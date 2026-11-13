import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AD_REWARDS,
  EGGS,
  GEM_PRODUCTS,
  healthForLevel,
  levelCap,
  nextRebirthGift,
  PADS,
  PETS,
  rebirthGift,
  rebirthMultiplier,
  TIRES,
  TUTORIAL,
  WORLD_PORTALS,
  WORLD_ZONES,
  WORLDS,
  ZONES,
} from '../../shared/balance.js'
import { formatDistance, formatNumber } from '../../shared/format.js'
import {
  applyAdReward,
  applyGemProduct,
  applyRebirth,
  applyRoll,
  baseRollWins,
  applyTrain,
  buyHealthPack,
  buyTire,
  createProfile,
  createSession,
  hatchEgg,
  healthPacks,
  isPadUnlocked,
  levelFor,
  normalizeProfile,
  padGain,
  rebirthSkipPrice,
  rollOutcome,
  rollReach,
  skipRebirth,
  usePortal,
} from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { LAUNCH_STAND, MAX_PULL, maxPullFor, PAD_X, padCenterZ, PORTALS, ROLL_ZONE, SPAWN, STAR } from '../../shared/world.js'

const onPad = (i) => ({ x: PAD_X, y: 0.5, z: padCenterZ(i) })
const inRollZone = () => ({ x: 0, y: 0, z: (ROLL_ZONE.minZ + ROLL_ZONE.maxZ) / 2 })

/** A session for a fresh profile, recording every event it emits. */
function makeSession(pos, profile = createProfile('a', 'A')) {
  const events = []
  // No lucky gifts (rand): Wins stay exactly what the rules say.
  const session = new PlayerSession(profile, { now: 0, rand: () => 0.99, emit: (type, payload) => events.push({ type, payload }), getPosition: () => pos })
  return { session, profile, events, count: (type) => events.filter((e) => e.type === type).length }
}

/** Trains on pad 0 until max level. */
function maxOut(p) {
  for (let i = 0; i < 1e5 && p.level < levelCap(p.rebirths); i += 1) applyTrain(p, 0, 0)
}

// --- Formatting ------------------------------------------------------------------

test('numbers format like the HUD', () => {
  assert.deepEqual(
    [0, 999, 1000, 1234, 7300, 14000, 2.5e6, 9999].map(formatNumber),
    ['0', '999', '1K', '1.2K', '7.3K', '14K', '2.5M', '9.9K'],
  )
  assert.equal(formatDistance(1050.7), '1,050 m')
})

// --- Levels and rebirth ----------------------------------------------------------

test('max level is 15 + 8 per rebirth; each rebirth adds x1 to gains', () => {
  assert.deepEqual([0, 1, 2, 3].map(levelCap), [15, 23, 31, 39])
  assert.deepEqual([0, 1, 2, 3].map(rebirthMultiplier), [1, 2, 3, 4])
})

test('each level needs more Health than the last', () => {
  assert.equal(healthForLevel(1), 0)
  for (let level = 2; level <= 60; level += 1) {
    assert.ok(healthForLevel(level) > healthForLevel(level - 1), `level ${level}`)
  }
  assert.equal(levelFor(0, 0), 1)
  assert.equal(levelFor(healthForLevel(15) - 1, 0), 14)
  assert.equal(levelFor(1e12, 0), 15, 'never past the cap')
  assert.equal(levelFor(1e12, 1), 23)
})

test('the first pad gives the tire power per step and stops at max level', () => {
  const p = createProfile('a', 'A')
  for (let i = 0; i < 10; i += 1) applyTrain(p, 0, 0)
  assert.equal(p.health, 10)
  maxOut(p)
  assert.equal(p.health, healthForLevel(15))
  assert.equal(p.level, 15)
  assert.equal(applyTrain(p, 0, 0).gain, 0, 'no more natural gains at max level')
  assert.equal(p.health, healthForLevel(15))
})

test('locked pads give nothing', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyTrain(p, 1, 0).ok, false)
  assert.equal(p.health, 0)
})

test('better tires add power, rebirths multiply it', () => {
  const p = createProfile('a', 'A')
  p.ownedTires.push('mountain')
  p.equippedTire = 'mountain'
  applyTrain(p, 0, 0)
  assert.equal(p.health, TIRES[1].power)
  p.rebirths = 1
  p.health = 0
  p.level = 1
  applyTrain(p, 0, 0)
  assert.equal(p.health, TIRES[1].power * 2)
  applyTrain(p, 1, 0)
  assert.equal(p.health, TIRES[1].power * 2 + TIRES[1].power * 2 * 2, 'Speed Pad is x2 on top')
})

test('rebirth needs max level, resets Health, keeps Wins and tires', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyRebirth(p).ok, false)
  maxOut(p)
  p.wins = 50
  p.ownedTires.push('mountain')
  assert.equal(applyRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.equal(p.health, 0)
  assert.equal(p.level, 1)
  assert.equal(p.wins, 50)
  assert.deepEqual(p.ownedTires, ['bicycle', 'mountain'])
})

test('skipping to a rebirth costs Wins', () => {
  const p = createProfile('a', 'A')
  const price = rebirthSkipPrice(p)
  p.wins = price - 1
  assert.equal(skipRebirth(p).ok, false)
  assert.equal(p.rebirths, 0)
  p.wins = price + 5
  assert.equal(skipRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.equal(p.wins, 5)
  assert.equal(p.health, 0)
})

// --- Rolling ---------------------------------------------------------------------

test('nothing blocks a kick: it always flies its full reach', () => {
  for (const health of [0, ZONES[1].wall - 1, ZONES[1].wall, ZONES[20].wall * 3]) {
    const outcome = rollOutcome(health)
    assert.equal(outcome.blocked, -1)
    assert.equal(outcome.distance, rollReach(health))
  }
  assert.equal(rollOutcome(ZONES[1].wall - 1).broken, 1, 'past the first stage without its pace Power')
})

test('Wins grow with distance', () => {
  let last = -1
  for (let m = 0; m <= 16000; m += 250) {
    const wins = baseRollWins(m)
    assert.ok(wins >= last, `${m} yd pays at least as much as ${m - 250} yd`)
    last = wins
  }
})

test('rolls pay Wins without using Health; a zone prize pays only once', () => {
  const p = createProfile('a', 'A')
  p.health = ZONES[1].wall
  const first = applyRoll(p, 0)
  assert.equal(p.health, ZONES[1].wall)
  assert.deepEqual(first.discovered, [1])
  assert.equal(first.prize, ZONES[1].discover)
  assert.equal(first.best, true)
  assert.equal(p.wins, first.wins + first.prize)
  const second = applyRoll(p, 0)
  assert.equal(second.prize, 0)
  assert.deepEqual(second.discovered, [])
  assert.equal(second.best, false)
  assert.equal(p.stats.totalWins, first.wins + first.prize + second.wins)
  assert.equal(p.stats.rolls, 2)
})

test('the timing meter decides how hard you hit: distance and Wins', () => {
  const kick = (accuracy) => {
    const p = createProfile('a', 'A')
    p.health = ZONES[3].wall
    p.stats.bestZone = ZONES.length - 1
    return applyRoll(p, 0, accuracy)
  }
  const auto = kick(null)
  const weak = kick(0.1)
  const good = kick(0.5)
  const great = kick(0.8)
  const perfect = kick(1)
  assert.equal(auto.hit, null)
  assert.deepEqual([weak.hit, good.hit, great.hit, perfect.hit], ['weak', 'good', 'great', 'perfect'])
  // Further the closer to the middle; Auto Kick flies Power's distance exactly.
  assert.equal(auto.distance, Math.round(rollReach(ZONES[3].wall) * 10) / 10)
  assert.ok(weak.distance < good.distance && good.distance < great.distance && great.distance < perfect.distance)
  // Every grade clearly apart from the next: at least a fifth further each step up.
  assert.ok(good.distance > weak.distance * 1.2 && great.distance > good.distance * 1.2 && perfect.distance > great.distance * 1.15)
  assert.ok(perfect.distance > auto.distance * 1.35 && weak.distance < auto.distance * 0.65)
  // Wins: the Power's worth times the grade's bonus, whatever extra yards the grade adds.
  assert.equal(good.wins, auto.wins)
  assert.ok(weak.wins < auto.wins && great.wins > auto.wins)
  assert.ok(Math.abs(perfect.wins - auto.wins * 1.6) <= 1)
  // Out-of-range accuracy is clamped, not trusted.
  assert.equal(kick(7).distance, perfect.distance)
})

test('the very first roll pays for the second tire, as the guide asks', () => {
  const p = createProfile('a', 'A')
  const r = applyRoll(p, 0)
  assert.ok(r.wins >= TIRES[1].cost)
})

// --- Buying ----------------------------------------------------------------------

test('tires are bought in order with Wins', () => {
  const p = createProfile('a', 'A')
  p.wins = 1000
  assert.equal(buyTire(p, TIRES[3].id).ok, false, 'skipping ahead')
  assert.equal(buyTire(p, TIRES[1].id).ok, true)
  assert.equal(p.wins, 1000 - TIRES[1].cost)
  assert.equal(p.equippedTire, TIRES[1].id)
  assert.equal(buyTire(p, TIRES[2].id).ok, true)
  assert.equal(buyTire(p, 'nope').ok, false)
  p.wins = 0
  assert.equal(buyTire(p, TIRES[3].id).ok, false, 'not enough Wins')
})

test('Health packs follow your level and ignore the cap', () => {
  const p = createProfile('a', 'A')
  const early = healthPacks(p)
  p.health = healthForLevel(10)
  p.level = levelFor(p.health, 0)
  const later = healthPacks(p)
  assert.ok(later[0].amount > early[0].amount)
  assert.ok(later[2].amount > later[0].amount)
  p.wins = later[2].price - 1
  assert.equal(buyHealthPack(p, 2).ok, false)
  p.wins = later[2].price
  const before = p.health
  assert.equal(buyHealthPack(p, 2).ok, true)
  assert.equal(p.health, before + later[2].amount)
  assert.equal(p.wins, 0)
  // Past the cap with packs: Health keeps climbing, the level stops at max.
  p.health = healthForLevel(15)
  p.level = 15
  p.wins = 1e9
  buyHealthPack(p, 0)
  assert.ok(p.health > healthForLevel(15))
  assert.equal(p.level, 15)
})

// --- Boxity products -------------------------------------------------------------

test('Gems products grant passes, and an owned pass turns into Wins', () => {
  const p = createProfile('a', 'A')
  const first = applyGemProduct(p, 'health_x2')
  assert.equal(first.ok, true)
  assert.equal(p.passes.healthX2, true)
  assert.equal(p.wins, 0)
  const again = applyGemProduct(p, 'health_x2')
  assert.ok(again.wins >= 10)
  assert.equal(p.wins, again.wins)
  assert.equal(p.stats.totalWins, again.wins)
  applyGemProduct(p, 'auto_roll')
  assert.equal(p.settings.autoRoll, true)
  applyGemProduct(p, 'potion_bundle')
  assert.deepEqual(p.items, { potionHealth: 3, potionWins: 3 })
  assert.equal(applyGemProduct(p, 'nope').ok, false)
  for (const sku of Object.keys(GEM_PRODUCTS)) assert.equal(applyGemProduct(createProfile('b', 'B'), sku).ok, true, sku)
})

test('ad rewards have a cooldown per placement', () => {
  const p = createProfile('a', 'A')
  const s = createSession(0)
  const [placement] = Object.keys(AD_REWARDS)
  const t0 = 1_000_000
  assert.equal(applyAdReward(p, s, placement, t0).ok, true)
  assert.equal(p.items.potionHealth, 1)
  assert.equal(applyAdReward(p, s, placement, t0 + 1000).ok, false)
  assert.equal(applyAdReward(p, s, placement, t0 + AD_REWARDS[placement].cooldownMs).ok, true)
  assert.equal(applyAdReward(p, s, 'nope', t0).ok, false)
})

// --- Saves -----------------------------------------------------------------------

test('old or corrupt saves load with defaults filled in', () => {
  const p = normalizeProfile(
    { health: 'x', wins: -5, pets: [{ uid: 1, id: 'nope' }], equippedPets: [1], ownedTires: ['nope'], equippedTire: 'nope', stats: { rolls: 3 } },
    'x',
    'X',
  )
  assert.equal(p.health, 0)
  assert.equal(p.wins, 0)
  assert.deepEqual(p.pets, [])
  assert.deepEqual(p.equippedPets, [])
  assert.deepEqual(p.ownedTires, ['bicycle'])
  assert.equal(p.equippedTire, 'bicycle')
  assert.equal(p.stats.rolls, 3)
  assert.equal(p.stats.bestDistance, 0)
  assert.deepEqual(p.settings, { autoRebirth: false, autoRoll: false })
  assert.deepEqual(normalizeProfile(null, 'y', 'Y'), createProfile('y', 'Y'))
  assert.equal(normalizeProfile({ health: healthForLevel(5) }, 'z', 'Z').level, 5, 'level recomputed from Health')
})

test('only brand-new players get the tutorial', () => {
  assert.equal(normalizeProfile({ rebirths: 0, tutorialStep: 1 }, 'a', 'A').tutorialStep, 1)
  assert.equal(normalizeProfile({ rebirths: 1, tutorialStep: 1 }, 'b', 'B').tutorialStep, TUTORIAL.length)
})

// --- The session -----------------------------------------------------------------

test('training only counts on the pad the player really stands on', () => {
  const pos = { x: SPAWN.x, y: 0, z: SPAWN.z }
  const { session, profile } = makeSession(pos)
  session.handle('enterPad', { pad: 0 }, 0)
  session.tick(0.1, 0)
  session.tick(2, 0)
  assert.equal(profile.health, 0, 'claimed a pad from spawn')
  Object.assign(pos, onPad(0))
  session.tick(0.1, 0)
  session.tick(2, 0)
  assert.ok(profile.health > 0)
  session.handle('enterPad', { pad: 1 }, 0)
  assert.equal(session.pad, 0, 'a locked pad cannot be entered')
})

test('the first guide step completes on the pad once Health reaches 30', () => {
  assert.equal(TUTORIAL[0].event, 'train')
  assert.equal(TUTORIAL[0].health, 30)
  const pos = onPad(0)
  const { session, profile } = makeSession(pos)
  session.handle('enterPad', { pad: 0 }, 0)
  let t = 0
  while (profile.health < 29) session.tick(0.1, (t += 100))
  assert.equal(profile.tutorialStep, 0)
  while (profile.health < 30) session.tick(0.1, (t += 100))
  assert.equal(profile.tutorialStep, 1)
})

test('rolls start only from the roll zone, one at a time', () => {
  const pos = { x: SPAWN.x, y: 0, z: SPAWN.z }
  const { session, profile, count } = makeSession(pos)
  session.handle('roll', {}, 1000)
  assert.equal(count('roll'), 0, 'not from spawn')
  Object.assign(pos, inRollZone())
  session.handle('roll', {}, 1000)
  assert.equal(count('roll'), 1)
  session.handle('roll', {}, 1500)
  assert.equal(count('roll'), 1, 'no second roll while the tire is out')
  // Health ticks in while the tire rolls.
  for (let t = 1100; t < 4000; t += 100) session.tick(0.1, t)
  assert.ok(profile.health >= 2, `got ${profile.health}`)
  session.handle('roll', {}, 1000 + session.busyUntil)
  assert.equal(count('roll'), 2, 'rolls again once the cooldown is over')
  assert.equal(profile.stats.rolls, 2)
})

test('ads and Gems are granted by the host only, never by a client message', () => {
  const { session, profile, count } = makeSession(inRollZone())
  session.handle('grantAdReward', { placement: 'health-potion' }, 0)
  session.handle('grantGemProduct', { sku: 'wins_big' }, 0)
  session.handle('adReward', { placement: 'health-potion' }, 0)
  assert.equal(profile.wins, 0)
  assert.deepEqual(profile.items, {})
  assert.equal(session.grantAdReward('health-potion', 1e6).ok, true)
  assert.equal(profile.items.potionHealth, 1)
  assert.equal(session.grantGemProduct('wins_big').ok, true)
  assert.ok(profile.wins > 0)
  assert.equal(count('reward'), 2)
})

// --- Rebirth gifts ---------------------------------------------------------------

/** Straight to max level (training there takes too long this late). */
function toCap(p) {
  p.level = levelCap(p.rebirths)
  p.health = healthForLevel(p.level)
}

test('every 5th rebirth from 15 gives Volcano eggs', () => {
  assert.equal(rebirthGift(14), null)
  assert.equal(rebirthGift(16), null)
  assert.deepEqual([15, 20, 25, 35, 100].map((r) => rebirthGift(r).amount), [3, 3, 4, 5, 6])
  assert.equal(nextRebirthGift(0).rebirths, 15)
  assert.equal(nextRebirthGift(15).rebirths, 20)
  assert.equal(nextRebirthGift(19).rebirths, 20)

  const p = createProfile('a', 'A')
  p.rebirths = 14
  toCap(p)
  const result = applyRebirth(p)
  assert.equal(result.gift.rebirths, 15)
  assert.equal(p.items.eggVolcano, 3)
  toCap(p)
  assert.equal(applyRebirth(p).gift, null, 'nothing at rebirth 16')
  assert.equal(p.items.eggVolcano, 3)
})

test('a rebirth gift is announced to the player', () => {
  const { session, profile, events } = makeSession(SPAWN)
  profile.rebirths = 19
  toCap(profile)
  session.handle('rebirth', {}, 0)
  const reward = events.find((e) => e.type === 'reward')
  assert.match(reward.payload.label, /REBIRTH 20 GIFT: 3 Volcano Eggs/)
})

// --- World 2 ---------------------------------------------------------------------

test('World 2 has its own sixty stages at the same gates, paying more', () => {
  const [w1, w2] = WORLD_ZONES
  assert.equal(w2.length, w1.length)
  assert.equal(new Set(w2.map((z) => z.id)).size, w2.length, 'unique ids')
  assert.ok(w2.every((z) => !w1.some((o) => o.name === z.name)), 'new names')
  for (let i = 0; i < w1.length; i += 1) {
    assert.equal(w2[i].start, w1[i].start)
    assert.equal(w2[i].wall, w1[i].wall)
    assert.equal(w2[i].discover, w1[i].discover * WORLDS[1].wins)
  }
})

test('the portal opens at enough rebirths and Wins, without spending them, and goes both ways', () => {
  const p = createProfile('a', 'A')
  assert.equal(usePortal(p).ok, false)
  assert.equal(p.world, 0)
  p.wins = WORLD_PORTALS.world2.wins
  assert.equal(usePortal(p).ok, false, 'Wins alone are not enough')
  p.rebirths = WORLD_PORTALS.world2.rebirths
  p.wins = WORLD_PORTALS.world2.wins - 1
  assert.equal(usePortal(p).ok, false, 'rebirths alone are not enough')
  p.wins = WORLD_PORTALS.world2.wins
  assert.deepEqual(usePortal(p), { ok: true, world: 1, first: true })
  assert.equal(p.wins, WORLD_PORTALS.world2.wins, 'Wins kept')
  assert.equal(usePortal(p).world, 0, 'back home')
  p.wins = 0
  assert.equal(usePortal(p).world, 1, 'open for good once unlocked')
  const saved = normalizeProfile(JSON.parse(JSON.stringify(p)), 'a', 'A')
  assert.equal(saved.world, 1)
  assert.equal(saved.world2Unlocked, true)
  assert.equal(normalizeProfile({ ...p, world2Unlocked: false }, 'a', 'A').world, 0, 'no World 2 without the unlock')
})

test('a roll in World 2 pays its multiplier and its own first-visit prizes', () => {
  const one = createProfile('a', 'A')
  const two = createProfile('b', 'B')
  one.health = two.health = 5000
  two.world = 1
  two.world2Unlocked = true
  const a = applyRoll(one, 0)
  const b = applyRoll(two, 0)
  assert.equal(b.distance, a.distance, 'same gates, same distance')
  assert.ok(Math.abs(b.wins - a.wins * WORLDS[1].wins) <= WORLDS[1].wins, `${b.wins} vs ${a.wins}`)
  assert.equal(b.prize, a.prize * WORLDS[1].wins)
  assert.equal(two.stats.bestZone, 0, "World 1's discoveries untouched")
  assert.ok(two.stats.bestZone2 > 0)
})

test('stepping into the portal switches world and tells the client', () => {
  const portal = PORTALS[0]
  const { session, profile, events } = makeSession({ x: portal.x, y: 0, z: portal.z })
  session.handle('portal', {}, 0)
  assert.equal(profile.world, 0, 'not enough Wins yet')
  profile.wins = WORLD_PORTALS.world2.wins
  profile.rebirths = WORLD_PORTALS.world2.rebirths
  session.handle('portal', {}, 0)
  assert.equal(profile.world, 1)
  assert.deepEqual(events.find((e) => e.type === 'world').payload, { world: 1, first: true })
  session.handle('portal', {}, 0)
  assert.equal(profile.world, 0)
})

// --- Palm Beach ------------------------------------------------------------------

test("Palm Beach's treadmills and Beach Egg work there only", () => {
  const p = createProfile('a', 'A')
  const surf = PADS.findIndex((pad) => pad.id === 'surf')
  const tsunami = PADS.findIndex((pad) => pad.id === 'tsunami')
  p.rebirths = 20
  p.wins = 1e9
  assert.equal(isPadUnlocked(p, surf), false, 'not in World 1, whatever your rebirths')
  assert.equal(hatchEgg(p, 'beach', 1).ok, false)
  assert.equal(p.wins, 1e9, 'nothing charged for an egg that cannot hatch here')
  p.world2Unlocked = true
  p.world = 1
  assert.equal(isPadUnlocked(p, surf), true)
  assert.equal(isPadUnlocked(p, tsunami), true)
  p.rebirths = 9
  assert.equal(isPadUnlocked(p, surf), false, 'and it still needs its rebirths')
  assert.equal(isPadUnlocked(p, 0), true, "World 1's treadmills work there too")
  const res = hatchEgg(p, 'beach', 1)
  assert.equal(res.ok, true)
  assert.ok(['seagull', 'dolphin', 'shark', 'kraken'].includes(res.pets[0].id))
  // Better pets than the Volcano Egg - the next step up - and its rarest is the best of all.
  const avg = (id) => EGGS[id].pets.reduce((sum, [pet, w]) => sum + PETS[pet].mult * w, 0) / 100
  assert.ok(avg('beach') > avg('volcano') * 1.3)
  const eggPets = Object.values(EGGS).flatMap((egg) => egg.pets.map(([pet]) => pet)).filter((pet) => pet !== 'kraken')
  assert.ok(eggPets.every((pet) => PETS[pet].mult < PETS.kraken.mult))
})

test("Palm Beach's Secret Star: found once, there only, for x2 Power everywhere", () => {
  const atStar = { x: STAR.x, y: 0, z: STAR.z }
  const { session, profile, count } = makeSession(atStar)
  session.handle('findStar', {}, 0)
  assert.equal(count('star'), 0, 'not in World 1')
  profile.world2Unlocked = true
  profile.world = 1
  const before = padGain(profile, 0, 0)
  session.handle('findStar', {}, 0)
  assert.equal(count('star'), 1)
  assert.equal(padGain(profile, 0, 0), before * 2)
  session.handle('findStar', {}, 0)
  assert.equal(count('star'), 1, 'once only')
  profile.world = 0
  assert.equal(padGain(profile, 0, 0), before * 2, 'and it keeps working back home')
  assert.equal(normalizeProfile(JSON.parse(JSON.stringify(profile)), 'a', 'A').secretStars.world2, true, 'saved')
  // Far from it, nothing.
  const far = makeSession({ x: 0, y: 0, z: 0 })
  far.profile.world2Unlocked = true
  far.profile.world = 1
  far.session.handle('findStar', {}, 0)
  assert.equal(far.count('star'), 0)
})

// --- The stretch lane ------------------------------------------------------------

test('walking further back down the stretch lane flings you further and pays more, up to your arms reach', () => {
  const launchFrom = (back, tire) => {
    const profile = createProfile('a', 'A')
    profile.health = 5000
    if (tire) {
      profile.ownedTires.push(tire)
      profile.equippedTire = tire
    }
    const { session, events } = makeSession({ x: LAUNCH_STAND.x, y: 0, z: LAUNCH_STAND.z + back }, profile)
    session.handle('roll', { accuracy: 0.5 }, 1000)
    return events.find((e) => e.type === 'roll').payload
  }
  const stood = launchFrom(0)
  const short = launchFrom(3)
  assert.equal(stood.stretch, 0)
  assert.ok(short.distance > stood.distance && short.wins >= stood.wins)
  // Starter arms only reach a few metres: walking the whole lane counts no further.
  const cheat = launchFrom(MAX_PULL)
  assert.ok(cheat.stretch <= maxPullFor('bicycle', 1, 15) + 0.6) // (+0.5 lag slack, rounded)
  // The best arms reach (nearly) the whole 40 m - and fly much further for it.
  const best = TIRES[TIRES.length - 1].id
  const far = launchFrom(MAX_PULL, best)
  assert.ok(far.stretch > cheat.stretch * 3)
  assert.ok(far.distance > stood.distance * 1.3)
})
