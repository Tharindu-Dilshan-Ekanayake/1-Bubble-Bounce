/**
 * Little bubbles blown out of a wand: a stream of them on a Blow Pad, a puff at every tap
 * of BLOW, out of other players' wands too. Callers queue them here (from frame loops or
 * events, allocation-free); Puffs.jsx draws them from one pooled InstancedMesh, so however
 * many are flying it's one draw call and nothing is ever created per bubble.
 */

/** A puff at a tap of BLOW: small, drifting off and up close by. */
export const PUFF_TAP = 0
/** A Blow Pad's stream: bigger bubbles carried off through the giant hoop. */
export const PUFF_STREAM = 1

const MAX_QUEUED = 48
const FIELDS = 7
/** Queued puffs as flat numbers: x, y, z, dirX, dirZ, colour (hex number), kind. */
const queue = new Float64Array(MAX_QUEUED * FIELDS)
let queued = 0

/**
 * Queues `count` bubbles blown from (x, y, z) towards (dirX, dirZ) (need not be unit
 * length), tinted `color` (a hex number, e.g. 0xbfe9ff), of `kind` (PUFF_TAP, PUFF_STREAM).
 */
export function emitPuffs(x, y, z, dirX, dirZ, count = 3, color = 0xbfe9ff, kind = PUFF_TAP) {
  for (let i = 0; i < count && queued < MAX_QUEUED; i += 1) {
    const o = queued * FIELDS
    queue[o] = x
    queue[o + 1] = y
    queue[o + 2] = z
    queue[o + 3] = dirX
    queue[o + 4] = dirZ
    queue[o + 5] = color
    queue[o + 6] = kind
    queued += 1
  }
}

/** Hands every queued puff to `spawn(x, y, z, dirX, dirZ, color, kind)` and empties the queue. */
export function drainPuffs(spawn) {
  for (let i = 0; i < queued; i += 1) {
    const o = i * FIELDS
    spawn(queue[o], queue[o + 1], queue[o + 2], queue[o + 3], queue[o + 4], queue[o + 5], queue[o + 6])
  }
  queued = 0
}

/** Taps of BLOW waiting for your wand to blow them out (the player picks them up). */
let taps = 0
export const requestTapPuff = () => {
  taps = Math.min(taps + 1, 4)
}
export function takeTapPuffs() {
  const n = taps
  taps = 0
  return n
}
