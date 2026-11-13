import { Color } from 'three'

import { zoneIndexAt } from '@shared/logic'

import { perWorld, skyLook } from '../worldLook'
import { SCENE_LOOKS } from './scenery'
import { ZONE_THEMES } from './themes'

/**
 * Every stage's own colours, so each one looks clearly different from the last as you
 * bounce into it: the valley floor in a bright checker of the stage's hue, the strip
 * beside it and the ground beyond tinted towards it (the scenery - houses, towers, palms -
 * keeps its own colours, so a town still reads as a town), the stage's start line, banner
 * arch and name-board frame in its accent, its name on the HUD in a gradient of it, and
 * its sky's horizon washed with it.
 *
 * Hues step round the colour wheel by the golden angle, so neighbouring stages never
 * share one (and World 2 starts further round). Built once per world, as Colors and CSS
 * strings: free to read every frame.
 */
const GOLDEN = 137.508
/** How strongly the stage's hue washes the strip beside the floor, the ground and the sky. */
const TURF_TINT = 0.24
const GROUND_TINT = 0.14
const SKY_TINT = 0.2

function makeLook(zone, index, world) {
  const hue = (((index + world * 7) * GOLDEN + 205) % 360) / 360
  const light = new Color().setHSL(hue, 0.74, 0.64)
  const dark = new Color().setHSL(hue, 0.7, 0.53)
  const accent = new Color().setHSL(hue, 0.95, 0.58)
  const deep = new Color().setHSL(hue, 0.85, 0.4)
  const scene = SCENE_LOOKS[zone.scene] ?? SCENE_LOOKS.meadow
  const theme = ZONE_THEMES[zone.theme] ?? ZONE_THEMES.grassy
  const sky = { ...theme.sky, horizon: `#${new Color(theme.sky.horizon).lerp(light, SKY_TINT).getHexString()}` }
  return {
    runway: [light, dark],
    turf: scene.turf.map((c) => new Color(c).lerp(light, TURF_TINT)),
    ground: new Color(scene.ground).lerp(dark, GROUND_TINT),
    accent,
    accentHex: `#${accent.getHexString()}`,
    nameGradient: `linear-gradient(180deg, #ffffff 0%, #${light.getHexString()} 45%, #${deep.getHexString()} 100%)`,
    sky: skyLook(sky),
  }
}

/** The current world's stage looks, by stage index. */
export const stageLooks = perWorld((zones, world) => zones.map((zone, i) => makeLook(zone, i, world)))

/** The look of the stage at metre `meter` down the valley. */
export const stageLookAt = (meter) => stageLooks()[zoneIndexAt(meter)]
