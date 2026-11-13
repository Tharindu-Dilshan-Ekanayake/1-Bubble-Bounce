import { CylinderGeometry, SphereGeometry, TorusGeometry } from 'three'

import {
  COURT_BACK_X,
  COURT_HALF,
  PAD_COUNT,
  PAD_HEIGHT,
  PAD_RADIUS,
  PAD_X,
  padCenterZ,
  padHoopRadius,
  ROBOT_X,
  SHOP_SIGN,
  SHOP_SIGN_FACING,
  SHOP_STAGES,
  TABLE_NEAR_X,
} from '@shared/world'

import { STYLE } from '../materials'
import { venueOf } from '../sceneStyle'

/**
 * Static lobby structures, added to the world's shared BlockSet and prop builder so they
 * render in the same few draw calls as the grandstands.
 */

/**
 * Per-pad look, in pad order (matches PADS in shared/balance.js): the pad's base, top,
 * glowing ring and emblem, the hoop pole and frame colour, the soap floor beyond it, the
 * soap in its tub, and the colour of its labels. `beach` ones (Coral Coast's coral pads)
 * get a surfboard and a palm on top of their board.
 */
export const PAD_THEMES = [
  { base: '#1f5fc8', top: '#3f9cff', ring: '#9fe8ff', emblem: '#ffffff', rail: '#1d5fd6', court: '#2c4fa8', screen: '#5fd6ff', text: '#5fd6ff' },
  { base: '#d68a12', top: '#ffd23f', ring: '#fff6a8', emblem: '#ff7a3a', rail: '#ff9a1e', court: '#c8761a', screen: '#ffe27a', text: '#ffd84a' },
  { base: '#d64a9a', top: '#ff8fd0', ring: '#ffffff', emblem: '#ffd23f', rail: '#d63f8f', court: '#b8467e', screen: '#ffffff', text: '#ff9cd6' },
  { base: '#0d6f9a', top: '#2fc6e8', ring: '#7ff6ff', emblem: '#ffffff', rail: '#1494c0', court: '#0f5f84', screen: '#7ff6ff', text: '#7fe8ff' },
  { base: '#5a2a9a', top: '#8a4cff', ring: '#ff7ad9', emblem: '#ffffff', rail: '#6a2fd0', court: '#4a2a8a', screen: '#ff7ad9', text: '#c69bff' },
  { base: '#1a8ab8', top: '#7ff0ff', ring: '#ffffff', emblem: '#9b6bff', rail: '#14a3c9', court: '#1f7aa8', screen: '#ffffff', text: '#9fe8ff', style: STYLE.GLOW },
  { base: '#1b2266', top: '#2a1450', ring: '#c35cff', emblem: '#ffd21f', rail: '#2a1450', court: '#1b1f5c', screen: '#ffd21f', text: '#d39bff', style: STYLE.GALAXY },
  // Coral Coast's coral pads: sand and coral, then a deep-sea wave.
  { base: '#e8c27a', top: '#ff9a8a', ring: '#3fd8ff', emblem: '#ff7a3a', rail: '#ff6f61', court: '#d9b46a', screen: '#3fd8ff', text: '#ffa898', beach: true },
  { base: '#0b4f8a', top: '#1a8fd8', ring: '#7ff6ff', emblem: '#ffffff', rail: '#0a6fb8', court: '#0b3f72', screen: '#7ff6ff', text: '#7ff6ff', style: STYLE.GLOW, beach: true },
]

const LINE = '#f4f7fb'
const LEG = '#3a3f4a'
/** The multiplier backboard: high above the hoop's frame, and compact. Labels centre on it (lobbyLabels). */
export const BOARD_BOTTOM = 4.8
export const BOARD_HEIGHT = 3.6

/** The giant hoop's pole stands here, just east of the pad (inside its collider). */
export const HOOP_X = TABLE_NEAR_X + 0.55
/** The height of the middle of pad `index`'s hoop: its bottom clears your head. */
export const hoopCentreY = (index) => PAD_HEIGHT + 1.65 + padHoopRadius(index)

const DISC = new CylinderGeometry(1, 1, 1, 24)
const RING = new TorusGeometry(1, 0.08, 4, 28)
/** The giant hoop: a fat ring, its own (rounder) geometry. */
const HOOP = new TorusGeometry(1, 0.075, 6, 28)
const CYL = new CylinderGeometry(1, 1, 1, 12)
const BALL = new SphereGeometry(1, 12, 8)
/** Foam blobs: small, many, low-poly. */
const FOAM = new SphereGeometry(1, 7, 5)

/**
 * A pad's soap floor, east of its pad: a coloured floor with white lines and a low wall
 * at the back. Boxes go in `blocks`: no draw calls of their own.
 */
function buildCourt(blocks, z, theme) {
  const courtLength = COURT_BACK_X - (TABLE_NEAR_X - 0.4)
  const courtX = (TABLE_NEAR_X - 0.4 + COURT_BACK_X) / 2
  blocks.addOn(courtX, 0, z, courtLength, 0.05, COURT_HALF * 2, theme.court, STYLE.SMOOTH)
  // Its lines stand 4 cm proud of the floor (nothing within 3 cm of another surface).
  for (const s of [-1, 1]) blocks.addOn(courtX, 0.05, z + s * (COURT_HALF - 0.15), courtLength - 0.3, 0.04, 0.12, LINE, STYLE.SMOOTH)
  blocks.addOn(COURT_BACK_X - 0.3, 0.05, z, 0.12, 0.04, COURT_HALF * 2 - 0.42, LINE, STYLE.SMOOTH)

  // The wall across the back: panels in two colours with a glowing top.
  for (let i = 0; i < 3; i += 1) {
    const pz = z - COURT_HALF + (i + 0.5) * ((COURT_HALF * 2) / 3)
    blocks.addOn(COURT_BACK_X, 0, pz, 0.22, 0.75, (COURT_HALF * 2) / 3 - 0.06, i % 2 ? theme.top : '#1f2a5c', STYLE.SMOOTH)
  }
  blocks.addOn(COURT_BACK_X, 0.75, z, 0.26, 0.08, COURT_HALF * 2, theme.ring, STYLE.GLOW)
}

/**
 * The giant bubble wand east of the pad (the trainee stands at the pad's middle facing
 * east, blowing through their own wand at it): a candy-striped pole, a fat glowing hoop
 * on top - bigger on every pad - with a soap film across it (AmbientBubbles' films) and
 * bubbles streaming out of it; beside it a tub of glowing soap with foam piled on its rim;
 * and behind, the big backboard the pad's multiplier label (labels/lobbyLabels.js) hangs
 * in front of, a giant bubble on top.
 *
 * Everything east of x = TABLE_NEAR_X stays inside the pad's static collider
 * (shared/world.js), so what you can't walk through is what's drawn.
 */
function buildGiantWand(blocks, props, z, theme, index) {
  const r = padHoopRadius(index)
  const cy = hoopCentreY(index)
  const bottom = cy - r
  // The pole: a foot, the striped pole up to the hoop, a glowing collar where they meet.
  blocks.addOn(HOOP_X, 0, z, 1.0, 0.18, 1.0, LEG, STYLE.SMOOTH)
  blocks.addOn(HOOP_X, 0.18, z, 0.34, bottom - 0.1, 0.34, theme.rail, STYLE.STRIPES)
  blocks.addOn(HOOP_X, bottom - 0.3, z, 0.46, 0.3, 0.46, theme.ring, STYLE.GLOW)
  // The hoop, facing west (its axis along x), glowing, with a second ring set in it.
  props.add(HOOP, { position: [HOOP_X, cy, z], rotation: [0, Math.PI / 2, 0], scale: [r, r, r * 1.6], color: theme.top, style: STYLE.GLOW })
  props.add(RING, { position: [HOOP_X + 0.06, cy, z], rotation: [0, Math.PI / 2, 0], scale: [r - 0.14, r - 0.14, 1], color: theme.ring, style: STYLE.GLOW })

  // The soap tub, inside the collider: a tub in the pad's colour, glowing soap, foam.
  const tx = ROBOT_X - 0.6
  const tz = z + 0.55
  props.add(CYL, { position: [tx, 0.38, tz], scale: [0.6, 0.76, 0.6], color: theme.base })
  props.add(CYL, { position: [tx, 0.78, tz], scale: [0.66, 0.08, 0.66], color: '#ffffff' })
  props.add(CYL, { position: [tx, 0.8, tz], scale: [0.52, 0.06, 0.52], color: theme.screen, style: STYLE.GLOW })
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + index
    props.add(FOAM, { position: [tx + Math.cos(a) * 0.4, 0.9, tz + Math.sin(a) * 0.4], scale: [0.24, 0.17, 0.24], color: '#ffffff' })
  }

  // The backboard behind it, kept small and high so the follow camera behind the trainee
  // (west of the pad, looking east) sees it over their head: a navy panel in a frame with
  // a glowing border in the pad's ring colour, on two thin posts.
  const bx = PAD_X + 5.6
  const by = BOARD_BOTTOM
  const bh = BOARD_HEIGHT
  for (const s of [-1, 1]) blocks.addOn(bx, 0, z + s * 1.5, 0.25, by, 0.25, LEG, STYLE.SMOOTH)
  blocks.addOn(bx, by, z, 0.4, bh, 4.2, theme.rail, STYLE.SMOOTH)
  blocks.addOn(bx - 0.23, by + 0.2, z, 0.08, bh - 0.4, 3.8, '#141a3a', STYLE.SMOOTH)
  blocks.addOn(bx - 0.28, by + 0.12, z, 0.06, 0.1, 3.9, theme.ring, STYLE.GLOW)
  blocks.addOn(bx - 0.28, by + bh - 0.22, z, 0.06, 0.1, 3.9, theme.ring, STYLE.GLOW)
  for (const s of [-1, 1]) blocks.addOn(bx - 0.28, by + 0.2, z + s * 1.9, 0.06, bh - 0.4, 0.1, theme.ring, STYLE.GLOW)
  if (theme.beach) {
    // A surfboard standing on end on top, and a little palm beside it.
    props.add(BALL, { position: [bx, by + bh + 1.0, z - 0.7], scale: [0.14, 0.95, 0.34], color: theme.ring })
    props.add(BALL, { position: [bx, by + bh + 1.0, z - 0.7], scale: [0.15, 0.8, 0.07], color: '#ffffff' })
    blocks.addOn(bx, by + bh, z + 0.9, 0.22, 1.5, 0.22, '#9a6a3a', STYLE.SMOOTH)
    blocks.add(bx, by + bh + 1.62, z + 0.9, 1.6, 0.18, 0.5, '#2fae4a', STYLE.SMOOTH, 0.4)
    blocks.add(bx, by + bh + 1.66, z + 0.9, 0.5, 0.16, 1.6, '#4cd36a', STYLE.SMOOTH, 0.4)
  } else {
    // A giant glossy bubble on top, and a little one.
    props.add(BALL, { position: [bx, by + bh + 0.85, z], scale: [0.8, 0.8, 0.8], color: theme.screen, style: STYLE.GLOW })
    props.add(FOAM, { position: [bx, by + bh + 0.5, z + 1.25], scale: [0.36, 0.36, 0.36], color: theme.ring, style: STYLE.GLOW })
  }
}

/**
 * The Blow Pads: round two-tier pads in the pad's colours with a glowing ring round the
 * top and foam piled round the edge, each with its giant wand beyond and a soap floor.
 * The rounded parts go into the world's props, the rest into its blocks: no draw calls of
 * their own.
 */
export function buildPads(blocks, props) {
  for (let i = 0; i < PAD_COUNT; i += 1) {
    const theme = PAD_THEMES[i]
    const z = padCenterZ(i)
    const r = PAD_RADIUS
    props.add(DISC, { position: [PAD_X, PAD_HEIGHT * 0.4, z], scale: [r + 0.45, PAD_HEIGHT * 0.8, r + 0.45], color: theme.base })
    props.add(DISC, { position: [PAD_X, PAD_HEIGHT - 0.06, z], scale: [r, 0.14, r], color: theme.top, style: theme.style ?? STYLE.STUDS })
    props.add(RING, { position: [PAD_X, PAD_HEIGHT + 0.02, z], rotation: [Math.PI / 2, 0, 0], scale: [r - 0.25, r - 0.25, 1], color: theme.ring, style: STYLE.GLOW })
    // The pad's emblem: a glowing disc either side of where you stand.
    for (const s of [-1, 1]) {
      props.add(CYL, { position: [PAD_X - 1.9, PAD_HEIGHT + 0.03, z + s * 1.6], scale: [0.46, 0.04, 0.46], color: theme.emblem })
      props.add(CYL, { position: [PAD_X - 1.9, PAD_HEIGHT + 0.08, z + s * 1.6], scale: [0.26, 0.04, 0.26], color: theme.ring, style: STYLE.GLOW })
    }
    // Foam piled round the pad's edge, on the west side (the east is the wand's).
    for (let k = 0; k < 5; k += 1) {
      const a = Math.PI * 0.55 + (k / 4) * Math.PI * 0.9
      const s = 0.3 + ((k * 37 + i * 11) % 5) * 0.06
      props.add(FOAM, { position: [PAD_X + Math.cos(a) * (r + 0.35), PAD_HEIGHT * 0.6, z + Math.sin(a) * (r + 0.35)], scale: [s, s * 0.8, s], color: '#ffffff' })
    }
    buildGiantWand(blocks, props, z, theme, i)
    buildCourt(blocks, z, theme)
  }
}

const WHITE = '#f4f7fb'

/**
 * The Bubble Shop: two open display stages (the stands on them are TireShop's) and the big
 * BUBBLE SHOP sign behind, built like the start arch - white decks on a yellow band with
 * gold light strips round the edges. `detail` (off on LOW) adds the sign's bulbs.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on.
 */
export function buildShop(blocks, { detail = true, world = 0 } = {}) {
  const { band: YELLOW, strip: PALE, post: GOLD, panel: NAVY } = venueOf(world).shop
  for (const s of SHOP_STAGES) {
    const w = s.maxX - s.minX
    const d = s.maxZ - s.minZ
    const cx = (s.minX + s.maxX) / 2
    const cz = (s.minZ + s.maxZ) / 2
    blocks.addOn(cx, -0.1, cz, w, s.height + 0.1, d, WHITE)
    blocks.addOn(cx, 0, cz, w + 0.3, s.height * 0.5, d + 0.3, YELLOW)
    // Light strips along all four top edges, and a gold post at each corner.
    for (const side of [-1, 1]) {
      blocks.addOn(cx + side * (w / 2 - 0.25), s.height, cz, 0.35, 0.08, d - 1.4, PALE, STYLE.GLOW)
      blocks.addOn(cx, s.height, cz + side * (d / 2 - 0.25), w - 1.4, 0.08, 0.35, PALE, STYLE.GLOW)
      for (const end of [-1, 1]) {
        blocks.addOn(cx + side * (w / 2 - 0.35), s.height, cz + end * (d / 2 - 0.35), 0.6, 0.7, 0.6, GOLD, STYLE.GLOW)
      }
    }
  }

  // The sign: two striped legs, a navy panel in a yellow frame, a gold cap, its face
  // turned to the plaza (`f`).
  const { x, minZ, maxZ, top } = SHOP_SIGN
  const f = SHOP_SIGN_FACING
  const length = maxZ - minZ
  const midZ = (minZ + maxZ) / 2
  const bottom = top - 8.2
  for (const z of [minZ + 1.5, maxZ - 1.5]) blocks.addOn(x - 0.1 * f, 0, z, 0.9, bottom + 0.3, 0.9, YELLOW, STYLE.STRIPES)
  blocks.addOn(x, bottom, midZ, 0.6, top - bottom, length, YELLOW)
  blocks.addOn(x + 0.1 * f, bottom + 0.5, midZ, 0.6, top - bottom - 1, length - 1, NAVY, STYLE.SMOOTH)
  blocks.addOn(x, top, midZ, 0.9, 0.4, length + 0.4, GOLD, STYLE.GLOW)
  if (detail) {
    for (let z = minZ + 1; z <= maxZ - 0.99; z += 1.5) {
      blocks.add(x + 0.42 * f, bottom + 0.25, z, 0.16, 0.3, 0.3, Math.round(z) % 2 ? '#ffffff' : GOLD, STYLE.GLOW)
      blocks.add(x + 0.42 * f, top - 0.25, z + 0.75, 0.16, 0.3, 0.3, Math.round(z) % 2 ? GOLD : '#ffffff', STYLE.GLOW)
    }
  }
}
