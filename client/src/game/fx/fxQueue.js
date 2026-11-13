/**
 * Hand-off from network events to the frame loop. Events arrive on timers and sockets;
 * the effects they trigger need the renderer's clock and camera, so they are queued
 * here and drained by the effect systems inside useFrame. Plain arrays, never state.
 */

const MAX_QUEUED = 12
const trainQueue = []

export function queueTrainFx(event) {
  trainQueue.push(event)
  if (trainQueue.length > MAX_QUEUED) trainQueue.shift()
}

export function drainTrainFx(handle) {
  while (trainQueue.length) handle(trainQueue.shift())
}

const MAX_BURSTS = 8
const bursts = []

/**
 * Queues a confetti burst at (x, y, z). Dropped by the particle system on presets
 * without particles.
 *
 * @param {{ x: number, y: number, z: number, count?: number, speed?: number,
 *           palette?: 'confetti' | 'gold' | 'power' | 'wood' }} burst
 */
export function burst({ x, y, z, count = 30, speed = 7, palette = 'confetti' }) {
  bursts.push({ x, y, z, count, speed, palette })
  if (bursts.length > MAX_BURSTS) bursts.shift()
}

export function drainBursts(handle) {
  while (bursts.length) handle(bursts.shift())
}

/** A PERFECT hit's fire waiting to be started by FireBurst.jsx, or null. */
let pendingFire = null

/**
 * Starts a burst at (x, y, z): off the boot as it meets the ball - `kind` 'perfect' (a
 * column of fire), 'great' (an electric-blue blast) or 'good' (a spray of sparkles) - or
 * 'dust' billowing up, or 'turf': the small puff of grass dust where the ball lands.
 */
export function fireBurst(x, y, z, kind = 'perfect') {
  pendingFire = { x, y, z, kind }
}

/** The fire burst queued since last asked, or null; FireBurst.jsx calls this every frame. */
export function takeFireBurst() {
  const fire = pendingFire
  pendingFire = null
  return fire
}
