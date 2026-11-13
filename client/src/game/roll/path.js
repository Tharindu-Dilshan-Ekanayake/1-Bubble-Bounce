import { Euler, Quaternion, Vector3 } from 'three'

import { BOUNCE_LAND, BOUNCE_MAX, bounceCount, LAST_BOUNCE, ROLL_LAUNCH } from '@shared/balance'
import { SLOPE_ANGLE, TRACK_START_Z } from '@shared/world'

import { BODY } from '../playerPose'

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

// --- A bounce ---------------------------------------------------------------------

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Radius of the bubble you ride, metres: you float spread out in its middle. */
export const BUBBLE_R = 2.1
/**
 * Where the bubble you blew sits as you get in: just in front of your wand's ring (0.75 m
 * ahead of where you stood) and resting on the ground, a touch above it.
 */
export const LAUNCH_AHEAD = 0.75 + BUBBLE_R
export const LAUNCH_Y = BUBBLE_R + 0.1
/** Seconds into a bounce that you're in the bubble and it leaps away (getting in takes them). */
export const KICK_HIT = ROLL_LAUNCH
/**
 * Getting in, as shares of KICK_HIT: jump up onto the bubble (to JUMP_END), land on top
 * and wobble there (to PERCH_END), sink down through its skin into the middle (to
 * SINK_END), then the bubble jiggles round you and crouches to leap.
 */
const JUMP_END = 0.28
const PERCH_END = 0.5
const SINK_END = 0.75
/** How big the rider reads to the trail and effects (they were sized for a ball). */
export const TIRE_SIZE = 1.7

/**
 * The bouncing takes LAND_T of the time after the hop; the rest is the bubble wobbling
 * to a stop where it landed, until it pops. (Shared with the server, which times PERFECT
 * BOUNCE taps by the same touch-downs: balance.bounceTimes.)
 */
const LAND_T = BOUNCE_LAND
/** Seconds a PERFECT BOUNCE's surge takes to carry the bubble its extra metres. */
const BOOST_TIME = 0.6
/** Seconds after the pop to land on your feet and cheer. */
const DROP = 0.35

/**
 * How far along its distance (0-1) the bubble is `t` of the way through its bouncing:
 * off fast, slowing as it goes, still rolling forward as it settles.
 */
const progress = (t) => {
  const x = clamp01(t)
  return 1.5 * x - 0.5 * x * x
}

/**
 * Seconds into a bounce of `duration` (the hop included) at which the bubble has gone
 * `f` (0-1) of the distance.
 */
export const kickTimeAt = (f, duration) => KICK_HIT + LAND_T * (1.5 - Math.sqrt(2.25 - 2 * clamp01(f))) * Math.max(0.1, duration - KICK_HIT)

/**
 * The first (and highest) bounce's height: grows with the distance (a short trip hops
 * low, a long one soars) and with how well the bubble was blown (KICK_ARC: a WEAK one
 * skims low, a PERFECT one soars), capped so the valley stays in view below you.
 */
const KICK_ARC = { weak: 0.55, good: 0.85, great: 1.1, perfect: 1.35 }
export const flightPeak = (distance, hit = null) => Math.min(30, (3 + 0.42 * Math.sqrt(Math.max(0, distance))) * (KICK_ARC[hit] ?? 1))

/**
 * The bounces of a trip of `distance` metres (the first `peak` high): each lower than the
 * last, down to LAST_BOUNCE of the first (the same touch-downs as balance.bounceTimes), each lasting as long as its height would take
 * to fall (the square root of it), shared out over the bouncing time. Written into `out`
 * as { count, peak, h: heights, t: start times (0-1 of the bouncing) }; reused, never
 * reallocated, and cached per trip (a rider asks every frame).
 */
function bounceSchedule(distance, hit, out) {
  if (out.distance === distance && out.hit === hit) return out
  out.distance = distance
  out.hit = hit
  const count = bounceCount(distance)
  const peak = flightPeak(distance, hit)
  const r = count > 1 ? Math.pow(LAST_BOUNCE, 1 / (count - 1)) : 1
  let total = 0
  for (let k = 0; k < count; k += 1) {
    out.h[k] = peak * Math.pow(r, k)
    total += Math.sqrt(out.h[k])
  }
  let at = 0
  for (let k = 0; k < count; k += 1) {
    out.t[k] = at
    at += Math.sqrt(out.h[k]) / total
  }
  out.t[count] = 1
  out.count = count
  out.peak = peak
  return out
}
const newSchedule = () => ({ distance: -1, hit: undefined, count: 0, peak: 0, h: new Float32Array(BOUNCE_MAX + 1), t: new Float32Array(BOUNCE_MAX + 2) })

/** A fresh state for rideState to write into. */
export const createRideState = () => ({
  phase: 'launch',
  launch: 0,
  meter: 0,
  speed: 0,
  /** Height of the bubble's bottom off the ground (0: touching down). */
  air: 0,
  size: TIRE_SIZE,
  /** True while the bubble is bouncing (until it settles). */
  airborne: false,
  /** Touch-downs so far. */
  bounces: 0,
  /** The bounce under way (index), its height, and how far through it (0-1). */
  bounce: 0,
  bounceHeight: 0,
  bounceT: 0,
  /** How the rider inside is turned: pitched forward (radians) and rolled. */
  pitch: 0,
  roll: 0,
  /** Never used here (the template's posts): -1 and 0. */
  grip: -1,
  strain: 0,
  /**
   * Pose weights: jumping up onto the bubble, balancing on top of it, sinking in (arms
   * up), floating inside, and up and cheering once it's popped.
   */
  hop: 0,
  perch: 0,
  sink: 0,
  fly: 0,
  sprawl: 0,
  cheer: 0,
  /** Never true: nothing stops a bubble. */
  crashed: false,
  /** The bubble: shown (0-1), squash (<0 flattened, >0 stretched tall), popped. */
  bubble: 1,
  squash: 0,
  popped: false,
  x: 0,
  /** The rider's middle (the point the body turns about). */
  position: new Vector3(),
  /** The bubble's centre. */
  bubblePos: new Vector3(),
  /** Metres PERFECT BOUNCEs have carried the bubble on so far. */
  extra: 0,
  schedule: newSchedule(),
})

/**
 * Everything about a bounce `elapsed` seconds in - yours, or another player's replayed
 * from the same numbers, so both bounce identically. `ride` is `{ fromMeter, startX,
 * distance, duration, hit }` (duration includes the hop); `lane` is a sideways offset so
 * riders don't overlap. Writes into `out` (see createRideState):
 *   phase     'launch' (hopping into the bubble you blew) | 'ride' | 'stopped' (popped)
 *   meter     metres down the valley; speed in m/s along it
 *   position  your middle; bubblePos the bubble's centre (the same once you're in)
 */
export function rideState(elapsed, ride, lane, out) {
  const start = ride.fromMeter + LAUNCH_AHEAD
  const end = Math.max(start + 1, ride.distance)
  const flightTime = Math.max(0.1, ride.duration - KICK_HIT)
  // Timed by the distance as launched, as the server times it (PERFECT BOUNCEs add metres, never bounces).
  const sched = bounceSchedule(ride.distance, ride.hit ?? null, out.schedule)
  let meter = start
  let speed = 0
  /** Height of the bubble's centre, and of the rider's middle. */
  let centre = LAUNCH_Y
  let rider
  let riderMeter = start
  out.airborne = false
  out.crashed = false
  out.grip = -1
  out.strain = 0
  out.hop = 0
  out.perch = 0
  out.sink = 0
  out.fly = 0
  out.sprawl = 0
  out.cheer = 0
  out.roll = 0
  out.pitch = 0
  out.squash = 0
  out.bubble = 1
  out.popped = false
  out.bounces = 0
  out.bounce = 0
  out.bounceHeight = 0
  out.bounceT = 0
  if (elapsed < KICK_HIT) {
    out.phase = 'launch'
    const u = clamp01(elapsed / KICK_HIT)
    out.launch = u
    // However big you'd blown it, it swells to full size as you jump.
    const blown = Number.isFinite(ride.blown) ? Math.min(1, Math.max(0.2, ride.blown)) : 1
    out.bubble = blown + (1 - blown) * smooth(0, JUMP_END, u)
    /** Where your middle is when you stand on top of the bubble (feet just into its skin). */
    const onTop = (squash) => centre + BUBBLE_R * (1 + squash) + BODY.pivot - 0.12
    if (u < JUMP_END) {
      // A big cartoon jump: up off your feet, over the bubble's top, coming down onto it.
      const k = u / JUMP_END
      riderMeter = ride.fromMeter + (start - ride.fromMeter) * smooth(0, 0.9, k)
      rider = BODY.pivot + (onTop(0) - BODY.pivot) * k + Math.sin(Math.PI * k) * 1.1
      out.hop = 1 - smooth(0.8, 1, k)
      out.perch = smooth(0.8, 1, k)
    } else if (u < PERCH_END) {
      // Landed on top: the bubble squashes under you and springs back; arms out to balance.
      const k = (u - JUMP_END) / (PERCH_END - JUMP_END)
      out.squash = -0.2 * Math.sin(Math.PI * k) * (1 - 0.4 * k)
      centre = LAUNCH_Y - BUBBLE_R * 0.12 * Math.sin(Math.PI * k)
      rider = onTop(out.squash) + Math.sin(Math.PI * k) * 0.15
      out.perch = 1 - smooth(0.7, 1, k)
      out.sink = smooth(0.7, 1, k)
    } else if (u < SINK_END) {
      // Sinking in, arms up, through the top of the bubble down into its middle; the
      // bubble wobbles as it swallows you.
      const k = (u - PERCH_END) / (SINK_END - PERCH_END)
      out.squash = 0.08 * Math.sin(k * Math.PI * 3) * (1 - k)
      rider = onTop(0) + (centre - onTop(0)) * smooth(0, 1, k)
      out.sink = 1 - smooth(0.75, 1, k)
      out.fly = smooth(0.75, 1, k)
    } else {
      // In: the bubble jiggles round you and crouches to leap.
      const k = (u - SINK_END) / (1 - SINK_END)
      out.fly = 1
      out.squash = -0.2 * Math.sin(Math.PI * k) + 0.06 * Math.sin(k * 18) * (1 - k)
      centre = LAUNCH_Y - 0.15 * Math.sin(Math.PI * k)
      rider = centre
    }
  } else {
    const t = (elapsed - KICK_HIT) / flightTime
    out.launch = 1
    out.phase = t >= 1 ? 'stopped' : 'ride'
    out.fly = 1
    if (t < LAND_T) {
      // Bouncing: which bounce (by its share of the time) and how far through it.
      const b = t / LAND_T
      let k = 0
      while (k + 1 < sched.count && b >= sched.t[k + 1]) k += 1
      const u = clamp01((b - sched.t[k]) / Math.max(1e-4, sched.t[k + 1] - sched.t[k]))
      const h = sched.h[k]
      const f = progress(b)
      meter = start + (end - start) * f
      speed = ((end - start) * (1.5 - b)) / (LAND_T * flightTime)
      // Each arc: up and down; the first leaves from where the bubble was blown.
      const lift = k === 0 ? (LAUNCH_Y - BUBBLE_R) * (1 - u) : 0
      const air = h * 4 * u * (1 - u) + lift
      centre = BUBBLE_R + air
      out.airborne = true
      out.bounces = k
      out.bounce = k
      out.bounceHeight = h
      out.bounceT = u
      // Squashed flat at each touch-down (harder after a higher fall), stretched tall
      // leaving the ground, round at the top.
      const near = Math.min(u, 1 - u)
      const hard = Math.min(1, Math.sqrt(h / Math.max(1, sched.peak)) + 0.25)
      out.squash = near < 0.07 ? -0.3 * hard * (1 - near / 0.07) : 0.1 * hard * smooth(0.07, 0.2, near) * (1 - smooth(0.25, 0.45, near))
      if (near < 0.07) centre -= BUBBLE_R * 0.3 * hard * (1 - near / 0.07)
      // You float inside, leaning into the way you're going and swaying; a PERFECT
      // blow somersaults you on the first, highest bounce.
      out.pitch = 0.25 + Math.sin(elapsed * 3.1) * 0.12
      out.roll = Math.sin(elapsed * 2.3) * 0.18
      if (k === 0 && ride.hit === 'perfect') out.pitch += Math.PI * 2 * smooth(0.15, 0.85, u)
    } else {
      // Settling where it landed: little hops, wobbling to a stop.
      const v = clamp01((t - LAND_T) / (1 - LAND_T))
      meter = end
      const last = sched.h[Math.max(0, sched.count - 1)]
      centre = BUBBLE_R + last * 0.35 * Math.abs(Math.sin(Math.PI * 2 * v)) * (1 - v)
      out.squash = Math.sin(v * Math.PI * 7) * 0.12 * (1 - v)
      out.bounces = sched.count
      out.pitch = 0.1 * (1 - v)
    }
    rider = centre
    riderMeter = meter
    if (t >= 1) {
      // POP! You drop out onto your feet and cheer.
      const since = elapsed - ride.duration
      const drop = smooth(0, DROP, since)
      out.popped = true
      out.bubble = 0
      out.fly = 1 - drop
      out.cheer = smooth(DROP * 0.6, DROP + 0.25, since)
      out.pitch = 0
      out.roll = 0
      rider = BUBBLE_R + (BODY.pivot - BUBBLE_R) * drop + Math.sin(Math.PI * drop) * 0.25
    }
  }
  // PERFECT BOUNCEs (`ride.boosts`: [{ at, add }]): each surges the bubble on `add` more
  // metres over BOOST_TIME from its touch-down `at` (seconds into the bounce).
  let extra = 0
  const boosts = ride.boosts
  if (boosts) {
    for (let i = 0; i < boosts.length; i += 1) {
      const k = clamp01((elapsed - boosts[i].at) / BOOST_TIME)
      if (k <= 0) continue
      extra += boosts[i].add * k * k * (3 - 2 * k)
      if (k < 1) speed += (boosts[i].add * 6 * k * (1 - k)) / BOOST_TIME
    }
  }
  meter += extra
  riderMeter += extra
  out.extra = extra
  // Ease from where you blew it onto your own line down the valley.
  const settle = clamp01((meter - start) / 40)
  const x = ride.startX * (1 - settle) + lane * settle
  out.meter = meter
  out.speed = speed
  out.air = centre - BUBBLE_R
  out.x = x
  out.size = TIRE_SIZE
  trackPoint(meter, x, centre, out.bubblePos)
  trackPoint(riderMeter, out.phase === 'launch' ? ride.startX : x, rider, out.position)
  return out
}

/** Each other player bounces down their own line of the valley, so riders don't overlap. */
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
