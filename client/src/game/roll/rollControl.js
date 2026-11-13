import { Vector3 } from 'three'

import { BOUNCE_MAX, bounceTimes, comboBonus, GOOD_BOUNCE_WINDOW, HIT_GRADES, MAX_PERFECT_BOUNCES, PERFECT_BOUNCE_REACH, PERFECT_BOUNCE_WINDOW } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { ROLL_RETURN } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame } from '../../store/game'
import { fadeThrough } from '../../ui/fade'
import { burst, fireBurst } from '../fx/fxQueue'
import { spawnScattered } from '../fx/popups'
import { consumeBlow, launch } from '../launch'
import { runtime } from '../runtime'
import { zones } from '../worldLook'
import { showHit } from './hudLink'
import { createRideState, KICK_HIT, meterAtZ, rideState } from './path'

/** How long the "+N Wins" result shows over you, after the pop, before you're back. */
const RESULT_HOLD_MS = 2600

/**
 * The bounce currently playing (the template's "roll"), read every frame by the camera,
 * the valley, your avatar, the bubble and the effects. Everything about it is known when
 * it starts (the authority already resolved the distance and the Wins), so the client
 * just plays it back: no per-frame network traffic.
 *
 * It's a ride state (see path.rideState: phase, meter, air, bounces, squash, pitch, roll,
 * the pose weights, the rider's and the bubble's positions...) plus the bounce's numbers.
 * Your logical position stays in the BLOW ZONE while you bounce (that's what the server
 * checks); only your avatar, your bubble and the camera go down the valley.
 */
export const roll = {
  ...createRideState(),
  active: false,
  /** True once the bubble has popped and the result is showing. */
  stopped: false,
  startedAt: 0,
  distance: 0,
  duration: 1,
  wins: 0,
  prize: 0,
  discovered: [],
  /** Never anything but -1: nothing stops a bubble (the template's walls). */
  blocked: -1,
  /** How many stages it bounces into past the first. */
  broken: 0,
  best: false,
  tireId: 'soap',
  /** How well you blew it (HIT_GRADES id), or null for Auto Bounce. */
  hit: null,
  /** Where you blew it from: metre along the valley and how far to the side. */
  fromMeter: 0,
  startX: 0,
  /** How big you'd blown the bubble when you let go (0-1; it swells to full as you jump on). */
  blown: 1,
  /** PERFECTs in a row with this bounce (0: not a PERFECT), and its lucky gift or null. */
  combo: 0,
  /**
   * PERFECT BOUNCE taps: when the bubble touches down (seconds into the bounce,
   * balance.bounceTimes - the server's own), how each touch-down went (0 not yet,
   * 1 PERFECT, 2 GOOD, 3 spent by a MISS, 4 passed untapped), the surges PERFECTs have
   * added ([{ at, add }], read by path.rideState), PERFECTs so far, PERFECTs in a row, and
   * the first touch-down not yet passed.
   */
  touchdowns: [],
  judged: new Uint8Array(BOUNCE_MAX),
  boosts: [],
  perfects: 0,
  bounceCombo: 0,
  passCursor: 0,
  gift: null,
  /** performance.now() of the last touch-down and take-off, for dust, shake and sound. */
  landedAt: 0,
  tookOffAt: 0,
  hitAt: 0,
  /** How hard the last touch-down shakes the camera (0-1). */
  shakePower: 0,
  /** performance.now() when the bubble leapt away. */
  kickedAt: 0,
  /**
   * A graded blow's moment: when it started (performance.now(), 0 if none this bounce),
   * how long time stands still (never, now), how strong the camera's zoom, punch and
   * shake are (0-1), and the clock's lag when it started.
   */
  freezeAt: 0,
  freezeMs: 0,
  freezePower: 0,
  freezeLag: 0,
  /**
   * The bubble thumping down: when (performance.now()), where, and how high it fell from
   * - what the ground's ripple and its spray need (Impact.jsx), on every touch-down.
   */
  impactAt: 0,
  impact: new Vector3(),
  impactMeter: 0,
  impactPeak: 0,
  frameKey: -1,
  /**
   * Slow motion: ms the bounce's clock is behind real time. Every touch-down slows it for
   * a moment; the clock catches up again a little faster than real time afterwards, and is
   * always caught up before the pop, so the bounce ends exactly when the authority said.
   */
  lag: 0,
  lastNow: 0,
}

/** How long each touch-down's slow motion lasts, how slow, and how fast the clock catches up. */
const SLOW_MS = 120
const SLOW_RATE = 0.45
/** How fast the clock runs during a hit-stop: all but frozen. */
const FREEZE_RATE = 0.06
const CATCH_UP = 0.4

let timers = []

function clearTimers() {
  for (const id of timers) clearTimeout(id)
  timers = []
}

/**
 * Moves the bounce on to this frame. Idempotent per frame (keyed on the renderer's
 * clock), so the camera, the valley and the effects all see exactly the same state
 * however many of them ask.
 */
export function advanceRoll(clockTime) {
  if (!roll.active || roll.frameKey === clockTime) return roll
  roll.frameKey = clockTime
  const now = performance.now()
  const wasAirborne = roll.airborne
  const wasWaiting = roll.phase === 'launch'
  const wasBounces = roll.bounces
  const wasPopped = roll.popped
  const dt = roll.lastNow ? Math.min(now - roll.lastNow, 100) : 0
  roll.lastNow = now
  if (now - roll.freezeAt < roll.freezeMs) {
    // From the clock, not summed frame by frame: frame steps are capped, so on a slow
    // device a summed freeze would mostly slip away.
    roll.lag = roll.freezeLag + (now - roll.freezeAt) * (1 - FREEZE_RATE)
  } else if (now - roll.hitAt < SLOW_MS) roll.lag += dt * (1 - SLOW_RATE)
  else roll.lag = Math.max(0, roll.lag - dt * CATCH_UP)
  // All caught up by half a second before the pop.
  const left = roll.duration - (now - roll.startedAt) / 1000
  roll.lag = Math.min(roll.lag, Math.max(0, left - 0.5) * 400)
  rideState((now - roll.startedAt - roll.lag) / 1000, roll, 0, roll)
  if (wasWaiting && roll.phase !== 'launch') {
    roll.kickedAt = now
    roll.tookOffAt = now
    blastOff(now)
  }
  // Each touch-down: a springy BOING, the ground rippling out under the bubble, a jolt of
  // the camera - all as big as the fall it came from.
  if (roll.bounces > wasBounces && roll.phase === 'ride') {
    const fell = roll.schedule.h[Math.max(0, roll.bounces - 1)] || 1
    touchDown(now, fell, roll.bounces - 1)
  }
  if (wasAirborne && !roll.airborne && !roll.popped) {
    // Settled where it landed: one last soft thud.
    touchDown(now, roll.schedule.h[Math.max(0, roll.schedule.count - 1)] || 1, roll.schedule.count)
  }
  if (!wasPopped && roll.popped) pop(now)
  // A touch-down gone by without a tap ends the PERFECT BOUNCE combo.
  if (roll.phase === 'ride') {
    const e = (now - roll.startedAt - roll.lag) / 1000
    while (roll.passCursor < roll.touchdowns.length && roll.touchdowns[roll.passCursor] < e - GOOD_BOUNCE_WINDOW) {
      if (!roll.judged[roll.passCursor]) {
        roll.judged[roll.passCursor] = 4
        roll.bounceCombo = 0
      }
      roll.passCursor += 1
    }
  }
  return roll
}

/** A touch-down after a fall of `fell` metres (bounce number `n`, 0 the first). */
function touchDown(now, fell, n) {
  const power = Math.min(1, Math.sqrt(fell / Math.max(1, roll.schedule.peak)))
  roll.landedAt = now
  roll.hitAt = now
  roll.shakePower = 0.25 + 0.75 * power * (n === 0 ? 1 : 0.6)
  roll.impactAt = now
  roll.impact.copy(roll.bubblePos)
  roll.impactMeter = roll.meter
  roll.impactPeak = fell
  sfx.bounce(n)
  if (n === 0 && fell > 6) sfx.groundSmash(Math.min(1, fell / 30))
  const p = roll.bubblePos
  burst({ x: p.x, y: 0.3, z: p.z, count: Math.round(10 + 22 * power), palette: 'bubble', speed: 4 + 6 * power })
}

/** The bubble pops where it stopped: a burst of soap droplets and a POP! */
function pop() {
  const p = roll.bubblePos
  sfx.bubblePop()
  burst({ x: p.x, y: p.y, z: p.z, count: 60, palette: 'bubble', speed: 9 })
  spawnScattered('POP!', { scale: 1.6 })
}

/**
 * How each grade of blow looks and sounds as the bubble leaps away: its burst (FireBurst
 * kind), confetti, and how hard the camera reacts (0-1). The rest - the title - follows
 * the grade too.
 */
const HIT_FX = {
  // No freeze (freezeMs 0): time standing still at take-off read as the game sticking.
  perfect: { fire: 'perfect', palette: 'gold', count: 60, speed: 12, freezeMs: 0, power: 1 },
  great: { fire: 'great', palette: 'bubble', count: 40, speed: 9, freezeMs: 0, power: 0.65 },
  good: { fire: 'good', palette: 'confetti', count: 16, speed: 6, freezeMs: 0, power: 0.35 },
  weak: { fire: null, palette: null, count: 0, speed: 0, freezeMs: 0, power: 0 },
}

/**
 * The bubble leaping away: the grade the blow meter gave it, straight away, so you see
 * why you go as far as you do. GOOD, GREAT and PERFECT each get their own moment, bigger
 * every step: a burst flies off you - sparkles, a blast of bubbles, a column of fire - and
 * the grade's title slams onto the screen (HitFlash.jsx); then you leap away with the
 * lens punching wide and the camera shaking (Roll.jsx). A WEAK one just plops off.
 */
function blastOff(now) {
  const grade = HIT_GRADES.find((g) => g.id === roll.hit)
  if (!grade) return
  const fx = HIT_FX[grade.id]
  const p = roll.bubblePos
  if (fx.count) burst({ x: p.x, y: p.y, z: p.z, count: fx.count, palette: fx.palette, speed: fx.speed })
  // PERFECTs in a row: the combo and the Wins it adds.
  if (grade.id === 'perfect' && roll.combo >= 2) {
    timers.push(setTimeout(() => spawnScattered(`PERFECT COMBO x${roll.combo}! +${Math.round((comboBonus(roll.combo) - 1) * 100)}% WINS`, { scale: 1.25 }), 450))
  }
  if (grade.id === 'weak') {
    spawnScattered(grade.label, { scale: 1.3 })
    sfx.weakHit()
    return
  }
  // From the moment you left on the bounce's clock, not whichever frame noticed.
  roll.freezeAt = Math.min(now, roll.startedAt + roll.lag + KICK_HIT * 1000)
  roll.freezeMs = fx.freezeMs
  roll.freezePower = fx.power
  roll.freezeLag = roll.lag
  fireBurst(p.x, p.y, p.z, fx.fire)
  showHit(grade.id)
  sfx.gradeHit(grade.id)
  timers.push(setTimeout(() => sfx.perfectRelease(fx.power), fx.freezeMs))
}

/**
 * Starts a bounce the authority already resolved, from where you blew the bubble: you
 * jump up onto it, sink inside, and it leaps away and bounces down the valley.
 */
export function beginRoll(result) {
  clearTimers()
  const game = getGame()
  const p = runtime.player.position
  // How big you'd blown it (Auto Bounce and a held one: full size); it swells the rest
  // of the way as you jump onto it.
  const blown = launch.charging || launch.released ? Math.max(0.2, launch.size) : 1
  consumeBlow()
  Object.assign(roll, {
    active: true,
    stopped: false,
    startedAt: performance.now(),
    distance: result.distance,
    duration: result.duration,
    wins: result.wins,
    prize: result.prize || 0,
    discovered: result.discovered || [],
    blocked: -1,
    broken: result.broken || 0,
    best: result.best,
    tireId: result.tireId || game.profile.equippedTire,
    hit: result.hit ?? null,
    fromMeter: meterAtZ(p.z),
    blown,
    startX: p.x,
    combo: result.combo || 0,
    touchdowns: bounceTimes(result.distance, result.duration).touchdowns,
    boosts: [],
    perfects: 0,
    bounceCombo: 0,
    passCursor: 0,
    gift: result.gift || null,
    landedAt: 0,
    tookOffAt: 0,
    hitAt: 0,
    shakePower: 0,
    kickedAt: 0,
    freezeAt: 0,
    freezeMs: 0,
    freezePower: 0,
    impactAt: 0,
    frameKey: -1,
    lag: 0,
    lastNow: 0,
  })
  roll.judged.fill(0)
  rideState(0, roll, 0, roll)
  runtime.player.frozen = true
  // Square up to the valley.
  runtime.player.yaw = Math.PI
  runtime.camera.mode = 'roll'
  // The HUD's switch to the bounce (a React update and a restyle) in a task of its own,
  // not the frame the bounce starts in: together they made that one frame stick on slow
  // phones. The bounce itself is already under way from the runtime state above.
  const started = {
    distance: result.distance,
    wins: result.wins,
    prize: result.prize || 0,
    blocked: -1,
    duration: result.duration,
    best: result.best,
    giftWins: result.gift?.wins || 0,
  }
  timers.push(setTimeout(() => game.startRoll(started), 0))

  // A springy jump up, a BOING as you land on top, a wet "bloop" as you sink through
  // its skin, then the whoosh as it leaps away (path.rideState: JUMP_END, SINK_END).
  sfx.jump()
  timers.push(setTimeout(() => sfx.bounce(2), KICK_HIT * 0.28 * 1000))
  timers.push(setTimeout(() => sfx.bubbleHop(), KICK_HIT * 0.52 * 1000))
  timers.push(setTimeout(() => sfx.rollStart(), KICK_HIT * 1000))
  timers.push(
    setTimeout(() => {
      roll.stopped = true
      sfx.wins()
      const f = roll.position
      burst({ x: f.x, y: f.y + 1.8, z: f.z, count: 50, palette: 'gold', speed: 9 })
      game.endRoll()
      // A stage reached for the first time ever: its name and the prize, once.
      const stages = zones()
      for (const zi of roll.discovered) {
        game.showToast(`NEW STAGE: ${stages[zi].name}! +${formatNumber(stages[zi].discover)} Wins`)
      }
      // A lucky gift: a present bursting open over you, and what was in it.
      const gift = roll.gift
      if (gift) {
        timers.push(
          setTimeout(
            () => {
              sfx.reveal()
              burst({ x: f.x, y: f.y + 2.4, z: f.z, count: 70, palette: 'confetti', speed: 11 })
              const what = gift.wins ? `+${formatNumber(gift.wins)} Wins` : gift.label
              game.showToast(`LUCKY GIFT! ${gift.wins ? `${gift.label}: ${what}` : what}`)
            },
            roll.discovered.length ? 1600 : 500,
          ),
        )
      }
      timers.push(setTimeout(() => fadeThrough(finishRoll), RESULT_HOLD_MS))
    }, result.duration * 1000),
  )
}

/**
 * Back in the Blow Zone, camera behind you, ready to blow again. With Auto Bounce on
 * you stay where you blew from, so the next bounce goes straight away.
 */
export function finishRoll() {
  clearTimers()
  roll.active = false
  roll.stopped = false
  runtime.flightFocus = null
  const player = runtime.player
  const { passes, settings } = getGame().profile
  if (!(passes.autoRoll && settings.autoRoll)) player.position.set(ROLL_RETURN.x, 0, ROLL_RETURN.z)
  player.yaw = Math.PI
  player.frozen = false
  runtime.camera.mode = 'follow'
  runtime.camera.yaw = 0
  runtime.camera.snap = true
  getGame().clearRollResult()
}

/** The touch-down a tap at bounce time `e` is about: the nearest not yet taken, or -1. */
function nearestTouchdown(e) {
  let best = -1
  let bestGap = Infinity
  for (let k = 0; k < roll.touchdowns.length; k += 1) {
    if (roll.judged[k]) continue
    const gap = Math.abs(e - roll.touchdowns[k])
    if (gap < bestGap) {
      bestGap = gap
      best = k
    }
  }
  return best
}

/**
 * A tap while you bounce: judged against the nearest touch-down still to take
 * (balance PERFECT_BOUNCE_WINDOW, GOOD_BOUNCE_WINDOW), on the bounce's own clock - what
 * you see. PERFECT: the bubble surges on (path.rideState `boosts`) straight away, a
 * shout, a chime, a gold burst and the combo counting up; GOOD: a smaller one. The server
 * is told either way and pays for it (shared/session.js bounceTap). Anything further off
 * is a MISS, and spends the next touch-down - tapping non-stop gets you nothing. Returns
 * the grade, or null when there's nothing to tap.
 */
export function tapBounce(now = performance.now()) {
  if (!roll.active || roll.phase !== 'ride') return null
  const e = (now - roll.startedAt - roll.lag) / 1000
  const k = nearestTouchdown(e)
  if (k < 0) return null
  const gap = Math.abs(e - roll.touchdowns[k])
  const p = roll.bubblePos
  if (gap > GOOD_BOUNCE_WINDOW) {
    // A MISS: it spends the next touch-down to come.
    for (let next = 0; next < roll.touchdowns.length; next += 1) {
      if (!roll.judged[next] && roll.touchdowns[next] > e) {
        roll.judged[next] = 3
        break
      }
    }
    roll.bounceCombo = 0
    spawnScattered('MISS', { scale: 0.85 })
    sfx.missBounce()
    return 'miss'
  }
  let grade = gap <= PERFECT_BOUNCE_WINDOW ? 'perfect' : 'good'
  if (grade === 'perfect' && roll.perfects >= MAX_PERFECT_BOUNCES) grade = 'good'
  roll.judged[k] = grade === 'perfect' ? 1 : 2
  actions.bounceTap(k, grade)
  if (grade === 'perfect') {
    roll.perfects += 1
    roll.bounceCombo += 1
    // The surge starts at the touch-down (or now, tapped a touch late).
    roll.boosts.push({ at: Math.max(e, roll.touchdowns[k]), add: Math.round(roll.distance * PERFECT_BOUNCE_REACH * 10) / 10 })
    const combo = roll.bounceCombo
    spawnScattered(combo > 1 ? `PERFECT BOUNCE x${combo}!` : 'PERFECT BOUNCE!', { scale: 1.3 + Math.min(0.5, combo * 0.08) })
    sfx.perfectBounce(combo)
    burst({ x: p.x, y: Math.max(0.4, p.y - 1), z: p.z, count: 36, palette: 'gold', speed: 9 })
    roll.hitAt = now
    roll.shakePower = 0.55
  } else {
    roll.bounceCombo = 0
    spawnScattered('GOOD BOUNCE', { scale: 1.05 })
    sfx.goodBounce()
    burst({ x: p.x, y: Math.max(0.4, p.y - 1), z: p.z, count: 14, palette: 'bubble', speed: 6 })
  }
  return grade
}

/** The server counted a PERFECT or GOOD BOUNCE: any stage it reached for the first time is announced with the rest. */
export function confirmBounceBoost(payload) {
  if (!roll.active || !payload?.discovered?.length) return
  for (const zi of payload.discovered) if (!roll.discovered.includes(zi)) roll.discovered.push(zi)
}
