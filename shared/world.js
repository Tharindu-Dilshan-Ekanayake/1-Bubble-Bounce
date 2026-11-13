/**
 * Lobby layout: every gameplay-relevant position and trigger area.
 *
 * Shared by the client (which renders it) and the server (which validates positions
 * against it), so the two can never disagree about where a pad or the roll zone is.
 *
 * Units are roughly metres in the lobby (the avatar is 1.8 tall) and down the bounce valley. +X is east, -Z is north, which is
 * "forward" from spawn and the way down the track.
 *
 * Seen from spawn: the Blow Zone and the valley beyond it straight ahead (north), the
 * Blow Pads along the right (east) side, the Bubble Shop on the left (west),
 * the eggs in a row back on the left, the Volcano egg front right, the leaderboards
 * behind. Grandstands ring the whole plaza, like a football stadium.
 *
 * Rects are `{ minX, maxX, minZ, maxZ }` on the ground plane.
 */

/**
 * The lobby is a small valley: you spawn at its south end and a path runs north, 90 m,
 * to the yellow BLOW ZONE at the mouth of the bounce valley. The Blow Pads stand close
 * together along the east side (each better than the last as you go north) and the
 * Bubble Shop along the west; the eggs and leaderboards are back by the spawn. Seen from
 * spawn: the path, the Blow Zone's giant wand arch and the valley beyond.
 */
export const SPAWN = { x: 0, z: 50 }

/** The flat, walkable plaza. Hills surround it on every side but the track. */
export const PLAZA = { minX: -48, maxX: 38, minZ: -40, maxZ: 69 }
/** The path down its middle (half its width). */
export const PATH_HALF = 5

// --- The track ----------------------------------------------------------------------

/**
 * The start of the valley: the plaza's north edge, where the bounce valley starts. Track metre
 * m is m yards along the field from here.
 */
export const TRACK_START_Z = PLAZA.minZ
/** How steeply the valley drops away from the start: 0, dead level all the way. */
export const SLOPE_ANGLE = 0
/** Half the width of the canyon floor. */
export const CANYON_HALF_WIDTH = 16

/**
 * The yellow BLOW ZONE (the template's roll zone) at the valley's mouth: bounces go from
 * here. Anywhere on it, hold BLOW to blow your bubble, then let go to hop in.
 */
export const ROLL_ZONE = { minX: -13, maxX: 13, minZ: -40, maxZ: -21 }
/** Where you're put back after a bounce: on the zone, facing the valley, ready to go again. */
export const ROLL_RETURN = { x: 0, z: -27 }

/** The giant wand arch's pillars, either side of the zone. */
export const ROLL_ARCH = { x: 15.5, z: -37 }

/** Walkable ground; the controller clamps the player into it. Nothing past the start. */
export const WALKABLE = [PLAZA]

// --- Training pads ------------------------------------------------------------------

/**
 * Blow Pads line the east side of the plaza, south to north: a round pad to stand on
 * (standing on it is blowing bubbles, facing east through its giant wand hoop) and
 * its console and multiplier backboard just beyond to the east, then a running track.
 */
/** Seven Blow Pads, then Coral Coast's two coral pads at the north end of the row. */
export const PAD_COUNT = 9
export const PAD_PITCH = 7
/** Radius of a pad's top: standing within it is training. */
export const PAD_RADIUS = 2.7
/** The pads' centre line, and their tops, a step up from the plaza. */
export const PAD_X = 24
export const PAD_HEIGHT = 0.5
/** Pad 0 (the free one) is the southernmost, nearest spawn; the rest run north. */
const PAD0_Z = 36

export const padCenterZ = (index) => PAD0_Z - index * PAD_PITCH

/** Each Blow Pad's giant wand hoop is a little bigger than the last (its radius, metres). */
export const padHoopRadius = (index) => 1.15 + 0.12 * Math.max(0, index)

/**
 * Each pad's console area, on the ground east of it: these constants (named for the
 * template's table, kept so the server's colliders and saves don't change) bound the
 * solid block of console, handrails and backboard drawn there. Training, you face it (east)
 * and run.
 */
export const TABLE_LENGTH = 4.2
export const TABLE_WIDTH = 2.4
export const TABLE_HEIGHT = 1.05
/** The solid block's near (west) end, its middle, and its far end beyond the backboard. */
export const TABLE_NEAR_X = PAD_X + PAD_RADIUS + 0.05
export const TABLE_X = TABLE_NEAR_X + TABLE_LENGTH / 2
export const ROBOT_X = TABLE_NEAR_X + TABLE_LENGTH + 0.6
/** Each pad's running track: its floor runs back to a low barrier behind the backboard, this wide either side. */
export const COURT_BACK_X = ROBOT_X + 1.5
export const COURT_HALF = 3.1
/** Facing the pad's hoop: east. (Yaw 0 faces +Z, south.) */
export const PAD_YAW = Math.PI / 2

/** The square round pad `index`: its raised deck (walkable, and a wall while locked). */
export function padRect(index) {
  const cz = padCenterZ(index)
  const r = PAD_RADIUS + 0.3
  return { minX: PAD_X - r, maxX: PAD_X + r, minZ: cz - r, maxZ: cz + r }
}

// --- Ball shop ----------------------------------------------------------------------

/**
 * The Bubble Shop: an open-air yard west of the plaza with two display stages, the
 * first twelve balls on the low front one and the next twelve on the higher back one,
 * and a big BALL SHOP sign behind. Both stages are low enough to walk straight onto.
 */
export const SHOP = { minX: -42, maxX: -16, minZ: -18, maxZ: 36 }
export const SHOP_STAGES = [
  { minX: -28, maxX: -17.5, minZ: -17, maxZ: 35, height: 0.5 },
  { minX: -41, maxX: -30.5, minZ: -17, maxZ: 35, height: 1 },
]
/** The sign along the back (west) edge, facing the plaza, high enough to clear the labels. */
export const SHOP_SIGN = { x: -42.6, minZ: -14, maxZ: 32, top: 16 }
/** Which way the sign faces: +1 east (towards the plaza). */
export const SHOP_SIGN_FACING = 1
export const STAND_SIZE = 4

/** Rows of display stands, nearest the plaza first: two rows on each stage. */
const STAND_ROWS_X = [-20, -25.5, -33, -38.5]
/** Stands per row, and how far apart along it. */
const STANDS_PER_ROW = 6
const STAND_PITCH = 9

/**
 * Twenty-four stands, six to a row. `row` (0-3, front to back) lets the labels above
 * them step up so nearer ones don't hide farther ones.
 */
export const TIRE_STANDS = Array.from({ length: 24 }, (_, i) => {
  const row = Math.floor(i / STANDS_PER_ROW)
  return {
    index: i,
    row,
    x: STAND_ROWS_X[row],
    z: (SHOP.minZ + SHOP.maxZ) / 2 - (STAND_PITCH * (STANDS_PER_ROW - 1)) / 2 + (i % STANDS_PER_ROW) * STAND_PITCH,
    y: SHOP_STAGES[row < 2 ? 0 : 1].height,
  }
})

export const standRect = (stand) => ({
  minX: stand.x - STAND_SIZE / 2,
  maxX: stand.x + STAND_SIZE / 2,
  minZ: stand.z - STAND_SIZE / 2,
  maxZ: stand.z + STAND_SIZE / 2,
})

// --- Eggs, showcases, leaderboards --------------------------------------------------

/**
 * The egg row stands back on the left (south-west), the Sphinx at its end; the big
 * Volcano egg has a spot of its own, front right on the way to the Blow Zone.
 */
export const EGG_STANDS = [
  { eggId: 'basic', x: -10, z: 46 },
  { eggId: 'meadow', x: -18, z: 46 },
  { eggId: 'sunset', x: -26, z: 46 },
  { eggId: 'unicorn', x: -34, z: 46 },
  { eggId: 'volcano', x: 10, z: -14, big: true },
  // Coral Coast's Coral Egg, the Volcano egg's twin across the plaza (hatches in Coral
  // Coast only; in World 1 it stands locked, a taste of what's through the portal).
  { eggId: 'beach', x: -10, z: -14, big: true },
]
export const EGG_TRIGGER_RADIUS = 4.2

/** Limited premium pet on display. */
export const SPHINX_STAND = { x: -43, z: 46 }

/** Four boards along the back of the plaza, as in the reference. */
export const LEADERBOARDS = [
  { id: 'rebirths', x: -18, z: 66.5 },
  { id: 'wins', x: -6, z: 66.5 },
  { id: 'distance', x: 6, z: 66.5 },
  { id: 'playtime', x: 18, z: 66.5 },
]

/** The world portal beside the start arch, to the west. Name and Wins in balance.js. */
export const PORTALS = [{ id: 'world2', x: -28, z: -34, radius: 3.4 }]

export const FREE_REWARD = { x: 12, z: 51, radius: 3 }

/**
 * Coral Coast's Secret Star (balance SECRET_STAR): tucked away behind the middle of the
 * leaderboards at the back of the plaza, where the camera never looks unless you go
 * round. Picked up within `radius`, in Coral Coast only.
 */
export const STAR = { x: -6, z: 68.2, y: 1.4, radius: 1.8 }

// --- Collision ----------------------------------------------------------------------

const box = (x, z, halfX, halfZ) => ({
  minX: x - halfX,
  maxX: x + halfX,
  minZ: z - halfZ,
  maxZ: z + halfZ,
})

/** Solid, never-changing obstacles. Locked pads add their own walls at runtime. */
export const STATIC_COLLIDERS = [
  // The Bubble Shop's sign.
  { minX: SHOP_SIGN.x - 0.5, maxX: SHOP_SIGN.x + 0.5, minZ: SHOP_SIGN.minZ - 0.5, maxZ: SHOP_SIGN.maxZ + 0.5 },
  // Egg pedestals.
  ...EGG_STANDS.map((s) => box(s.x, s.z, s.big ? 2.1 : 1.6, s.big ? 2.1 : 1.6)),
  box(SPHINX_STAND.x, SPHINX_STAND.z, 3, 3),
  ...LEADERBOARDS.map((b) => box(b.x, b.z, 4.6, 0.5)),
  box(FREE_REWARD.x, FREE_REWARD.z, 1.4, 1.4),
  // Each pad's hoop stand and soap tub block, and the low wall across its back.
  ...Array.from({ length: PAD_COUNT }, (_, i) => ({
    minX: TABLE_NEAR_X,
    maxX: ROBOT_X + 0.7,
    minZ: padCenterZ(i) - TABLE_WIDTH / 2,
    maxZ: padCenterZ(i) + TABLE_WIDTH / 2,
  })),
  ...Array.from({ length: PAD_COUNT }, (_, i) => box(COURT_BACK_X, padCenterZ(i), 0.15, COURT_HALF)),
  // Each portal ring's base; the swirl itself is walk-through.
  ...PORTALS.flatMap((p) => [box(p.x - p.radius, p.z, 0.6, 0.8), box(p.x + p.radius, p.z, 0.6, 0.8)]),
  // The wand arch's pillars.
  box(-ROLL_ARCH.x, ROLL_ARCH.z, 1, 1),
  box(ROLL_ARCH.x, ROLL_ARCH.z, 1, 1),
  // The canyon's rims either side of its mouth.
  { minX: PLAZA.minX, maxX: -CANYON_HALF_WIDTH - 1, minZ: PLAZA.minZ - 1, maxZ: PLAZA.minZ + 0.6 },
  { minX: CANYON_HALF_WIDTH + 1, maxX: PLAZA.maxX, minZ: PLAZA.minZ - 1, maxZ: PLAZA.minZ + 0.6 },
]

/** Raised floors the player stands on, as rects with a height. */
export const PLATFORMS = [
  ...SHOP_STAGES.map((s) => ({ ...s })),
  ...Array.from({ length: PAD_COUNT }, (_, i) => ({ ...padRect(i), height: PAD_HEIGHT })),
]

// --- Helpers ------------------------------------------------------------------------

export const inRect = (r, x, z, margin = 0) =>
  x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin

/** Whether (x, z) is on training pad `index`'s top, give or take `margin`. */
export const onPad = (index, x, z, margin = 0) => Math.hypot(x - PAD_X, z - padCenterZ(index)) <= PAD_RADIUS + margin

/** Index of the training pad under (x, z), or -1. */
export function padAt(x, z, margin = 0) {
  for (let i = 0; i < PAD_COUNT; i += 1) {
    if (onPad(i, x, z, margin)) return i
  }
  return -1
}

export const inRollZone = (x, z, margin = 0) => inRect(ROLL_ZONE, x, z, margin)

/** The portal whose swirl (x, z) is in, give or take `margin`, or null. */
export function portalAt(x, z, margin = 0) {
  for (const p of PORTALS) {
    if (Math.hypot(x - p.x, z - p.z) < p.radius + margin) return p
  }
  return null
}

/**
 * Whether a move from `from` to `to` is the hop back after a bounce: off the Blow Zone
 * onto ROLL_RETURN. Faster than walking, so the server's speed check lets exactly this
 * one through.
 */
export const isRollReturn = (from, to) =>
  inRollZone(from.x, from.z, 2) && Math.hypot(to.x - ROLL_RETURN.x, to.z - ROLL_RETURN.z) < 2.5

/** Index of the tire stand under (x, z), or -1. */
export function standAt(x, z) {
  for (const stand of TIRE_STANDS) {
    if (inRect(standRect(stand), x, z)) return stand.index
  }
  return -1
}

/** The egg stand within reach of (x, z), or null. */
export function eggStandNear(x, z) {
  for (const stand of EGG_STANDS) {
    const reach = EGG_TRIGGER_RADIUS + (stand.big ? 1 : 0)
    if (Math.hypot(stand.x - x, stand.z - z) <= reach) return stand
  }
  return null
}

/** Height of the floor at (x, z): raised platforms, else the ground at 0. */
export function groundHeightAt(x, z) {
  let h = 0
  for (const p of PLATFORMS) {
    if (p.height > h && inRect(p, x, z)) h = p.height
  }
  return h
}

/** Clamps (x, z) into the walkable union, returning the nearest walkable point. */
export function clampToWalkable(x, z, out = { x: 0, z: 0 }) {
  let best = Infinity
  for (const r of WALKABLE) {
    const cx = Math.min(r.maxX, Math.max(r.minX, x))
    const cz = Math.min(r.maxZ, Math.max(r.minZ, z))
    const d = (cx - x) ** 2 + (cz - z) ** 2
    if (d < best) {
      best = d
      out.x = cx
      out.z = cz
      if (d === 0) break
    }
  }
  return out
}

/** Fastest a player can legitimately move, for the server's anti-teleport check. */
export const MAX_MOVE_SPEED = 14
