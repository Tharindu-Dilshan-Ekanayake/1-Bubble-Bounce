import { CylinderGeometry, SphereGeometry } from 'three'

import { mulberry32 } from '@shared/rng'

import { STYLE } from '../materials'

/**
 * Palm Beach's dressing round the lobby (World 2 only): chunky voxel palm trees in the
 * plaza's corners, along the sand strip and out on the beach, beach umbrellas with deck
 * chairs and surfboards stuck in the sand along the sidelines - never on the stands, eggs,
 * treadmills, kick zone, portal, ball shop, leaderboards or the spawn - and out in the
 * ocean (Ocean.jsx) a few palm islands and a lighthouse.
 *
 * Boxes go in the world's block set and the round parts in its props: no draw calls of
 * their own, nothing done per frame. Parts that overlap are stacked at least 3 cm apart
 * (no z-fighting). `density` (the preset's decorDensity) thins it out on LOW.
 */

const TRUNK = ['#9a6a3a', '#a8774a', '#8a5c30']
const LEAVES = ['#2fae4a', '#4cd36a']
const COCONUT = '#6a4424'
const SAND = '#f2dca0'
const CORAL = '#ff6f61'
const TURQUOISE = '#16b8c4'

const CYL = new CylinderGeometry(1, 1, 1, 12)
const CONE = new CylinderGeometry(0, 1, 1, 12)
const BALL = new SphereGeometry(1, 12, 8)

/**
 * A palm at (x, y, z), `h` tall: a trunk in three segments leaning a little further each
 * way up, a crown of four long leaves each 4 cm above the last, and two coconuts.
 */
function addPalm(blocks, x, y, z, h, turn) {
  const dx = Math.cos(turn) * 0.35
  const dz = Math.sin(turn) * 0.35
  const seg = h / 3
  // Segments stacked end to end (not overlapping), so their sides never share a plane
  // however the trunk leans.
  for (let i = 0; i < 3; i += 1) {
    const w = 0.72 - i * 0.08
    blocks.addOn(x + dx * i, y + seg * i, z + dz * i, w, seg, w, TRUNK[i], STYLE.SMOOTH)
  }
  const cx = x + dx * 2.6
  const cz = z + dz * 2.6
  const top = y + h
  for (let i = 0; i < 4; i += 1) {
    blocks.add(cx, top + 0.1 + i * 0.05, cz, 4.4, 0.16, 0.8, LEAVES[i % 2], STYLE.SMOOTH, turn + (i * Math.PI) / 4)
  }
  // The coconuts turned 45 degrees, so their sides never line up with the trunk's.
  blocks.add(cx + 0.35, top - 0.3, cz + 0.2, 0.42, 0.42, 0.42, COCONUT, STYLE.SMOOTH, Math.PI / 4)
  blocks.add(cx - 0.25, top - 0.38, cz - 0.3, 0.38, 0.38, 0.38, COCONUT, STYLE.SMOOTH, Math.PI / 4)
}

/** A beach umbrella at (x, z): a pole and a two-tone canopy (two layers 4 cm apart), and a deck chair beside it. */
function addUmbrella(blocks, props, x, z, color, turn) {
  props.add(CYL, { position: [x, 1.35, z], scale: [0.07, 2.7, 0.07], color: '#ffffff' })
  blocks.add(x, 2.72, z, 2.6, 0.12, 2.6, color, STYLE.SMOOTH, turn)
  blocks.add(x, 2.88, z, 1.9, 0.12, 1.9, '#ffffff', STYLE.SMOOTH, turn + Math.PI / 4)
  blocks.add(x, 3.02, z, 0.3, 0.16, 0.3, color, STYLE.GLOW, turn)
  // The deck chair: a white frame and a striped cloth seat leaning back.
  const cx = x + Math.cos(turn) * 1.7
  const cz = z + Math.sin(turn) * 1.7
  blocks.add(cx, 0.22, cz, 0.8, 0.44, 1.5, '#ffffff', STYLE.SMOOTH, turn + Math.PI / 2)
  blocks.add(cx, 0.62, cz, 0.7, 0.08, 1.5, color, STYLE.STRIPES, turn + Math.PI / 2, 0.35)
}

/** A surfboard stuck upright in the sand at (x, z), in two colours with a white stripe. */
function addSurfboard(props, x, z, color, turn) {
  props.add(BALL, { position: [x, 1.1, z], rotation: [0, turn, 0.12], scale: [0.12, 1.35, 0.4], color })
  props.add(BALL, { position: [x, 1.1, z], rotation: [0, turn, 0.12], scale: [0.13, 1.15, 0.09], color: '#ffffff' })
}

/** A little palm island in the ocean: a stepped sand mound (each step 4 cm proud) and two palms. */
function addIsland(blocks, x, z, size) {
  blocks.addOn(x, -0.6, z, size, 1.2, size * 0.8, SAND, STYLE.STUDS)
  blocks.addOn(x + size * 0.05, 0.6, z, size * 0.6, 0.6, size * 0.5, '#ead196', STYLE.STUDS)
  addPalm(blocks, x - size * 0.12, 1.2, z, 7, 0.8)
  addPalm(blocks, x + size * 0.18, 1.2, z + size * 0.1, 5.5, 2.4)
}

/** A lighthouse on a rock: white and red bands, a gallery, a glowing lamp and a red cap. */
function addLighthouse(blocks, props, x, z) {
  blocks.addOn(x, -0.6, z, 9, 2.2, 8, '#8a8f9c', STYLE.STUDS)
  for (let i = 0; i < 5; i += 1) {
    const r = 2.2 - i * 0.18
    props.add(CYL, { position: [x, 1.6 + i * 3 + 1.5, z], scale: [r, 3, r], color: i % 2 ? '#e8463c' : '#ffffff' })
  }
  props.add(CYL, { position: [x, 16.8, z], scale: [1.9, 0.4, 1.9], color: '#2a2f3a' })
  props.add(CYL, { position: [x, 18.1, z], scale: [1.1, 2.2, 1.1], color: '#fff2a8', style: STYLE.GLOW })
  props.add(CONE, { position: [x, 20.1, z], scale: [1.5, 1.8, 1.5], color: '#e8463c' })
}

/**
 * Builds Palm Beach's lobby dressing into `blocks` and `props`. Returns how many palms
 * it planted (for tests/debug).
 */
export function buildBeach(blocks, props, { density = 1 } = {}) {
  const full = density >= 0.75
  const some = density >= 0.5
  let palms = 0
  const palm = (x, y, z, h, turn) => {
    addPalm(blocks, x, y, z, h, turn)
    palms += 1
  }

  // The plaza's four corners, clear of the treadmills, the ball shop, the eggs and the portal.
  palm(47.5, 0, -37.5, 7.5, 2.3)
  palm(47.5, 0, 33.5, 8, 0.8)
  palm(-47.5, 0, 33.5, 7, 2.5)
  palm(-47.5, 0, -37.5, 8.5, 0.6)

  // Along the sand strip outside the plaza's wall (the floodlights stand in its south corners).
  const strip = some ? [-32, -16, 0, 16, 30] : [-16, 16]
  for (const z of strip) {
    palm(55, 0, z, 7 + ((z + 40) % 3), 3.6)
    palm(-55, 0, z + 4, 7.5 + ((z + 41) % 3), 0.2)
  }
  for (const x of some ? [-40, -20, 20, 40] : [-30, 30]) palm(x, 0, 41, 7 + (x > 0 ? 1 : 0), 1.6 + x * 0.01)

  // Umbrellas and deck chairs on the sideline aprons: south-east by the end zone, west
  // between the ball shop and the eggs.
  const umbrellas = [
    [31, 32, CORAL, 0.3],
    [39, 31, TURQUOISE, 2.2],
    [-31, 17, TURQUOISE, -0.4],
    [-40, 17.5, CORAL, 2.8],
  ]
  for (const [x, z, color, turn] of full ? umbrellas : umbrellas.slice(0, 2)) addUmbrella(blocks, props, x, z, color, turn)

  // Surfboards stuck in the sand behind the treadmills' tracks, and by the umbrellas.
  const boards = [
    [47.5, 20.5, CORAL],
    [47.5, 6.5, TURQUOISE],
    [47.5, -7.5, '#ffd27a'],
    [47.5, -21.5, CORAL],
    [44.5, 33.5, TURQUOISE],
    [-35, 19.5, '#ffd27a'],
  ]
  for (const [x, z, color] of some ? boards : boards.slice(0, 3)) addSurfboard(props, x, z, color, 0.4)

  // Out on the beach beyond the pavilions, as far as the water's edge: a scatter of palms
  // (and umbrellas on HIGH), placed from a seed, none touching.
  const rand = mulberry32(77)
  const count = full ? 22 : some ? 14 : 8
  const placed = []
  for (let tries = 0; placed.length < count && tries < 400; tries += 1) {
    const side = Math.floor(rand() * 3)
    const along = rand() * 2 - 1
    const out = 96 + rand() * 16
    const x = side === 0 ? along * 100 : side === 1 ? out : -out
    const z = side === 0 ? out : -36 + (along + 1) * 68
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 9)) continue
    placed.push([x, z])
    palm(x, 0, z, 7 + rand() * 4, rand() * Math.PI * 2)
    if (full && placed.length % 3 === 0) addUmbrella(blocks, props, x + 4, z + 3, placed.length % 2 ? CORAL : TURQUOISE, rand() * 3)
  }

  // Out at sea: palm islands, and a lighthouse off the north-east, by the kick field.
  addIsland(blocks, 168, 62, 26)
  addIsland(blocks, -172, 28, 22)
  if (some) {
    addIsland(blocks, 64, 172, 20)
    addIsland(blocks, -96, 160, 24)
  }
  addLighthouse(blocks, props, 150, -64)
  return { palms }
}
