/**
 * Plays the game with the real rules (shared/logic.js) as a sensible, greedy player and
 * prints the pacing: when each rebirth, tire, egg and zone arrives. Run it after any
 * change to shared/balance.js:
 *
 *   node scripts/balance-sim.mjs [hours=6]
 *
 * The player: trains on the best pad it has until its Health is well up on its last
 * roll (or it hits max level), rolls, then spends - the next tire first, then eggs,
 * passes and pads. At max level it rolls a few times for Wins, then rebirths. Walking
 * between the pads and the roll zone, and the fade back after a roll, cost time too.
 * No potions, no daily rewards, no packs: a free player's floor.
 */
import { EGGS, healthForLevel, levelCap, PADS, PETS, rollDuration, ROLL_RECOVERY, SHOP, TIRES, TRAIN_INTERVAL, WORLD_ZONES, ZONES } from '../shared/balance.js'
import { formatDistance, formatNumber } from '../shared/format.js'
import {
  applyRebirth,
  applyRoll,
  applyRollTick,
  applyTrain,
  buyShopItem,
  buyTire,
  claimSecretStar,
  createProfile,
  deletePet,
  equipBestPets,
  hatchEgg,
  isMaxLevel,
  isPadUnlocked,
  nextTire,
  petMultiplier,
  rollOutcome,
  tireById,
  usePortal,
} from '../shared/logic.js'
import { mulberry32 } from '../shared/rng.js'

const HOURS = Number(process.argv[2]) || 6
const WALK_TO_PAD = 6
const WALK_TO_ROLL = 6
const FADE_BACK = 2.5
const rand = mulberry32(42)

const p = createProfile('sim', 'Sim')
let t = 0
let lastRollHealth = 0
let onPad = false
const log = []
const mark = (what) => log.push({ t, what })
const clock = (s) => `${String(Math.floor(s / 3600)).padStart(1, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const bestPad = () => {
  let best = 0
  for (let i = 0; i < PADS.length; i += 1) if (isPadUnlocked(p, i) && PADS[i].mult > PADS[best].mult) best = i
  return best
}

function roll() {
  if (onPad) t += WALK_TO_ROLL
  onPad = false
  const key = p.world === 1 ? 'bestZone2' : 'bestZone'
  const before = p.stats[key]
  const r = applyRoll(p, t * 1000)
  // Health ticks in while the tire rolls.
  for (let s = 1; s <= Math.floor(r.duration); s += 1) applyRollTick(p, t * 1000)
  t += r.cooldown + FADE_BACK
  lastRollHealth = p.health
  const zones = WORLD_ZONES[p.world]
  for (let z = before + 1; z <= p.stats[key]; z += 1) mark(`ZONE  ${zones[z].name} reached (+${formatNumber(zones[z].discover)} Wins prize)`)
  // Through the portal as soon as it opens.
  if (process.env.NO_WORLD2 !== '1' && p.world === 0 && usePortal(p).ok) {
    mark(`PALM BEACH at R${p.rebirths} with ${formatNumber(p.wins)} Wins`)
    // An active player finds the Secret Star soon after arriving (NO_STAR=1 to skip).
    if (process.env.NO_STAR !== '1' && claimSecretStar(p)) mark('STAR  Secret Star found: x2 Power')
  }
  return r
}

const eggAverage = (egg) => egg.pets.reduce((sum, [id, w]) => sum + PETS[id].mult * w, 0) / 100
const weakestEquipped = () => {
  if (p.equippedPets.length < 3) return 0
  return Math.min(...p.equippedPets.map((uid) => PETS[p.pets.find((x) => x.uid === uid).id].mult))
}

/** Like a real player: throws away pets it isn't using once the inventory fills up. */
function tidyPets() {
  if (p.pets.length < 30) return
  for (const pet of [...p.pets]) if (!p.equippedPets.includes(pet.uid)) deletePet(p, pet.uid)
}

function spend() {
  tidyPets()
  for (;;) {
    const tire = nextTire(p)
    if (tire && p.wins >= tire.cost) {
      buyTire(p, tire.id)
      mark(`TIRE  ${tire.name} (+${formatNumber(tire.power)}) for ${formatNumber(tire.cost)}`)
      continue
    }
    // Passes, cheapest first, once they're under a third of what we hold.
    const pass = Object.entries(SHOP)
      .filter(([id, item]) => item.kind === 'pass' && !p.passes[id] && item.price * 3 <= p.wins)
      .sort((a, b) => a[1].price - b[1].price)[0]
    if (pass && (!tire || tire.cost > p.wins * 2)) {
      buyShopItem(p, pass[0])
      mark(`PASS  ${pass[1].name} for ${formatNumber(pass[1].price)}`)
      continue
    }
    // The best egg we can afford three of, when no tire is close and its pets would
    // beat the weakest one we have equipped.
    const egg = Object.entries(EGGS)
      .filter(([, e]) => e.cost.wins * 3 <= p.wins && eggAverage(e) > weakestEquipped())
      .sort((a, b) => b[1].cost.wins - a[1].cost.wins)[0]
    // (Or whenever three of them cost under a tenth of what we hold.)
    const cheap = egg && egg[1].cost.wins * 30 <= p.wins
    if (egg && (cheap || !tire || tire.cost > (p.wins - egg[1].cost.wins * 3) * 3) && p.pets.length < 40) {
      const res = hatchEgg(p, egg[0], 3, { rand })
      if (res.ok) {
        equipBestPets(p)
        mark(`EGG   3x ${egg[1].name}: ${res.pets.map((x) => PETS[x.id].name).join(', ')} -> pets x${petMultiplier(p).toFixed(1)}`)
        continue
      }
    }
    break
  }
}

let rebirthAt = 0
while (t < HOURS * 3600) {
  if (isMaxLevel(p)) {
    // At the cap: a few rolls for Wins, then rebirth.
    for (let i = 0; i < 3; i += 1) {
      roll()
      spend()
    }
    const out = rollOutcome(p.health)
    applyRebirth(p)
    mark(
      `REBIRTH -> R${p.rebirths}  (${clock(t - rebirthAt)} since last) | tire ${tireById(p.equippedTire).name}, pets x${petMultiplier(p).toFixed(1)}, ` +
        `${formatDistance(out.distance)}${out.blocked > 0 ? ` stopped by the ${ZONES[out.blocked].name} wall` : ''}, wins ${formatNumber(p.wins)}`,
    )
    rebirthAt = t
    lastRollHealth = 0
    // Rebirth gift eggs: hatch them straight away.
    tidyPets()
    while ((p.items.eggVolcano || 0) > 0 && p.pets.length < 40) {
      const res = hatchEgg(p, 'volcano', 1, { paid: 'item', rand })
      if (!res.ok) break
      equipBestPets(p)
      mark(`GIFT  Volcano Egg: ${PETS[res.pets[0].id].name} -> pets x${petMultiplier(p).toFixed(1)}`)
    }
    continue
  }
  // Train until Health is well up on the last roll, or capped.
  if (!onPad) t += WALK_TO_PAD
  onPad = true
  const pad = bestPad()
  const target = Math.max(30, lastRollHealth * 1.6)
  while (!isMaxLevel(p) && p.health < target) {
    applyTrain(p, pad, t * 1000)
    t += TRAIN_INTERVAL
  }
  roll()
  spend()
}

for (const { t: at, what } of log) console.log(`${clock(at)}  ${what}`)
console.log()
console.log(`After ${HOURS} h: R${p.rebirths}, level ${p.level}/${levelCap(p.rebirths)}, tire ${tireById(p.equippedTire).name}, ` +
  `best ${formatDistance(p.stats.bestDistance)} (${ZONES[p.stats.bestZone].name}), ${formatNumber(p.stats.totalWins)} Wins earned, ${p.stats.rolls} rolls`)
console.log(`Cap health R${p.rebirths}: ${formatNumber(healthForLevel(levelCap(p.rebirths)))}; roll duration at best: ${rollDuration(p.stats.bestDistance).toFixed(1)} s + ${ROLL_RECOVERY} s`)
console.log(`Tires owned ${p.ownedTires.length}/${TIRES.length}`)
