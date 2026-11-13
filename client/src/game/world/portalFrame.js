import { PORTALS } from '@shared/world'

import { STYLE } from '../materials'

/** Height of a portal ring's centre (every portal is the same size). */
export const PORTAL_CENTER_Y = PORTALS[0].radius + 0.6

/**
 * How each portal looks: its ring's alternating blocks (a third colour, if given, glows
 * on every fourth block), the slab under it, and its swirl's colours (linear RGB).
 */
export const PORTAL_THEMES = {
  world2: {
    ring: ['#7fd0ff', '#bfeaff'],
    base: '#e6f6ff',
    swirl: { deep: [0.12, 0.45, 0.95], light: [0.75, 0.95, 1.0], core: [0.6, 0.6, 0.6] },
  },
}

/** Each portal's frame: a ring of blocks standing upright, facing the plaza. */
export function buildPortalFrame(blocks) {
  const segments = 20
  for (const portal of PORTALS) {
    const { ring, base } = PORTAL_THEMES[portal.id]
    const r = portal.radius
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2
      const x = portal.x + Math.cos(a) * r
      const y = PORTAL_CENTER_Y + Math.sin(a) * r
      const lit = ring[2] && i % 4 === 1
      // Neighbours overlap round the ring, so every other block is 5 cm thinner each side:
      // their faces never share a plane.
      blocks.add(x, y, portal.z, 1.2, 1.2, i % 2 ? 1.3 : 1.4, lit ? ring[2] : ring[i % 2], lit ? STYLE.GLOW : STYLE.STUDS, 0, 0, a)
    }
    blocks.addOn(portal.x, 0, portal.z, r * 2 + 1.5, 0.5, 2.4, base)
  }
}
