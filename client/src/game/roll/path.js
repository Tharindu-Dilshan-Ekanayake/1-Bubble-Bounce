import { Euler, Quaternion, Vector3 } from 'three'

import { ROLL_LAUNCH } from '@shared/balance'
import { maxPullFor, SLOPE_ANGLE, TRACK_START_Z } from '@shared/world'

import { BODY, GRIP } from '../playerPose'

/**
 * Geometry of a launch: one long, straight runway running north from the plaza's edge,
 * dead level (SLOPE_ANGLE is 0; the maths still allows a slope).
 *
 * Track metre `m` is measured along the runway from the start line (the plaza's north
 * edge). Before the start (m < 0) the ground is the plaza. Everything here is pure maths
 * and allocation-free, so the frame loop can call it freely.
 */

export const SIN = Math.sin(SLOPE_ANGLE)
export const COS = Math.cos(SLOPE_ANGLE)
export const TAN = Math.tan(SLOPE_ANGLE)

/** World z of track metre m. */
export const zAt = (m) => TRACK_START_Z - (m > 0 ? m * COS : m)
/** Height of the floor at track metre m. */
export const floorY = (m) => (m > 0 ? -m * SIN : 0)
/** Height of the track's floor plane under world z. */
export const slopeY = (z) => (z < TRACK_START_Z ? -(TRACK_START_Z - z) * TAN : 0)
/** Height of a surface parallel to the floor, `h` metres off it, under world z. */
export const surfaceY = (z, h) => slopeY(z) + h / COS

/** How a box lies on the track: tipped back by the slope angle. */
export const SLOPE_EULER_X = -SLOPE_ANGLE

/** World point at track metre m, `x` to the side and `h` off the floor. */
export function trackPoint(m, x, h, out) {
  if (m <= 0) return out.set(x, h, TRACK_START_Z - m)
  return out.set(x, -m * SIN + h * COS, TRACK_START_Z - m * COS - h * SIN)
}

const _e = new Euler()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()

/**
 * Matrix of a box lying on the track, given in track terms: centred `x` across, `h`
 * off the floor (to its centre) and at metre `m` (also its centre), sized `sx` across,
 * `sy` thick and `sz` along the track, leaning `lean` radians about its own long axis.
 */
export function slopeBoxMatrix(m, x, h, sx, sy, sz, lean, out) {
  trackPoint(m, x, h, _p)
  _q.setFromEuler(_e.set(m > 0 ? SLOPE_EULER_X : 0, 0, lean))
  return out.compose(_p, _q, _s.set(sx, sy, sz))
}

/** Same as slopeBoxMatrix, but as BlockSet.add arguments: [x, y, z, rotX]. */
export function slopeBoxPlacement(m, x, h) {
  trackPoint(m, x, h, _p)
  return [_p.x, _p.y, _p.z, m > 0 ? SLOPE_EULER_X : 0]
}

/** Metres a world z is along the track (negative in the plaza). */
export const meterAtZ = (z) => (z < TRACK_START_Z ? (TRACK_START_Z - z) / COS : TRACK_START_Z - z)

// --- A launch ---------------------------------------------------------------------

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** How far back you can walk holding the posts, at full stretch, with the starter arms (metres). */
export const PULL_DIST = 3.6
/** How far back arms let you walk (shared/world maxPullFor: the server checks it too). */
export { maxPullFor }

/** The flight sets off this far ahead of where you stood: just past the posts. */
export const PUSH_AHEAD = GRIP.ahead + 0.6
/** Seconds into a launch that you fly past the posts: the snap takes the whole launch. */
export const KICK_HIT = ROLL_LAUNCH
/** Let go, you hang on - straining, arms at full stretch - for this share of the snap. */
const SNAP_HOLD = 0.16
/** Lying flat, how high your middle (the pivot you dive about) is off the ground. */
export const BODY_FLAT = 0.3
/** Your middle's height off the ground standing, less BODY_FLAT: the flight starts there. */
const LAUNCH_AIR = BODY.pivot - BODY_FLAT
/** How big the flier reads to the trail and effects (they were sized for the ball). */
export const TIRE_SIZE = 0.6

/**
 * The flight takes LAND_T of the launch's time after the snap; the rest is belly-flopping
 * onto the turf, bouncing and getting up.
 */
const LAND_T = 0.86
/** Belly bounces on the turf after you slam down, over the first SETTLE of the time left. */
const BOUNCES = 2
const SETTLE = 0.6
/** Seconds to get up and start cheering, once you've stopped. */
const STAND_UP = 0.45

/**
 * How far along its distance (0-1) the flight is `t` of the way through: off the posts
 * fast, slowing as you go, still moving as you slam down at the end.
 */
const progress = (t) => {
  const x = clamp01(t)
  return 1.5 * x - 0.5 * x * x
}

/**
 * Seconds into a launch of `duration` (the snap included) at which you've flown `f`
 * (0-1) of the distance: 0.5 is the top of the arc, 1 the moment you slam down.
 */
export const kickTimeAt = (f, duration) => KICK_HIT + LAND_T * (1.5 - Math.sqrt(2.25 - 2 * clamp01(f))) * Math.max(0.1, duration - KICK_HIT)

/**
 * The flight: one high arc over the whole distance, slamming down exactly where the
 * authority says you stop - a splash of turf (Impact.jsx) - then a couple of belly
 * bounces and you get up to celebrate. The arc's peak grows with the distance (a short
 * hop stays low, a long one soars) and with how well you let go (KICK_ARC: a WEAK one
 * skims low, a PERFECT one soars high), capped so the runway stays in view below you.
 */
const KICK_ARC = { weak: 0.5, good: 0.85, great: 1.15, perfect: 1.45 }
export const flightPeak = (distance, hit = null) =>
  Math.min(44, (4 + 0.6 * Math.sqrt(Math.max(0, distance))) * (KICK_ARC[hit] ?? 1))

/** A fresh state for rideState to write into. */
export const createRideState = () => ({
  phase: 'launch',
  launch: 0,
  meter: 0,
  speed: 0,
  /** Height of your middle off the ground, less BODY_FLAT (0: lying on it). */
  air: 0,
  size: TIRE_SIZE,
  /** True while you're in the arc (until you first land). */
  airborne: false,
  /** 0 in the air; 1 once you've slammed down, then one more for every bounce after. */
  bounces: 0,
  /** How far the body is dived forward about its middle (0 upright, PI/2 flying flat). */
  pitch: 0,
  /** A barrel roll about the way you're flying (radians). */
  roll: 0,
  /** Metres from your middle ahead to the posts' grips while you still hold them, else -1. */
  grip: -1,
  /** How hard the rubber is still pulling (0-1), for the pose. */
  strain: 0,
  /** Pose weights: flying like a superhero, sprawled where you landed, up and cheering. */
  fly: 0,
  sprawl: 0,
  cheer: 0,
  /** Never true: nothing on the runway stops you. */
  crashed: false,
  x: 0,
  /** Your middle: the point the body dives and rolls about. */
  position: new Vector3(),
})

/**
 * Everything about a launch `elapsed` seconds in - yours, or another player's replayed
 * from the same numbers, so both fly identically. `ride` is `{ fromMeter, startX,
 * distance, duration, hit, pull }` (duration includes the snap; `pull` is how far back
 * the stretch had walked them, in metres - PULL_DIST if unknown); `lane` is a sideways
 * offset so fliers don't overlap. Writes into `out` (see createRideState):
 *   phase    'launch' (the rubber snapping you forward) | 'ride' | 'stopped'
 *   meter    metres along the runway; speed in m/s along it
 *   position your middle; pitch and roll say how the body lies
 */
export function rideState(elapsed, ride, lane, out) {
  const start = ride.fromMeter + PUSH_AHEAD
  const end = Math.max(start + 1, ride.distance)
  const flightTime = Math.max(0.1, ride.duration - KICK_HIT)
  const back = Number.isFinite(ride.pull) ? ride.pull : PULL_DIST
  let meter
  let speed = 0
  let air = LAUNCH_AIR
  out.airborne = false
  out.crashed = false
  out.bounces = 0
  out.grip = -1
  out.strain = 0
  out.fly = 0
  out.sprawl = 0
  out.cheer = 0
  out.roll = 0
  if (elapsed < KICK_HIT) {
    // The snap: hanging on a beat at full stretch, then slung forward - faster and
    // faster - diving flat as you go, the arms snapping short until you pass the posts.
    out.phase = 'launch'
    const u = clamp01(elapsed / KICK_HIT)
    out.launch = u
    const k = clamp01((u - SNAP_HOLD) / (1 - SNAP_HOLD))
    const from = ride.fromMeter - back
    meter = from + (start - from) * k * k
    speed = (2 * k * (start - from)) / ((1 - SNAP_HOLD) * KICK_HIT)
    out.pitch = (Math.PI / 2) * smooth(0.3, 1, k)
    const ahead = ride.fromMeter + GRIP.ahead - meter
    if (ahead > 0.35) {
      out.grip = ahead
      out.strain = (1 - k) * Math.min(1, back / PULL_DIST)
    } else {
      out.fly = 1
    }
  } else {
    const t = (elapsed - KICK_HIT) / flightTime
    out.launch = 1
    out.phase = t >= 1 ? 'stopped' : 'ride'
    const peak = flightPeak(end - start, ride.hit)
    if (t < LAND_T) {
      const f = progress(t / LAND_T)
      meter = start + (end - start) * f
      speed = ((end - start) * (1.5 - t / LAND_T)) / (LAND_T * flightTime)
      air = LAUNCH_AIR * (1 - f) + peak * 4 * f * (1 - f)
      out.airborne = true
      // Nose up as you leave the posts, level at the top, nose down coming in to land.
      out.pitch = Math.PI / 2 - 0.3 + 0.55 * f
      out.fly = 1
      // A PERFECT launch barrel-rolls once on the way up; the rest just sway.
      out.roll = ride.hit === 'perfect' ? Math.PI * 2 * smooth(0.12, 0.5, f) : Math.sin(f * 9) * 0.14
    } else {
      // Down on the turf: belly bounces, each lower, then lying there a moment.
      meter = end
      const v = (t - LAND_T) / (1 - LAND_T) / SETTLE
      air = v < 1 ? peak * 0.06 * (1 - v) * Math.abs(Math.sin(Math.PI * BOUNCES * v)) : 0
      out.bounces = v < 1 ? 1 + Math.min(BOUNCES - 1, Math.floor(v * BOUNCES)) : BOUNCES
      out.pitch = Math.PI / 2
      out.sprawl = 1
    }
    if (t >= 1) {
      // Up on your feet to celebrate.
      const stand = smooth(0, STAND_UP, elapsed - ride.duration)
      out.pitch = (Math.PI / 2) * (1 - stand)
      air = LAUNCH_AIR * stand
      out.sprawl = 1 - stand
      out.cheer = stand
    }
  }
  // Ease from where you launched onto your own line down the runway.
  const settle = clamp01((meter - start) / 40)
  const x = ride.startX * (1 - settle) + lane * settle
  out.meter = meter
  out.speed = speed
  out.air = air
  out.x = x
  out.size = TIRE_SIZE
  trackPoint(meter, x, BODY_FLAT + air, out.position)
  return out
}

/** Each other player flies down their own line of the runway, so fliers don't overlap. */
export function laneFor(sid) {
  let h = 2166136261
  for (let i = 0; i < sid.length; i += 1) h = Math.imul(h ^ sid.charCodeAt(i), 16777619)
  return (((h >>> 0) % 5) - 2) * 3
}

const _ax = new Vector3(1, 0, 0)
const _ay = new Vector3(0, 1, 0)
const _az = new Vector3(0, 0, 1)
const _qa = new Quaternion()
const _qb = new Quaternion()

/**
 * The body's turn for ride state `st`, facing down the runway (-Z): turned about the
 * vertical to face it, barrel-rolled about the way it's going, then dived forward
 * about its middle. Applied to an avatar that faces +Z.
 */
export function flierTurn(st, out) {
  out.setFromAxisAngle(_ay, Math.PI)
  out.multiply(_qa.setFromAxisAngle(_az, st.roll))
  return out.multiply(_qb.setFromAxisAngle(_ax, st.pitch))
}
