import { armBase, armTrail, ARM_STYLES } from './armStyles'

/**
 * Each pair of arms' colours, by arm id (the ids are the template's tire ids, kept for
 * saves; names and stats live in shared/balance.js, and how each pair of arms looks is
 * armStyles.js). Named for the template, so everything that tinted itself by your tire -
 * the flight's trail, the speed lines, the landing's glow, the stands - now takes your
 * arms' colours. `glow` is the trail colour; `rim` is the arms' base colour.
 */
export const TIRE_STYLES = ARM_STYLES

export const tireRim = (id) => armBase(id)
export const tireGlow = (id) => armTrail(id)
