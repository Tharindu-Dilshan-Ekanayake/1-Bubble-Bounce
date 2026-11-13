import {
  AD_REWARDS,
  BADGES,
  DAILY_INTERVAL_MS,
  dayNumber,
  DAILY_REWARDS,
  EGGS,
  FREE_REWARD,
  GEM_PRODUCTS,
  HEALTH_PACKS,
  healthForLevel,
  hitGrade,
  hitReach,
  ITEMS,
  levelCap,
  MAX_EQUIPPED_PETS,
  MAX_PET_INVENTORY,
  OFFLINE_MAX_MS,
  OFFLINE_MIN_MS,
  OFFLINE_RATE,
  PADS,
  PETS,
  PLAYTIME_REWARDS,
  RARITIES,
  REBIRTH_SKIP_ROLLS,
  rebirthGift,
  rebirthMultiplier,
  ROLL_BASE,
  ROLL_H0,
  ROLL_RECOVERY,
  SECRET_STAR,
  rollDuration,
  SHOP,
  streakMultiplier,
  STRETCH_REACH,
  STRETCH_WINS,
  TIRES,
  TRAIN_INTERVAL,
  TROPHY_FIRST,
  TROPHY_METERS,
  TROPHY_SPACING,
  TUTORIAL,
  WALL_MARGIN,
  WORLD_PORTALS,
  WORLD_ZONES,
  ZONES,
  zonesOf,
} from './balance.js'

/**
 * Game rules as pure functions over a plain profile object.
 *
 * The server runs these authoritatively; the client runs the very same functions for
 * offline play and for display (costs, multipliers, what a button would do). Mutating
 * functions change the profile in place and return a small result describing what
 * happened, which is what gets sent to the client as an event.
 *
 * `session` is the per-connection state that is never saved: when this session
 * started, which playtime rewards were claimed, the free-reward flag.
 */

export const PROFILE_VERSION = 1

export function createProfile(id, name) {
  return {
    v: PROFILE_VERSION,
    id,
    name,
    health: 0,
    wins: 0,
    rebirths: 0,
    level: 1,
    equippedTire: 'bicycle',
    ownedTires: ['bicycle'],
    pets: [],
    equippedPets: [],
    nextPetUid: 1,
    items: {},
    boosts: { health: 0, wins: 0 },
    passes: {},
    daily: { start: 0, claimed: [] },
    freeRewardClaimed: false,
    tutorialStep: 0,
    badges: [],
    stats: {
      rolls: 0,
      trains: 0,
      bestDistance: 0,
      playtime: 0,
      bestHealth: 0,
      totalWins: 0,
      wallsBroken: 0,
      /** Furthest zone ever reached (index into ZONES): its `discover` prize is paid once. */
      bestZone: 0,
      /** The same for World 2's stages. */
      bestZone2: 0,
    },
    /** The world you're in (index into WORLDS), and whether World 2's portal is open. */
    world: 0,
    world2Unlocked: false,
    /** Secret Stars found, by world id ('world2': Palm Beach's). */
    secretStars: {},
    lastPad: -1,
    lastSeen: 0,
    settings: { autoRebirth: false, autoRoll: false },
    /** Today's quests (engage.js): the day they're for, the three, the bonus chest taken. */
    quests: { day: -1, list: [], bonus: false },
    /** Login streak: the last day played (balance.dayNumber), days in a row, the best run. */
    streak: { day: -1, days: 0, best: 0 },
  }
}

/** Fills in anything missing from an older or partial save. Never throws. */
export function normalizeProfile(raw, id, name) {
  const base = createProfile(id, name)
  if (!raw || typeof raw !== 'object') return base
  const p = { ...base, ...raw, id, name: name || raw.name || base.name }
  p.boosts = { ...base.boosts, ...(raw.boosts || {}) }
  p.stats = { ...base.stats, ...(raw.stats || {}) }
  p.settings = { ...base.settings, ...(raw.settings || {}) }
  p.daily = { ...base.daily, ...(raw.daily || {}) }
  const streak = raw.streak && typeof raw.streak === 'object' ? raw.streak : {}
  p.streak = {
    day: Number.isInteger(streak.day) ? streak.day : -1,
    days: Math.max(0, Math.floor(streak.days) || 0),
    best: Math.max(0, Math.floor(streak.best) || 0),
  }
  const quests = raw.quests && typeof raw.quests === 'object' ? raw.quests : {}
  p.quests = {
    day: Number.isInteger(quests.day) ? quests.day : -1,
    list: Array.isArray(quests.list)
      ? quests.list
          .filter((q) => q && typeof q.type === 'string' && Number.isFinite(q.target))
          .map((q) => ({ type: q.type, tier: Math.max(0, Math.min(2, Math.floor(q.tier) || 0)), target: q.target, progress: Math.max(0, Number(q.progress) || 0), claimed: q.claimed === true }))
      : [],
    bonus: quests.bonus === true,
  }
  p.items = Object.fromEntries(Object.entries(raw.items || {}).filter(([itemId]) => ITEMS[itemId]))
  p.passes = Object.fromEntries(Object.entries(raw.passes || {}).filter(([productId]) => SHOP[productId]))
  p.health = Number.isFinite(raw.health) ? Math.max(0, raw.health) : 0
  p.wins = Number.isFinite(raw.wins) ? Math.max(0, raw.wins) : 0
  p.pets = Array.isArray(raw.pets) ? raw.pets.filter((pet) => PETS[pet?.id]) : []
  p.equippedPets = Array.isArray(raw.equippedPets)
    ? raw.equippedPets.filter((uid) => p.pets.some((pet) => pet.uid === uid)).slice(0, MAX_EQUIPPED_PETS)
    : []
  const owned = Array.isArray(raw.ownedTires) ? raw.ownedTires.filter((tireId) => tireIndex(tireId) >= 0) : []
  p.ownedTires = owned.length ? owned : ['bicycle']
  if (!p.ownedTires.includes(p.equippedTire)) p.equippedTire = p.ownedTires[0]
  p.stats.bestZone = Math.min(ZONES.length - 1, Math.max(0, Math.floor(p.stats.bestZone) || 0))
  p.stats.bestZone2 = Math.min(ZONES.length - 1, Math.max(0, Math.floor(p.stats.bestZone2) || 0))
  p.world2Unlocked = raw.world2Unlocked === true
  p.secretStars = { world2: raw.secretStars?.world2 === true }
  p.world = p.world2Unlocked && raw.world === 1 ? 1 : 0
  // Levels follow from Health; recompute rather than trust a stored one.
  p.level = levelFor(p.health, p.rebirths)
  // The tutorial is for brand-new players only: anyone who has rebirthed is past it.
  if (p.rebirths > 0) p.tutorialStep = TUTORIAL.length
  p.tutorialStep = Math.min(TUTORIAL.length, Math.max(0, Math.floor(p.tutorialStep) || 0))
  p.v = PROFILE_VERSION
  return p
}

export function createSession(now) {
  return { start: now, playtimeClaimed: [], freeRewardTaken: false, adAt: {} }
}

// --- Lookups ------------------------------------------------------------------------

export const tireIndex = (id) => TIRES.findIndex((t) => t.id === id)
export const tireById = (id) => TIRES.find((t) => t.id === id) || TIRES[0]

export function isPadUnlocked(profile, index) {
  const pad = PADS[index]
  if (!pad) return false
  // A world's own treadmill runs in that world only.
  if (pad.world !== undefined && (profile.world || 0) !== pad.world) return false
  if (pad.product) return Boolean(profile.passes[pad.product])
  return profile.rebirths >= pad.rebirths
}

/**
 * Health values are kept to a tenth below a million and whole above, so repeated
 * small gains don't pile up float dust.
 */
export const tidy = (value) => (value < 1e6 ? Math.round(value * 10) / 10 : Math.round(value))

/** "Nice" price or amount: two significant figures (692 -> 690, 1934 -> 1900). */
export function niceRound(n) {
  if (n < 100) return Math.max(1, Math.round(n))
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / step) * step
}

// --- Levels -------------------------------------------------------------------------

/** The level `health` reaches, never above the cap for `rebirths`. */
export function levelFor(health, rebirths) {
  const cap = levelCap(rebirths)
  let level = 1
  while (level < cap && health >= healthForLevel(level + 1)) level += 1
  return level
}

export const isMaxLevel = (profile) => profile.level >= levelCap(profile.rebirths)

/** 0..1 through the current level: what the level bar fills to. */
export function levelProgress(profile) {
  if (isMaxLevel(profile)) return 1
  const from = healthForLevel(profile.level)
  const to = healthForLevel(profile.level + 1)
  return Math.max(0, Math.min(1, (profile.health - from) / Math.max(1e-9, to - from)))
}

/** 0..1 progress towards being able to rebirth, by levels. */
export function rebirthProgress(profile) {
  const cap = levelCap(profile.rebirths)
  if (profile.level >= cap) return 1
  return Math.max(0, Math.min(1, (profile.level - 1 + levelProgress(profile)) / Math.max(1, cap - 1)))
}

// --- Multipliers --------------------------------------------------------------------

/** Equipped pets stack additively: x3 and x2 together make x4, not x6. */
export function petMultiplier(profile) {
  let total = 1
  for (const uid of profile.equippedPets) {
    const pet = profile.pets.find((p) => p.uid === uid)
    if (pet && PETS[pet.id]) total += PETS[pet.id].mult - 1
  }
  return total
}

export const isBoostActive = (profile, kind, now) => (profile.boosts[kind] || 0) > now

/** The x2 Health pass and potion; they stack. */
export function healthBoostMultiplier(profile, now) {
  return (profile.passes.healthX2 ? 2 : 1) * (isBoostActive(profile, 'health', now) ? 2 : 1)
}

/**
 * Days in a row you've played, as of `now`: your streak while it's alive (played today
 * or yesterday), else 0. (engage.applyStreak counts the days.)
 */
export function streakDays(profile, now) {
  const s = profile.streak
  if (!s || s.days <= 0) return 0
  return dayNumber(now) - s.day <= 1 ? s.days : 0
}

/** The x2 Wins pass and potion (they stack), and your login streak's bonus. */
export function winsMultiplier(profile, now) {
  return (profile.passes.winsX2 ? 2 : 1) * (isBoostActive(profile, 'wins', now) ? 2 : 1) * streakMultiplier(streakDays(profile, now))
}

/** Palm Beach's Secret Star, once found: x2 Power for good, in every world. */
export const starMultiplier = (profile) => (profile.secretStars?.world2 ? SECRET_STAR.power : 1)

/** Everything that multiplies a Health gain except the tire and where you earn it. */
export function gainMultiplier(profile, now) {
  return rebirthMultiplier(profile.rebirths) * petMultiplier(profile) * healthBoostMultiplier(profile, now) * starMultiplier(profile)
}

/** Health from one gain anywhere but a pad: your tire's power, multiplied. */
export const baseGain = (profile, now) => tidy(tireById(profile.equippedTire).power * gainMultiplier(profile, now))

/** Health from one training step on pad `index`. */
export function padGain(profile, index, now) {
  const pad = PADS[index]
  if (!pad) return 0
  return tidy(tireById(profile.equippedTire).power * pad.mult * gainMultiplier(profile, now))
}

// --- Training, levels, rebirth ------------------------------------------------------

/**
 * Banks a natural gain (pad, rolling or walking) and the levels it reaches. Once you're
 * at max level natural gains stop: rebirth to keep going. Returns what was really added.
 */
function addHealth(profile, gain) {
  const cap = levelCap(profile.rebirths)
  if (profile.level >= cap) return { gain: 0, leveledUp: false, maxed: true }
  // Stops exactly on max level rather than overshooting it.
  const room = Math.max(0, healthForLevel(cap) - profile.health)
  const added = tidy(Math.min(gain, room))
  profile.health = tidy(profile.health + added)
  profile.stats.trains += 1
  profile.stats.bestHealth = Math.max(profile.stats.bestHealth, profile.health)
  const before = profile.level
  profile.level = levelFor(profile.health, profile.rebirths)
  return { gain: added, leveledUp: profile.level > before, levels: profile.level - before, maxed: profile.level >= cap }
}

export function applyTrain(profile, index, now) {
  if (!isPadUnlocked(profile, index)) return { ok: false, error: 'Bar locked' }
  profile.lastPad = index
  return { ok: true, ...addHealth(profile, padGain(profile, index, now)) }
}

/** One tick of Health while your tire rolls. */
export function applyRollTick(profile, now) {
  return { ok: true, ...addHealth(profile, baseGain(profile, now)) }
}

/** One step's worth of walking round the lobby: the same gain as a roll tick. */
export const applyWalkStep = applyRollTick

/** Rebirth: +1 rebirth; Health and levels reset (Wins, tires and pets stay). */
export function applyRebirth(profile) {
  if (!isMaxLevel(profile)) return { ok: false, error: `Reach level ${levelCap(profile.rebirths)} first!` }
  profile.rebirths += 1
  profile.tutorialStep = TUTORIAL.length
  profile.health = 0
  profile.level = 1
  const gift = rebirthGift(profile.rebirths)
  if (gift) addItem(profile, gift.item, gift.amount)
  return { ok: true, rebirths: profile.rebirths, gift }
}

// --- Rolling ------------------------------------------------------------------------

/** How far `health` rolls on open ground, before any wall gets in the way. */
/** Health that just reaches each gate on open ground (its wall needs WALL_MARGIN times it). */
const GATE_REACH = ZONES.map((z) => z.wall / WALL_MARGIN)

/**
 * How far `health` rolls on open ground, before any wall gets in the way: up to the
 * first gate along a gentle curve from ROLL_BASE, then from each gate's mark to the next
 * as Health climbs from one gate's reach to the next (in log terms), and past the last
 * gate at the last stage's pace.
 */
export function rollReach(health) {
  const h = Math.max(0, health)
  const first = GATE_REACH[1]
  if (h <= first) return ROLL_BASE + ((ZONES[1].start - ROLL_BASE) * Math.log1p(h / ROLL_H0)) / Math.log1p(first / ROLL_H0)
  let i = 1
  while (i + 1 < ZONES.length && h >= GATE_REACH[i + 1]) i += 1
  // Past the last gate, keep going at the last stage's pace.
  const a = i + 1 < ZONES.length ? i : i - 1
  const span = ZONES[a + 1].start - ZONES[a].start
  return ZONES[i].start + (span * Math.log(h / GATE_REACH[i])) / Math.log(GATE_REACH[a + 1] / GATE_REACH[a])
}

export function zoneIndexAt(meter) {
  for (let i = ZONES.length - 1; i >= 0; i -= 1) {
    if (meter >= ZONES[i].start) return i
  }
  return 0
}

/**
 * Where a kick with `health` (Power) lands: its full reach - nothing on the field stops
 * it. `broken` is how many stages it flew into past the first (the name stayed from the
 * template's walls); `blocked` is always -1.
 */
export function rollOutcome(health, reachFactor = 1) {
  const reach = rollReach(health) * reachFactor
  let broken = 0
  for (let i = 1; i < ZONES.length && ZONES[i].start <= reach; i += 1) broken += 1
  return { distance: reach, blocked: -1, broken, reach }
}

/** Yards of every trophy within `distance`. */
export function trophiesWithin(distance) {
  const out = []
  for (let m = TROPHY_FIRST; m <= distance; m += TROPHY_SPACING) out.push(m)
  return out
}

/** Wins the trophy at `meter` is worth in `world`, before multipliers. */
export const trophyValue = (meter, world = 0) => Math.max(1, Math.round(zonesOf(world)[zoneIndexAt(meter)].winsPerMeter * TROPHY_METERS))

/**
 * Wins for a kick in `world` before multipliers: every yard flown, at its stage's rate
 * (further out pays more per yard), plus the trophies passed. (All worlds' stages start
 * at the same yards; only what they pay differs.)
 */
export function baseRollWins(distance, world = 0) {
  const zones = zonesOf(world)
  let wins = 0
  for (let i = 0; i < zones.length; i += 1) {
    const start = zones[i].start
    const end = i + 1 < zones.length ? zones[i + 1].start : Infinity
    const metres = Math.max(0, Math.min(distance, end) - start)
    wins += metres * zones[i].winsPerMeter
  }
  for (let m = TROPHY_FIRST; m <= distance; m += TROPHY_SPACING) wins += trophyValue(m, world)
  return wins
}

/** Wins a roll at `health` pays in `world` before multipliers. */
export const rollWinsAt = (health, world = 0) => baseRollWins(rollOutcome(health).distance, world)

/**
 * A kick down the field. Health is not consumed. Returns everything the client needs
 * to replay it locally: distance, duration, the wall that stopped it, the Wins earned
 * (trophy positions follow from the distance) and any zone reached for the first time.
 * `accuracy` is where the timing meter was stopped (0-1, see HIT_GRADES): its grade
 * decides how far the ball flies (hitReach: half as far for a WEAK kick, half as far
 * again for a PERFECT one) and multiplies the Wins (`bonus`). The Wins are what the
 * kick's Power is worth - the yards a plain kick would fly - times that bonus, never
 * the extra yards themselves: further out every yard pays more, so paying for them
 * would multiply a PERFECT kick's Wins dozens of times over late in the game. Without
 * the meter (Auto Kick) the kick is a plain x1 kick.
 */
export function applyRoll(profile, now, accuracy = null, bonus = 1, stretch = 0) {
  // `stretch` (0-1): how much of the 40 m stretch lane you'd walked back - further and richer.
  const pulled = Math.min(1, Math.max(0, Number(stretch) || 0))
  const outcome = rollOutcome(profile.health, hitReach(accuracy) * (1 + STRETCH_REACH * pulled))
  const distance = Math.round(outcome.distance * 10) / 10
  const grade = hitGrade(accuracy)
  // `bonus`: the session's own multipliers (a PERFECT combo, friends in the server).
  const multiplier = winsMultiplier(profile, now) * (grade ? grade.bonus : 1) * Math.max(1, Number(bonus) || 1) * (1 + STRETCH_WINS * pulled)
  const world = profile.world
  const worth = Math.round(rollReach(profile.health) * 10) / 10
  const wins = Math.max(1, Math.round(baseRollWins(worth, world) * multiplier))
  // First time into a zone: its discovery prize, paid once ever (once in each world).
  const zone = zoneIndexAt(distance)
  const bestKey = world === 1 ? 'bestZone2' : 'bestZone'
  const discovered = []
  let prize = 0
  for (let i = profile.stats[bestKey] + 1; i <= zone; i += 1) {
    discovered.push(i)
    prize += WORLD_ZONES[world][i].discover
  }
  const best = distance > profile.stats.bestDistance
  profile.wins += wins + prize
  profile.stats.totalWins += wins + prize
  profile.stats.rolls += 1
  profile.stats.wallsBroken += outcome.broken
  profile.stats.bestDistance = Math.max(profile.stats.bestDistance, distance)
  profile.stats[bestKey] = Math.max(profile.stats[bestKey], zone)
  const duration = rollDuration(distance)
  return {
    ok: true,
    distance,
    wins,
    prize,
    discovered,
    blocked: outcome.blocked,
    broken: outcome.broken,
    multiplier,
    hit: grade ? grade.id : null,
    best,
    duration,
    cooldown: duration + ROLL_RECOVERY,
  }
}

/** Wins (before multipliers) of a roll at your max level: what packs and skips cost in. */
export const maxRollWins = (profile) => rollWinsAt(healthForLevel(levelCap(profile.rebirths)), profile.world)

/** `rolls` max-level launches' worth of Wins: rewards that grow with you. */
export const winsForRolls = (profile, rolls) => Math.max(10, Math.round(maxRollWins(profile) * rolls))

/** The egg item that fits how far you've got: a reward that's always worth opening. */
export function eggItemFor(profile) {
  if (profile.rebirths >= 10) return 'eggVolcano'
  if (profile.rebirths >= 5) return 'eggUnicorn'
  if (profile.rebirths >= 2) return 'eggSunset'
  return 'eggMeadow'
}

/**
 * Pays a reward grant of { winsRolls?, item?, egg? } (quests, lucky gifts). Returns what
 * was given: { wins, items: [itemId...] }.
 */
export function payReward(profile, grant) {
  const out = { wins: 0, items: [] }
  if (grant.winsRolls) {
    out.wins = winsForRolls(profile, grant.winsRolls)
    profile.wins += out.wins
    profile.stats.totalWins += out.wins
  }
  if (grant.item) {
    addItem(profile, grant.item, 1)
    out.items.push(grant.item)
  }
  if (grant.egg) {
    const egg = eggItemFor(profile)
    addItem(profile, egg, 1)
    out.items.push(egg)
  }
  return out
}

/**
 * The Health packs as they stand for you now: `[{ amount, price }]`. Both follow the
 * Health your next level needs, and the Wins a roll with that much Health pays.
 */
export function healthPacks(profile) {
  const next = healthForLevel(profile.level + 1)
  const wins = rollWinsAt(next, profile.world)
  return HEALTH_PACKS.map((pack) => ({
    amount: niceRound(Math.max(10, next * pack.share)),
    price: niceRound(Math.max(3, wins * pack.rolls)),
  }))
}

/** Buys Health pack `index` with Wins. Packs ignore the level cap. */
export function buyHealthPack(profile, index) {
  const pack = healthPacks(profile)[index]
  if (!pack) return { ok: false, error: 'Unknown pack' }
  if (profile.wins < pack.price) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= pack.price
  profile.health = tidy(profile.health + pack.amount)
  profile.stats.bestHealth = Math.max(profile.stats.bestHealth, profile.health)
  profile.level = levelFor(profile.health, profile.rebirths)
  return { ok: true, amount: pack.amount }
}

/** Wins to rebirth now without reaching max level first. */
export const rebirthSkipPrice = (profile) => niceRound(Math.max(20, maxRollWins(profile) * REBIRTH_SKIP_ROLLS))

export function skipRebirth(profile) {
  if (isMaxLevel(profile)) return applyRebirth(profile)
  const price = rebirthSkipPrice(profile)
  if (profile.wins < price) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= price
  profile.level = levelCap(profile.rebirths)
  return applyRebirth(profile)
}

// --- Worlds -------------------------------------------------------------------------

/**
 * Steps through the world portal: from World 1 into Palm Beach (opening it for good the
 * first time you have the rebirths and hold the Wins - they aren't spent), or from Palm
 * Beach back home.
 */
export function usePortal(profile) {
  if (profile.world === 1) {
    profile.world = 0
    return { ok: true, world: 0 }
  }
  const { wins: need, rebirths } = WORLD_PORTALS.world2
  if (!profile.world2Unlocked && profile.rebirths < rebirths) return { ok: false, error: `Need ${rebirths} Rebirths`, need, rebirths }
  if (!profile.world2Unlocked && profile.wins < need) return { ok: false, error: `Need ${need} Wins`, need, rebirths }
  const first = !profile.world2Unlocked
  profile.world2Unlocked = true
  profile.world = 1
  return { ok: true, world: 1, first }
}

// --- Tires --------------------------------------------------------------------------

export function buyTire(profile, tireId) {
  const tire = TIRES.find((t) => t.id === tireId)
  if (!tire) return { ok: false, error: 'Unknown arms' }
  if (profile.ownedTires.includes(tireId)) return equipTire(profile, tireId)
  const previous = TIRES[tireIndex(tireId) - 1]
  if (previous && !profile.ownedTires.includes(previous.id)) {
    return { ok: false, error: `Buy the ${previous.name} first!` }
  }
  if (profile.wins < tire.cost) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= tire.cost
  profile.ownedTires.push(tireId)
  profile.equippedTire = tireId
  return { ok: true, bought: true, tireId }
}

export function equipTire(profile, tireId) {
  if (!profile.ownedTires.includes(tireId)) return { ok: false, error: 'You don’t own those arms' }
  profile.equippedTire = tireId
  return { ok: true, equipped: true, tireId }
}

/** The next tire in the showroom you don't have yet, or null. */
export function nextTire(profile) {
  return TIRES.find((t) => !profile.ownedTires.includes(t.id)) || null
}

// --- Pets --------------------------------------------------------------------------

function rollPet(eggId, rand) {
  const egg = EGGS[eggId]
  const total = egg.pets.reduce((sum, [, w]) => sum + w, 0)
  let r = rand() * total
  for (const [petId, weight] of egg.pets) {
    r -= weight
    if (r < 0) return petId
  }
  return egg.pets[egg.pets.length - 1][0]
}

export function addPet(profile, petId) {
  const pet = { uid: profile.nextPetUid++, id: petId }
  profile.pets.push(pet)
  // Auto-equip into a free slot, so a first pet does something straight away.
  if (profile.equippedPets.length < MAX_EQUIPPED_PETS) profile.equippedPets.push(pet.uid)
  return pet
}

/**
 * Hatches `count` eggs. `paid` says how: 'wins' charges the egg's Wins price, 'item'
 * consumes an egg item, 'free' is for reward grants already paid for.
 */
export function hatchEgg(profile, eggId, count = 1, { paid = 'wins', rand = Math.random } = {}) {
  const egg = EGGS[eggId]
  if (!egg) return { ok: false, error: 'Unknown egg' }
  // A world's own egg hatches in that world only (eggs from rewards included).
  if (egg.world !== undefined && (profile.world || 0) !== egg.world) return { ok: false, error: 'Hatches in Palm Beach only!' }
  if (profile.pets.length + count > MAX_PET_INVENTORY) return { ok: false, error: 'Pet inventory full!' }
  if (paid === 'wins') {
    if (!egg.cost.wins) return { ok: false, error: 'This egg is premium only' }
    const price = egg.cost.wins * count
    if (profile.wins < price) return { ok: false, error: 'Not enough Wins!' }
    profile.wins -= price
  } else if (paid === 'item') {
    const itemId = Object.keys(ITEMS).find((k) => ITEMS[k].kind === 'egg' && ITEMS[k].egg === eggId)
    if (!itemId || (profile.items[itemId] || 0) < count) return { ok: false, error: 'No eggs left' }
    profile.items[itemId] -= count
  }
  const pets = []
  for (let i = 0; i < count; i += 1) pets.push(addPet(profile, rollPet(eggId, rand)))
  return { ok: true, eggId, pets }
}

export function equipPet(profile, uid) {
  if (!profile.pets.some((p) => p.uid === uid)) return { ok: false, error: 'Unknown pet' }
  if (profile.equippedPets.includes(uid)) return { ok: true }
  if (profile.equippedPets.length >= MAX_EQUIPPED_PETS) return { ok: false, error: `Max ${MAX_EQUIPPED_PETS} pets equipped` }
  profile.equippedPets.push(uid)
  return { ok: true }
}

export function unequipPet(profile, uid) {
  profile.equippedPets = profile.equippedPets.filter((u) => u !== uid)
  return { ok: true }
}

const petScore = (pet) => PETS[pet.id]?.mult ?? 0

export function equipBestPets(profile) {
  const best = [...profile.pets].sort((a, b) => petScore(b) - petScore(a)).slice(0, MAX_EQUIPPED_PETS)
  profile.equippedPets = best.map((p) => p.uid)
  return { ok: true }
}

export function deletePet(profile, uid) {
  const before = profile.pets.length
  profile.pets = profile.pets.filter((p) => p.uid !== uid)
  profile.equippedPets = profile.equippedPets.filter((u) => u !== uid)
  return { ok: profile.pets.length < before }
}

/** Sort key for inventory display: equipped first, then rarity, then multiplier. */
export function petSortKey(profile, pet) {
  const info = PETS[pet.id]
  const equipped = profile.equippedPets.includes(pet.uid) ? 1 : 0
  return equipped * 1e6 + (RARITIES[info.rarity]?.order ?? 0) * 1e4 + info.mult
}

// --- Items & boosts ---------------------------------------------------------------

export function addItem(profile, itemId, amount = 1) {
  profile.items[itemId] = (profile.items[itemId] || 0) + amount
}

export function usePotion(profile, itemId, now) {
  const item = ITEMS[itemId]
  if (!item || item.kind !== 'potion') return { ok: false, error: 'Not a potion' }
  if ((profile.items[itemId] || 0) <= 0) return { ok: false, error: 'None left' }
  profile.items[itemId] -= 1
  // Stacks: a second potion extends the timer instead of wasting it.
  profile.boosts[item.boost] = Math.max(profile.boosts[item.boost] || 0, now) + item.durationMs
  return { ok: true, boost: item.boost, endsAt: profile.boosts[item.boost] }
}

/** Applies a reward grant: { wins } | { item } | { pet } | { health } | { hatch }. */
export function applyGrant(profile, grant, { rand = Math.random } = {}) {
  const result = { ok: true }
  if (grant.wins) {
    profile.wins += grant.wins
    profile.stats.totalWins += grant.wins
  }
  if (grant.health) {
    profile.health = tidy(profile.health + grant.health)
    profile.stats.bestHealth = Math.max(profile.stats.bestHealth, profile.health)
    profile.level = levelFor(profile.health, profile.rebirths)
  }
  if (grant.item) addItem(profile, grant.item, grant.amount || 1)
  if (grant.pet) result.pets = [addPet(profile, grant.pet)]
  if (grant.hatch) {
    const hatched = hatchEgg(profile, grant.hatch, 1, { paid: 'free', rand })
    if (!hatched.ok) return hatched
    result.pets = hatched.pets
    result.eggId = grant.hatch
  }
  return result
}

// --- Daily & playtime rewards -------------------------------------------------------

/**
 * State of each daily reward: 'claimed' | 'ready' | 'next' (with `unlocksIn` ms) |
 * 'locked'. A new 7-day cycle starts on first claim after the last one finishes.
 */
export function dailyStatus(profile, now) {
  const { start, claimed } = profile.daily
  const fresh = !start || claimed.length >= DAILY_REWARDS.length
  const cycleStart = fresh ? now : start
  let nextShown = false
  return DAILY_REWARDS.map((reward, day) => {
    if (!fresh && claimed.includes(day)) return { day, state: 'claimed' }
    const unlockAt = cycleStart + day * DAILY_INTERVAL_MS
    if (now >= unlockAt) return { day, state: 'ready' }
    if (!nextShown) {
      nextShown = true
      return { day, state: 'next', unlocksIn: unlockAt - now }
    }
    return { day, state: 'locked' }
  })
}

export function claimDaily(profile, day, now, opts) {
  const status = dailyStatus(profile, now)[day]
  if (!status || status.state !== 'ready') return { ok: false, error: 'Not ready yet' }
  if (!profile.daily.start || profile.daily.claimed.length >= DAILY_REWARDS.length) {
    profile.daily = { start: now, claimed: [] }
  }
  profile.daily.claimed.push(day)
  const result = applyGrant(profile, DAILY_REWARDS[day].grant, opts)
  return { ...result, day, label: DAILY_REWARDS[day].label }
}

export function playtimeStatus(session, now) {
  const minutes = (now - session.start) / 60000
  return PLAYTIME_REWARDS.map((reward, index) => {
    if (session.playtimeClaimed.includes(index)) return { index, state: 'claimed' }
    if (minutes >= reward.minutes) return { index, state: 'ready' }
    return { index, state: 'locked', unlocksIn: (reward.minutes - minutes) * 60000 }
  })
}

export function claimPlaytime(profile, session, index, now, opts) {
  const status = playtimeStatus(session, now)[index]
  if (!status || status.state !== 'ready') return { ok: false, error: 'Not ready yet' }
  session.playtimeClaimed.push(index)
  const result = applyGrant(profile, PLAYTIME_REWARDS[index].grant, opts)
  return { ...result, index, label: PLAYTIME_REWARDS[index].label }
}

export function claimFreeReward(profile, session, opts) {
  if (session.freeRewardTaken) return { ok: false, error: 'Already claimed this session' }
  session.freeRewardTaken = true
  const grant = profile.freeRewardClaimed ? FREE_REWARD.repeat : FREE_REWARD.firstTime
  profile.freeRewardClaimed = true
  return { ...applyGrant(profile, grant, opts), grant }
}

// --- Shop ---------------------------------------------------------------------------

/** Buys a SHOP item with Wins. */
export function buyShopItem(profile, productId, opts = {}) {
  const item = SHOP[productId]
  if (!item) return { ok: false, error: 'Unknown item' }
  if (item.kind === 'pass' && profile.passes[productId]) return { ok: false, error: 'Already owned' }
  if (profile.wins < item.price) return { ok: false, error: 'Not enough Wins!' }
  if (item.kind === 'pass') {
    profile.wins -= item.price
    profile.passes[productId] = true
    // Auto Roll switches itself on once bought.
    if (productId === 'autoRoll') profile.settings.autoRoll = true
    return { ok: true, productId, pass: true }
  }
  const result = applyGrant(profile, item.grant || {}, opts)
  if (result.ok) profile.wins -= item.price
  return { ...result, productId }
}

// --- Boxity Gems and rewarded ads ------------------------------------------------

/**
 * Grants Gems product `sku`, already paid for in Boxity. Passes you own already turn
 * into a Wins pack of the same worth, so nothing bought is ever wasted.
 */
export function applyGemProduct(profile, sku) {
  const product = GEM_PRODUCTS[sku]
  if (!product) return { ok: false, error: 'Unknown product' }
  const { grant } = product
  const result = { ok: true, sku, name: product.name }
  if (grant.pass) {
    if (profile.passes[grant.pass]) {
      result.wins = Math.max(10, Math.round(maxRollWins(profile) * 20))
    } else {
      profile.passes[grant.pass] = true
      if (grant.pass === 'autoRoll') profile.settings.autoRoll = true
      result.pass = grant.pass
    }
  }
  if (grant.winsRolls) result.wins = (result.wins || 0) + Math.max(25, Math.round(maxRollWins(profile) * grant.winsRolls))
  if (result.wins) {
    profile.wins += result.wins
    profile.stats.totalWins += result.wins
  }
  for (const [itemId, amount] of Object.entries(grant.items || {})) addItem(profile, itemId, amount)
  return result
}

/** A rewarded ad's prize for `placement`, if it's off cooldown (`session.adAt`). */
export function applyAdReward(profile, session, placement, now) {
  const reward = AD_REWARDS[placement]
  if (!reward) return { ok: false, error: 'Unknown reward' }
  session.adAt = session.adAt || {}
  if (now - (session.adAt[placement] || 0) < reward.cooldownMs) return { ok: false, error: 'Not ready yet' }
  session.adAt[placement] = now
  return { ...applyGrant(profile, reward.grant), placement, label: reward.label }
}

// --- Offline progress -------------------------------------------------------------

/** Health earned while away, if the player logged off on a training pad. */
export function applyOfflineProgress(profile, now) {
  const away = Math.min(OFFLINE_MAX_MS, now - (profile.lastSeen || now))
  if (profile.lastPad < 0 || away < OFFLINE_MIN_MS) return null
  if (!isPadUnlocked(profile, profile.lastPad) || isMaxLevel(profile)) return null
  const steps = Math.floor(away / 1000 / TRAIN_INTERVAL)
  // Potions don't run while you're away.
  const gain = padGain(profile, profile.lastPad, 0)
  const result = addHealth(profile, Math.floor(steps * gain * OFFLINE_RATE))
  if (result.gain <= 0) return null
  return { health: result.gain, ms: away }
}

// --- Tutorial & badges ------------------------------------------------------------

/** Advances the tutorial if `event` completes the current step. */
export function advanceTutorial(profile, event) {
  const step = TUTORIAL[profile.tutorialStep]
  if (!step || step.event !== event) return false
  if (step.health && profile.health < step.health) return false
  profile.tutorialStep += 1
  return true
}

/** Awards a badge once. Returns the badge if newly awarded. */
/**
 * Finds Palm Beach's Secret Star (the caller checks the player is at it, in Palm Beach).
 * Once only; false if it was already found.
 */
export function claimSecretStar(profile) {
  if ((profile.world || 0) !== SECRET_STAR.world || profile.secretStars?.world2) return false
  profile.secretStars = { ...profile.secretStars, world2: true }
  return true
}

export function awardBadge(profile, id) {
  if (!BADGES[id] || profile.badges.includes(id)) return null
  profile.badges.push(id)
  return { id, ...BADGES[id] }
}
