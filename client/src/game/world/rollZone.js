import { CylinderGeometry, SphereGeometry, TorusGeometry } from 'three'

import { ROLL_ARCH, ROLL_ZONE } from '@shared/world'

import { STYLE } from '../materials'
import { venueOf } from '../sceneStyle'

/** The BLOW ZONE strip: the one gameplay yellow, the same in every world. */
const STRIP = '#ffd21f'
const PINK = '#ff5fa8'
const SOAP = '#9fe8ff'

const DISC = new CylinderGeometry(1, 1, 1, 28)
const BALL = new SphereGeometry(1, 12, 8)
const HOOP = new TorusGeometry(1, 0.09, 8, 34)
const RING = new TorusGeometry(1, 0.08, 4, 28)

/** Height of the arch's beam, and the sign hung on its face. */
const ARCH_TOP = 11
export const ARCH_SIGN = { width: 12, height: 3, y: ARCH_TOP - 1.6, faceZ: ROLL_ARCH.z + 1.05 }
/** The giant wand crowning the arch: its hoop's centre and radius (AmbientBubbles films it). */
export const ARCH_HOOP = { x: 0, y: ARCH_TOP + 7.6, z: ROLL_ARCH.z, r: 4.2 }
/** Glowing spots on the strip: stand on one (or anywhere on the strip) and hold BLOW. */
export const BLOW_SPOTS = [-7, 0, 7].map((x) => ({ x, z: -27 }))

/**
 * The mouth of the bounce valley: the yellow BLOW ZONE across it (painted with its name,
 * see signs.js) with navy chevrons pointing down the valley, three glowing blow spots and
 * a glowing pad at each end, and a big start arch over it with a BLOW & BOUNCE sign -
 * in the venue's colours (turquoise and teal with coral at Coral Coast); the strip itself
 * is the same yellow everywhere. Crowning the arch, a giant bubble wand: a candy-pink
 * handle and a huge glowing hoop with a soap film across it (AmbientBubbles), bubbles
 * rising out of it.
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
  // valley's edge.
  blocks.addOn(cx, 0, cz + 0.3, w + 1.2, 0.05, d + 0.6, c.base)
  blocks.addOn(cx, 0.05, cz + 0.3, w, 0.05, d - 0.2, STRIP)
  // Chevrons on the strip, pointing down the valley.
  for (const x of [-11, 11]) {
    for (let k = 0; k < 3; k += 1) {
      for (const side of [-1, 1]) {
        blocks.add(x + side * 0.7, 0.12, cz + 5 - k * 5, 2.2, 0.04, 0.6, c.base, STYLE.SMOOTH, side * 0.75)
      }
    }
  }
  // The blow spots: a white disc, a glowing soap-blue one on it, a pink ring round them.
  for (const spot of BLOW_SPOTS) {
    props.add(DISC, { position: [spot.x, 0.13, spot.z], scale: [1.5, 0.04, 1.5], color: '#ffffff' })
    props.add(DISC, { position: [spot.x, 0.17, spot.z], scale: [1.2, 0.04, 1.2], color: SOAP, style: STYLE.GLOW })
    props.add(RING, { position: [spot.x, 0.2, spot.z], rotation: [Math.PI / 2, 0, 0], scale: [1.35, 1.35, 1], color: PINK, style: STYLE.GLOW })
  }
  // Glowing pads at both ends.
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 2.2)
    props.add(DISC, { position: [x, 0.08, cz + 0.3], scale: [2, 0.12, 2.6], color: '#ffffff' })
    props.add(DISC, { position: [x, 0.15, cz + 0.3], scale: [1.6, 0.06, 2.2], color: STRIP, style: STYLE.GLOW })
  }

  // The start arch: striped pillars either side, a beam across the top carrying the
  // sign and a gold crest, and a glowing orb on each pillar.
  const archZ = ROLL_ARCH.z
  const span = ROLL_ARCH.x * 2
  for (const side of [-1, 1]) {
    const x = side * ROLL_ARCH.x
    blocks.addOn(x, 0, archZ, 2.2, 0.8, 2.2, c.base)
    blocks.addOn(x, 0.8, archZ, 1.6, ARCH_TOP - 0.8, 1.6, c.pillar, STYLE.STRIPES)
    props.add(BALL, { position: [x, ARCH_TOP + 1.4, archZ], scale: [1.25, 1.25, 1.25], color: SOAP, style: STYLE.GLOW })
    if (detail) {
      for (let y = 1.8; y < ARCH_TOP - 0.6; y += 1.1) {
        blocks.add(x, y, archZ + 0.88, 0.3, 0.3, 0.16, Math.round(y) % 2 ? '#ffffff' : c.base, STYLE.GLOW)
      }
    }
  }
  blocks.addOn(0, ARCH_TOP - 0.2, archZ, span + 1, 1.5, 1.3, c.pillar, STYLE.STRIPES)
  blocks.addOn(0, ARCH_TOP - 0.45, archZ, span - 1.4, 0.25, 1.4, c.glow, STYLE.GLOW)
  blocks.addOn(0, ARCH_TOP + 1.3, archZ, span - 4, 0.3, 1, c.base, STYLE.SMOOTH)
  // The sign: a gold-framed navy panel, lettering painted on (signs.js), a bubble either side.
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2 - 0.15, archZ + 0.75, ARCH_SIGN.width + 0.6, ARCH_SIGN.height + 0.3, 0.3, c.crest)
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2, archZ + 0.8, ARCH_SIGN.width, ARCH_SIGN.height, 0.3, c.base, STYLE.SMOOTH)
  for (const side of [-1, 1]) {
    props.add(BALL, { position: [side * (ARCH_SIGN.width / 2 + 1.9), ARCH_SIGN.y, archZ + 0.9], scale: [0.95, 0.95, 0.5], color: SOAP, style: STYLE.GLOW })
    props.add(BALL, { position: [side * (ARCH_SIGN.width / 2 + 2.6), ARCH_SIGN.y + 1.1, archZ + 0.9], scale: [0.45, 0.45, 0.3], color: '#ffffff', style: STYLE.GLOW })
  }
  if (detail) {
    for (let x = -ROLL_ARCH.x + 1.5; x <= ROLL_ARCH.x - 1.49; x += 1) {
      if (Math.abs(x) < ARCH_SIGN.width / 2 + 0.7) continue
      blocks.add(x, ARCH_TOP + 0.95, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? c.crest : '#ffffff', STYLE.GLOW)
      blocks.add(x + 0.5, ARCH_TOP + 0.15, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? '#ffffff' : c.crest, STYLE.GLOW)
    }
  }

  // The crown: a giant bubble wand standing on the beam - a candy-striped handle with a
  // gold grip, and a huge glowing hoop facing the plaza, a second ring set inside it.
  const baseY = ARCH_TOP + 1.45
  const { y: hy, r } = ARCH_HOOP
  blocks.addOn(0, baseY, archZ, 1.6, 0.5, 1.6, c.crest, STYLE.GLOW)
  blocks.addOn(0, baseY + 0.5, archZ, 0.7, 1.2, 0.7, '#ffd21f', STYLE.SMOOTH)
  blocks.addOn(0, baseY + 1.7, archZ, 0.5, hy - r - baseY - 1.7, 0.5, PINK, STYLE.STRIPES)
  props.add(HOOP, { position: [0, hy, archZ], scale: [r, r, r * 1.4], color: PINK, style: STYLE.GLOW })
  props.add(RING, { position: [0, hy, archZ + 0.1], scale: [r - 0.3, r - 0.3, 1], color: '#ffffff', style: STYLE.GLOW })
}
