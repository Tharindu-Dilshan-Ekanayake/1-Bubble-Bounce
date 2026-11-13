import { EGG_STANDS, FREE_REWARD, PLAZA, SPAWN } from '@shared/world'

import { STYLE } from '../materials'

/**
 * The football field the lobby stands on: the plaza is painted as a pitch running north to
 * the KICK ZONE (so the start arch reads as the goalposts at the end of the field), with
 * mown bands, a white border, a royal blue end zone round the kick zone and a navy one
 * at the south end under the leaderboards ("KICK FIELD GOAL" in gold), a blue running
 * track down each side and a navy sideline apron beyond it where the treadmills, the ball
 * shop and the eggs stand - all in the venue's colours (sceneStyle VENUES: the home team's
 * royal blue, white and gold, or Palm Beach's turquoise, coral and sand). The circular BACKYARD STADIUM logo lies at the spawn, on the 50.
 *
 * Who draws what:
 *  - the colour areas (bands, end zones, border, track, apron) are painted into the
 *    ground map at one texel per unit (ground.js) - every edge on a whole unit, so crisp;
 *  - the lines (goal and yard lines, hash marks, the track's lanes) are thin white boxes
 *    in the world's block set (buildPitch), 0.04 above the ground;
 *  - the logo, yard numbers, end-zone lettering and direction stencils are decals in the
 *    painted-signs atlas (signs.js), 0.03 above the ground. Lines never run under a decal:
 *    they are cut round the logo, and the numbers and stencils sit between the lines -
 *    so nothing lies within 3 cm of anything else (no z-fighting, even on phones).
 *
 * The field's yard lines are 4 units (5 "yards") apart, counted from the north goal line:
 * the 50 is the line through the spawn.
 */

/** The field: sidelines at x = +-HALF, goal lines at NORTH and SOUTH, yard lines every YARD. */
export const PITCH = { half: 19, north: -26, south: 26, yard: 4 }
/** The white border outside each sideline, and the running track outside that. */
export const BORDER = { from: 19, to: 20 }
export const TRACK = { from: 20, to: 24, lanes: [21, 22, 23, 23.95] }
/** The circular logo at the spawn. Lines are cut back to LINE_CLEAR round it. */
export const LOGO = { x: SPAWN.x, z: SPAWN.z, radius: 9.5 }
/** (Past the logo's polygon and its triangles' bounds, so nothing even nearly overlaps.) */
const LINE_CLEAR = 10.6

/** How high the line boxes reach and the decals lie (each at least 3 cm off the ground and each other). */
const LINE_TOP = 0.04
export const DECAL_Y = 0.03

/** Yard numbers: every other yard line from the north goal, on both halves of the field. */
const NUMBER_X = 12
/** A digit's size on the ground, and its centre's distance north of its line. */
export const DIGIT = { width: 2, height: 2.4, gap: 0.1, offset: 1.7 }

const box = (x, z, hx, hz) => ({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz })
const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ
/** Things standing on the field that a decal must not run under. */
const STANDING = [
  ...EGG_STANDS.map((s) => box(s.x, s.z, s.big ? 2.3 : 1.8, s.big ? 2.3 : 1.8)),
  box(FREE_REWARD.x, FREE_REWARD.z, 1.6, 1.6),
]

/**
 * Every numbered line's decals: { digit, x, z } for each digit. None: this is a training
 * field, not a football pitch (the lines stay, the numbers went with the football).
 */
export function yardNumbers() {
  return []
}

/** The template's numbering, kept for a venue that wants it back. */
export function footballNumbers() {
  const out = []
  for (let k = 2; ; k += 2) {
    const z = PITCH.north + k * PITCH.yard
    if (z > LOGO.z) break
    const n = Math.min(50, k * 5)
    const z0 = z - DIGIT.offset
    for (const side of [-1, 1]) {
      const cx = side * NUMBER_X
      const half = DIGIT.width + DIGIT.gap / 2
      if (STANDING.some((r) => overlaps(r, box(cx, z0, half, DIGIT.height / 2)))) continue
      out.push({ digit: Math.floor(n / 10), x: cx - (DIGIT.width + DIGIT.gap) / 2, z: z0 })
      out.push({ digit: n % 10, x: cx + (DIGIT.width + DIGIT.gap) / 2, z: z0 })
    }
  }
  return out
}

/**
 * The direction stencils on the turf, white with an arrow: `arrow` is which way it points
 * in the image (its top is north at yaw 0), `yaw` turns it to read from where you'd see it.
 */
export const DIRECTIONS = [
  { text: 'LAUNCH', arrow: 'up', x: 0, z: SPAWN.z - 13, width: 8, yaw: 0 },
  { text: 'PULL-UPS', arrow: 'right', x: 12, z: SPAWN.z + 3, width: 7, yaw: 0 },
  { text: 'ARMS', arrow: 'left', x: -12, z: SPAWN.z - 13, width: 5.5, yaw: 0 },
  { text: 'PETS', arrow: 'left', x: -12, z: SPAWN.z + 5, width: 5.5, yaw: 0 },
]
/** A stencil's height for its width (its atlas cell's shape). */
export const DIRECTION_ASPECT = 0.22

/** The end zones' lettering: [text, centre z, yaw (reads from the field)]. */
export const END_ZONE_TEXT = [
  { text: '+1 ARM LENGTH', z: 30.4, width: 26, yaw: Math.PI },
  // (Its words are the venue's: BACKYARD, or PALM BEACH - sceneStyle VENUES.)
  { text: 'BACKYARD', z: -29.2, width: 20, yaw: 0 },
]

/** Rects the hash marks keep clear of: every decal, a little grown. */
function decalRects() {
  const rects = []
  for (const d of DIRECTIONS) rects.push(box(d.x, d.z, d.width / 2 + 0.3, (d.width * DIRECTION_ASPECT) / 2 + 0.3))
  for (const n of yardNumbers()) rects.push(box(n.x, n.z, DIGIT.width / 2 + 0.3, DIGIT.height / 2 + 0.3))
  return rects
}

const LINE = '#ffffff'

/** A white line from x0 to x1 across the field at z, `width` thick, cut round the logo. */
function addLine(blocks, z, x0, x1, width) {
  const dz = Math.abs(z - LOGO.z)
  if (dz >= LINE_CLEAR) {
    blocks.addOn((x0 + x1) / 2, 0, z, x1 - x0, LINE_TOP, width, LINE, STYLE.SMOOTH)
    return
  }
  const c = Math.sqrt(LINE_CLEAR * LINE_CLEAR - dz * dz)
  if (x0 < LOGO.x - c) blocks.addOn((x0 + LOGO.x - c) / 2, 0, z, LOGO.x - c - x0, LINE_TOP, width, LINE, STYLE.SMOOTH)
  if (x1 > LOGO.x + c) blocks.addOn((LOGO.x + c + x1) / 2, 0, z, x1 - LOGO.x - c, LINE_TOP, width, LINE, STYLE.SMOOTH)
}

/**
 * The field's lines into the world's block set (no draw calls of their own): the goal
 * lines, a yard line every 4 units, hash marks between them (inbounds and by the
 * sidelines), and the running track's lane lines. `hashes` (off on LOW) adds the hash
 * marks.
 */
export function buildPitch(blocks, { hashes = true } = {}) {
  const { half, north, south, yard } = PITCH
  addLine(blocks, north, -half, half, 0.4)
  addLine(blocks, south, -half, half, 0.4)
  for (let z = north + yard; z < south - 0.01; z += yard) addLine(blocks, z, -half, half, 0.25)

  if (hashes) {
    const clear = decalRects()
    for (let z = north; z < south - 0.01; z += yard) {
      for (let k = 1; k < 5; k += 1) {
        const hz = z + (k * yard) / 5
        for (const [x, length] of [
          [-18.2, 0.9],
          [-6, 0.6],
          [6, 0.6],
          [18.2, 0.9],
        ]) {
          if (Math.hypot(x - LOGO.x, hz - LOGO.z) < LINE_CLEAR + 0.5) continue
          const mark = box(x, hz, length / 2, 0.06)
          if (clear.some((r) => overlaps(r, mark))) continue
          blocks.addOn(x, 0, hz, length, LINE_TOP, 0.12, LINE, STYLE.SMOOTH)
        }
      }
    }
  }

  // The running track's lane lines, the whole length of the plaza on both sides.
  const length = PLAZA.maxZ - PLAZA.minZ
  const midZ = (PLAZA.minZ + PLAZA.maxZ) / 2
  for (const x of TRACK.lanes) {
    for (const side of [-1, 1]) blocks.addOn(side * x, 0, midZ, 0.1, LINE_TOP, length, LINE, STYLE.SMOOTH)
  }
}
