import { TRAIN_INTERVAL } from '@shared/balance'

/**
 * Training bits shared by your character, everyone else's and the sounds. (The file keeps
 * the template's name; the launch itself is roll/path.js and launch.js.)
 */

/**
 * Rep phase speed (radians a second) of pull-ups on a bar: one rep per TRAIN_INTERVAL, so
 * every rep lands a gain.
 */
export const RUN_CADENCE = (Math.PI * 2) / TRAIN_INTERVAL
