import { twangAt } from '@shared/balance'

/**
 * Your stretch on the launch posts, before the authority hears about it. Press LAUNCH by
 * the posts and you grab them (`gripping`); walking back - the player controller does the
 * walking (Player.jsx), with your own joystick or keys - stretches your arms, and the
 * meter is how far back you've got, out of `max` (how far your arms reach); at full
 * stretch the rubber twangs (shared/balance.js twangAt). Press LET GO and the launch is
 * sent (net/actions.roll); the pose holds until the server's answer starts it
 * (roll/rollControl.beginRoll). Plain module state, written by the LAUNCH button and the
 * player and read every frame by the camera and the avatar - never React state, never
 * per-frame network traffic.
 */
export const launch = {
  /** Holding the posts (walking back, or standing stretched). */
  gripping: false,
  /** Walking back by itself (Auto Launch). */
  auto: false,
  /** Set when you grab: the player moves you onto the stand spot on its next frame. */
  snap: false,
  /** The meter now (0-1), and whether you're at full stretch (the rubber's twanging). */
  charge: 0,
  full: false,
  /** performance.now() you reached full stretch. */
  fullSince: 0,
  /** Let go and waiting for the authority: when. */
  released: false,
  releasedAt: 0,
  /** Metres you are behind the stand spot (the player writes it), and the most you can be. */
  back: 0,
  max: 1,
}

/** No answer this long after letting go (off the pad, busy): let the stretch go. */
const RELEASE_TIMEOUT_MS = 1500

/** Grabs the posts (`auto`: and walks back by itself). */
export function grab(auto = false) {
  launch.gripping = true
  launch.auto = auto
  launch.snap = true
  launch.released = false
  launch.charge = 0
  launch.full = false
  launch.back = 0
}

/**
 * The meter for being `back` metres behind the stand, out of `max`, at `now`. Called
 * every frame by the player while gripping. Returns the meter (0-1).
 */
export function updatePull(now, back, max) {
  launch.back = back
  launch.max = max
  if (launch.released && now - launch.releasedAt > RELEASE_TIMEOUT_MS) cancelPull()
  if (!launch.gripping) return launch.charge
  const full = back >= max - 0.02
  if (full && !launch.full) launch.fullSince = now
  launch.full = full
  launch.charge = full ? twangAt((now - launch.fullSince) / 1000) : Math.max(0, back / max)
  return launch.charge
}

/** Lets go: returns the meter at that moment (what the launch is graded on). */
export function letGo(now = performance.now()) {
  const charge = launch.charge
  launch.gripping = false
  launch.auto = false
  launch.released = true
  launch.releasedAt = now
  return charge
}

/** The authority's launch has started from the stretch: it takes it from here. */
export function consumePull() {
  launch.gripping = false
  launch.auto = false
  launch.released = false
  launch.charge = 0
  launch.full = false
}

/** Gives up the stretch (jumped, stepped away, a panel opened, no answer came). */
export function cancelPull() {
  launch.gripping = false
  launch.auto = false
  launch.released = false
  launch.charge = 0
  launch.full = false
}

/** Whether you're on the posts at all: holding them, or let go and waiting. */
export const isPulling = () => launch.gripping || launch.released
