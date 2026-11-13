/**
 * Every tunable number in the game. Rules live in logic.js; this file is only data,
 * so balancing never means touching code. `scripts/balance-sim.mjs` plays the game
 * with these numbers and prints the pacing (time to each rebirth, bubble and stage).
 *
 * Shared by client (display) and server (authority): both always agree on costs and
 * multipliers because they read the same table.
 *
 * The loop (+1 Bubble Hop): blow bubbles on the Blow Pads (and tap BLOW) for Breath ->
 * step into the BLOW ZONE, hold BLOW to puff up a giant bubble, let go at its biggest and
 * hop inside -> bounce down the valley through meadows, villages, towns and cities (more
 * Breath bounces you further, every bounce earns more Breath and every metre pays Wins)
 * -> better bubbles, eggs and pads -> rebirth at max level for a bigger Breath multiplier
 * and a higher cap -> bounce further still.
 *
 * Inside the code the template's names stay (so the server and the HUD plumbing never
 * change): `health` is Breath, a `tire` is a BUBBLE, a `pad` is a Blow Pad and a `roll`
 * is a bounce. Only what players see was renamed. How each bubble looks (its shape and
 * colours) is client/src/game/bubbles.js.
 */

// --- Health and levels --------------------------------------------------------------

/** Seconds between gains blowing on a Blow Pad: one puff, one gain. */
export const TRAIN_INTERVAL = 0.6
/** Seconds between the "+N" Breath gains you earn while you bounce. */
export const ROLL_TICK = 1
/**
 * Tapping BLOW anywhere: every tap is one more gain (a Blow Pad's, standing on one),
 * on top of the pad's own puffs - at most BLOW_TAP_RATE a second, with a burst of
 * BLOW_TAP_BURST, so an autoclicker is no better than a quick thumb.
 */
export const BLOW_TAP_RATE = 4
export const BLOW_TAP_BURST = 4

/**
 * Your level comes from your Health: reaching level L takes healthForLevel(L) Health.
 * Each level needs LEVEL_GROWTH_EARLY times the last at first, easing towards
 * LEVEL_GROWTH_LATE: early rebirths multiply your gains many times over (a new bar,
 * x2 from the rebirth itself, the next bubble), later ones much less, and the levels
 * keep step so every rebirth takes a little longer than the one before.
 */
export const LEVEL_BASE = 20
export const LEVEL_GROWTH_EARLY = 1.3
export const LEVEL_GROWTH_LATE = 1.097
export const LEVEL_GROWTH_FADE = 100
/** Levels past this are not reachable: the table stops here. */
export const MAX_LEVEL = 1200

const LEVEL_TABLE = (() => {
  const table = new Float64Array(MAX_LEVEL + 1)
  let need = LEVEL_BASE
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    table[level] = table[level - 1] + need
    const growth = LEVEL_GROWTH_LATE + (LEVEL_GROWTH_EARLY - LEVEL_GROWTH_LATE) * Math.exp(-level / LEVEL_GROWTH_FADE)
    need *= growth
  }
  return table
})()

/** Two significant figures: level thresholds read cleanly (2,300, not 2,317). */
const round2 = (n) => {
  if (n < 100) return Math.round(n)
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / step) * step
}

export const healthForLevel = (level) => (level <= 1 ? 0 : round2(LEVEL_TABLE[Math.min(MAX_LEVEL, level)]))

// --- Rebirth ----------------------------------------------------------------------

/** Max level by rebirth count: R0 = 15, R1 = 23, then +8 per rebirth. */
export const levelCap = (rebirths) => Math.min(MAX_LEVEL, 15 + 8 * Math.max(0, rebirths))

/** Health multiplier from rebirths, as in the reference: R0 = x1, R1 = x2, R2 = x3 ... */
export const rebirthMultiplier = (rebirths) => 1 + Math.max(0, rebirths)

/**
 * From Rebirth 15, every 5th rebirth (15, 20, 25...) comes with a gift of eggs: late in
 * the game, when each rebirth takes longest, there's always one coming up. One more egg
 * every 10 rebirths, up to 6.
 */
export const REBIRTH_GIFT_FROM = 15
export const REBIRTH_GIFT_EVERY = 5
export function rebirthGift(rebirths) {
  if (rebirths < REBIRTH_GIFT_FROM || (rebirths - REBIRTH_GIFT_FROM) % REBIRTH_GIFT_EVERY !== 0) return null
  const amount = Math.min(6, 3 + Math.floor((rebirths - REBIRTH_GIFT_FROM) / 10))
  return { rebirths, item: 'eggVolcano', amount, label: `${amount} Volcano Eggs` }
}
/** The next rebirth after `rebirths` that brings a gift, and the gift. */
export function nextRebirthGift(rebirths) {
  const from = Math.max(REBIRTH_GIFT_FROM, rebirths + 1)
  const at = from + ((REBIRTH_GIFT_EVERY - ((from - REBIRTH_GIFT_FROM) % REBIRTH_GIFT_EVERY)) % REBIRTH_GIFT_EVERY)
  return rebirthGift(at)
}

/** Skipping straight to a rebirth costs this many max-level bounces' worth of Wins. */
export const REBIRTH_SKIP_ROLLS = 10

// --- Blow Pads (the template's training pads) ----------------------------------------

/**
 * Blow Pads, south to north in world.js order. Standing on one, you blow bubbles through
 * a giant wand and gain Breath every TRAIN_INTERVAL. `rebirths` = rebirths needed;
 * `product` = the SHOP pass that unlocks it instead; `world` = the only world it works in
 * (the coral pads at the north end of the row work in Coral Coast only, and stand locked
 * in World 1 as a teaser).
 */
export const PADS = [
  { id: 'starter', name: 'Soapy Pad', mult: 1, rebirths: 0 },
  { id: 'speed', name: 'Sunny Pad', mult: 2, rebirths: 1 },
  { id: 'turbo', name: 'Bubblegum Pad', mult: 4, rebirths: 2 },
  { id: 'nitro', name: 'Ocean Pad', mult: 10, rebirths: 4 },
  { id: 'rocket', name: 'Rocket Pad', mult: 20, rebirths: 6 },
  { id: 'diamond', name: 'Crystal Pad', mult: 40, product: 'padVeryOp', tag: 'VERY OP!' },
  { id: 'galaxy', name: 'Galaxy Pad', mult: 100, product: 'padBest', tag: 'BEST OVERALL!' },
  // Kept close to the Galaxy Pad: every Breath multiplier here speeds up the whole late
  // game (scripts/balance-sim.mjs) - the coral pads are milestones, not a jump.
  { id: 'surf', name: 'Coral Pad', mult: 115, rebirths: 10, world: 1 },
  { id: 'tsunami', name: 'Tsunami Pad', mult: 130, rebirths: 16, world: 1 },
]

// --- Bubbles (the template's tires) --------------------------------------------------

/**
 * The bubbles you blow - and ride. `power` is the Breath every single gain is worth
 * before multipliers (the "+1" of the Soap Bubble); `cost` is in Wins; `rarity`
 * (RARITIES) is shown on its stand. Bought in order at the Bubble Shop. Every one is a
 * different shape (client/src/game/bubbles.js: drops, cubes, hearts, stars, gems,
 * clouds, planets...), from a plain soap bubble to galaxy and infinity bubbles. About
 * x2.6 power for x2.8-x3.3 the Wins each.
 */
export const TIRES = [
  { id: 'soap', name: 'Soap Bubble', power: 1, cost: 0, rarity: 'common' },
  // Cheap enough to buy with the Wins from your very first bounce.
  { id: 'drop', name: 'Raindrop Bubble', power: 3, cost: 1, rarity: 'common' },
  { id: 'mint', name: 'Minty Cube', power: 5, cost: 15, rarity: 'common' },
  { id: 'heart', name: 'Lovely Heart', power: 12, cost: 75, rarity: 'uncommon' },
  { id: 'star', name: 'Twinkle Star', power: 30, cost: 300, rarity: 'uncommon' },
  { id: 'bunny', name: 'Bunny Bubble', power: 75, cost: 1200, rarity: 'rare' },
  { id: 'gem', name: 'Amethyst Gem', power: 200, cost: 4500, rarity: 'rare' },
  { id: 'cloud', name: 'Cloud Puff', power: 500, cost: 16000, rarity: 'rare' },
  { id: 'pill', name: 'Candy Capsule', power: 1250, cost: 55000, rarity: 'epic' },
  { id: 'planet', name: 'Ringed Planet', power: 3500, cost: 180000, rarity: 'epic' },
  { id: 'crystal', name: 'Ice Crystal', power: 9000, cost: 600000, rarity: 'epic' },
  { id: 'twin', name: 'Twin Bubble', power: 23000, cost: 2e6, rarity: 'epic' },
  { id: 'egg', name: 'Golden Egg', power: 60000, cost: 6e6, rarity: 'legendary' },
  { id: 'magma', name: 'Magma Orb', power: 155000, cost: 17e6, rarity: 'legendary' },
  { id: 'atom', name: 'Atom Bubble', power: 400000, cost: 48e6, rarity: 'legendary' },
  { id: 'blossom', name: 'Blossom Bubble', power: 1.05e6, cost: 135e6, rarity: 'legendary' },
  { id: 'ruby', name: 'Ruby Heart', power: 2.7e6, cost: 380e6, rarity: 'mythic' },
  { id: 'diamond', name: 'Diamond Gem', power: 7e6, cost: 1.05e9, rarity: 'mythic' },
  { id: 'rainbow', name: 'Rainbow Star', power: 1.8e7, cost: 3e9, rarity: 'mythic' },
  { id: 'candy', name: 'Cotton Candy Cloud', power: 4.8e7, cost: 8.5e9, rarity: 'mythic' },
  { id: 'galaxy', name: 'Galaxy Orb', power: 1.25e8, cost: 2.4e10, rarity: 'secret' },
  { id: 'dragon', name: 'Dragon Egg', power: 3.3e8, cost: 6.8e10, rarity: 'secret' },
  { id: 'cosmic', name: 'Cosmic Planet', power: 8.6e8, cost: 1.9e11, rarity: 'secret' },
  { id: 'infinity', name: 'Infinity Twin', power: 2.2e9, cost: 5.4e11, rarity: 'secret' },
]

// --- Bouncing (the template's rolls) -------------------------------------------------

/**
 * How far a bounce takes you (in metres): 0 Breath still sends you ROLL_BASE metres, and
 * each stage's start is reached with the Breath in its `wall`, less WALL_MARGIN; in
 * between, distance follows Breath (in log terms) from one stage's start to the next. So
 * the stages' `wall` Breath sets the pace. Nothing on the way stops you. See
 * logic.rollReach.
 */
export const ROLL_BASE = 60
export const ROLL_H0 = 50
/** A stage's `wall` is this many times the Breath that just reaches its start. */
export const WALL_MARGIN = 1.3

/**
 * The valley's sixty stages: stretches of distance, each a little longer than the one
 * before (100 m, 106 m, 112 m ... about 450 m) - a meadow, a village, a farm, a town, the
 * suburbs, downtown, a city of skyscrapers, the harbour, the beach and on out to the
 * Moon and space. `theme` picks the sky (one of twenty); `scene` picks what you bounce
 * past (client/src/game/roll/scenery.js: cottages, barns, houses, skyscrapers, palms,
 * igloos, candy houses, giant mushrooms, crystals, domes...). `wall` = the Breath that
 * paces how far a bounce goes (see ROLL_BASE); each about twice the last. `winsPerMeter`
 * pays for every metre bounced in the stage - the further out, the more each metre pays
 * - and `discover` is a one-off prize the first time you ever reach the stage. `smash`
 * is left over from the template's gates and no longer paid.
 */
export const ZONES = [
  { id: 'meadow', name: 'Bubble Meadow', theme: 'grassy', scene: 'meadow', start: 0, wall: 0, winsPerMeter: 0.006, smash: 0, discover: 0 },
  { id: 'daisy-village', name: 'Daisy Village', theme: 'grassy', scene: 'village', start: 100, wall: 11, winsPerMeter: 0.0072, smash: 2, discover: 5 },
  { id: 'windmill-farm', name: 'Windmill Farm', theme: 'autumn', scene: 'farm', start: 200, wall: 21, winsPerMeter: 0.00984, smash: 3, discover: 7 },
  { id: 'maple-town', name: 'Maple Town', theme: 'autumn', scene: 'town', start: 306, wall: 41, winsPerMeter: 0.0135, smash: 4, discover: 9 },
  { id: 'sunny-suburbs', name: 'Sunny Suburbs', theme: 'sky', scene: 'town', start: 418, wall: 79, winsPerMeter: 0.0185, smash: 5, discover: 13 },
  { id: 'downtown', name: 'Downtown', theme: 'sky', scene: 'city', start: 536, wall: 150, winsPerMeter: 0.0255, smash: 7, discover: 18 },
  { id: 'skyscraper-city', name: 'Skyscraper City', theme: 'ocean', scene: 'city', start: 660, wall: 300, winsPerMeter: 0.0351, smash: 10, discover: 24 },
  { id: 'harbor-docks', name: 'Harbor Docks', theme: 'ocean', scene: 'harbor', start: 790, wall: 590, winsPerMeter: 0.0486, smash: 13, discover: 34 },
  { id: 'sandy-beach', name: 'Sandy Beach', theme: 'beach', scene: 'beach', start: 926, wall: 1200, winsPerMeter: 0.0673, smash: 19, discover: 47 },
  { id: 'palm-jungle', name: 'Palm Jungle', theme: 'jungle', scene: 'jungle', start: 1068, wall: 2300, winsPerMeter: 0.0934, smash: 26, discover: 65 },
  { id: 'snowy-village', name: 'Snowy Village', theme: 'frozen', scene: 'snow', start: 1216, wall: 4600, winsPerMeter: 0.13, smash: 36, discover: 90 },
  { id: 'blossom-town', name: 'Blossom Town', theme: 'cherry', scene: 'blossom', start: 1370, wall: 9200, winsPerMeter: 0.181, smash: 50, discover: 130 },
  { id: 'candy-town', name: 'Candy Town', theme: 'candy', scene: 'candy', start: 1530, wall: 18000, winsPerMeter: 0.253, smash: 70, discover: 180 },
  { id: 'mushroom-village', name: 'Mushroom Village', theme: 'mushroom', scene: 'mushroom', start: 1696, wall: 37000, winsPerMeter: 0.355, smash: 99, discover: 250 },
  { id: 'cactus-town', name: 'Cactus Town', theme: 'desert', scene: 'desert', start: 1868, wall: 75000, winsPerMeter: 0.498, smash: 140, discover: 350 },
  { id: 'volcano-island', name: 'Volcano Island', theme: 'volcano', scene: 'volcano', start: 2046, wall: 150000, winsPerMeter: 0.7, smash: 190, discover: 490 },
  { id: 'swampy-hollow', name: 'Swampy Hollow', theme: 'swamp', scene: 'swamp', start: 2230, wall: 310000, winsPerMeter: 0.987, smash: 270, discover: 690 },
  { id: 'crystal-caves', name: 'Crystal Caves', theme: 'crystal', scene: 'crystal', start: 2420, wall: 640000, winsPerMeter: 1.39, smash: 390, discover: 970 },
  { id: 'coral-reef', name: 'Coral Reef', theme: 'ocean', scene: 'reef', start: 2616, wall: 1.3e6, winsPerMeter: 1.97, smash: 550, discover: 1400 },
  { id: 'neon-city', name: 'Neon City', theme: 'neon', scene: 'neon', start: 2818, wall: 2.7e6, winsPerMeter: 2.8, smash: 780, discover: 1900 },
  { id: 'cloud-kingdom', name: 'Cloud Kingdom', theme: 'sky', scene: 'sky', start: 3026, wall: 5.7e6, winsPerMeter: 3.98, smash: 1100, discover: 2800 },
  { id: 'rainbow-road', name: 'Rainbow Road', theme: 'rainbow', scene: 'rainbow', start: 3240, wall: 1.2e7, winsPerMeter: 5.66, smash: 1600, discover: 3900 },
  { id: 'moon-base', name: 'Moon Base', theme: 'moon', scene: 'moon', start: 3460, wall: 2.5e7, winsPerMeter: 8.08, smash: 2200, discover: 5600 },
  { id: 'aurora-peaks', name: 'Aurora Peaks', theme: 'aurora', scene: 'snow', start: 3686, wall: 5.3e7, winsPerMeter: 11.6, smash: 3200, discover: 8000 },
  { id: 'space', name: 'Space Station', theme: 'space', scene: 'space', start: 3918, wall: 1.1e8, winsPerMeter: 16.6, smash: 4600, discover: 12000 },
  { id: 'star-gate', name: 'Star Gate', theme: 'cosmic', scene: 'space', start: 4156, wall: 2.4e8, winsPerMeter: 23.8, smash: 6600, discover: 17000 },
  { id: 'green-valley', name: 'Green Valley', theme: 'grassy', scene: 'village', start: 4400, wall: 5.1e8, winsPerMeter: 34.2, smash: 9500, discover: 24000 },
  { id: 'pumpkin-farm', name: 'Pumpkin Farm', theme: 'autumn', scene: 'farm', start: 4650, wall: 1.1e9, winsPerMeter: 49.3, smash: 14000, discover: 34000 },
  { id: 'old-town', name: 'Old Town', theme: 'autumn', scene: 'town', start: 4906, wall: 2.3e9, winsPerMeter: 71.3, smash: 20000, discover: 50000 },
  { id: 'metro-city', name: 'Metro City', theme: 'sky', scene: 'city', start: 5168, wall: 5e9, winsPerMeter: 103, smash: 29000, discover: 72000 },
  { id: 'lighthouse-bay', name: 'Lighthouse Bay', theme: 'beach', scene: 'harbor', start: 5436, wall: 1.1e10, winsPerMeter: 150, smash: 42000, discover: 100000 },
  { id: 'jungle-temple', name: 'Jungle Temple', theme: 'jungle', scene: 'jungle', start: 5710, wall: 2.4e10, winsPerMeter: 218, smash: 60000, discover: 150000 },
  { id: 'igloo-town', name: 'Igloo Town', theme: 'frozen', scene: 'snow', start: 5990, wall: 5.2e10, winsPerMeter: 317, smash: 88000, discover: 220000 },
  { id: 'lantern-town', name: 'Lantern Town', theme: 'cherry', scene: 'blossom', start: 6276, wall: 1.1e11, winsPerMeter: 462, smash: 130000, discover: 320000 },
  { id: 'sweet-kingdom', name: 'Sweet Kingdom', theme: 'candy', scene: 'candy', start: 6568, wall: 2.5e11, winsPerMeter: 676, smash: 190000, discover: 470000 },
  { id: 'fairy-forest', name: 'Fairy Forest', theme: 'mushroom', scene: 'mushroom', start: 6866, wall: 5.6e11, winsPerMeter: 990, smash: 270000, discover: 690000 },
  { id: 'desert-oasis', name: 'Desert Oasis', theme: 'desert', scene: 'desert', start: 7170, wall: 1.2e12, winsPerMeter: 1450, smash: 400000, discover: 1e6 },
  { id: 'lava-lake', name: 'Lava Lake', theme: 'volcano', scene: 'volcano', start: 7480, wall: 2.8e12, winsPerMeter: 2140, smash: 590000, discover: 1.5e6 },
  { id: 'firefly-bayou', name: 'Firefly Bayou', theme: 'swamp', scene: 'swamp', start: 7796, wall: 6.2e12, winsPerMeter: 3150, smash: 870000, discover: 2.2e6 },
  { id: 'gem-mines', name: 'Gem Mines', theme: 'crystal', scene: 'crystal', start: 8118, wall: 1.4e13, winsPerMeter: 4650, smash: 1.3e6, discover: 3.2e6 },
  { id: 'sunken-city', name: 'Sunken City', theme: 'ocean', scene: 'reef', start: 8446, wall: 3.2e13, winsPerMeter: 6870, smash: 1.9e6, discover: 4.8e6 },
  { id: 'cyber-city', name: 'Cyber City', theme: 'neon', scene: 'neon', start: 8780, wall: 7.2e13, winsPerMeter: 10200, smash: 2.8e6, discover: 7.1e6 },
  { id: 'sky-castle', name: 'Sky Castle', theme: 'sky', scene: 'sky', start: 9120, wall: 1.6e14, winsPerMeter: 15100, smash: 4.2e6, discover: 1e7 },
  { id: 'prism-falls', name: 'Prism Falls', theme: 'rainbow', scene: 'rainbow', start: 9466, wall: 3.7e14, winsPerMeter: 22500, smash: 6.2e6, discover: 1.6e7 },
  { id: 'lunar-craters', name: 'Lunar Craters', theme: 'moon', scene: 'moon', start: 9818, wall: 8.6e14, winsPerMeter: 33500, smash: 9.3e6, discover: 2.3e7 },
  { id: 'northern-lights', name: 'Northern Lights', theme: 'aurora', scene: 'snow', start: 10176, wall: 2e15, winsPerMeter: 50000, smash: 1.4e7, discover: 3.5e7 },
  { id: 'galaxy-rift', name: 'Galaxy Rift', theme: 'space', scene: 'space', start: 10540, wall: 4.6e15, winsPerMeter: 74800, smash: 2.1e7, discover: 5.2e7 },
  { id: 'nebula-gate', name: 'Nebula Gate', theme: 'cosmic', scene: 'space', start: 10910, wall: 1.1e16, winsPerMeter: 112000, smash: 3.1e7, discover: 7.8e7 },
  { id: 'sunflower-village', name: 'Sunflower Village', theme: 'grassy', scene: 'village', start: 11286, wall: 2.5e16, winsPerMeter: 168000, smash: 4.7e7, discover: 1.2e8 },
  { id: 'harvest-town', name: 'Harvest Town', theme: 'autumn', scene: 'town', start: 11668, wall: 5.8e16, winsPerMeter: 253000, smash: 7e7, discover: 1.8e8 },
  { id: 'capital-city', name: 'Capital City', theme: 'sky', scene: 'city', start: 12056, wall: 1.4e17, winsPerMeter: 382000, smash: 1.1e8, discover: 2.7e8 },
  { id: 'tropical-isle', name: 'Tropical Isle', theme: 'beach', scene: 'beach', start: 12450, wall: 3.2e17, winsPerMeter: 576000, smash: 1.6e8, discover: 4e8 },
  { id: 'yeti-village', name: 'Yeti Village', theme: 'frozen', scene: 'snow', start: 12850, wall: 7.6e17, winsPerMeter: 872000, smash: 2.4e8, discover: 6.1e8 },
  { id: 'cupcake-castle', name: 'Cupcake Castle', theme: 'candy', scene: 'candy', start: 13256, wall: 1.8e18, winsPerMeter: 1.3e6, smash: 3.7e8, discover: 9.2e8 },
  { id: 'inferno-peak', name: 'Inferno Peak', theme: 'volcano', scene: 'volcano', start: 13668, wall: 4.3e18, winsPerMeter: 2e6, smash: 5.6e8, discover: 1.4e9 },
  { id: 'atlantis', name: 'Atlantis', theme: 'ocean', scene: 'reef', start: 14086, wall: 1e19, winsPerMeter: 3e6, smash: 8.5e8, discover: 2.1e9 },
  { id: 'arcade-avenue', name: 'Arcade Avenue', theme: 'neon', scene: 'neon', start: 14510, wall: 2.5e19, winsPerMeter: 4.7e6, smash: 1.3e9, discover: 3.2e9 },
  { id: 'red-planet', name: 'Red Planet', theme: 'moon', scene: 'moon', start: 14940, wall: 6e19, winsPerMeter: 7.1e6, smash: 2e9, discover: 4.9e9 },
  { id: 'comet-field', name: 'Comet Field', theme: 'aurora', scene: 'space', start: 15376, wall: 1.5e20, winsPerMeter: 1.1e7, smash: 3e9, discover: 7.5e9 },
  { id: 'bubble-beyond', name: 'The Bubble Beyond', theme: 'cosmic', scene: 'space', start: 15818, wall: 3.5e20, winsPerMeter: 1.7e7, smash: 4.6e9, discover: 1.2e10 },
]

/** Wins pickups down the valley: first at 40 m, then every 80 m. */
export const TROPHY_FIRST = 40
export const TROPHY_SPACING = 80
/** A trophy is worth this many metres of its zone's Wins (at least 1). */
export const TROPHY_METERS = 80

/**
 * Seconds from letting go of BLOW to bouncing away: you jump up onto the bubble you just
 * blew, land on top of it, sink inside, and it crouches and leaps away. (Blowing it up
 * before that is yours: you hold for as long as you like, and the server only hears about
 * the release.)
 */
export const ROLL_LAUNCH = 1.4
/**
 * Seconds a bounce of `distance` metres takes, the hop in included. Logarithmic: long
 * trips stay short.
 */
export const rollDuration = (distance) => ROLL_LAUNCH + 3 + 2.2 * Math.log(1 + distance / 60)
/** The result popup after the bubble pops, before you're back in the Blow Zone. */
export const ROLL_RECOVERY = 2.2

/**
 * How many times a bubble bouncing `distance` metres touches down before it stops: a few
 * big hops on a short trip, up to BOUNCE_MAX on the longest. The client draws the hops
 * (roll/path.js); the server pays a Breath gain every ROLL_TICK while you bounce.
 */
export const BOUNCE_MIN = 3
export const BOUNCE_MAX = 16
export const bounceCount = (distance) => Math.max(BOUNCE_MIN, Math.min(BOUNCE_MAX, Math.round(3 + 2.2 * Math.log(1 + Math.max(0, distance) / 80))))

/**
 * When the bubble touches down. The bouncing takes BOUNCE_LAND of the time after the hop
 * in (the rest is settling, then the pop); each bounce is lower than the last, down to
 * LAST_BOUNCE of the first, and lasts as long as its height would take to fall (the
 * square root of it). Shared, so the client draws the touch-downs (roll/path.js) exactly
 * when the server times PERFECT BOUNCE taps against them.
 */
export const BOUNCE_LAND = 0.88
export const LAST_BOUNCE = 0.1
/**
 * The touch-downs of a bounce of `distance` metres that takes `duration` seconds: seconds
 * after letting go of BLOW, one per bounce (the first ends the big first arc). Also each
 * bounce's share of the bouncing time, as `fractions` (cumulative, 0 to 1).
 */
export function bounceTimes(distance, duration) {
  const count = bounceCount(distance)
  const r = count > 1 ? Math.pow(LAST_BOUNCE, 1 / (count - 1)) : 1
  let total = 0
  for (let k = 0; k < count; k += 1) total += Math.pow(r, k / 2)
  const fractions = [0]
  const touchdowns = []
  const flight = Math.max(0.1, duration - ROLL_LAUNCH)
  let at = 0
  for (let k = 0; k < count; k += 1) {
    at += Math.pow(r, k / 2) / total
    fractions.push(at)
    touchdowns.push(ROLL_LAUNCH + BOUNCE_LAND * flight * at)
  }
  fractions[count] = 1
  return { count, fractions, touchdowns }
}

/**
 * PERFECT BOUNCE: tap the moment the bubble touches down. Within PERFECT_BOUNCE_WINDOW
 * seconds of a touch-down it's PERFECT - the bubble surges on PERFECT_BOUNCE_REACH more of
 * the bounce's distance, pays PERFECT_BOUNCE_WINS more of its Wins and PERFECT_BOUNCE_BREATH
 * gains of Breath (at most MAX_PERFECT_BOUNCES a bounce); within GOOD_BOUNCE_WINDOW it's
 * GOOD - GOOD_BOUNCE_BREATH gains. A tap nowhere near a touch-down is a MISS and spends the
 * next one, so tapping non-stop gets you nothing. The client judges the tap (as it does
 * the blow meter); the server checks it's plausibly timed and counts each touch-down once.
 */
export const PERFECT_BOUNCE_WINDOW = 0.12
export const GOOD_BOUNCE_WINDOW = 0.26
export const PERFECT_BOUNCE_REACH = 0.04
export const PERFECT_BOUNCE_WINS = 0.04
export const PERFECT_BOUNCE_BREATH = 3
export const GOOD_BOUNCE_BREATH = 1
export const MAX_PERFECT_BOUNCES = 10
/** A tap reaches the server this long before or after its touch-down's server time, at most (network lag). */
export const BOUNCE_TAP_EARLY_MS = 400
export const BOUNCE_TAP_LATE_MS = 1200

/**
 * The blow meter. Step into the BLOW ZONE and hold BLOW: you blow two little bubbles off
 * your wand, then a giant one, and the meter fills as it grows (CHARGE_TIME to full size;
 * client/src/game/launch.js times the little ones). Full size, it wobbles: the meter
 * bounces off the top and back, again and again (TWANG_PERIOD a wobble, dipping
 * TWANG_DEPTH). Let go of BLOW and you hop inside and bounce away. `accuracy` is how full
 * the meter was when you let go: 1 at the very top of a wobble. The grade it lands in
 * decides the bounce, each grade clearly apart from the next: how far you go (`reach`, a
 * share of what your Breath alone would send you - half the distance for a WEAK one,
 * half as far again for a PERFECT one) and how many Wins it pays (`bonus`). Auto Bounce
 * skips the meter: a plain x1 bounce, between GOOD and GREAT.
 *
 * Wins are the Breath's worth times `bonus` - not paid by the metres the grade adds:
 * late in the game each stage pays ~1.4 times the last, so paying for half as far again
 * would multiply a PERFECT bounce's Wins dozens of times over (logic.applyRoll).
 */
export const CHARGE_TIME = 1.6
/**
 * Seconds per wobble at full size, and how far down the meter each one dips. The wobble
 * is sharp at the top (|sin|), so the PERFECT moment is ~0.1 s each time: a real test of
 * timing, still fair on a phone, and a bubble let go at full size is never worse than
 * GOOD.
 */
export const TWANG_PERIOD = 0.75
export const TWANG_DEPTH = 0.5
/** Held this long at full size, the bubble lets go by itself. */
export const CHARGE_HOLD_MAX = 3.5
/** The meter (0-1) `seconds` after reaching full size: wobbling off the top. */
export const twangAt = (seconds) => 1 - TWANG_DEPTH * Math.abs(Math.sin((Math.PI * Math.max(0, seconds)) / TWANG_PERIOD))
/**
 * Grades by `min` accuracy: PERFECT is the top 12% of the meter, GREAT 30%, GOOD 60%.
 * `reach` is [at the grade's outer edge, at its inner edge]: a little further the nearer
 * the top within a grade, and a big step up to the next.
 */
export const HIT_GRADES = [
  { id: 'perfect', min: 0.88, reach: [1.4, 1.5], bonus: 1.6, label: 'PERFECT!' },
  { id: 'great', min: 0.7, reach: [1.1, 1.2], bonus: 1.25, label: 'GREAT!' },
  { id: 'good', min: 0.4, reach: [0.8, 0.9], bonus: 1, label: 'GOOD' },
  { id: 'weak', min: 0, reach: [0.5, 0.6], bonus: 0.75, label: 'TOO SMALL...' },
]
const clampAccuracy = (accuracy) => Math.min(1, Math.max(0, accuracy))
/** The grade for a meter `accuracy` (0-1), or null for a bounce without the meter. */
export const hitGrade = (accuracy) => (Number.isFinite(accuracy) ? HIT_GRADES.find((g) => clampAccuracy(accuracy) >= g.min) : null)
/**
 * How far a bounce at meter `accuracy` takes you, as a share of what your Breath alone
 * would: 0.5 barely blown, 1.5 at the top of a wobble, in a clear step per grade; 1 for a
 * bounce without the meter.
 */
export function hitReach(accuracy) {
  const grade = hitGrade(accuracy)
  if (!grade) return 1
  const index = HIT_GRADES.indexOf(grade)
  const top = index > 0 ? HIT_GRADES[index - 1].min : 1
  const t = Math.min(1, (clampAccuracy(accuracy) - grade.min) / (top - grade.min))
  return grade.reach[0] + (grade.reach[1] - grade.reach[0]) * t
}

// --- Pets & eggs ------------------------------------------------------------------

export const RARITIES = {
  common: { name: 'Common', color: '#b9c3cf', order: 0 },
  uncommon: { name: 'Uncommon', color: '#4ade80', order: 1 },
  rare: { name: 'Rare', color: '#38bdf8', order: 2 },
  epic: { name: 'Epic', color: '#b15cff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffc41f', order: 4 },
  mythic: { name: 'Mythic', color: '#ff3b6b', order: 5 },
  secret: { name: 'Secret', color: '#ff5bd8', order: 6 },
}

/** `mult` multiplies Breath gains. Equipped pets stack additively (see logic.js). */
export const PETS = {
  cat: { name: 'Cat', rarity: 'common', mult: 1.1 },
  dog: { name: 'Dog', rarity: 'common', mult: 1.15 },
  bunny: { name: 'Bunny', rarity: 'uncommon', mult: 1.25 },
  bear: { name: 'Bear', rarity: 'rare', mult: 1.5 },
  cow: { name: 'Cow', rarity: 'uncommon', mult: 1.4 },
  parrot: { name: 'Parrot', rarity: 'rare', mult: 1.7 },
  fox: { name: 'Fox', rarity: 'epic', mult: 2.2 },
  tiger: { name: 'Tiger', rarity: 'legendary', mult: 3 },
  flamingo: { name: 'Flamingo', rarity: 'uncommon', mult: 2.5 },
  turtle: { name: 'Turtle', rarity: 'rare', mult: 3.2 },
  owl: { name: 'Owl', rarity: 'epic', mult: 4.5 },
  phoenix: { name: 'Phoenix', rarity: 'legendary', mult: 7 },
  pony: { name: 'Pony', rarity: 'rare', mult: 5 },
  unicorn: { name: 'Unicorn', rarity: 'epic', mult: 8 },
  pegasus: { name: 'Pegasus', rarity: 'legendary', mult: 13 },
  salamander: { name: 'Salamander', rarity: 'rare', mult: 10 },
  firebird: { name: 'Fire Bird', rarity: 'epic', mult: 16 },
  golem: { name: 'Magma Golem', rarity: 'legendary', mult: 26 },
  inferno: { name: 'Inferno Wolf', rarity: 'mythic', mult: 45 },
  dragon: { name: 'Dragon', rarity: 'epic', mult: 2.5 },
  crab: { name: 'Lucky Crab', rarity: 'uncommon', mult: 1.2 },
  sphinx: { name: 'Sphinx', rarity: 'secret', mult: 80 },
  // Coral Coast's Coral Egg: the Kraken is the best pet in the game, but only just - the
  // best three pets set the late game's pace (scripts/balance-sim.mjs).
  seagull: { name: 'Seagull', rarity: 'rare', mult: 16 },
  dolphin: { name: 'Dolphin', rarity: 'epic', mult: 22 },
  shark: { name: 'Shark', rarity: 'legendary', mult: 32 },
  kraken: { name: 'Kraken', rarity: 'mythic', mult: 55 },
}

/**
 * Eggs, bought with Wins. `world` = the only world it hatches in (the Coral Egg: Coral
 * Coast). `pets` are [petId, weight] - weights are percentages and
 * sum to 100. Each egg is priced at about the Wins of a few bounces at the stage of the
 * game whose pets it beats.
 */
export const EGGS = {
  basic: { name: 'Basic', cost: { wins: 15 }, pets: [['cat', 45], ['dog', 30], ['bunny', 20], ['bear', 5]] },
  meadow: { name: 'Grass', cost: { wins: 120 }, pets: [['cow', 45], ['parrot', 30], ['fox', 20], ['tiger', 5]] },
  sunset: { name: 'Sunset', cost: { wins: 750 }, pets: [['flamingo', 45], ['turtle', 30], ['owl', 20], ['phoenix', 5]] },
  unicorn: { name: 'Unicorn', cost: { wins: 6000 }, pets: [['pony', 50], ['unicorn', 35], ['pegasus', 15]] },
  volcano: { name: 'Volcano', cost: { wins: 35000 }, pets: [['salamander', 50], ['firebird', 30], ['golem', 15], ['inferno', 5]] },
  beach: { name: 'Coral', cost: { wins: 2000000 }, world: 1, pets: [['seagull', 45], ['dolphin', 30], ['shark', 20], ['kraken', 5]] },
}

export const MAX_EQUIPPED_PETS = 3
export const MAX_PET_INVENTORY = 60
/** Multi-hatch opens this many at once, for that many times the cost. */
export const MULTI_HATCH = 3

// --- Items, boosts, rewards -------------------------------------------------------

export const POTION_DURATION_MS = 5 * 60 * 1000

export const ITEMS = {
  potionHealth: { name: 'x2 Breath Potion', kind: 'potion', boost: 'health', durationMs: POTION_DURATION_MS },
  potionWins: { name: 'x2 Wins Potion', kind: 'potion', boost: 'wins', durationMs: POTION_DURATION_MS },
  eggMeadow: { name: 'Grass Egg', kind: 'egg', egg: 'meadow' },
  eggSunset: { name: 'Sunset Egg', kind: 'egg', egg: 'sunset' },
  eggUnicorn: { name: 'Unicorn Egg', kind: 'egg', egg: 'unicorn' },
  eggVolcano: { name: 'Volcano Egg', kind: 'egg', egg: 'volcano' },
}

/** 7-day cycle; day N unlocks N x 24h after the cycle started. */
export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000
export const DAILY_REWARDS = [
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Dragon', icon: 'pet:dragon', sub: 'x1', grant: { pet: 'dragon' } },
  { label: 'x2 Breath', icon: 'potionHealth', sub: '5m', grant: { item: 'potionHealth' } },
  { label: 'Unicorn Egg', icon: 'egg:unicorn', sub: 'x1', grant: { item: 'eggUnicorn' } },
  { label: 'x2 Breath', icon: 'potionHealth', sub: '5m', grant: { item: 'potionHealth' } },
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Volcano Egg', icon: 'egg:volcano', sub: 'x1', grant: { item: 'eggVolcano' } },
]

/**
 * Claimable once each per session, after this many minutes played: something to look
 * forward to every few minutes for the first hour.
 */
export const PLAYTIME_REWARDS = [
  { minutes: 3, label: '+10 Wins', icon: 'trophy', grant: { wins: 10 } },
  { minutes: 8, label: 'x2 Breath', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { minutes: 15, label: 'Grass Egg', icon: 'egg:meadow', grant: { item: 'eggMeadow' } },
  { minutes: 25, label: 'x2 Wins', icon: 'potionWins', grant: { item: 'potionWins' } },
  { minutes: 35, label: '+250 Wins', icon: 'trophy', grant: { wins: 250 } },
  { minutes: 45, label: 'Sunset Egg', icon: 'egg:sunset', grant: { item: 'eggSunset' } },
  { minutes: 60, label: 'x2 Breath', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { minutes: 90, label: 'Unicorn Egg', icon: 'egg:unicorn', grant: { item: 'eggUnicorn' } },
]

/** The stand by spawn: a pet the first time, a potion on later sessions. */
export const FREE_REWARD = { firstTime: { pet: 'crab' }, repeat: { item: 'potionHealth' } }

/** Offline training: a quarter of your pad's rate, for up to 8 hours away. */
export const OFFLINE_RATE = 0.25
export const OFFLINE_MAX_MS = 8 * 60 * 60 * 1000
export const OFFLINE_MIN_MS = 60 * 1000

/**
 * The world portal (placed by PORTALS in world.js): its name, and what opens it the
 * first time - this many rebirths AND this many Wins held (not spent). After that it's
 * open for good, both ways. Stepping through earns the badge of the same id.
 */
export const WORLD_PORTALS = {
  world2: { name: 'Coral Coast', wins: 1000000, rebirths: 8 },
}

/**
 * Coral Coast's Secret Star, hidden somewhere in its lobby (STAR in world.js): finding it
 * doubles every Breath gain for good, in every world.
 */
export const SECRET_STAR = { world: 1, power: 2 }

// --- Worlds -----------------------------------------------------------------------

/**
 * Coral Coast (World 2), through the portal once you've rebirthed 8 times and hold 1M
 * Wins: a bubble park on the beach. Its own Coral Egg, two coral pads and a Secret Star,
 * and its own valley - the same stages, one for one, as seaside spots (surf villages,
 * docks, reefs, beach towns) - where every metre, trophy and first-visit prize pays
 * `wins` times as much. Its stages need the same Breath as World 1's - a harder World 2
 * would pay less than World 1 right after each rebirth - so going over is always worth
 * it, and coming back (the same portal) costs nothing.
 */
export const WORLDS = [
  { id: 'world1', name: 'Bubble Valley', wins: 1 },
  { id: 'world2', name: 'Coral Coast', wins: 3 },
]

/** Coral Coast's stages: [id, name, theme, scene], one for each of World 1's. */
const WORLD2_STAGES = [
  ['w2-shell-shore', 'Seashell Shore', 'beach', 'beach'],
  ['w2-surf-village', 'Surf Village', 'beach', 'village'],
  ['w2-palm-grove', 'Palm Grove', 'jungle', 'jungle'],
  ['w2-fishing-docks', 'Fishing Docks', 'ocean', 'harbor'],
  ['w2-coconut-town', 'Coconut Town', 'beach', 'town'],
  ['w2-lifeguard-row', 'Lifeguard Row', 'sky', 'beach'],
  ['w2-boardwalk', 'The Boardwalk', 'beach', 'town'],
  ['w2-sunset-pier', 'Sunset Pier', 'cherry', 'harbor'],
  ['w2-tiki-village', 'Tiki Village', 'jungle', 'village'],
  ['w2-coral-garden', 'Coral Garden', 'ocean', 'reef'],
  ['w2-blue-lagoon', 'Blue Lagoon', 'ocean', 'beach'],
  ['w2-shipwreck-cove', 'Shipwreck Cove', 'swamp', 'harbor'],
  ['w2-pelican-point', 'Pelican Point', 'sky', 'beach'],
  ['w2-beach-party', 'Beach Party', 'neon', 'neon'],
  ['w2-lighthouse-hill', 'Lighthouse Hill', 'beach', 'harbor'],
  ['w2-tide-pools', 'Tide Pools', 'ocean', 'reef'],
  ['w2-sandcastle-hill', 'Sandcastle Hill', 'desert', 'desert'],
  ['w2-volcano-isle', 'Volcano Isle', 'volcano', 'volcano'],
  ['w2-moonlit-bay', 'Moonlit Bay', 'moon', 'beach'],
  ['w2-starfish-strand', 'Starfish Strand', 'beach', 'beach'],
  ['w2-turtle-beach', 'Turtle Beach', 'beach', 'beach'],
  ['w2-mango-farm', 'Mango Farm', 'beach', 'farm'],
  ['w2-driftwood-woods', 'Driftwood Woods', 'jungle', 'jungle'],
  ['w2-seagull-rock', 'Seagull Rock', 'ocean', 'harbor'],
  ['w2-surf-city', 'Surf City', 'beach', 'city'],
  ['w2-bonfire-beach', 'Bonfire Beach', 'sky', 'beach'],
  ['w2-hammock-hollow', 'Hammock Hollow', 'beach', 'village'],
  ['w2-pirate-bay', 'Pirate Bay', 'cherry', 'harbor'],
  ['w2-reef-point', 'Reef Point', 'jungle', 'reef'],
  ['w2-sea-breeze-town', 'Sea Breeze Town', 'ocean', 'town'],
  ['w2-flamingo-lake', 'Flamingo Lake', 'ocean', 'beach'],
  ['w2-aloha-harbor', 'Aloha Harbor', 'swamp', 'harbor'],
  ['w2-dune-ridge', 'Dune Ridge', 'sky', 'desert'],
  ['w2-rainbow-reef', 'Rainbow Reef', 'neon', 'reef'],
  ['w2-island-town', 'Island Town', 'beach', 'town'],
  ['w2-treasure-cove', 'Treasure Cove', 'ocean', 'harbor'],
  ['w2-wave-rider-bay', 'Wave Rider Bay', 'desert', 'beach'],
  ['w2-pearl-grotto', 'Pearl Grotto', 'volcano', 'crystal'],
  ['w2-glowing-bay', 'Glowing Bay', 'moon', 'reef'],
  ['w2-coconut-cove', 'Coconut Cove', 'beach', 'beach'],
  ['w2-sunrise-shore', 'Sunrise Shore', 'beach', 'beach'],
  ['w2-dolphin-docks', 'Dolphin Docks', 'beach', 'harbor'],
  ['w2-palm-paradise', 'Palm Paradise', 'jungle', 'jungle'],
  ['w2-tropic-city', 'Tropic City', 'ocean', 'city'],
  ['w2-crab-village', 'Crab Village', 'beach', 'village'],
  ['w2-sundown-strip', 'Sundown Strip', 'sky', 'neon'],
  ['w2-kraken-bay', 'Kraken Bay', 'beach', 'harbor'],
  ['w2-shark-fin-reef', 'Shark Fin Reef', 'cherry', 'reef'],
  ['w2-golden-sands', 'Golden Sands', 'jungle', 'desert'],
  ['w2-paradise-isle', 'Paradise Isle', 'ocean', 'beach'],
  ['w2-neon-boardwalk', 'Neon Boardwalk', 'ocean', 'neon'],
  ['w2-starlit-beach', 'Starlit Beach', 'swamp', 'beach'],
  ['w2-aurora-bay', 'Aurora Bay', 'sky', 'snow'],
  ['w2-marlin-pier', 'Marlin Pier', 'neon', 'harbor'],
  ['w2-mermaid-lagoon', 'Mermaid Lagoon', 'beach', 'reef'],
  ['w2-big-wave-bay', 'Big Wave Bay', 'ocean', 'beach'],
  ['w2-hula-town', 'Hula Town', 'desert', 'town'],
  ['w2-ocean-kingdom', 'Ocean Kingdom', 'volcano', 'reef'],
  ['w2-galaxy-beach', 'Galaxy Beach', 'moon', 'space'],
  ['w2-bubble-champions', 'Bubble Champions', 'beach', 'rainbow'],
]

const worldZones = (world) =>
  ZONES.map((zone, i) => {
    const mult = WORLDS[world].wins
    const [id, name, theme, scene] = world === 1 ? WORLD2_STAGES[i] : [zone.id, zone.name, zone.theme, zone.scene]
    return {
      ...zone,
      id,
      name,
      theme,
      scene,
      winsPerMeter: zone.winsPerMeter * mult,
      smash: zone.smash * mult,
      discover: zone.discover * mult,
    }
  })

/** Each world's stages, as ZONES: `WORLD_ZONES[profile.world]`. */
export const WORLD_ZONES = [ZONES, worldZones(1)]
export const zonesOf = (world) => WORLD_ZONES[world] ?? ZONES

// --- Shop -------------------------------------------------------------------------

/**
 * The shop. Wins are the game's only currency: everything here, like arms and eggs,
 * is bought with them. `pass` = permanent unlock; `consumable` = grants every time.
 */
export const SHOP = {
  healthX2: { name: 'x2 Breath', price: 400, kind: 'pass' },
  winsX2: { name: 'x2 Wins', price: 2500, kind: 'pass' },
  autoRoll: { name: 'Auto Bounce', price: 150, kind: 'pass' },
  padVeryOp: { name: 'VERY OP! Pad', price: 150000, kind: 'pass' },
  padBest: { name: 'BEST OVERALL! Pad', price: 2500000, kind: 'pass' },
  sphinx: { name: 'Sphinx', price: 2500000, kind: 'consumable', grant: { pet: 'sphinx' }, stock: 1000 },
}

/**
 * Boxity Gems products, by sku. Prices live in Boxity's catalog, never here: the game
 * only names the sku and, once Boxity confirms the sale, grants what it says. Wins
 * packs grow with you: `winsRolls` max-level bounces' worth of Wins.
 */
export const GEM_PRODUCTS = {
  wins_small: { name: 'Pile of Wins', blurb: '10 max-level bounces of Wins', icon: 'trophy', grant: { winsRolls: 10 } },
  wins_big: { name: 'Mountain of Wins', blurb: '60 max-level bounces of Wins', icon: 'trophy', grant: { winsRolls: 60 } },
  potion_bundle: { name: 'Potion Bundle', blurb: '3 x2 Breath + 3 x2 Wins potions', icon: 'potionHealth', grant: { items: { potionHealth: 3, potionWins: 3 } } },
  volcano_eggs: { name: '3 Volcano Eggs', blurb: 'The best pets in the game', icon: 'egg:volcano', grant: { items: { eggVolcano: 3 } } },
  auto_roll: { name: 'Auto Bounce', blurb: 'Blows your bubble and bounces you from the Blow Zone', icon: 'tire', grant: { pass: 'autoRoll' } },
  health_x2: { name: 'x2 Breath', blurb: 'Double every Breath gain, forever', icon: 'heart', grant: { pass: 'healthX2' } },
  wins_x2: { name: 'x2 Wins', blurb: 'Double every bounce’s Wins, forever', icon: 'trophy', grant: { pass: 'winsX2' } },
  pad_best: { name: 'Galaxy Pad', blurb: 'Unlocks the x100 Galaxy Blow Pad', icon: 'portal', grant: { pass: 'padBest' } },
}

/**
 * Rewarded ads (Boxity): watch one to earn this. Placement names are lowercase, digits
 * and hyphens. `cooldownMs` keeps a player from chaining them.
 */
export const AD_REWARDS = {
  'health-potion': { label: 'x2 Breath Potion', icon: 'potionHealth', grant: { item: 'potionHealth' }, cooldownMs: 3 * 60 * 1000 },
  'wins-potion': { label: 'x2 Wins Potion', icon: 'potionWins', grant: { item: 'potionWins' }, cooldownMs: 3 * 60 * 1000 },
}

/** Sphinx stock shown before the server reports the live count. */
export const SPHINX_STOCK_DEFAULT = 954

/**
 * The three Breath packs under the level bar. They grow with you: each gives `share`
 * of the Breath your next level needs, for `rolls` bounces' worth of Wins at that Breath.
 * Packs aren't held back by the level cap.
 */
export const HEALTH_PACKS = [
  { share: 1, rolls: 1 },
  { share: 5, rolls: 4 },
  { share: 20, rolls: 12 },
]

// --- Coming back for more: streaks, quests, combos, lucky gifts, friends ---------------

/**
 * A game day, in UTC: quests reset and login streaks count by it, the same for everyone
 * everywhere (`dayNumber(now)` is the day since 1970).
 */
export const DAY_MS = 24 * 60 * 60 * 1000
export const dayNumber = (now) => Math.floor(now / DAY_MS)

/**
 * Login streak: play on consecutive days and every bounce pays STREAK_STEP more Wins per
 * day in a row (day 1 x1, day 2 x1.1 ... day 11 and on x2). Miss a day and it starts again
 * from day 1 - the reason to come back tomorrow.
 */
export const STREAK_STEP = 0.1
export const STREAK_MAX_DAYS = 11
export const streakMultiplier = (days) => 1 + STREAK_STEP * (Math.min(STREAK_MAX_DAYS, Math.max(1, days)) - 1)

/**
 * PERFECT combo: PERFECT bounces in a row each pay COMBO_STEP more Wins than the last
 * (the 2nd +10%, the 3rd +20% ... up to +COMBO_MAX); anything less than PERFECT breaks it.
 * Kept for the session, never saved.
 */
export const COMBO_STEP = 0.1
export const COMBO_MAX = 0.5
export const comboBonus = (combo) => 1 + Math.min(COMBO_MAX, COMBO_STEP * Math.max(0, combo - 1))

/**
 * Playing together: every other player in your server (and your world) adds CROWD_STEP
 * to your bounces' Wins, up to CROWD_MAX - bring your friends.
 */
export const CROWD_STEP = 0.1
export const CROWD_MAX = 0.3
export const crowdBonus = (others) => 1 + Math.min(CROWD_MAX, CROWD_STEP * Math.max(0, others))

/**
 * Lucky gifts: each bounce has LUCKY_CHANCE of landing a surprise on top of its Wins.
 * `weight`s are relative. Wins gifts grow with you (`winsRolls` max-level bounces' worth);
 * an egg gift is an egg that fits how far you've got (logic.eggItemFor).
 */
export const LUCKY_CHANCE = 0.08
export const LUCKY_GIFTS = [
  { weight: 45, label: 'Bag of Wins', icon: 'trophy', grant: { winsRolls: 4 } },
  { weight: 20, label: 'x2 Wins Potion', icon: 'potionWins', grant: { item: 'potionWins' } },
  { weight: 20, label: 'x2 Breath Potion', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { weight: 15, label: 'Mystery Egg', icon: 'egg', grant: { egg: true } },
]

/**
 * Daily quests: QUESTS_PER_DAY a day - an EASY, a MEDIUM and a HARD one of different
 * kinds, picked fresh each day for each player - and a bonus chest for finishing all
 * three. Rewards grow with you: `winsRolls` max-level bounces' worth of Wins (HARD adds
 * a potion; the chest adds an egg that fits your progress).
 *
 * Each kind counts one thing (`counter`, fed by the session as you play) up to its
 * target; `mode: 'best'` keeps the best single value instead of adding up. `targets` are
 * per tier; `scale` scales them with your best bounce so far ('total': that many of it in
 * metres, 'best': that share of it). `{n}` in `text` is the target.
 */
export const QUESTS_PER_DAY = 3
export const QUEST_TIERS = [
  { id: 'easy', label: 'EASY', winsRolls: 3 },
  { id: 'medium', label: 'MEDIUM', winsRolls: 6 },
  { id: 'hard', label: 'HARD', winsRolls: 12, item: 'potionWins' },
]
export const QUEST_BONUS = { winsRolls: 15 }
export const QUEST_TYPES = {
  launch: { counter: 'launch', text: 'Bounce {n} times', targets: [5, 12, 25] },
  great: { counter: 'great', text: 'Blow {n} GREAT or PERFECT bubbles', targets: [2, 5, 10] },
  perfect: { counter: 'perfect', text: 'Blow {n} PERFECT bubbles', targets: [1, 3, 6] },
  combo: { counter: 'combo', mode: 'best', text: 'Hit a PERFECT combo of {n}', targets: [2, 3, 4] },
  reps: { counter: 'rep', text: 'Blow {n} bubbles on the Blow Pads', targets: [40, 120, 300] },
  meters: { counter: 'meters', text: 'Bounce {n} m in total', scale: 'total', targets: [4, 10, 25] },
  far: { counter: 'far', mode: 'best', text: 'Bounce {n} m in one go', scale: 'best', targets: [0.6, 0.8, 0.95] },
  perfectBounce: { counter: 'perfectBounce', text: 'Hit {n} PERFECT BOUNCES', targets: [3, 8, 15] },
  hatch: { counter: 'hatch', text: 'Hatch {n} pets', targets: [1, 3, 6] },
  minutes: { counter: 'minute', text: 'Play for {n} minutes', targets: [5, 15, 30] },
}

// --- Tutorial & badges ------------------------------------------------------------

/**
 * The guide for new players: blow, bounce, spend the Wins on a new bubble, bounce
 * further, rebirth. Each step completes when its event fires (and, with `health`, once
 * you have that much); after the last the guide is done.
 */
export const TUTORIAL = [
  { text: 'Stand on a Blow Pad to get 30 Breath', event: 'train', target: 'pad0', health: 30 },
  { text: 'Go to the BLOW ZONE, hold BLOW, let go at the biggest!', event: 'roll', target: 'roll' },
  { text: 'Buy the Raindrop Bubble with your Wins!', event: 'buyTire', target: 'tires' },
]

export const BADGES = {
  firstRoll: { name: 'First Bounce' },
  firstRebirth: { name: 'First Rebirth' },
  firstPet: { name: 'Pet Owner' },
  firstWall: { name: 'Explorer' },
  kilometer: { name: '1 Kilometre Club' },
  space: { name: 'Space Bouncer' },
  cosmic: { name: 'Cosmic Champion' },
  world2: { name: 'Coral Explorer' },
  secretStar: { name: 'Star Finder' },
}
