import { Color } from 'three'

import { BUBBLE_STYLES, bubbleStyle } from './bubbles'

/**
 * Each bubble's colours, by bubble id (the ids are shared/balance.js TIRES - the
 * template's "tires" are bubbles; how each one looks is bubbles.js). Named for the
 * template, so everything that tinted itself by your tire - the bounce's trail, the
 * speed lines, the landing's glow, the shop stands - takes your bubble's colours.
 * `tireGlow` is the trail colour; `tireRim` is the bubble's body colour. Both are cached
 * Colors: safe to read every frame.
 */
export const TIRE_STYLES = BUBBLE_STYLES

const parsed = new Map()
function colorOf(hex) {
  let c = parsed.get(hex)
  if (!c) {
    c = new Color(hex)
    parsed.set(hex, c)
  }
  return c
}

export const tireRim = (id) => colorOf(bubbleStyle(id).a)
export const tireGlow = (id) => colorOf(bubbleStyle(id).trail)
