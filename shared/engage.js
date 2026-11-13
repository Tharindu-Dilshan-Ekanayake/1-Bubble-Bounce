import { dayNumber, LUCKY_CHANCE, LUCKY_GIFTS, QUEST_BONUS, QUEST_TIERS, QUEST_TYPES, QUESTS_PER_DAY, streakMultiplier } from './balance.js'
import { niceRound, payReward, winsForRolls } from './logic.js'
import { mulberry32 } from './rng.js'

/**
 * What keeps players coming back, as pure functions over the profile (like logic.js, and
 * run by the same authority): today's quests, the login streak and lucky gifts. The
 * session (session.js) feeds quest progress from what you do and emits what happened.
 *
 * Quests are picked per player per day from a seeded random (the day and the player's
 * id), so the server and the offline stand-in agree, and a refresh never re-rolls them.
 */

/** A stable 32-bit hash of a string (FNV-1a). */
function hashString(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A quest's target for `tier`, scaled by your best flight where its kind asks. */
function questTarget(type, tier, profile) {
  const raw = type.targets[tier]
  const best = Math.max(120, profile.stats.bestDistance || 0)
  if (type.scale === 'total') return niceRound(raw * best)
  if (type.scale === 'best') return niceRound(Math.max(80, raw * best))
  return raw
}

/** Today's three quests for `profile`: an EASY, a MEDIUM and a HARD one, all different kinds. */
export function createQuestDay(profile, day) {
  const rand = mulberry32(hashString(`${profile.id}:${day}`))
  const kinds = Object.keys(QUEST_TYPES)
  const list = []
  for (let tier = 0; tier < QUESTS_PER_DAY; tier += 1) {
    const pick = kinds.splice(Math.floor(rand() * kinds.length), 1)[0]
    list.push({ type: pick, tier, target: questTarget(QUEST_TYPES[pick], tier, profile), progress: 0, claimed: false })
  }
  return { day, list, bonus: false }
}

/** Makes sure the profile holds today's quests. Returns true if a new day's were dealt. */
export function ensureQuests(profile, now) {
  const day = dayNumber(now)
  const q = profile.quests
  if (q && q.day === day && q.list.length === QUESTS_PER_DAY && q.list.every((x) => QUEST_TYPES[x.type])) return false
  profile.quests = createQuestDay(profile, day)
  return true
}

/** A quest's line for the UI: "Launch 12 times". */
export const questText = (quest) => QUEST_TYPES[quest.type]?.text.replace('{n}', quest.target.toLocaleString('en-US')) ?? ''

export const questDone = (quest) => quest.progress >= quest.target

/** What claiming quest `index` would give you now: { wins, item }. */
export function questReward(profile, index) {
  const quest = profile.quests.list[index]
  if (!quest) return null
  const tier = QUEST_TIERS[quest.tier]
  return { wins: winsForRolls(profile, tier.winsRolls), item: tier.item ?? null }
}

/** What the bonus chest would give you now: { wins, egg }. */
export const questBonusReward = (profile) => ({ wins: winsForRolls(profile, QUEST_BONUS.winsRolls), egg: true })

/**
 * Counts `amount` of `counter` towards today's quests (adding up, or the best single value
 * for `mode: 'best'` kinds). Returns the indices of quests this just finished.
 */
export function progressQuests(profile, counter, amount, now) {
  ensureQuests(profile, now)
  const finished = []
  profile.quests.list.forEach((quest, i) => {
    const type = QUEST_TYPES[quest.type]
    if (!type || type.counter !== counter || quest.claimed || questDone(quest)) return
    quest.progress = type.mode === 'best' ? Math.max(quest.progress, amount) : quest.progress + amount
    quest.progress = Math.min(quest.target, Math.round(quest.progress * 10) / 10)
    if (questDone(quest)) finished.push(i)
  })
  return finished
}

/** Whether any of today's quests (or the bonus chest) is waiting to be claimed. */
export function questsReady(profile, now) {
  const q = profile.quests
  if (!q || q.day !== dayNumber(now)) return false
  if (q.list.some((quest) => questDone(quest) && !quest.claimed)) return true
  return !q.bonus && q.list.length > 0 && q.list.every((quest) => quest.claimed)
}

/** Claims finished quest `index`: its Wins (and a potion for a HARD one). */
export function claimQuest(profile, index, now) {
  ensureQuests(profile, now)
  const quest = profile.quests.list[index]
  if (!quest) return { ok: false, error: 'Unknown quest' }
  if (quest.claimed) return { ok: false, error: 'Already claimed' }
  if (!questDone(quest)) return { ok: false, error: 'Not finished yet' }
  quest.claimed = true
  const tier = QUEST_TIERS[quest.tier]
  const paid = payReward(profile, { winsRolls: tier.winsRolls, item: tier.item })
  return { ok: true, index, ...paid, label: `QUEST DONE: ${questText(quest)}` }
}

/** Opens the bonus chest once all three are claimed: Wins and an egg that fits you. */
export function claimQuestBonus(profile, now) {
  ensureQuests(profile, now)
  const q = profile.quests
  if (q.bonus) return { ok: false, error: 'Already opened' }
  if (!q.list.every((quest) => quest.claimed)) return { ok: false, error: 'Finish all three first' }
  q.bonus = true
  const paid = payReward(profile, { winsRolls: QUEST_BONUS.winsRolls, egg: true })
  return { ok: true, ...paid, label: 'QUEST CHEST OPENED' }
}

/**
 * Counts today into the login streak: the day after the last one played adds a day,
 * the same day changes nothing, any gap starts again at 1. Returns { days, changed,
 * broke (a streak of 2+ was lost), multiplier }.
 */
export function applyStreak(profile, now) {
  const today = dayNumber(now)
  const s = profile.streak
  if (s.day === today) return { days: s.days, changed: false, broke: false, multiplier: streakMultiplier(s.days) }
  const continued = s.day === today - 1
  const broke = !continued && s.days >= 2
  s.days = continued ? s.days + 1 : 1
  s.day = today
  s.best = Math.max(s.best, s.days)
  return { days: s.days, changed: true, broke, multiplier: streakMultiplier(s.days) }
}

/**
 * A launch's lucky gift, LUCKY_CHANCE of the time: picks one (by weight), pays it and
 * returns { label, icon, wins, items }; null if no luck this time.
 */
export function rollLuckyGift(profile, rand = Math.random) {
  if (rand() >= LUCKY_CHANCE) return null
  const total = LUCKY_GIFTS.reduce((sum, g) => sum + g.weight, 0)
  let r = rand() * total
  let gift = LUCKY_GIFTS[LUCKY_GIFTS.length - 1]
  for (const g of LUCKY_GIFTS) {
    r -= g.weight
    if (r < 0) {
      gift = g
      break
    }
  }
  const paid = payReward(profile, gift.grant)
  return { label: gift.label, icon: gift.icon, ...paid }
}
