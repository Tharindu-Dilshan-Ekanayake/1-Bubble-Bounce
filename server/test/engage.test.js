import assert from 'node:assert/strict'
import { test } from 'node:test'

import { comboBonus, crowdBonus, DAY_MS, LUCKY_CHANCE, QUEST_TYPES, QUESTS_PER_DAY, streakMultiplier } from '../../shared/balance.js'
import { applyStreak, claimQuest, claimQuestBonus, createQuestDay, ensureQuests, progressQuests, questsReady, rollLuckyGift } from '../../shared/engage.js'
import { applyRoll, createProfile, normalizeProfile, winsMultiplier, winsForRolls } from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { ROLL_ZONE } from '../../shared/world.js'

const DAY = DAY_MS
const onPad = () => ({ x: 0, y: 0, z: (ROLL_ZONE.minZ + ROLL_ZONE.maxZ) / 2 })

/** A session (no lucky gifts unless `rand` says so), recording every event it emits. */
function makeSession({ profile = createProfile('p', 'P'), now = 10 * DAY, rand = () => 0.99, others = 0 } = {}) {
  const events = []
  const session = new PlayerSession(profile, { now, rand, getOthers: () => others, emit: (type, payload) => events.push({ type, payload }), getPosition: onPad })
  return { session, profile, events, of: (type) => events.filter((e) => e.type === type) }
}

test('each day deals three quests: easy, medium, hard, all different, the same on every call', () => {
  const p = createProfile('player-1', 'P')
  const a = createQuestDay(p, 100)
  const b = createQuestDay(p, 100)
  assert.deepEqual(a, b)
  assert.equal(a.list.length, QUESTS_PER_DAY)
  assert.deepEqual(a.list.map((q) => q.tier), [0, 1, 2])
  assert.equal(new Set(a.list.map((q) => q.type)).size, QUESTS_PER_DAY)
  for (const q of a.list) assert.ok(QUEST_TYPES[q.type] && q.target > 0)
  // Another day, another deal (for at least one of a run of days).
  const days = Array.from({ length: 6 }, (_, i) => createQuestDay(p, 101 + i).list.map((q) => q.type).join())
  assert.ok(days.some((d) => d !== a.list.map((q) => q.type).join()))
})

test('quests count what you do, finish once, and pay a reward that grows with you', () => {
  const p = createProfile('q', 'Q')
  const now = 50 * DAY
  ensureQuests(p, now)
  p.quests.list = [
    { type: 'launch', tier: 0, target: 3, progress: 0, claimed: false },
    { type: 'far', tier: 1, target: 100, progress: 0, claimed: false },
    { type: 'reps', tier: 2, target: 2, progress: 0, claimed: false },
  ]
  assert.deepEqual(progressQuests(p, 'launch', 2, now), [])
  assert.deepEqual(progressQuests(p, 'launch', 1, now), [0])
  assert.deepEqual(progressQuests(p, 'launch', 1, now), [], 'a finished quest stops counting')
  // "best" quests keep the best single value.
  progressQuests(p, 'far', 60, now)
  progressQuests(p, 'far', 40, now)
  assert.equal(p.quests.list[1].progress, 60)
  assert.equal(questsReady(p, now), true)
  const wins = p.wins
  const claimed = claimQuest(p, 0, now)
  assert.equal(claimed.ok, true)
  assert.equal(p.wins - wins, winsForRolls(p, 3))
  assert.equal(claimQuest(p, 0, now).ok, false, 'never twice')
  assert.equal(claimQuest(p, 1, now).ok, false, 'not before it is finished')
  // The HARD one pays a potion too; the chest needs all three.
  progressQuests(p, 'rep', 2, now)
  assert.equal(claimQuestBonus(p, now).ok, false)
  progressQuests(p, 'far', 100, now)
  claimQuest(p, 1, now)
  const hard = claimQuest(p, 2, now)
  assert.deepEqual(hard.items, ['potionWins'])
  const chest = claimQuestBonus(p, now)
  assert.equal(chest.ok, true)
  assert.equal(chest.items.length, 1, 'the chest has an egg')
  assert.equal(claimQuestBonus(p, now).ok, false)
  // Tomorrow: a fresh deal.
  assert.equal(ensureQuests(p, now + DAY), true)
  assert.ok(p.quests.list.every((q) => q.progress === 0 && !q.claimed) && !p.quests.bonus)
})

test('the login streak grows day by day, survives a refresh and resets after a missed day', () => {
  const p = createProfile('s', 'S')
  assert.deepEqual([applyStreak(p, 10 * DAY).days, applyStreak(p, 10 * DAY + 5000).days], [1, 1])
  assert.equal(applyStreak(p, 11 * DAY).days, 2)
  assert.equal(applyStreak(p, 12 * DAY + 100).days, 3)
  // It pays: day 3 is x1.2 on every launch's Wins.
  assert.ok(Math.abs(winsMultiplier(p, 12 * DAY) - streakMultiplier(3)) < 1e-9)
  assert.ok(Math.abs(streakMultiplier(3) - 1.2) < 1e-9)
  assert.equal(streakMultiplier(50), 2, 'capped at x2')
  const broken = applyStreak(p, 14 * DAY)
  assert.deepEqual([broken.days, broken.broke], [1, true])
  assert.equal(p.streak.best, 3)
  // Saved and loaded, it's the same streak.
  assert.deepEqual(normalizeProfile(JSON.parse(JSON.stringify(p)), 's', 'S').streak, p.streak)
})

test('PERFECTs in a row build a combo bonus; friends in the server add theirs', () => {
  assert.equal(comboBonus(1), 1)
  assert.ok(Math.abs(comboBonus(3) - 1.2) < 1e-9)
  assert.equal(comboBonus(99), 1.5)
  assert.ok(Math.abs(crowdBonus(2) - 1.2) < 1e-9)
  assert.equal(crowdBonus(10), 1.3)

  const plain = applyRoll(createProfile('x', 'X'), 0, 1)
  const boosted = applyRoll(createProfile('y', 'Y'), 0, 1, 1.5)
  // The same launch, half as many Wins again (give or take rounding).
  assert.ok(Math.abs(boosted.wins - plain.wins * 1.5) <= 1, `${boosted.wins} vs ${plain.wins} x1.5`)

  const { session, of } = makeSession({ others: 2 })
  for (let i = 0; i < 3; i += 1) {
    session.busyUntil = 0
    session.handle('roll', { accuracy: 1 }, 10 * DAY + i * 60000)
  }
  assert.deepEqual(of('roll').map((e) => e.payload.combo), [1, 2, 3])
  assert.ok(of('roll').every((e) => e.payload.others === 2))
  session.busyUntil = 0
  session.handle('roll', { accuracy: 0.5 }, 10 * DAY + 600000)
  assert.equal(of('roll').at(-1).payload.combo, 0, 'a GOOD launch breaks the combo')
})

test('lucky gifts land LUCKY_CHANCE of the time and pay out', () => {
  const p = createProfile('l', 'L')
  assert.equal(rollLuckyGift(p, () => LUCKY_CHANCE + 0.01), null)
  const rolls = [LUCKY_CHANCE / 2, 0]
  const gift = rollLuckyGift(p, () => rolls.shift())
  assert.ok(gift && gift.label)
  assert.ok(gift.wins > 0 || gift.items.length > 0)

  const { session, of } = makeSession({ rand: () => 0 })
  session.handle('roll', { accuracy: 1 }, 10 * DAY)
  assert.ok(of('roll')[0].payload.gift, 'the launch event carries the gift')
})

test('the session feeds quests from launches and tells the client when one is done', () => {
  const profile = createProfile('feed', 'F')
  const { session, of } = makeSession({ profile })
  profile.quests.list[0] = { type: 'launch', tier: 0, target: 2, progress: 0, claimed: false }
  for (let i = 0; i < 2; i += 1) {
    session.busyUntil = 0
    session.handle('roll', { accuracy: 0.5 }, 10 * DAY + i * 60000)
  }
  assert.equal(of('quest').length, 1)
  assert.equal(of('quest')[0].payload.index, 0)
  const wins = profile.wins
  session.handle('claimQuest', { index: 0 }, 10 * DAY + 200000)
  assert.ok(profile.wins > wins)
  assert.equal(of('reward').length, 1)
  // The streak news rides along with the session state.
  assert.equal(session.session.streak.days, 1)
})
