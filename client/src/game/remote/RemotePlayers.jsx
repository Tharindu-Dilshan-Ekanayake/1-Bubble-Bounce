import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { ROLL_RECOVERY } from '@shared/balance'
import { levelCap } from '@shared/balance'
import { PAD_YAW } from '@shared/world'

import { armGrowth } from '../armStyles'

import { remotePlayers } from '../../net/remotePlayers'
import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { RUN_CADENCE } from '../kick'
import { sharedMaterials, STYLE } from '../materials'
import { BODY } from '../playerPose'
import { flierTurn, laneFor, rideState } from '../roll/path'
import { runtime } from '../runtime'
import { hideNameplatesFrom, NAMEPLATE_POOL_SIZE, placeNameplate } from './nameplates'

/** Remote players are drawn this far in the past, so 10 Hz updates interpolate. */
const INTERP_DELAY_MS = 110
const MAX_REMOTES = 8
const PARTS = 6
const S = 0.36

/** Classic blocky figure, in studs-scaled units: [x, y(pivot), size, hangs from pivot]. */
const PART_LAYOUT = [
  { key: 'head', pos: [0, 1.62, 0], size: [1.2 * S, 1 * S, 1 * S] },
  { key: 'torso', pos: [0, 1.08, 0], size: [2 * S, 2 * S, 1 * S] },
  { key: 'armL', pos: [-1.5 * S, 1.44, 0], size: [1 * S, 2 * S, 1 * S], swing: -1 },
  { key: 'armR', pos: [1.5 * S, 1.44, 0], size: [1 * S, 2 * S, 1 * S], swing: 1 },
  { key: 'legL', pos: [-0.5 * S, 0.72, 0], size: [1 * S, 2 * S, 1 * S], swing: 1 },
  { key: 'legR', pos: [0.5 * S, 0.72, 0], size: [1 * S, 2 * S, 1 * S], swing: -1 },
]

// Parsed once: setColorAt runs for every limb of every player, every frame.
const palette = (list) => list.map((c) => new Color(c))
const SHIRTS = palette(['#e8423a', '#2f7fe6', '#3ccf4e', '#9b4dff', '#ff9a1f', '#1d1f26', '#ffffff', '#ff5fa8'])
const PANTS = palette(['#2d3a5c', '#1d1f26', '#4a3a2a', '#3a3a46', '#2f5aa8'])
const SKINS = palette(['#f5cd47', '#e8b48a', '#c98a5a', '#8a5a3a', '#ffd9b3'])

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const _m = new Matrix4()
const _base = new Matrix4()
const _local = new Matrix4()
const _rot = new Matrix4()
const _scale = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _v = new Vector3()
const _up = new Vector3(0, 1, 0)
const _target = new Vector3()
const _dir = new Vector3()
const _prev = new Vector3()
const _hipDown = new Matrix4().makeTranslation(0, -BODY.pivot, 0)
const _flyQ = new Quaternion()

function lerpAngle(a, b, t) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** Interpolates a remote player to `renderTime`. */
function interpolate(r, renderTime) {
  const snaps = r.snaps
  if (snaps.length === 0) return
  let i = snaps.length - 1
  while (i > 0 && snaps[i - 1].t > renderTime) i -= 1
  const b = snaps[i]
  const a = snaps[Math.max(0, i - 1)]
  const span = b.t - a.t
  const t = span > 0 ? Math.min(1, Math.max(0, (renderTime - a.t) / span)) : 1
  _prev.copy(r.position)
  r.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)
  r.yaw = lerpAngle(a.r, b.r, t)
  // Drop snapshots we've moved past, keeping one to interpolate from.
  while (snaps.length > 2 && snaps[1].t < renderTime) snaps.shift()
}

/**
 * Writes one blocky figure's six parts from `base` (its feet), limbs swung by `swing`
 * (and arms by `armSwing`, if given, stretched `armStretch` times their length). Returns
 * the next free instance.
 */
function writeFigure(body, instance, r, base, swing, armSwing, armStretch = 1) {
  const h = hashString(r.sessionId)
  const shirt = SHIRTS[h % SHIRTS.length]
  const pants = PANTS[(h >>> 8) % PANTS.length]
  const skin = SKINS[(h >>> 16) % SKINS.length]
  for (const part of PART_LAYOUT) {
    const hangs = part.swing !== undefined
    const isArm = part.key.startsWith('arm')
    const angle = hangs ? (isArm && armSwing !== null ? armSwing : swing * part.swing) : 0
    const long = isArm ? armStretch : 1
    _local.makeTranslation(part.pos[0], part.pos[1], part.pos[2])
    _rot.makeRotationX(angle)
    _scale.makeScale(part.size[0], part.size[1] * long, part.size[2])
    // Limbs hang from their pivot; head and torso are centred on theirs.
    if (hangs) _scale.setPosition(0, (-part.size[1] * long) / 2, 0)
    _m.copy(base).multiply(_local).multiply(_rot).multiply(_scale)
    body.setMatrixAt(instance, _m)
    // Classic look: shirt on the torso, trousers on the legs, bare arms and head.
    body.setColorAt(instance, part.key === 'torso' ? shirt : part.key.startsWith('leg') ? pants : skin)
    instance += 1
  }
  return instance
}

/** Puts a name tag over `at`, if it's on screen; returns the next free tag. */
function writeNameplate(plate, name, at, distance, maxDistance, camera, size, uid) {
  if (plate >= NAMEPLATE_POOL_SIZE) return plate
  if (distance < maxDistance) {
    _v.copy(at).project(camera)
    if (_v.z < 1) {
      const fade = Math.min(1, (maxDistance - distance) / 6)
      placeNameplate(plate, name, (_v.x * 0.5 + 0.5) * size.width, (-_v.y * 0.5 + 0.5) * size.height, fade, uid)
      return plate + 1
    }
  }
  placeNameplate(plate, '', null)
  return plate + 1
}

/**
 * Everyone else in the lobby: blocky avatars (one InstancedMesh for every limb of every
 * player), name tags and their pets (handed to the shared pet renderer). Also works out,
 * once a frame for everyone, what the real avatars (RemoteAvatars) need: each launch
 * replayed down the runway (`r.flying`, `r.flight`: the same path.rideState yours
 * follows). Stretching back on the launch posts they're where the network says they've
 * walked back to (anim 'pull'). On a pull-up bar they do pull-ups. Hidden past the
 * preset's draw distance.
 */
export function RemotePlayers() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const bodyRef = useRef(null)

  const assets = useMemo(() => {
    // Smooth toy boxes: the shared toy material, so no extra shader program.
    const body = createBoxInstances(MAX_REMOTES * PARTS, sharedMaterials().toy, STYLE.SMOOTH)
    body.castShadow = true
    return { body }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.body)
      hideNameplatesFrom(0)
    },
    [assets],
  )

  useFrame((state, rawDelta) => {
    const body = bodyRef.current
    if (!body) return
    const delta = Math.min(rawDelta, 0.05)
    const settings = getQuality()
    const now = performance.now()
    const renderTime = now - INTERP_DELAY_MS
    const t = state.clock.elapsedTime

    let instance = 0
    let plate = 0
    runtime.remotePets.length = 0

    for (const r of remotePlayers.values()) {
      interpolate(r, renderTime)
      const moved = _prev.distanceTo(r.position)
      r.speed = r.speed * 0.8 + (moved / Math.max(delta, 1e-3)) * 0.2

      // --- Their launch: replayed from the numbers the server sent -----------------
      const ghost = runtime.ghostRolls.get(r.sessionId)
      r.flying = false
      if (ghost) {
        const elapsed = (now - ghost.startedAt) / 1000
        if (elapsed > ghost.duration + ROLL_RECOVERY + 1) runtime.ghostRolls.delete(r.sessionId)
        else {
          rideState(elapsed, ghost, laneFor(r.sessionId), r.flight)
          r.flying = true
        }
      }
      r.pulling = r.anim === 'pull' && !r.flying
      if (r.flying) r.shadow.position.set(r.flight.position.x, r.flight.position.y - 0.4, r.flight.position.z)
      else r.shadow.position.copy(r.position)

      // --- In the lobby -----------------------------------------------------------
      const shownAt = r.flying ? r.flight.position : r.position
      const distance = camera.position.distanceTo(shownAt)
      const visible = distance < settings.remoteDrawDistance
      r.shadow.visible = visible
      const running = r.anim === 'run'

      // Players drawn as their real avatar (RemoteAvatars) skip the blocky figure.
      if (visible && !r.fullAvatar && r.flying && instance + PARTS <= MAX_REMOTES * PARTS) {
        // Flying flat like a superhero, arms out ahead (or sprawled, or up cheering).
        const st = r.flight
        flierTurn(st, _flyQ)
        _base.compose(st.position, _flyQ, _s.set(1, 1, 1)).multiply(_hipDown)
        const arms = st.cheer > 0.5 ? -2.7 + Math.sin(t * 10) * 0.3 : st.sprawl > 0.5 ? -2.3 : st.grip >= 0 ? -1.4 : -3
        instance = writeFigure(body, instance, r, _base, 0, arms, st.fly > 0 ? 1.5 : 1)
      } else if (visible && !r.fullAvatar && instance + PARTS <= MAX_REMOTES * PARTS) {
        const walking = !running && r.speed > 0.6
        if (walking) r.walkPhase += delta * (6 + Math.min(r.speed, 10) * 0.5)
        // Pull-ups on a bar: arms up, stretching long and snapping short each rep.
        if (running) r.walkPhase += delta * RUN_CADENCE
        const swing = walking ? Math.sin(r.walkPhase) * 0.9 : 0
        const pulling = r.pulling
        _q.setFromAxisAngle(_up, running ? PAD_YAW : pulling ? Math.PI : r.yaw)
        _base.compose(r.position, _q, _s.set(1, 1, 1))
        const rep = running ? 0.5 - 0.5 * Math.cos(r.walkPhase) : 0
        // Otherwise their rubber arms reach the floor, dragging behind as they walk.
        const drag = 0.15 + (walking ? 0.45 + Math.sin(r.walkPhase) * 0.25 : 0)
        const arms = running ? Math.PI : pulling ? -1.45 : drag
        const grow = armGrowth(r.tireId, r.level, levelCap(r.rebirths || 0))
        const stretch = running ? 1.7 - rep * 0.7 : pulling ? 3 : 1.1 + (Math.min(3, 1.95 / Math.max(0.3, Math.cos(drag))) - 1.1) * grow
        instance = writeFigure(body, instance, r, _base, swing, arms, stretch)
      }

      // Name tag, just above the head (players are 1.8 tall).
      if (visible) {
        if (r.flying) _v.set(shownAt.x, shownAt.y + 1.4, shownAt.z)
        else _v.set(r.position.x, r.position.y + 2.05, r.position.z)
        plate = writeNameplate(plate, r.name, _v, distance, settings.remoteNameDistance, camera, size, r.uid)
      }

      // Their pets: follow in formation, drawn by the shared pet renderer.
      if (visible) {
        const sin = Math.sin(r.yaw)
        const cos = Math.cos(r.yaw)
        for (let i = 0; i < r.petIds.length && i < r.pets.length; i += 1) {
          const pet = r.pets[i]
          pet.id = r.petIds[i]
          const sx = i === 0 ? -1.5 : i === 1 ? 1.5 : 0
          const sz = i === 2 ? -2.5 : -1.3
          _target.set(r.position.x - cos * sx + sin * sz, r.position.y, r.position.z + sin * sx + cos * sz)
          _dir.copy(pet.position)
          pet.position.lerp(_target, 1 - Math.exp(-6 * delta))
          const stepped = _dir.distanceTo(pet.position)
          if (stepped > 0.005) pet.yaw = Math.atan2(pet.position.x - _dir.x, pet.position.z - _dir.z)
          pet.hop = Math.abs(Math.sin(t * 7 + i)) * (stepped > 0.01 ? 0.35 : 0.08)
          runtime.remotePets.push(pet)
        }
      }
    }
    hideNameplatesFrom(plate)
    body.count = instance
    body.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
  })

  return (
    <>
      <primitive ref={bodyRef} object={assets.body} />
    </>
  )
}

export default RemotePlayers
