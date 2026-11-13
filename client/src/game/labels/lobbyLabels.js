import { EGGS, PADS, PETS, RARITIES, SHOP, TIRES, WORLD_PORTALS, WORLDS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isPadUnlocked } from '@shared/logic'
import { EGG_STANDS, FREE_REWARD, LAUNCH_STAND, padCenterZ, PORTALS, SPHINX_STAND, STRETCH_LANE, TABLE_X, TIRE_STANDS } from '@shared/world'

import { eggHeight } from '../world/eggs'
import { BOARD_BOTTOM, BOARD_HEIGHT, PAD_THEMES } from '../world/structures'
import { SCOREBOARD } from '../world/terrain'

/**
 * Text styles, as gradients top-to-bottom, matching the reference signage.
 */
export const TEXT = {
  gold: ['#fffaa8', '#ffd52a', '#ff9c00'],
  green: ['#e6ffb0', '#8dff4f', '#2fd12f'],
  price: ['#d9ff9a', '#7dff4a', '#2fd12f'],
  white: ['#ffffff', '#ffffff', '#dfe7f0'],
  red: ['#ffb0a8', '#ff4a3b', '#d4142a'],
  blue: ['#e0faff', '#7fe2ff', '#2fa8ff'],
}

const tint = (hex) => ['#ffffff', hex, hex]

/**
 * "x4 POWER / Bubblegum Bar / LOCKED: 2 Rebirths", "x1 POWER / Wooden Bar / FREE",
 * "x40 POWER / VERY OP! / 150K Wins"... (hung on each pull-up bar's backboard).
 */
export function padLabelSpec(index, unlocked, world = 0) {
  const pad = PADS[index]
  const theme = PAD_THEMES[index]
  const lines = [
    { text: `x${formatNumber(pad.mult)} POWER`, size: 54, icon: 'heart', gradient: tint(theme.text) },
    { text: pad.name, size: 34, fill: '#ffffff' },
  ]
  if (unlocked) {
    lines.push({ text: pad.rebirths === 0 && !pad.product ? 'FREE' : 'UNLOCKED', size: 44, gradient: TEXT.green })
  } else if (pad.world !== undefined && world !== pad.world) {
    lines.push({ text: `${WORLDS[pad.world].name.toUpperCase()} ONLY`, size: 44, icon: 'portal', gradient: TEXT.blue })
  } else if (pad.product) {
    lines.push({ text: pad.tag, size: 46, rainbow: true })
    lines.push({ text: `${formatNumber(SHOP[pad.product].price)} Wins`, size: 42, icon: 'trophy', gradient: TEXT.gold })
  } else {
    const word = pad.rebirths === 1 ? 'Rebirth' : 'Rebirths'
    lines.push({ text: `LOCKED: ${pad.rebirths} ${word}`, size: 44, icon: 'rebirth', gradient: TEXT.red })
  }
  return { lines, pxPerUnit: 64 }
}

/** Largest a pad label can get, so its atlas slot fits every state. */
const padReserve = (index) => {
  const pad = PADS[index]
  const lines = [
    { text: `x${formatNumber(pad.mult)} POWER`, size: 54, icon: 'heart' },
    { text: pad.name, size: 34 },
  ]
  if (pad.product) {
    lines.push({ text: pad.tag, size: 46 })
    lines.push({ text: `${formatNumber(SHOP[pad.product].price)} Wins`, size: 42, icon: 'trophy' })
  } else {
    lines.push({ text: 'LOCKED: 88 Rebirths', size: 44, icon: 'rebirth' })
  }
  return { lines }
}

export function padLabels(profile) {
  return PADS.map((pad, i) => ({
    id: `pad-${i}`,
    // Well in front of the treadmill's backboard (structures.js), centred on it: the label
    // turns to face the camera and is wider than the board, so any nearer and its far half
    // swings behind the board seen from an angle.
    position: [TABLE_X - 2.2, BOARD_BOTTOM + BOARD_HEIGHT / 2, padCenterZ(i)],
    spec: padLabelSpec(i, isPadUnlocked(profile, i), profile.world || 0),
    reserve: padReserve(i),
    fade: 150,
  }))
}

/** Ownership state of each ball stand: 'equipped' | 'owned' | 'buy' | 'locked'. */
export function standState(profile, index) {
  const tire = TIRES[index]
  if (profile.equippedTire === tire.id) return 'equipped'
  if (profile.ownedTires.includes(tire.id)) return 'owned'
  const previous = TIRES[index - 1]
  return !previous || profile.ownedTires.includes(previous.id) ? 'buy' : 'locked'
}

/** A ball's rarity line: in its rarity's colour, rainbow for the Secret ones. */
const rarityLine = (tire) => {
  const rarity = RARITIES[tire.rarity]
  return tire.rarity === 'secret'
    ? { text: rarity.name.toUpperCase(), size: 36, rainbow: true }
    : { text: rarity.name.toUpperCase(), size: 34, gradient: tint(rarity.color) }
}

/**
 * Like the reference: a state tag (EQUIPPED / OWNED / CAN BUY! / LOCKED), the ball's name,
 * "+3 per kick", then its price in Wins - or its rarity once it's yours.
 */
export function standLabelSpec(index, state) {
  const tire = TIRES[index]
  const tag =
    state === 'equipped'
      ? { text: 'EQUIPPED', size: 36, gradient: TEXT.green }
      : state === 'owned'
        ? { text: 'OWNED', size: 36, gradient: TEXT.blue }
        : state === 'buy'
          ? { text: 'CAN BUY!', size: 36, gradient: TEXT.green }
          : { text: 'LOCKED', size: 36, gradient: TEXT.red }
  const last =
    state === 'equipped' || state === 'owned'
      ? rarityLine(tire)
      : { text: `${formatNumber(tire.cost)} Wins`, size: 40, icon: 'trophy', gradient: state === 'locked' ? TEXT.red : TEXT.price }
  return {
    lines: [tag, { text: tire.name, size: 46, fill: '#ffffff' }, { text: `+${formatNumber(tire.power)} Power`, size: 40, icon: 'heart', gradient: TEXT.gold }, last],
    pxPerUnit: 70,
  }
}

/** Largest a stand label can get, so its atlas slot fits every state. */
const standReserve = (index) => ({
  lines: [
    { text: 'CAN BUY!', size: 36 },
    { text: TIRES[index].name, size: 46 },
    { text: `+${formatNumber(TIRES[index].power)} Power`, size: 40, icon: 'heart' },
    { text: `${formatNumber(TIRES[index].cost)} Wins`, size: 40, icon: 'trophy' },
  ],
})

export function standLabels(profile) {
  return TIRE_STANDS.map((stand) => ({
    id: `stand-${stand.index}`,
    // Each row back rides higher, so they clear the rows in front seen from the plaza.
    position: [stand.x, stand.y + 6.8 + stand.row * 1.35, stand.z],
    spec: standLabelSpec(stand.index, standState(profile, stand.index)),
    reserve: standReserve(stand.index),
    fade: 70,
  }))
}

/** The big eggs' title colours. */
const BIG_EGG_TEXT = { volcano: TEXT.red, beach: TEXT.blue }

export function eggLabels(profile) {
  return EGG_STANDS.map((stand) => {
    const egg = EGGS[stand.eggId]
    // A world's own egg, seen from another world: where to go for it.
    const elsewhere = egg.world !== undefined && (profile?.world || 0) !== egg.world
    const lines = stand.big
      ? [
          { text: `${egg.name} Egg`, size: 54, gradient: BIG_EGG_TEXT[stand.eggId] || TEXT.red },
          elsewhere
            ? { text: `${WORLDS[egg.world].name.toUpperCase()} ONLY`, size: 44, icon: 'portal', gradient: TEXT.blue }
            : { text: `${formatNumber(egg.cost.wins)} Wins`, size: 46, icon: 'trophy', gradient: TEXT.gold },
        ]
      : [
          { text: `${egg.name} Egg`, size: 50, fill: '#ffffff' },
          { text: `${formatNumber(egg.cost.wins)} Wins`, size: 44, icon: 'trophy', gradient: TEXT.gold },
        ]
    return {
      id: `egg-${stand.eggId}`,
      position: [stand.x, eggHeight(stand) + (stand.big ? 4 : 2.5), stand.z],
      spec: { lines, pxPerUnit: 62 },
      fade: 100,
    }
  })
}

/** The limited Sphinx showcase: price, hype, and live stock. */
export function sphinxLabelSpec(stock) {
  const mult = PETS.sphinx.mult
  return {
    lines: [
      { text: `${formatNumber(SHOP.sphinx.price)} Wins`, size: 46, icon: 'trophy', gradient: TEXT.gold },
      { text: 'BEST IN GAME', size: 56, gradient: TEXT.red },
      { text: 'Sphinx', size: 76, fill: '#ffffff' },
      { text: `${formatNumber(mult * 100 - 100)}% BETTER`, size: 54, rainbow: true },
      { text: `${formatNumber(stock)} Left`, size: 50, gradient: TEXT.green },
    ],
    pxPerUnit: 48,
  }
}

export function sphinxLabel(stock) {
  return {
    id: 'sphinx',
    position: [SPHINX_STAND.x, 11.5, SPHINX_STAND.z],
    spec: sphinxLabelSpec(stock),
    reserve: sphinxLabelSpec(88888),
    fade: 140,
  }
}

/** The jumbotron over the south stand, lettered like the arch: the game's name. */
const scoreboardLabel = () => ({
  id: 'scoreboard',
  position: [SCOREBOARD.x, SCOREBOARD.y + 0.8 + SCOREBOARD.height / 2, SCOREBOARD.z - 1.5],
  spec: {
    lines: [
      { text: '+1 ARM LENGTH', size: 100, gradient: TEXT.gold },
      { text: 'STRETCH - FLY FAR - REBIRTH', size: 44, gradient: TEXT.white },
    ],
    pxPerUnit: 34,
  },
  fade: 220,
})

const freeRewardLabel = () => ({
  id: 'free-reward',
  position: [FREE_REWARD.x, 4.6, FREE_REWARD.z],
  spec: { lines: [{ text: 'FREE REWARD', size: 50, gradient: ['#fff2b0', '#ffb347', '#ff6a1e'] }], pxPerUnit: 60 },
  fade: 90,
})

/**
 * Where the portal goes: Palm Beach (and what opens it - rebirths and Wins - until it's
 * open), or home.
 */
const portalLabel = (profile) => (portal) => {
  const home = profile.world === 1
  const open = profile.world2Unlocked
  const need = WORLD_PORTALS[portal.id]
  const lines = home
    ? [
        { text: WORLDS[0].name.toUpperCase(), size: 56, gradient: TEXT.green },
        { text: 'Back home', size: 42, gradient: TEXT.white },
      ]
    : [
        { text: WORLDS[1].name.toUpperCase(), size: 60, gradient: TEXT.blue },
        open
          ? { text: `x${WORLDS[1].wins} Wins!`, size: 46, icon: 'trophy', gradient: TEXT.gold }
          : { text: `${need.rebirths} Rebirths + ${formatNumber(need.wins)} Wins`, size: 40, icon: 'rebirth', gradient: TEXT.white },
      ]
  return {
    id: `portal-${portal.id}`,
    position: [portal.x, portal.radius * 2 + 2.8, portal.z],
    spec: { lines, pxPerUnit: 56 },
    // Big enough for either side of the portal.
    reserve: {
      lines: [
        { text: WORLDS[0].name.toUpperCase(), size: 60 },
        { text: `${need.rebirths} Rebirths + ${formatNumber(need.wins)} Wins`, size: 46, icon: 'rebirth' },
      ],
    },
    fade: 140,
  }
}

/** Over the far end of the stretch lane: what walking further back gets you. */
const laneLabel = () => ({
  id: 'stretch-lane',
  position: [LAUNCH_STAND.x, 4.4, STRETCH_LANE.maxZ],
  spec: {
    lines: [
      { text: 'STRETCH LANE', size: 60, gradient: TEXT.gold },
      { text: 'Longer arms = FLY FARTHER!', size: 40, gradient: TEXT.white },
    ],
    pxPerUnit: 52,
  },
  fade: 120,
})

/** Every label in the lobby. */
export function lobbyLabels(profile, { sphinxStock = 0 } = {}) {
  return [...padLabels(profile), ...standLabels(profile), ...eggLabels(profile), sphinxLabel(sphinxStock), scoreboardLabel(), freeRewardLabel(), laneLabel(), ...PORTALS.map(portalLabel(profile))]
}
