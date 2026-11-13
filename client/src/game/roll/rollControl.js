import { Vector3 } from 'three'

import { comboBonus, HIT_GRADES, STRETCH_REACH } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { LAUNCH_STAND, MAX_PULL, ROLL_RETURN } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame } from '../../store/game'
import { fadeThrough } from '../../ui/fade'
import { burst, fireBurst } from '../fx/fxQueue'
import { spawnScattered } from '../fx/popups'
import { consumePull, launch } from '../launch'
import { runtime } from '../runtime'
import { zones } from '../worldLook'
import { showHit } from './hudLink'
import { createRideState, flightPeak, KICK_HIT, meterAtZ, PULL_DIST, PUSH_AHEAD, rideState, kickTimeAt } from './path'

/** How long the "+N Wins" result shows over you, landed, before you're back. */
const RESULT_HOLD_MS = 2600
/** The skid sound starts this long before a normal stop. */
const SKID_SOUND_LEAD = 0.9

/**
 * The launch currently playing (the template's "roll"), read every frame by the camera,
 * the runway, your avatar and the effects. Everything about it is known when it starts
 * (the authority already resolved the distance and the Wins), so the client just plays it
 * back: no per-frame network traffic.
 *
 * It's a ride state (see path.rideState: phase, meter, air, pitch, roll, grip, the pose
 * weights, position...) plus the launch's numbers. Your logical position stays on the
 * LAUNCH PAD while you fly (that's what the server checks); only your avatar and the
 * camera go down the runway.
 */
export const roll = {
  ...createRideState(),
  active: false,
  /** True once you've landed and the result is showing. */
  stopped: false,
  startedAt: 0,
  distance: 0,
  duration: 1,
  wins: 0,
  prize: 0,
  discovered: [],
  /** Zone index of the wall that stopped it, or -1. */
  blocked: -1,
  /** How many stages it flies into past the first. */
  broken: 0,
  best: false,
  tireId: 'bicycle',
  /** How well you let go (HIT_GRADES id), or null for Auto Launch. */
  hit: null,
  /** Where you launched from: metre along the runway and how far to the side. */
  fromMeter: 0,
  startX: 0,
  /** How far back the stretch had walked you (metres): the snap starts from there. */
  pull: 0,
  /** PERFECTs in a row with this launch (0: not a PERFECT), and its lucky gift or null. */
  combo: 0,
  /** Metres of the stretch lane the server paid this launch for (STRETCH_REACH). */
  stretch: 0,
  gift: null,
  /** performance.now() of the last landing, take-off and wall hit, for dust, shake and sound. */
  landedAt: 0,
  tookOffAt: 0,
  hitAt: 0,
  /** performance.now() when you shot past the posts. */
  kickedAt: 0,
  /**
   * A graded hit's hit-stop: when it started (performance.now(), 0 if none this kick),
   * how long it lasts, how strong the camera's zoom, punch and shake are (0-1), and the
   * roll clock's lag when it started (the freeze is measured from it).
   */
  freezeAt: 0,
  freezeMs: 0,
  freezePower: 0,
  freezeLag: 0,
  /**
   * You slamming down at the end of the arc: when (performance.now()), where, and how
   * high you fell from - what the turf splash and its spray of grass need.
   */
  impactAt: 0,
  impact: new Vector3(),
  impactMeter: 0,
  impactPeak: 0,
  frameKey: -1,
  /**
   * Slow motion: ms the roll's clock is behind real time. Every wall smashed slows the
   * ball (and the camera on it) for a moment, so you see the planks burst; the clock
   * catches up again a little faster than real time afterwards, and is always caught up
   * before the ball stops, so the kick ends exactly when the authority said.
   */
  lag: 0,
  lastNow: 0,
}

/** How long each smash's slow motion lasts, how slow, and how fast the clock catches up. */
const SLOW_MS = 220
const SLOW_RATE = 0.25
/** How fast the roll's clock runs during a hit-stop: all but frozen. */
const FREEZE_RATE = 0.06
const CATCH_UP = 0.4

let timers = []

function clearTimers() {
  for (const id of timers) clearTimeout(id)
  timers = []
}

/**
 * Moves the roll on to this frame. Idempotent per frame (keyed on the renderer's
 * clock), so the camera, walls and effects all see exactly the same state however many
 * of them ask.
 */
export function advanceRoll(clockTime) {
  if (!roll.active || roll.frameKey === clockTime) return roll
  roll.frameKey = clockTime
  const now = performance.now()
  const wasAirborne = roll.airborne
  const wasCrashed = roll.crashed
  const wasWaiting = roll.phase === 'launch'
  const wasBounces = roll.bounces
  const dt = roll.lastNow ? Math.min(now - roll.lastNow, 100) : 0
  roll.lastNow = now
  if (now - roll.freezeAt < roll.freezeMs) {
    // From the clock, not summed frame by frame: frame steps are capped, so on a slow
    // device a summed freeze would mostly slip away.
    roll.lag = roll.freezeLag + (now - roll.freezeAt) * (1 - FREEZE_RATE)
  } else if (now - roll.hitAt < SLOW_MS && !roll.crashed) roll.lag += dt * (1 - SLOW_RATE)
  else roll.lag = Math.max(0, roll.lag - dt * CATCH_UP)
  // All caught up by half a second before the stop.
  const left = roll.duration - (now - roll.startedAt) / 1000
  roll.lag = Math.min(roll.lag, Math.max(0, left - 0.5) * 400)
  rideState((now - roll.startedAt - roll.lag) / 1000, roll, 0, roll)
  if (wasWaiting && roll.phase !== 'launch') {
    roll.kickedAt = now
    blastOff(now)
  }
  if (!wasAirborne && roll.airborne) {
    roll.tookOffAt = now
    sfx.jumpWhoosh()
  } else if (wasAirborne && !roll.airborne) {
    // Slammed down from the top of the arc: the runway cracks open (Impact.jsx), the
    // camera jolts, a moment of slow motion, and a boom.
    roll.landedAt = now
    roll.hitAt = now
    roll.impactAt = now
    roll.impact.copy(roll.position)
    roll.impactMeter = roll.meter
    roll.impactPeak = flightPeak(roll.distance - roll.fromMeter - PUSH_AHEAD, roll.hit)
    sfx.groundSmash(Math.min(1, roll.impactPeak / 32))
  }
  // Each belly bounce on the turf after it: a thud, softer every time.
  if (roll.bounces > wasBounces && wasBounces > 0) sfx.bounce(roll.bounces - 1)
  if (!wasCrashed && roll.crashed) {
    roll.hitAt = now
    sfx.wallBlock()
  }
  return roll
}

/**
 * How each grade of launch looks and sounds as you shoot past the posts: its burst
 * (FireBurst kind), confetti, how long time stands still and how hard the camera reacts
 * (0-1). The rest - the title - follows the grade too.
 */
const HIT_FX = {
  // No freeze (freezeMs 0): time standing still at launch read as the game sticking.
  perfect: { fire: 'perfect', palette: 'gold', count: 60, speed: 12, freezeMs: 0, power: 1 },
  great: { fire: 'great', palette: 'power', count: 34, speed: 9, freezeMs: 0, power: 0.65 },
  good: { fire: 'good', palette: 'confetti', count: 16, speed: 6, freezeMs: 0, power: 0.35 },
  weak: { fire: null, palette: null, count: 0, speed: 0, freezeMs: 0, power: 0 },
}

/**
 * Shooting past the posts: the grade the stretch meter gave the launch, straight away, so
 * you see why you fly as far as you do. GOOD, GREAT and PERFECT each get their own moment,
 * bigger every step: time stands still for a beat while a burst flies off you - sparkles,
 * an electric-blue blast, a column of fire - and the grade's title slams onto the screen
 * (HitFlash.jsx); then you blast away with the lens punching wide and the camera shaking
 * (Roll.jsx). A WEAK one just flops off the rubber.
 */
function blastOff(now) {
  const grade = HIT_GRADES.find((g) => g.id === roll.hit)
  if (!grade) return
  const fx = HIT_FX[grade.id]
  const p = roll.position
  if (fx.count) burst({ x: p.x, y: p.y, z: p.z, count: fx.count, palette: fx.palette, speed: fx.speed })
  // The stretch: metres walked back, and how much further that flings you.
  if (roll.stretch >= 1) {
    const extra = Math.round((STRETCH_REACH * roll.stretch * 100) / MAX_PULL)
    spawnScattered(`${Math.round(roll.stretch)}m STRETCH! +${extra}% FLY`, { scale: 1.1 + Math.min(0.5, roll.stretch / 60) })
  }
  // PERFECTs in a row: the combo and the Wins it adds.
  if (grade.id === 'perfect' && roll.combo >= 2) {
    timers.push(setTimeout(() => spawnScattered(`PERFECT COMBO x${roll.combo}! +${Math.round((comboBonus(roll.combo) - 1) * 100)}% WINS`, { scale: 1.25 }), 450))
  }
  if (grade.id === 'weak') {
    spawnScattered(grade.label, { scale: 1.3 })
    sfx.weakHit()
    return
  }
  // The freeze starts the moment you passed the posts on the launch's clock, not at
  // whichever frame noticed: on a slow frame you'd be well away by then.
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
 * Starts a launch the authority already resolved, from wherever your stretch had walked
 * you back to: the rubber snaps, you're slung past the posts, and off you fly. (Auto
 * Launch, and a launch the stretch had already let go of, start from full stretch.)
 */
export function beginRoll(result) {
  clearTimers()
  const game = getGame()
  const p = runtime.player.position
  // How far back you'd walked from the posts' stand spot (your logical position: the
  // server saw you there too). Auto Launch walks you all the way back as well.
  const stretched = launch.gripping || launch.released
  consumePull()
  const back = Math.max(0, p.z - LAUNCH_STAND.z)
  Object.assign(roll, {
    active: true,
    stopped: false,
    startedAt: performance.now(),
    distance: result.distance,
    duration: result.duration,
    wins: result.wins,
    prize: result.prize || 0,
    discovered: result.discovered || [],
    blocked: result.blocked ?? -1,
    broken: result.broken || 0,
    best: result.best,
    tireId: result.tireId || game.profile.equippedTire,
    hit: result.hit ?? null,
    fromMeter: meterAtZ(LAUNCH_STAND.z),
    startX: LAUNCH_STAND.x,
    pull: stretched || back > 0.2 ? back : PULL_DIST,
    combo: result.combo || 0,
    stretch: result.stretch || 0,
    gift: result.gift || null,
    landedAt: 0,
    tookOffAt: 0,
    hitAt: 0,
    kickedAt: 0,
    freezeAt: 0,
    freezeMs: 0,
    freezePower: 0,
    impactAt: 0,
    frameKey: -1,
    lag: 0,
    lastNow: 0,
  })
  rideState(0, roll, 0, roll)
  runtime.player.frozen = true
  // Square up to the runway.
  runtime.player.yaw = Math.PI
  runtime.camera.mode = 'roll'
  // The HUD's switch to the flight (a React update and a restyle) in a task of its own,
  // not the frame the launch starts in: together they made that one frame stick on slow
  // phones. The flight itself is already under way from the runtime state above.
  const started = {
    distance: result.distance,
    wins: result.wins,
    prize: result.prize || 0,
    blocked: result.blocked ?? -1,
    duration: result.duration,
    best: result.best,
    giftWins: result.gift?.wins || 0,
  }
  timers.push(setTimeout(() => game.startRoll(started), 0))

  // The rubber letting go with a twang, then the whoosh past the posts.
  sfx.rubberSnap(Math.min(1, roll.pull / PULL_DIST))
  timers.push(setTimeout(() => sfx.rollStart(), KICK_HIT * 1000))
  // A cartoon whistle as you fall from the top of the arc, ending as you slam down.
  const apex = kickTimeAt(0.5, result.duration)
  const land = kickTimeAt(1, result.duration)
  timers.push(setTimeout(() => sfx.fallWhistle(land - apex), apex * 1000))
  timers.push(setTimeout(() => sfx.rollStop(), Math.max(0, result.duration - SKID_SOUND_LEAD) * 1000))
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
 * Back at the start, just short of the launch pad, camera behind you. With Auto Launch
 * on you stay on the pad instead, so the next launch goes straight away.
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
