import { CHARGE_HOLD_MAX, CHARGE_TIME, twangAt } from '@shared/balance'

/**
 * Blowing your bubble in the BLOW ZONE, before the authority hears about it. Hold BLOW
 * (the button, E or Enter) anywhere on the zone and you start blowing: the bubble swells
 * out of your wand (`size`) and the meter fills (`charge`) over CHARGE_TIME; at full size
 * it wobbles, the meter bouncing off the top (shared/balance.js twangAt). Let go and the
 * bounce is sent (net/actions.roll) with the meter as it stood; the bubble holds until the
 * server's answer starts the bounce (roll/rollControl.beginRoll). Held too long at full
 * size, it lets go by itself. Plain module state, written by the BLOW button and the
 * player, read every frame by the camera, the avatar and the bubble - never React state,
 * never per-frame network traffic.
 */
export const launch = {
  /** Holding BLOW: the bubble is growing (or wobbling at full size). */
  charging: false,
  /** Blown by Auto Bounce (it lets go by itself). */
  auto: false,
  /** The meter now (0-1), the bubble's size (0-1), and whether it's at full size. */
  charge: 0,
  size: 0,
  full: false,
  /** performance.now() you started blowing, and reached full size. */
  startedAt: 0,
  fullSince: 0,
  /** Let go and waiting for the authority: when. */
  released: false,
  releasedAt: 0,
}

/** No answer this long after letting go (off the zone, busy): the bubble pops. */
const RELEASE_TIMEOUT_MS = 1500

/**
 * Blowing starts with two little bubbles off the wand: each swells for `grow` seconds
 * from `at` (seconds after you started blowing) to radius `r`, then floats away up and to
 * one side (`side`) for `drift` seconds and pops. Then, from BIG_START, the giant one
 * swells to full size at CHARGE_TIME. (BubbleRiders draws them all from these.)
 */
export const SMALL_BUBBLES = [
  { at: 0, grow: 0.24, r: 0.52, side: -1, drift: 1.3 },
  { at: 0.27, grow: 0.24, r: 0.7, side: 1, drift: 1.4 },
]
export const BIG_START = 0.55

/** Starts blowing (`auto`: Auto Bounce, which lets go by itself). */
export function startBlow(now = performance.now(), auto = false) {
  launch.charging = true
  launch.auto = auto
  launch.released = false
  launch.startedAt = now
  launch.charge = 0
  launch.size = 0
  launch.full = false
}

/**
 * The meter and the bubble's size at `now`. Called every frame by the player while
 * blowing (and after letting go, to time out). Returns the meter (0-1).
 */
export function updateBlow(now = performance.now()) {
  if (launch.released && now - launch.releasedAt > RELEASE_TIMEOUT_MS) cancelBlow()
  if (!launch.charging) return launch.charge
  const t = (now - launch.startedAt) / 1000
  if (t < CHARGE_TIME) {
    launch.charge = t / CHARGE_TIME
    // The little bubbles come first; then the giant one swells, easing into full size.
    const k = Math.max(0, (t - BIG_START) / (CHARGE_TIME - BIG_START))
    launch.size = t < BIG_START ? 0 : 0.06 + 0.94 * (1 - (1 - k) * (1 - k))
    launch.full = false
  } else {
    if (!launch.full) {
      launch.full = true
      launch.fullSince = launch.startedAt + CHARGE_TIME * 1000
    }
    launch.charge = twangAt((now - launch.fullSince) / 1000)
    // Wobbling: biggest at the top of the meter.
    launch.size = 0.9 + 0.1 * launch.charge
  }
  return launch.charge
}

/** Whether the bubble has been held at full size so long it lets go by itself. */
export const heldTooLong = (now = performance.now()) => launch.charging && launch.full && (now - launch.fullSince) / 1000 > CHARGE_HOLD_MAX

/** Lets go: returns the meter at that moment (what the bounce is graded on). */
export function releaseBlow(now = performance.now()) {
  const charge = launch.charge
  launch.charging = false
  launch.auto = false
  launch.released = true
  launch.releasedAt = now
  return charge
}

/** The authority's bounce has started: it takes the bubble from here. */
export function consumeBlow() {
  launch.charging = false
  launch.auto = false
  launch.released = false
  launch.charge = 0
  launch.size = 0
  launch.full = false
}

/** Gives up the bubble (jumped, stepped off, a panel opened, no answer came): it pops. */
export function cancelBlow() {
  const had = launch.charging || launch.released
  consumeBlow()
  return had
}

/** Whether you're blowing at all: holding BLOW, or let go and waiting. */
export const isBlowing = () => launch.charging || launch.released
