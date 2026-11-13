import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Color, Quaternion, Vector3 } from 'three'

import { isPadUnlocked } from '@shared/logic'
import { clampToWalkable, groundHeightAt, PAD_YAW, padAt, STATIC_COLLIDERS } from '@shared/world'

import { sfx } from '../audio/sfx'
import { getGame } from '../store/game'
import { getQuality } from '../store/quality'
import ErrorBoundary from '../ui/ErrorBoundary'
import FallbackAvatar from './FallbackAvatar'
import PlayerAvatar from './PlayerAvatar'
import { RUN_CADENCE } from './kick'
import { actions } from '../net/actions'
import { setBubbleLook } from './bubbles'
import { emitPuffs, PUFF_STREAM, PUFF_TAP, takeTapPuffs } from './fx/puffQueue'
import { cancelBlow, heldTooLong, isBlowing, launch, releaseBlow, updateBlow } from './launch'
import { BODY, holdsWand, WAND_RING } from './playerPose'
import { flierTurn } from './roll/path'
import { roll } from './roll/rollControl'
import { runtime } from './runtime'
import { tireGlow } from './tire'
import useKeyboard from './useKeyboard'
import { Wand } from './Wand'

export const PLAYER_HEIGHT = 1.8
const RADIUS = 0.45

const WALK_SPEED = 10.875
const ACCELERATION = 16
const GRAVITY = 32
const JUMP_SPEED = 10.5
/** Ledges up to this high are walked straight onto (the shop's back stage). */
const STEP_UP = 1.05

// Scratch objects, reused each frame so the loop allocates nothing.
const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _clamped = { x: 0, z: 0 }
const _pivot = new Vector3()
const _hip = new Vector3()
const _ring = new Vector3()
const _c = new Color()

/** Pushes a circle out of an axis-aligned rect. Returns true on contact. */
function pushOut(pos, rect) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, pos.x))
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, pos.z))
  const dx = pos.x - cx
  const dz = pos.z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= RADIUS * RADIUS) return false

  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    const push = (RADIUS - d) / d
    pos.x += dx * push
    pos.z += dz * push
    return true
  }

  // Centre inside the rect (spawned in, or a wall appeared on top of us): leave by the
  // nearest side.
  const left = pos.x - rect.minX
  const right = rect.maxX - pos.x
  const near = pos.z - rect.minZ
  const far = rect.maxZ - pos.z
  const m = Math.min(left, right, near, far)
  if (m === left) pos.x = rect.minX - RADIUS
  else if (m === right) pos.x = rect.maxX + RADIUS
  else if (m === near) pos.z = rect.minZ - RADIUS
  else pos.z = rect.maxZ + RADIUS
  return true
}

/**
 * The local player: a kinematic character controller.
 *
 * No physics engine: the world is flat ground, a few raised floors and a list of
 * rectangular walls, which a circle-vs-rect push-out handles exactly. That saves the
 * ~2 MB Rapier WASM download and keeps the active rigid body count at zero.
 *
 * Standing still on an unlocked Blow Pad you face its hoop and blow bubbles through your
 * wand, little bubbles drifting off it with every puff (and with every tap of BLOW). In
 * the BLOW ZONE, holding BLOW (RollButton) keeps you on the spot, facing the valley,
 * blowing your giant bubble (launch.js); let go and the bounce plays: your logical
 * position stays in the zone (what the server checks) while your avatar hops into the
 * bubble and floats inside it down the valley (roll/path.rideState).
 *
 * Reads and writes `runtime.player`; never touches React state per frame.
 *
 * @param {{ onAvatarReady?: () => void }} props
 */
export function Player({ onAvatarReady }) {
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const wandRef = useRef(null)
  const keys = useKeyboard()
  const velocity = useRef(new Vector3())
  const vy = useRef(0)
  /** The puff phase last blown out on a pad (one burst of little bubbles per puff). */
  const lastPuff = useRef(0)

  /** Handed to the avatar so it can pose itself. A ref: written every frame. */
  const motionRef = useRef({
    time: 0,
    speed: 0,
    grounded: true,
    maxSpeed: WALK_SPEED,
    vy: 0,
    stride: 0,
    charge: -1,
  })

  // The blob shadow follows the character (or, bouncing, the bubble's spot on the ground).
  const shownAt = useMemo(() => new Vector3().copy(runtime.player.position), [])
  const casterRef = useRef(null)
  useEffect(() => {
    const caster = { position: shownAt, size: 1.1 }
    casterRef.current = caster
    runtime.shadowCasters.add(caster)
    return () => runtime.shadowCasters.delete(caster)
  }, [shownAt])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const now = performance.now()
    const player = runtime.player
    const pos = player.position
    const k = keys.current
    const joy = runtime.input
    const motion = motionRef.current
    motion.time += delta

    const group = groupRef.current
    const visual = visualRef.current
    const wand = wandRef.current
    const profile = getGame().profile

    // --- Blowing the giant bubble in the Blow Zone ---------------------------------
    const blowingBig = !roll.active && isBlowing()
    if (blowingBig) {
      updateBlow(now)
      // Held at full size too long: it lets go by itself (graded as it stands).
      if (heldTooLong(now)) {
        const charge = releaseBlow(now)
        sfx.stretchStop()
        actions.roll(Math.round(charge * 1000) / 1000)
      }
    }

    // --- Input, relative to the camera ----------------------------------------
    _input.set(0, 0, 0)
    const still = player.frozen || blowingBig
    if (!still) {
      _input.set(
        (k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX,
        0,
        (k.backward ? 1 : 0) - (k.forward ? 1 : 0) - joy.joyY,
      )
    }
    const inputLength = Math.min(1, _input.length())

    if (inputLength > 0.02) {
      _input.normalize()
      // Flatten the camera's forward onto the ground plane so "up" always means
      // "away from the camera".
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move
        .set(0, 0, 0)
        .addScaledVector(_camForward, -_input.z)
        .addScaledVector(_camRight, _input.x)
        .normalize()
        .multiplyScalar(WALK_SPEED * inputLength)
    } else {
      _move.set(0, 0, 0)
    }

    // Ease towards the target velocity: crisp, but no instant 0->max snaps.
    const blend = 1 - Math.exp(-ACCELERATION * delta)
    velocity.current.lerp(_move, blowingBig ? 1 : blend)

    // --- Horizontal move + collision --------------------------------------------
    const prevX = pos.x
    const prevZ = pos.z
    pos.x += velocity.current.x * delta
    pos.z += velocity.current.z * delta

    for (const rect of STATIC_COLLIDERS) pushOut(pos, rect)
    for (const rect of runtime.dynamicColliders) pushOut(pos, rect)
    clampToWalkable(pos.x, pos.z, _clamped)
    pos.x = _clamped.x
    pos.z = _clamped.z

    // A ledge too tall to step onto acts as a wall.
    let floor = groundHeightAt(pos.x, pos.z)
    if (floor - pos.y > STEP_UP) {
      pos.x = prevX
      pos.z = prevZ
      floor = groundHeightAt(pos.x, pos.z)
    }

    // --- Vertical ---------------------------------------------------------------
    const wantJump = !player.frozen && (k.jump || joy.jump)
    // Jumping while blowing the giant bubble pops it (no bounce).
    if (wantJump && blowingBig && launch.charging) {
      cancelBlow()
      sfx.stretchStop()
      sfx.bubblePop()
    }
    if (wantJump && player.grounded && !isBlowing()) {
      vy.current = JUMP_SPEED
      player.grounded = false
      sfx.jump()
    }
    vy.current -= GRAVITY * delta
    pos.y += vy.current * delta

    if (pos.y <= floor) {
      // Coming down from a jump (not just stepping off a kerb) lands with a thump.
      if (!player.grounded && vy.current < -5) sfx.jumpLand()
      pos.y = floor
      vy.current = 0
      player.grounded = true
    } else if (pos.y - floor > 0.05) {
      // Walked off a ledge, or still rising from a jump.
      player.grounded = false
    }

    // --- Facing -----------------------------------------------------------------
    const speed = Math.hypot(velocity.current.x, velocity.current.z)
    // Standing still on an unlocked Blow Pad: blowing bubbles, facing its hoop.
    const pad = padAt(pos.x, pos.z)
    const training = pad >= 0 && player.grounded && speed < 0.5 && !still && isPadUnlocked(profile, pad)
    if (training) player.yaw = PAD_YAW
    else if (blowingBig) player.yaw = Math.PI
    else if (speed > 0.3) player.yaw = Math.atan2(velocity.current.x, velocity.current.z)

    // --- Where the body is: on the ground, or in the bubble ------------------------
    motion.charge = -1
    motion.pitch = 0
    motion.hop = 0
    motion.perch = 0
    motion.sink = 0
    motion.fly = 0
    motion.cheer = 0
    if (roll.active) {
      // The bounce: hopping into the bubble and floating inside it (rollControl/path).
      _pivot.copy(roll.position)
      motion.hop = roll.hop
      motion.perch = roll.perch
      motion.sink = roll.sink
      motion.fly = roll.fly
      motion.cheer = roll.cheer
      if (visual) flierTurn(roll, visual.quaternion)
    } else {
      // Step-ups ease in over a few frames on the visual only; the logical position
      // snaps so collision and triggers stay exact.
      const shownY = group ? group.position.y : pos.y
      const steppingUp = player.grounded && pos.y > shownY
      const y = steppingUp ? shownY + (pos.y - shownY) * Math.min(1, delta * 18) : pos.y
      _pivot.set(pos.x, y + BODY.pivot, pos.z)
      if (blowingBig) motion.charge = launch.charge
      if (visual) {
        _targetQuat.setFromAxisAngle(_up, player.yaw)
        visual.quaternion.slerp(_targetQuat, blowingBig ? 1 : 1 - Math.pow(0.0005, delta))
      }
    }
    if (group && visual) {
      // The body turns about its middle: the group sits under the middle, and the visual
      // is offset so that point stays put whichever way it's turned.
      group.position.set(_pivot.x, _pivot.y - BODY.pivot, _pivot.z)
      _hip.set(0, BODY.pivot, 0).applyQuaternion(visual.quaternion)
      visual.position.set(-_hip.x, BODY.pivot - _hip.y, -_hip.z)
    }
    if (roll.active) {
      // The shadow is the bubble's, on the ground under it - gone once it's popped.
      shownAt.set(roll.bubblePos.x, 0, roll.bubblePos.z)
      if (casterRef.current) casterRef.current.size = roll.popped ? 1.1 : 4
    } else {
      shownAt.set(_pivot.x, pos.y, _pivot.z)
      if (casterRef.current) casterRef.current.size = 1.1
    }

    // --- Publish motion ---------------------------------------------------------
    player.speed = speed
    player.anim = !player.grounded ? 'jump' : blowingBig ? 'pull' : training ? 'run' : speed > 0.5 ? 'walk' : 'idle'

    // A tap of BLOW anywhere: the wand comes up for a moment (standing still, it's
    // blown through; walking, it's carried).
    const taps = takeTapPuffs()
    if (taps > 0) lastTapAt.value = now
    const tapping = now - lastTapAt.value < 700 && speed < 0.5 && player.grounded && !still

    motion.speed = speed
    motion.grounded = player.grounded
    motion.vy = vy.current
    // On a Blow Pad (or tapping BLOW): blowing bubbles (playerPose `run`), a puff per gain.
    motion.run = training || tapping ? 1 : 0
    motion.stride += delta * (training || tapping ? RUN_CADENCE : 5 + 6 * Math.min(1, speed / WALK_SPEED))

    // --- The wand, and the little bubbles it blows ---------------------------------
    if (wand) {
      const up = !roll.active && (holdsWand(motion) || now - lastTapAt.value < 900)
      wand.visible = up
      if (up) {
        if (wand.userData.bubbleId !== profile.equippedTire) {
          wand.userData.bubbleId = profile.equippedTire
          setBubbleLook(wand.userData.film, profile.equippedTire)
        }
        // On a pad, every breath out sends a stream of bubbles off the wand and through the
        // pad's giant hoop (and every tap of BLOW sends more); a tap anywhere else, a puff.
        const puff = Math.floor((motion.stride + Math.PI * 0.6) / (Math.PI * 2))
        const low = !getQuality().particles
        const stream = training && puff !== lastPuff.current ? (low ? 3 : 6) : 0
        const tapped = taps * (low ? 2 : 3)
        lastPuff.current = puff
        if (stream + tapped > 0) {
          wand.updateWorldMatrix(true, false)
          _ring.copy(WAND_RING).applyMatrix4(wand.matrixWorld)
          const color = _c.copy(tireGlow(profile.equippedTire)).getHex()
          const fx = Math.sin(player.yaw)
          const fz = Math.cos(player.yaw)
          if (stream) emitPuffs(_ring.x, _ring.y, _ring.z, fx, fz, stream, color, PUFF_STREAM)
          if (tapped) emitPuffs(_ring.x, _ring.y, _ring.z, fx, fz, tapped, color, training ? PUFF_STREAM : PUFF_TAP)
        }
      }
    }
  })

  return (
    <group ref={groupRef}>
      <group ref={visualRef}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} onReady={onAvatarReady} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} />}>
            <PlayerAvatar onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} handRef={wandRef} />
          </Suspense>
        </ErrorBoundary>
        <Wand ref={wandRef} />
      </group>
    </group>
  )
}

/** When you last tapped BLOW (performance.now()): the wand stays up a moment after. */
const lastTapAt = { value: -Infinity }

export default Player
