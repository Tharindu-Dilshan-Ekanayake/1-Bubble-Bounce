/**
 * The player's body language, shared by the Bloxity avatar and the blocky stand-in so
 * both move the same way.
 *
 * `computePose` turns the motion state into joint angles; each avatar applies them to its
 * own limbs. Angles are radians in character space (the character faces +Z, its left
 * side is +X), about each joint's pivot:
 *   swing - about X: negative swings a hanging limb forward (arm up in front, knee up);
 *           on the spine and neck, which point up, negative bends them back
 *   sway  - about Z: positive moves a limb towards +X
 *   twist - about Y: positive turns the right shoulder forward
 * `lift` raises (or, to keep bent legs on the ground, lowers) the body, in metres.
 * `stretchL` / `stretchR` are how long each arm is against its rest length: always 1 in
 * this game (the avatar's own arms and hands, as the SDK made them).
 */

export const POSED_BONES = [
  'Spine1',
  'Neck1',
  'ArmL1',
  'ArmL2',
  'ArmR1',
  'ArmR2',
  'LegL1',
  'LegL2',
  'LegR1',
  'LegR2',
]

/** Written by `computePose` every frame; one shared result, never reallocated. */
export const pose = {
  lift: 0,
  stretchL: 1,
  stretchR: 1,
  bones: Object.fromEntries(POSED_BONES.map((name) => [name, { swing: 0, sway: 0, twist: 0 }])),
}

/**
 * The 1.8 m character's measurements: shoulder height and how far out from the middle,
 * arm length (shoulder to palm), and the pivot the body turns about (its middle).
 * Measured on Bloxity's player.glb fitted to 1.8 m.
 */
export const BODY = { shoulderY: 1.35, shoulderX: 0.56, arm: 0.63, pivot: 0.9 }

/**
 * The bubble wand held in the right hand (Wand.jsx): its stick's length from the fist and
 * its ring's radius, metres. In the hand's rest frame (arm hanging, facing +Z) the stick
 * points forward (+Z), so with the arm raised to blow it points up in front of the face
 * and the ring faces the mouth.
 */
export const WAND = { stick: 0.4, ring: 0.16 }
/** The wand ring's centre in the wand's own frame: where blown bubbles come out. */
export const WAND_RING = Object.freeze({ x: 0, y: 0, z: WAND.stick + WAND.ring })

/** Sway sign that moves a limb away from the body, per side. */
const OUT_L = 1
const OUT_R = -1

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Adds to a joint, scaled by weight `w`. */
function add(name, swing, sway, twist, w) {
  const b = pose.bones[name]
  b.swing += swing * w
  b.sway += sway * w
  b.twist += twist * w
}

/** Relaxed stance: knees soft, breathing, arms hanging easy at the sides. */
function stance(w, time) {
  const breath = Math.sin(time * 1.8)
  add('LegL1', -0.04, 0.06 * OUT_L, 0, w)
  add('LegL2', 0.08, 0, 0, w)
  add('LegR1', 0.04, 0.06 * OUT_R, 0, w)
  add('LegR2', 0.08, 0, 0, w)
  add('ArmL1', 0.04 + breath * 0.02, 0.1 * OUT_L, 0, w)
  add('ArmR1', 0.04 + breath * 0.02, 0.1 * OUT_R, 0, w)
  add('ArmL2', -0.12, 0, 0, w)
  add('ArmR2', -0.12, 0, 0, w)
  add('Spine1', 0.02 + breath * 0.015, 0, 0, w)
  pose.lift += (-0.01 + breath * 0.006) * w
}

/**
 * Walk to sprint: the legs swing, the arms swing against them and the body bobs once per
 * step. `phase` advances faster with speed, so the steps quicken.
 */
function stride(phase, ratio) {
  const cycle = Math.sin(phase)
  const leg = 0.85 * ratio
  add('LegL1', cycle * leg, 0, 0, 1)
  add('LegR1', -cycle * leg, 0, 0, 1)
  // Knees fold on the back swing only.
  add('LegL2', Math.max(0, -cycle) * 1.1 * ratio, 0, 0, 1)
  add('LegR2', Math.max(0, cycle) * 1.1 * ratio, 0, 0, 1)
  add('ArmL1', -cycle * 0.75 * ratio, 0.08 * OUT_L * ratio, 0, 1)
  add('ArmR1', cycle * 0.75 * ratio, 0.08 * OUT_R * ratio, 0, 1)
  add('ArmL2', -0.35 * ratio, 0, 0, 1)
  add('ArmR2', -0.35 * ratio, 0, 0, 1)
  add('Spine1', (0.06 + 0.1 * ratio) * ratio, 0, cycle * 0.12 * ratio, 1)
  pose.lift += (Math.abs(Math.cos(phase)) * 0.05 - 0.015) * ratio
}

/** In the air: one knee up on the way up; falling, the legs reach down and the arms fling up. */
function airborne(vy) {
  const f = smooth(0, 1, clamp01((2 - vy) / 9))
  add('LegL1', lerp(-1.3, -0.35, f), 0.08 * OUT_L, 0, 1)
  add('LegL2', lerp(1.6, 0.25, f), 0, 0, 1)
  add('LegR1', lerp(0.25, -0.1, f), 0.08 * OUT_R, 0, 1)
  add('LegR2', lerp(0.5, 0.2, f), 0, 0, 1)
  add('ArmL1', lerp(-0.6, -2.2, f), 0.5 * OUT_L, 0, 1)
  add('ArmR1', lerp(-0.6, -2.2, f), 0.5 * OUT_R, 0, 1)
  add('Spine1', lerp(0.15, -0.06, f), 0, 0, 1)
}

/**
 * The wand arm: the right arm raised in front, the wand's ring in front of the mouth;
 * `reach` (0-1) holds it further out, `pump` (0-1) is a puff of breath bringing it in a
 * touch. The left hand rests on the hip.
 */
function wandArms(reach, pump, w) {
  add('ArmR1', -1.15 - 0.25 * reach + 0.1 * pump, 0.32, 0.15, w)
  add('ArmR2', -0.35 + 0.25 * reach, 0, 0, w)
  add('ArmL1', 0.1, 0.42 * OUT_L, -0.1, w)
  add('ArmL2', -1.2, 0, 0, w)
}

/**
 * Blowing bubbles on a Blow Pad (`phase` advances one puff every TRAIN_INTERVAL): the
 * wand up in front of your face, and with each puff a deep breath in, leaning back, then
 * blowing out through the ring, leaning in.
 */
function blowing(phase, w) {
  const c = 0.5 - 0.5 * Math.cos(phase)
  const out = Math.pow(c, 0.7)
  wandArms(0, out, w)
  add('Spine1', -0.08 + 0.16 * out, 0, 0, w)
  add('Neck1', 0.1 * out - 0.05, 0, 0, w)
  add('LegL1', -0.05, 0.08 * OUT_L, 0, w)
  add('LegR1', 0.08, 0.08 * OUT_R, 0, w)
  add('LegL2', 0.1, 0, 0, w)
  add('LegR2', 0.12, 0, 0, w)
  pose.lift += -0.01 * w
}

/**
 * Blowing the giant bubble in the Blow Zone (`charge` 0-1, the meter): the wand held out,
 * leaning back as the bubble swells in front of you, legs braced, puffing harder and
 * faster - and wobbling with it once it's full size.
 */
function charging(charge, time, w) {
  const puff = Math.sin(time * (9 + 6 * charge)) * 0.5 + 0.5
  wandArms(0.6 + 0.4 * charge, puff * 0.5, w)
  add('Spine1', -(0.06 + 0.22 * charge) + puff * 0.04, 0, 0, w)
  add('Neck1', 0.12 * charge, 0, 0, w)
  add('LegL1', -0.4 - 0.1 * charge, 0.1 * OUT_L, 0, w)
  add('LegL2', 0.3, 0, 0, w)
  add('LegR1', 0.35 + 0.1 * charge, 0.1 * OUT_R, 0, w)
  add('LegR2', 0.25, 0, 0, w)
  pose.lift -= (0.04 + 0.05 * charge) * w
}

/** Hopping into the bubble: knees tucked up, arms reaching forward for it. */
function hopping(w) {
  add('LegL1', -1.4, 0.1 * OUT_L, 0, w)
  add('LegL2', 1.9, 0, 0, w)
  add('LegR1', -1.2, 0.1 * OUT_R, 0, w)
  add('LegR2', 1.7, 0, 0, w)
  add('ArmL1', -1.9, 0.25 * OUT_L, 0, w)
  add('ArmR1', -1.9, 0.25 * OUT_R, 0, w)
  add('Spine1', 0.25, 0, 0, w)
  add('Neck1', -0.3, 0, 0, w)
}

/**
 * Landed on top of the bubble: knees bent to soak up the bounce, arms flung out to the
 * sides for balance, wobbling.
 */
function perching(time, w) {
  const wobble = Math.sin(time * 11) * 0.18
  add('ArmL1', -0.3 + wobble, 1.35 * OUT_L, 0, w)
  add('ArmR1', -0.3 - wobble, 1.35 * OUT_R, 0, w)
  add('ArmL2', -0.2, 0, 0, w)
  add('ArmR2', -0.2, 0, 0, w)
  add('LegL1', -0.55, 0.12 * OUT_L, 0, w)
  add('LegR1', -0.55, 0.12 * OUT_R, 0, w)
  add('LegL2', 0.95, 0, 0, w)
  add('LegR2', 0.95, 0, 0, w)
  add('Spine1', 0.25, 0, wobble * 0.3, w)
  add('Neck1', -0.2, 0, 0, w)
  pose.lift -= 0.22 * w
}

/** Sinking down into the bubble: arms straight up over your head, legs together. */
function sinking(time, w) {
  const wiggle = Math.sin(time * 16) * 0.12
  add('ArmL1', -2.95 + wiggle, 0.12 * OUT_L, 0, w)
  add('ArmR1', -2.95 - wiggle, 0.12 * OUT_R, 0, w)
  add('LegL1', 0.05 + wiggle * 0.5, 0, 0, w)
  add('LegR1', 0.05 - wiggle * 0.5, 0, 0, w)
  add('Spine1', -0.05, 0, 0, w)
  add('Neck1', -0.35, 0, 0, w)
}

/**
 * Floating inside the bubble, starfish style: arms out and up, legs apart and bent,
 * head up to see where you're bouncing - waving, kicking a little, loving it.
 */
function floating(time, w) {
  const wave = Math.sin(time * 3.2) * 0.25
  const kick = Math.sin(time * 4.1) * 0.15
  add('ArmL1', -2.1 + wave, 0.95 * OUT_L, 0, w)
  add('ArmR1', -2.1 - wave, 0.95 * OUT_R, 0, w)
  add('ArmL2', -0.3, 0, 0, w)
  add('ArmR2', -0.3, 0, 0, w)
  add('LegL1', -0.35 + kick, 0.4 * OUT_L, 0, w)
  add('LegR1', -0.35 - kick, 0.4 * OUT_R, 0, w)
  add('LegL2', 0.7, 0, 0, w)
  add('LegR2', 0.7, 0, 0, w)
  add('Spine1', -0.1, 0, 0, w)
  add('Neck1', -0.45, 0, 0, w)
}

/** Arms up and waving, bouncing on the spot: the celebration once the bubble's popped. */
function cheering(time, w) {
  const wave = Math.sin(time * 10) * 0.28
  add('ArmL1', -2.7 + wave, 0.38 * OUT_L, 0, w)
  add('ArmR1', -2.7 - wave, 0.38 * OUT_R, 0, w)
  add('ArmL2', -0.25, 0, 0, w)
  add('ArmR2', -0.25, 0, 0, w)
  add('LegL1', -0.12, 0.06 * OUT_L, 0, w)
  add('LegR1', -0.12, 0.06 * OUT_R, 0, w)
  add('LegL2', 0.22, 0, 0, w)
  add('LegR2', 0.22, 0, 0, w)
  add('Spine1', -0.1, 0, 0, w)
  add('Neck1', -0.15, 0, 0, w)
  pose.lift += Math.abs(Math.sin(time * 7)) * 0.16 * w
}

/**
 * @param {{ time?: number, speed?: number, maxSpeed?: number, grounded?: boolean,
 *   vy?: number, stride?: number, run?: number, charge?: number, hop?: number,
 *   perch?: number, sink?: number, fly?: number, cheer?: number, emote?: string|null }} motion
 *   `run` (0-1) is blowing bubbles on a Blow Pad (`stride` is the puff's phase); the name
 *   is the template's, and what other players are told ('run').
 *   `charge` is the blow meter while you blow the giant bubble in the Blow Zone (below 0:
 *   not blowing it). `hop` (0-1) is jumping up onto it, `perch` (0-1) balancing on top,
 *   `sink` (0-1) sinking in, `fly` (0-1) floating inside it,
 *   `cheer` (0-1) up and celebrating once it's popped.
 *   `emote` is a Boxity emote id to play over this pose, or null. It isn't posed here:
 *   the Bloxity avatar blends the emote clip on top of this pose (avatarRig.updateEmote),
 *   so the same motion object drives both. `emoteFromAnim(r.anim)` in bloxity/emotes.js
 *   turns another player's synced anim ('emote:<id>') into this field.
 */
export function computePose(motion) {
  const {
    time = 0,
    speed = 0,
    maxSpeed = 6,
    grounded = true,
    vy = 0,
    stride: phase = time * 5,
    run = 0,
    charge = -1,
    hop = 0,
    perch = 0,
    sink = 0,
    fly = 0,
    cheer = 0,
  } = motion
  for (const name of POSED_BONES) {
    const b = pose.bones[name]
    b.swing = 0
    b.sway = 0
    b.twist = 0
  }
  pose.lift = 0
  pose.stretchL = 1
  pose.stretchR = 1

  // A bounce: jumping up onto the bubble, balancing on it, sinking in, floating inside,
  // popped out and cheering.
  if (hop > 0 || perch > 0 || sink > 0 || fly > 0 || cheer > 0) {
    if (hop > 0) hopping(hop)
    if (perch > 0) perching(time, perch)
    if (sink > 0) sinking(time, sink)
    if (fly > 0) floating(time, fly)
    if (cheer > 0) cheering(time, cheer)
    const rest = clamp01(1 - hop - perch - sink - fly - cheer)
    if (rest > 0) stance(rest, time)
    return pose
  }
  if (charge >= 0) {
    charging(charge, time, 1)
    return pose
  }
  if (run > 0 && grounded) {
    blowing(phase, clamp01(run))
    return pose
  }
  const ratio = grounded ? clamp01(speed / Math.max(maxSpeed, 0.001)) : 0
  if (grounded) {
    const still = 1 - smooth(0.05, 0.4, ratio)
    stance(still, time)
    if (ratio > 0.02) stride(phase, ratio)
  } else {
    airborne(vy)
  }
  return pose
}

/** Whether a motion state holds the wand up: blowing on a pad or blowing the big bubble. */
export const holdsWand = (motion) => (motion.run > 0 && motion.grounded !== false) || motion.charge >= 0
