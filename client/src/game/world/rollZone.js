import { CylinderGeometry, SphereGeometry } from 'three'

import { LAUNCH_POSTS, LAUNCH_STAND, MAX_PULL, ROLL_ARCH, ROLL_ZONE, STRETCH_LANE } from '@shared/world'

import { STYLE } from '../materials'
import { GRIP } from '../playerPose'
import { venueOf } from '../sceneStyle'

/** The LAUNCH PAD strip: the one gameplay yellow, the same in every world. */
const STRIP = '#ffd21f'
const WOOD = '#a8693a'
const RUBBER = '#ff5fa8'

const DISC = new CylinderGeometry(1, 1, 1, 28)
const BALL = new SphereGeometry(1, 16, 12)

/** Height of the arch's beam, and the sign hung on its face. */
const ARCH_TOP = 11
export const ARCH_SIGN = { width: 12, height: 3, y: ARCH_TOP - 1.6, faceZ: ROLL_ARCH.z + 1.05 }

/** A lightning bolt in three slanted bars, on the arch's face at (x, y). */
function addBolt(blocks, x, y, z, flip, color) {
  blocks.add(x + 0.35 * flip, y + 0.75, z, 0.7, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0.9 * flip)
  blocks.add(x, y, z, 1.4, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0)
  blocks.add(x - 0.35 * flip, y - 0.75, z, 0.7, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0.9 * flip)
}

/**
 * The start of the runway: the yellow LAUNCH PAD across its mouth (painted with its name,
 * see signs.js) with navy chevrons pointing down the runway, a glowing pad at each end,
 * and a big yellow-and-navy start arch over it with a STRETCH & FLY sign between lightning
 * bolts, crowned by a giant slingshot - in the venue's colours (turquoise and teal with
 * coral at Palm Beach); the strip itself is the same yellow everywhere. In the middle of
 * the pad stand the two launch posts you grab (LAUNCH_POSTS), a glowing ring on the spot
 * behind them where you hold on, and rainbow chevrons pointing back the way you walk to
 * stretch.
 *
 * Boxes go into the world's block set and the round parts into its props, so the whole
 * thing rides in those two draw calls. `detail` (off on LOW) adds the bulbs.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on (flush faces flicker, worst on phones' coarser depth buffers).
 */
export function buildRollZone(blocks, props, { detail = true, world = 0 } = {}) {
  const c = venueOf(world).arch
  const { minX, maxX, minZ, maxZ } = ROLL_ZONE
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const w = maxX - minX
  const d = maxZ - minZ

  // The strip: a navy border with the yellow fill raised on it, running right up to the
  // field's edge.
  blocks.addOn(cx, 0, cz + 0.3, w + 1.2, 0.05, d + 0.6, c.base)
  blocks.addOn(cx, 0.05, cz + 0.3, w, 0.05, d - 0.2, STRIP)
  // Chevrons on the strip, pointing down the runway.
  for (const x of [-9, 9]) {
    for (const side of [-1, 1]) {
      blocks.add(x + side * 0.7, 0.12, cz, 2.2, 0.04, 0.6, c.base, STYLE.SMOOTH, side * 0.75)
    }
  }
  // Glowing pads at both ends.
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 2.2)
    props.add(DISC, { position: [x, 0.08, cz + 0.3], scale: [2, 0.12, 2.6], color: '#ffffff' })
    props.add(DISC, { position: [x, 0.15, cz + 0.3], scale: [1.6, 0.06, 2.2], color: STRIP, style: STYLE.GLOW })
  }

  // The launch posts: a chunky wooden post either side of the runway's middle on a navy
  // foot, banded in gold, topped with a glowing grip at hand height.
  for (const side of [-1, 1]) {
    const x = LAUNCH_POSTS.x + side * LAUNCH_POSTS.halfGap
    const z = LAUNCH_POSTS.z
    blocks.addOn(x, 0.1, z, 0.8, 0.22, 0.8, c.base, STYLE.SMOOTH)
    blocks.addOn(x, 0.32, z, 0.36, GRIP.y - 0.5, 0.36, WOOD, STYLE.STUDS)
    for (const y of [0.6, 1.05]) blocks.addOn(x, y, z, 0.42, 0.08, 0.42, c.crest, STYLE.GLOW)
    blocks.addOn(x, GRIP.y - 0.18, z, 0.46, 0.2, 0.46, '#ffffff', STYLE.SMOOTH)
    props.add(BALL, { position: [x, GRIP.y + 0.06, z], scale: [0.26, 0.2, 0.26], color: RUBBER, style: STYLE.GLOW })
  }
  // Where you stand to grab them.
  props.add(DISC, { position: [LAUNCH_STAND.x, 0.13, LAUNCH_STAND.z], scale: [0.95, 0.04, 0.95], color: '#ffffff' })
  props.add(DISC, { position: [LAUNCH_STAND.x, 0.17, LAUNCH_STAND.z], scale: [0.75, 0.04, 0.75], color: RUBBER, style: STYLE.GLOW })
  // The STRETCH LANE: a pink rubber strip on white rails running MAX_PULL (40 m) back
  // from the stand, rainbow chevrons pointing the way you walk, a white tick every 5 m
  // (the numbers are painted beside them: signs.js) and a glowing post at the far end.
  // Its top (0.125) clears the pad's yellow (0.10) it starts on.
  const laneX = LAUNCH_STAND.x
  const laneStart = LAUNCH_STAND.z + 0.9
  const laneEnd = STRETCH_LANE.maxZ
  const laneMid = (laneStart + laneEnd) / 2
  const laneLen = laneEnd - laneStart
  blocks.addOn(laneX, 0, laneMid, 5.2, 0.11, laneLen + 0.4, '#ffffff', STYLE.SMOOTH)
  blocks.addOn(laneX, 0, laneMid, 4.4, 0.125, laneLen, RUBBER, STYLE.PLATE)
  const CHEVRONS = ['#ff4a4a', '#ff9a1e', '#ffe23a', '#4be05a', '#2fd0ff', '#b05cff']
  for (let i = 0, z = LAUNCH_STAND.z + 2.5; z < LAUNCH_STAND.z + MAX_PULL; i += 1, z += 2.5) {
    if (i % 2 === 1) continue
    const color = CHEVRONS[(i / 2) % CHEVRONS.length]
    for (const side of [-1, 1]) {
      blocks.add(laneX + side * 0.5, 0.15, z + 1.05, 1.3, 0.06, 0.3, color, STYLE.GLOW, side * 0.75)
    }
  }
  for (let m = 5; m <= MAX_PULL; m += 5) {
    blocks.add(laneX, 0.145, LAUNCH_STAND.z + m, 4.4, 0.05, 0.3, '#ffffff', STYLE.GLOW)
  }
  for (const side of [-1, 1]) {
    blocks.addOn(laneX + side * 2.9, 0, laneEnd, 0.5, 1.6, 0.5, '#ffffff', STYLE.STRIPES)
    props.add(BALL, { position: [laneX + side * 2.9, 1.9, laneEnd], scale: [0.45, 0.45, 0.45], color: CHEVRONS[5], style: STYLE.GLOW })
  }

  // The start arch: striped pillars either side, a beam across the top carrying the
  // sign and a gold crest, and a glowing orb on each pillar.
  const archZ = ROLL_ARCH.z
  const span = ROLL_ARCH.x * 2
  for (const side of [-1, 1]) {
    const x = side * ROLL_ARCH.x
    blocks.addOn(x, 0, archZ, 2.2, 0.8, 2.2, c.base)
    blocks.addOn(x, 0.8, archZ, 1.6, ARCH_TOP - 0.8, 1.6, c.pillar, STYLE.STRIPES)
    blocks.addOn(x, ARCH_TOP + 1.3, archZ, 2.1, 2.1, 2.1, c.crest, STYLE.GLOW)
    if (detail) {
      for (let y = 1.8; y < ARCH_TOP - 0.6; y += 1.1) {
        blocks.add(x, y, archZ + 0.88, 0.3, 0.3, 0.16, Math.round(y) % 2 ? '#ffffff' : c.base, STYLE.GLOW)
      }
    }
  }
  blocks.addOn(0, ARCH_TOP - 0.2, archZ, span + 1, 1.5, 1.3, c.pillar, STYLE.STRIPES)
  blocks.addOn(0, ARCH_TOP - 0.45, archZ, span - 1.4, 0.25, 1.4, c.glow, STYLE.GLOW)
  blocks.addOn(0, ARCH_TOP + 1.3, archZ, span - 4, 0.3, 1, c.base, STYLE.SMOOTH)
  // The sign: a gold-framed navy panel, lettering painted on (signs.js), a lightning bolt
  // either side.
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2 - 0.15, archZ + 0.75, ARCH_SIGN.width + 0.6, ARCH_SIGN.height + 0.3, 0.3, c.crest)
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2, archZ + 0.8, ARCH_SIGN.width, ARCH_SIGN.height, 0.3, c.base, STYLE.SMOOTH)
  for (const side of [-1, 1]) addBolt(blocks, side * (ARCH_SIGN.width / 2 + 2.1), ARCH_SIGN.y - ARCH_SIGN.height / 2, archZ + 0.78, side, c.crest)
  if (detail) {
    for (let x = -ROLL_ARCH.x + 1.5; x <= ROLL_ARCH.x - 1.49; x += 1) {
      if (Math.abs(x) < ARCH_SIGN.width / 2 + 0.7) continue
      blocks.add(x, ARCH_TOP + 0.95, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? c.crest : '#ffffff', STYLE.GLOW)
      blocks.add(x + 0.5, ARCH_TOP + 0.15, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? '#ffffff' : c.crest, STYLE.GLOW)
    }
  }

  // The crown: a giant wooden slingshot standing on the beam - a handle, two prongs
  // flaring out - with a pink rubber band stretched between the prongs, pulled back
  // towards the plaza, and a gold ring glowing behind it.
  const baseY = ARCH_TOP + 1.4
  blocks.addOn(0, baseY, archZ, 1.2, 2.2, 1.2, WOOD, STYLE.SMOOTH)
  for (const side of [-1, 1]) {
    blocks.add(side * 1.15, baseY + 3.3, archZ, 0.95, 2.8, 0.95, WOOD, STYLE.SMOOTH, 0, 0, -side * 0.5)
    blocks.add(side * 1.85, baseY + 5.2, archZ, 0.85, 1.4, 0.85, WOOD, STYLE.SMOOTH, 0, 0, -side * 0.15)
    blocks.addOn(side * 1.95, baseY + 5.9, archZ, 1.05, 0.25, 1.05, c.crest, STYLE.GLOW)
    // The band, from each prong's tip back to the pouch.
    blocks.add(side * 0.975, baseY + 5.5, archZ + 1.1, 0.24, 0.24, 2.94, RUBBER, STYLE.GLOW, -side * 0.725)
  }
  props.add(BALL, { position: [0, baseY + 5.5, archZ + 2.2], scale: [0.7, 0.55, 0.45], color: RUBBER, style: STYLE.GLOW })
  props.add(DISC, { position: [0, baseY + 4.2, archZ - 1.2], rotation: [Math.PI / 2, 0, 0], scale: [4.6, 0.3, 4.6], color: c.crest, style: STYLE.GLOW })
}
