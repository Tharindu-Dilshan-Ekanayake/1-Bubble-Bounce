import { hash2, mulberry32 } from '@shared/rng'
import { PLAZA } from '@shared/world'

import { STYLE } from '../materials'
import { PALETTE, VENUES } from '../sceneStyle'

/**
 * The stadium round the plaza: a strip of turf (painted into the ground map, ground.js)
 * behind a low LED wall, then three covered pavilions - south, east and west, the north
 * left open for the kick field and its arch - a floodlight tower in each open corner, a
 * big scoreboard over the south pavilion, and beyond it all a hazy city skyline.
 *
 * Each pavilion is the same cross-section run along its side: an LED board along the
 * front, a lower tier of pale concrete steps with royal blue seats on them (a gold section
 * in the middle with white either side, so it reads as seat blocks, not stripes), stair
 * aisles with gold nosings and handrails every ten metres, a hospitality band of dark
 * glass in a white frame, an upper tier with its own LED board, a back wall, and a
 * cantilevered roof tilted up to the front, with a navy fascia, a row of floodlights under
 * it, trusses on top and the team's flags along its back edge.
 *
 * Built in the colours of the world's venue (sceneStyle VENUES): royal blue, white and gold
 * in the Backyard Stadium, turquoise, coral and sand at Palm Beach (where the ocean takes
 * the skyline's place: beach.js).
 *
 * Everything is boxes in the world's block set: no draw calls of its own, nothing to do
 * per frame. Layers that touch are at least 3 cm apart or meet face-to-face, never
 * overlapping in one plane (no z-fighting). `density` (the preset's decorDensity) sets the
 * crowd, rails, trusses, mullions and the skyline's size: LOW gets none of the crowd.
 */

/** The front lines of the three pavilions, and the stretch of their side they cover. */
const PAVILIONS = [
  { along: 'x', from: -56, to: 56, front: 46, out: 1 },
  { along: 'z', from: -40, to: 40, front: 60, out: 1 },
  { along: 'z', from: -40, to: 40, front: -60, out: -1 },
]

/** The cross-section, in metres out from the pavilion's front (u) and up (y). */
const LOWER_ROWS = 7
const UPPER_ROWS = 6
const ROW = 2
const lowerFront = 0.6
const lowerTop = (r) => 1.4 + 0.9 * r
const VIP_FROM = lowerFront + LOWER_ROWS * ROW
const VIP_TO = VIP_FROM + 3.6
const VIP_TOP = lowerTop(LOWER_ROWS - 1) + 3.6
const upperTop = (r) => VIP_TOP + 1.6 + 1.0 * r
const BACK = VIP_TO + UPPER_ROWS * ROW
const WALL_TOP = upperTop(UPPER_ROWS - 1) + 4
/** The roof: from over the upper tier's front to past the back wall, rising to the front. */
const ROOF = { front: VIP_FROM + 1.8, back: BACK + 1.2, frontY: WALL_TOP + 1.6, backY: WALL_TOP + 0.2, thick: 0.5 }
const AISLE_EVERY = 10

const ROOF_COLOR = '#e9eef4'

/**
 * A pavilion's own frame: `s` along its side, `u` out from its front, `y` up. `box` adds a
 * box given in those terms, `tilt` turning it about the along axis (positive: its front
 * end higher).
 */
function frameOf(p, blocks) {
  return (s0, s1, u0, u1, y0, y1, color, style = STYLE.SMOOTH, tilt = 0, length = null) => {
    const s = (s0 + s1) / 2
    const o = p.front + p.out * ((u0 + u1) / 2)
    const y = (y0 + y1) / 2
    const depth = length ?? u1 - u0
    if (p.along === 'x') blocks.add(s, y, o, s1 - s0, y1 - y0, depth, color, style, 0, tilt * p.out, 0)
    else blocks.add(o, y, s, depth, y1 - y0, s1 - s0, color, style, 0, 0, -tilt * p.out)
  }
}

/** A bar from (u0, y0) to (u1, y1) at `s` (a rail or a truss): a thin box tilted to lie along it. */
function bar(box, s, u0, y0, u1, y1, size, color) {
  const length = Math.hypot(u1 - u0, y1 - y0)
  const angle = -Math.atan2(y1 - y0, u1 - u0)
  box(s - size / 2, s + size / 2, (u0 + u1) / 2 - size / 2, (u0 + u1) / 2 + size / 2, (y0 + y1) / 2 - size / 2, (y0 + y1) / 2 + size / 2, color, STYLE.SMOOTH, angle, length)
}

/** Builds pavilion `p` into `blocks`; returns how many fans it seated. */
function buildPavilion(p, index, blocks, { detail, crowd, v }) {
  const box = frameOf(p, blocks)
  const LED = [v.primary, v.light, v.accent]
  const { from, to } = p
  const length = to - from
  const sections = Math.max(1, Math.round(length / AISLE_EVERY))
  const sectionLength = length / sections
  const aisles = Array.from({ length: sections - 1 }, (_, i) => from + sectionLength * (i + 1))
  const middle = Math.floor(sections / 2)
  const seatColor = (j) => (j === middle ? v.accent : Math.abs(j - middle) === 1 ? v.light : v.primary)

  // The LED boards along the front of each tier, in the team's colours.
  for (let s = from, i = 0; s < to - 0.01; s += 8, i += 1) {
    const e = Math.min(to, s + 8)
    box(s + 0.05, e - 0.05, 0, lowerFront, 0, 1.6, LED[i % 3], STYLE.GLOW)
    box(s + 0.05, e - 0.05, VIP_FROM, VIP_FROM + 0.6, VIP_TOP, VIP_TOP + 1, LED[(i + 1) % 3], STYLE.GLOW)
  }

  // Both tiers: concrete steps, seat blocks between the aisles, gold-nosed stairs.
  const tiers = [
    { rows: LOWER_ROWS, u: lowerFront, top: lowerTop },
    { rows: UPPER_ROWS, u: VIP_TO, top: upperTop },
  ]
  let fans = 0
  for (const [t, tier] of tiers.entries()) {
    for (let r = 0; r < tier.rows; r += 1) {
      const u = tier.u + r * ROW
      const top = tier.top(r)
      box(from, to, u, u + ROW, 0, top, v.concrete[r % 3], STYLE.STUDS)
      for (let j = 0; j < sections; j += 1) {
        const s0 = j === 0 ? from + 0.3 : aisles[j - 1] + 0.8
        const s1 = j === sections - 1 ? to - 0.3 : aisles[j] - 0.8
        box(s0, s1, u + 0.5, u + 1.5, top, top + 0.45, seatColor(j))
        // The fans: a seat every 1.4 m, filled by a seeded hash, each well inside it.
        if (crowd > 0) {
          for (let k = 0, s = s0 + 0.7; s < s1 - 0.69; k += 1, s += 1.4) {
            const row = index * 64 + t * 16 + r
            const cell = j * 16 + k
            if (hash2(row, cell, 31) > crowd) continue
            const size = 0.55 + Math.floor(hash2(row, cell, 51) * 3) * 0.1
            const color = v.crowd[Math.floor(hash2(row, cell, 41) * v.crowd.length)]
            box(s - size / 2, s + size / 2, u + 1 - size / 2, u + 1 + size / 2, top + 0.45, top + 0.45 + size * 1.25, color)
            fans += 1
          }
        }
      }
      for (const a of aisles) box(a - 0.6, a + 0.6, u + 0.05, u + ROW - 0.05, top, top + 0.12, v.accent)
    }
    // A handrail down the middle of each aisle (not on LOW).
    if (detail) {
      const last = tier.rows - 1
      for (const a of aisles) bar(box, a, tier.u + 1, tier.top(0) + 1, tier.u + last * ROW + 1, tier.top(last) + 1, 0.1, '#dfe4ec')
    }
  }

  // The hospitality band: concrete, a strip of dark glass in a white frame, mullions on HIGH.
  box(from, to, VIP_FROM, VIP_TO, 0, VIP_TOP, v.vip)
  box(from, to, VIP_FROM - 0.12, VIP_FROM, VIP_TOP - 3.1, VIP_TOP - 0.7, v.glass)
  box(from, to, VIP_FROM - 0.2, VIP_FROM, VIP_TOP - 3.45, VIP_TOP - 3.1, v.light)
  box(from, to, VIP_FROM - 0.2, VIP_FROM, VIP_TOP - 0.7, VIP_TOP - 0.35, v.light)
  if (detail) {
    for (let s = from + 3; s < to - 1; s += 3) box(s - 0.06, s + 0.06, VIP_FROM - 0.18, VIP_FROM - 0.12, VIP_TOP - 3.1, VIP_TOP - 0.7, v.light)
  }

  // Back wall, and the roof over the upper tier: tilted up to the front, overhanging the
  // ends, a navy fascia along its front edge with floodlights under it.
  box(from, to, BACK, BACK + 0.8, 0, WALL_TOP, v.wall)
  const roofDepth = ROOF.back - ROOF.front
  const rise = ROOF.frontY - ROOF.backY
  const tilt = Math.atan2(rise, roofDepth)
  box(from - 0.5, to + 0.5, ROOF.front, ROOF.back, (ROOF.frontY + ROOF.backY) / 2 - ROOF.thick / 2, (ROOF.frontY + ROOF.backY) / 2 + ROOF.thick / 2, ROOF_COLOR, STYLE.SMOOTH, tilt, Math.hypot(roofDepth, rise))
  box(from - 0.5, to + 0.5, ROOF.front - 0.6, ROOF.front, ROOF.frontY - 0.8, ROOF.frontY + 0.6, v.dark)
  for (let s = from + 2; s < to - 1; s += 4) box(s - 0.8, s + 0.8, ROOF.front - 0.75, ROOF.front - 0.6, ROOF.frontY - 0.6, ROOF.frontY - 0.1, '#fffbe0', STYLE.GLOW)

  // Trusses on top of the roof, and flags along its back edge.
  for (let s = from + 6, i = 0; s < to - 1; s += 12, i += 1) {
    if (detail) {
      box(s - 0.2, s + 0.2, BACK + 0.2, BACK + 0.6, WALL_TOP, WALL_TOP + 4, '#9aa3b2')
      bar(box, s, BACK + 0.4, WALL_TOP + 4, ROOF.front + 0.4, ROOF.frontY + 0.3, 0.3, '#9aa3b2')
    }
    box(s + 2.85, s + 3.15, BACK + 0.25, BACK + 0.55, WALL_TOP, WALL_TOP + 6, PALETTE.rail)
    box(s + 3.15, s + 4.95, BACK + 0.34, BACK + 0.46, WALL_TOP + 4.6, WALL_TOP + 5.8, v.flags[i % v.flags.length])
  }
  return fans
}

/**
 * A floodlight tower at (x, z) with its bank of lamps turned to face the plaza: a tall
 * pole on a base, a dark frame at the top and 4 x 3 glowing lamps on it.
 */
function addFloodlight(blocks, x, z, v) {
  const height = 36
  const yaw = Math.atan2(-x, 8 - z)
  const right = [Math.cos(yaw), -Math.sin(yaw)]
  const front = [Math.sin(yaw), Math.cos(yaw)]
  blocks.addOn(x, 0, z, 3, 1.4, 3, v.dark, STYLE.SMOOTH)
  blocks.addOn(x, 1.4, z, 1.2, height - 1.4, 1.2, '#cfd6e4', STYLE.SMOOTH)
  blocks.addOn(x, height - 1, z, 2.4, 0.5, 2.4, v.dark, STYLE.SMOOTH)
  const bankY = height + 3
  blocks.add(x + front[0] * 0.7, bankY, z + front[1] * 0.7, 10.4, 6.4, 1.2, v.dark, STYLE.SMOOTH, yaw)
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      const u = (col - 1.5) * 2.4
      blocks.add(x + right[0] * u + front[0] * 1.45, bankY + (row - 1) * 2, z + right[1] * u + front[1] * 1.45, 1.9, 1.5, 0.3, '#fffbe0', STYLE.GLOW, yaw)
    }
  }
}

/** The scoreboard behind the south pavilion's roof, on two pylons: its lettering is a world label (lobbyLabels.js). */
export const SCOREBOARD = { x: 0, z: PLAZA.maxZ + 14, y: WALL_TOP + 2.6, width: 30, height: 12 }

export function addScoreboard(blocks, v) {
  const { x, z, y, width, height } = SCOREBOARD
  for (const side of [-1, 1]) blocks.addOn(x + side * (width / 2 - 3), 0, z + 0.4, 1.4, y, 1.2, v.dark, STYLE.SMOOTH)
  // Frame, navy screen, glowing gold edge and a row of blue/white lamps along the top.
  blocks.addOn(x, y, z, width + 1.6, height + 1.6, 1.4, '#cfd6e4', STYLE.SMOOTH)
  blocks.addOn(x, y + 0.8, z - 0.2, width, height, 1.4, '#0e1740', STYLE.SMOOTH)
  blocks.addOn(x, y + 0.5, z - 1, width - 0.6, 0.35, 0.2, v.accent, STYLE.GLOW)
  blocks.addOn(x, y + height + 0.7 - 0.35, z - 1, width - 0.6, 0.35, 0.2, v.accent, STYLE.GLOW)
  for (const side of [-1, 1]) blocks.addOn(x + side * (width / 2 - 0.3), y + 0.8, z - 1, 0.35, height, 0.2, v.accent, STYLE.GLOW)
  for (let i = 0; i < 15; i += 1) {
    blocks.addOn(x - width / 2 + 1 + i * 2, y + height + 1.6, z, 1.2, 0.9, 1.2, i % 2 ? v.primary : '#ffffff', STYLE.GLOW)
  }
}

/**
 * The low LED wall round the plaza's edge, between you and the turf: panels in the team's
 * blue and white with a gold cap. Along the south, east and west sides, and the two
 * stretches of the north edge either side of the kick field's mouth.
 */
function addWall(blocks, v) {
  const { minX, maxX, minZ, maxZ } = PLAZA
  const panel = 4
  const put = (x, z, sx, sz, i) => {
    blocks.addOn(x, 0, z, sx, 1.1, sz, i % 2 ? v.light : v.primary, STYLE.SMOOTH)
    blocks.addOn(x, 1.1, z, sx + 0.1, 0.18, sz + 0.1, v.accent, STYLE.GLOW)
  }
  let n = 0
  for (let x = minX; x < maxX - 0.01; x += panel) put(x + panel / 2, maxZ + 0.35, panel - 0.05, 0.5, n++)
  for (let z = minZ; z < maxZ - 0.01; z += panel) {
    put(maxX + 0.35, z + panel / 2, 0.5, panel - 0.05, n++)
    put(minX - 0.35, z + panel / 2, 0.5, panel - 0.05, n++)
  }
  for (let x = 35; x < maxX - 0.01; x += panel) {
    put(x + panel / 2, minZ - 0.35, panel - 0.05, 0.5, n++)
    put(-x - panel / 2, minZ - 0.35, panel - 0.05, 0.5, n++)
  }
}

/**
 * The city round the stadium, beyond the pavilions: towers in hazy blue-grey and dusky
 * purple with lit windows (STYLE.WINDOWS) and a beacon on top, fading into the fog. Placed
 * from a seed, never touching each other, all round but the north (where the kick field
 * runs and Lane.jsx has its own).
 */
function addSkyline(blocks, count) {
  const rand = mulberry32(2024)
  const placed = []
  for (let tries = 0; placed.length < count && tries < count * 20; tries += 1) {
    const angle = (-15 + rand() * 210) * (Math.PI / 180)
    const r = 128 + rand() * 55
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    const w = 12 + Math.floor(rand() * 9) * 2
    const d = 12 + Math.floor(rand() * 7) * 2
    const h = 24 + Math.floor(rand() * 12) * 5
    const rect = { minX: x - w / 2 - 2, maxX: x + w / 2 + 2, minZ: z - d / 2 - 2, maxZ: z + d / 2 + 2 }
    if (placed.some((q) => q.minX < rect.maxX && q.maxX > rect.minX && q.minZ < rect.maxZ && q.maxZ > rect.minZ)) continue
    placed.push(rect)
    const color = PALETTE.city[placed.length % PALETTE.city.length]
    const cap = h * 0.28
    blocks.addOn(x, 0, z, w, h, d, color, STYLE.WINDOWS)
    blocks.addOn(x, h, z, w * 0.62, cap, d * 0.62, PALETTE.city[(placed.length + 2) % PALETTE.city.length], STYLE.WINDOWS)
    blocks.addOn(x, h + cap, z, w * 0.3, 1.2, d * 0.3, placed.length % 3 ? '#ffe2a8' : '#ff6a5a', STYLE.GLOW)
  }
  return placed.length
}

/**
 * Builds the stadium into `blocks`, in the colours of `world`'s venue. `density` (0-1, the
 * preset's decorDensity): the crowd is full at 0.75+, thinner at 0.5+, none on LOW, which
 * also loses the rails, trusses and mullions and gets a smaller skyline. Palm Beach has no
 * skyline: the ocean and its islands are round it instead (beach.js). Returns how many fans
 * and buildings were placed (for tests/debug).
 */
export function buildTerrain(blocks, { density = 1, world = 0 } = {}) {
  const v = VENUES[world] ?? VENUES[0]
  const crowd = density >= 0.75 ? 0.62 : density >= 0.5 ? 0.35 : 0
  const detail = density >= 0.5
  let people = 0
  PAVILIONS.forEach((p, i) => {
    people += buildPavilion(p, i, blocks, { detail, crowd, v })
  })
  addWall(blocks, v)
  addFloodlight(blocks, 57, 43, v)
  addFloodlight(blocks, -57, 43, v)
  addFloodlight(blocks, 38, -44, v)
  addFloodlight(blocks, -38, -44, v)
  addScoreboard(blocks, v)
  const buildings = v.beach ? 0 : addSkyline(blocks, density >= 0.75 ? 56 : density >= 0.5 ? 44 : 28)
  return { people, buildings }
}
