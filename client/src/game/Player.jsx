import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'

import { levelCap } from '@shared/balance'
import { isPadUnlocked } from '@shared/logic'
import { clampToWalkable, groundHeightAt, LAUNCH_STAND, PAD_YAW, padAt, padBarHeight, STATIC_COLLIDERS } from '@shared/world'

import { sfx } from '../audio/sfx'
import { getGame } from '../store/game'
import ErrorBoundary from '../ui/ErrorBoundary'
import FallbackAvatar from './FallbackAvatar'
import PlayerAvatar from './PlayerAvatar'
import { RUN_CADENCE } from './kick'
import { actions } from '../net/actions'
import { armGrowth } from './armStyles'
import { cancelPull, grab, isPulling, launch, letGo, updatePull } from './launch'
import { BODY, GRIP } from './playerPose'
import { flierTurn, maxPullFor } from './roll/path'
import { roll } from './roll/rollControl'
import { runtime } from './runtime'
import useKeyboard from './useKeyboard'

export const PLAYER_HEIGHT = 1.8
const RADIUS = 0.45

const WALK_SPEED = 10.875
const ACCELERATION = 16
const GRAVITY = 32
const JUMP_SPEED = 10.5
/** Ledges up to this high are walked straight onto (the showroom's back stage). */
const STEP_UP = 1.05
/**
 * Walking back holding the launch posts, straining against the rubber: this fast at most
 * (m/s) - quicker with longer arms, so even the full 40 m lane takes only a few seconds
 * (always well under the server's MAX_MOVE_SPEED).
 */
const pullWalk = (maxPull) => Math.min(12, Math.max(5, maxPull / 3.6))
/** Reaching the stand spot this close to the posts grabs them by itself. */
const AUTO_GRAB = 0.9
/** Walked back at least this far, stopping pulling back lets go (a launch). */
const ARMED_BACK = 0.8
/** Not pulling back for this long (s) lets go: a flicker of the stick doesn't. */
const LET_GO_AFTER = 0.12

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
 * Walk up to the LAUNCH PAD's two posts and you grab them (or press LAUNCH, launch.js),
 * standing on the spot behind them; then your own joystick or keys walk you straight back
 * (no further than your arms reach, maxPullFor), arms stretching like rubber. Stop
 * pulling back - let go of the stick or key - and the launch is sent, no button needed;
 * the launch plays: your
 * logical position stays on the pad (what the server checks) while your avatar is slung
 * past the posts and flies down the runway (roll/path.rideState), diving flat and
 * barrel-rolling about its middle. On a pull-up bar you face east and do rubber-arm
 * pull-ups.
 *
 * Reads and writes `runtime.player`; never touches React state per frame.
 *
 * @param {{ onAvatarReady?: () => void }} props
 */
export function Player({ onAvatarReady }) {
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const keys = useKeyboard()
  /** How long you've held the posts without pulling back (seconds). */
  const letGoTimer = useRef(0)
  const velocity = useRef(new Vector3())
  const vy = useRef(0)

  /** Handed to the avatar so it can pose itself. A ref: written every frame. */
  const motionRef = useRef({
    time: 0,
    speed: 0,
    grounded: true,
    maxSpeed: WALK_SPEED,
    vy: 0,
    stride: 0,
    grip: -1,
  })

  // The blob shadow follows the character (or, flying, the point under it).
  const shownAt = useMemo(() => new Vector3().copy(runtime.player.position), [])
  useEffect(() => {
    const caster = { position: shownAt, size: 1.1 }
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

    // --- The launch posts: grabbed, walking back, let go ------------------------
    // Walking up to the posts and reaching the spot behind them grabs them by itself.
    if (!roll.active && !isPulling() && !player.frozen && player.grounded && !getGame().panel) {
      if (Math.hypot(pos.x - LAUNCH_STAND.x, pos.z - LAUNCH_STAND.z) < AUTO_GRAB) {
        grab(false)
        sfx.stretchStart()
      }
    }
    const pulling = !roll.active && isPulling()
    const maxPull = maxPullFor(getGame().profile.equippedTire, getGame().profile.level, levelCap(getGame().profile.rebirths))
    if (pulling && launch.snap) {
      // Just grabbed: onto the spot behind the posts, facing down the runway.
      launch.snap = false
      pos.set(LAUNCH_STAND.x, groundHeightAt(LAUNCH_STAND.x, LAUNCH_STAND.z), LAUNCH_STAND.z)
      velocity.current.set(0, 0, 0)
    }

    // --- Input, relative to the camera ----------------------------------------
    _input.set(0, 0, 0)
    const still = player.frozen || launch.released
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

    if (pulling) {
      // Holding the posts: only straight back (south, +Z) and in again, at a strained
      // walk, no further than the arms reach. Auto Launch walks you back by itself.
      const pullingBack = launch.auto || _move.z > WALK_SPEED * 0.15
      const walk = pullWalk(maxPull)
      const back = launch.auto ? walk : (_move.z / WALK_SPEED) * walk
      _move.set(0, 0, launch.released ? 0 : back)
      // Walked back far enough, then stopped pulling: that's the let-go. Fired from here
      // (not a button): the meter as it stood is what the launch is graded on.
      if (pullingBack) letGoTimer.current = 0
      else if (launch.gripping && !launch.auto && pos.z - LAUNCH_STAND.z > ARMED_BACK) {
        letGoTimer.current += delta
        if (letGoTimer.current > LET_GO_AFTER) {
          const charge = letGo()
          sfx.stretchStop()
          actions.roll(Math.round(charge * 1000) / 1000)
        }
      }
    } else {
      letGoTimer.current = 0
    }

    // Ease towards the target velocity: crisp, but no instant 0->max snaps.
    const blend = 1 - Math.exp(-ACCELERATION * delta)
    velocity.current.lerp(_move, blend)

    // --- Horizontal move + collision --------------------------------------------
    const prevX = pos.x
    const prevZ = pos.z
    pos.x += velocity.current.x * delta
    pos.z += velocity.current.z * delta
    if (pulling) {
      pos.x = LAUNCH_STAND.x
      pos.z = Math.min(LAUNCH_STAND.z + maxPull, Math.max(LAUNCH_STAND.z, pos.z))
    }
    updatePull(now, pulling ? pos.z - LAUNCH_STAND.z : 0, maxPull)

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
    const wantJump = !still && (k.jump || joy.jump)
    // Jumping lets go of the posts (no launch).
    if (wantJump && pulling) cancelPull()
    if (wantJump && player.grounded) {
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
    // Standing still under an unlocked bar: pull-ups, facing along it.
    const pad = padAt(pos.x, pos.z)
    const training = pad >= 0 && player.grounded && speed < 0.5 && !still && isPadUnlocked(getGame().profile, pad)
    if (training) player.yaw = PAD_YAW
    else if (pulling) player.yaw = Math.PI
    else if (speed > 0.3) player.yaw = Math.atan2(velocity.current.x, velocity.current.z)

    // --- Where the body is: on the ground, walked back by the stretch, or flying ---
    const profile = getGame().profile
    motion.grow = armGrowth(profile.equippedTire, profile.level, levelCap(profile.rebirths))
    motion.grip = -1
    motion.strain = 0
    motion.pitch = 0
    motion.fly = 0
    motion.sprawl = 0
    motion.cheer = 0
    if (roll.active) {
      // The launch: slung past the posts and down the runway (rollControl/path).
      _pivot.copy(roll.position)
      motion.grip = roll.grip
      motion.strain = roll.strain
      motion.pitch = roll.pitch
      motion.fly = roll.fly
      motion.sprawl = roll.sprawl
      motion.cheer = roll.cheer
      motion.reach = roll.hit === 'perfect' ? 1.9 : roll.hit === 'great' ? 1.65 : 1.4
      if (visual) flierTurn(roll, visual.quaternion)
    } else {
      // Step-ups ease in over a few frames on the visual only; the logical position
      // snaps so collision and triggers stay exact.
      const shownY = group ? group.position.y : pos.y
      const steppingUp = player.grounded && pos.y > shownY
      const y = steppingUp ? shownY + (pos.y - shownY) * Math.min(1, delta * 18) : pos.y
      _pivot.set(pos.x, y + BODY.pivot, pos.z)
      if (pulling) {
        // Walked back from the posts (south, +Z: you face down the runway), gripping them;
        // at full stretch the rubber twangs and rocks you to and fro.
        const back = pos.z - LAUNCH_STAND.z
        if (launch.full) _pivot.z += (1 - launch.charge) * 0.35
        motion.grip = GRIP.ahead + back + (launch.full ? (1 - launch.charge) * 0.35 : 0)
        motion.strain = Math.min(1, back / maxPull)
      }
      if (visual) {
        _targetQuat.setFromAxisAngle(_up, player.yaw)
        visual.quaternion.slerp(_targetQuat, pulling ? 1 : 1 - Math.pow(0.0005, delta))
      }
    }
    if (group && visual) {
      // The body turns and dives about its middle: the group sits under the middle, and
      // the visual is offset so that point stays put whichever way it's turned.
      group.position.set(_pivot.x, _pivot.y - BODY.pivot, _pivot.z)
      _hip.set(0, BODY.pivot, 0).applyQuaternion(visual.quaternion)
      visual.position.set(-_hip.x, BODY.pivot - _hip.y, -_hip.z)
    }
    shownAt.set(_pivot.x, roll.active ? _pivot.y - 0.4 : pos.y, _pivot.z)

    // --- Publish motion ---------------------------------------------------------
    player.speed = speed
    player.anim = !player.grounded ? 'jump' : pulling ? 'pull' : training ? 'run' : speed > 0.5 ? 'walk' : 'idle'

    motion.speed = speed
    motion.grounded = player.grounded
    motion.vy = vy.current
    // Under a bar: rubber-arm pull-ups (playerPose, `run`), a rep per gain.
    motion.run = training ? 1 : 0
    // Each bar is higher than the last: the arms stretch up to this one.
    motion.barY = training ? padBarHeight(pad) : undefined
    motion.stride += delta * (training ? RUN_CADENCE : 5 + 6 * Math.min(1, speed / WALK_SPEED))
  })

  return (
    <group ref={groupRef}>
      <group ref={visualRef}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} onReady={onAvatarReady} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} />}>
            <PlayerAvatar onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} />
          </Suspense>
        </ErrorBoundary>
      </group>
    </group>
  )
}

export default Player
