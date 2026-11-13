import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  MeshLambertMaterial,
  NearestFilter,
  Quaternion,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BACK_BONE, HAT_BONE, NECK_OFFSET_BONE, PART_SLOTS, WORN_SLOTS } from '../bloxity/avatarAssets'
import { patchArmMaterial } from './armStyles'
import { computePose, POSED_BONES } from './playerPose'

/**
 * Rig manipulation for the base `player.glb` character.
 *
 * The rig's real structure (confirmed by reading player.glb directly):
 *   character
 *     - default_arm_L / default_arm_R / default_head
 *     - default_leg_L / default_leg_R / default_torso   (6 SkinnedMeshes, 1 skeleton)
 *     - Rig1
 *         - Spine1 > Spine2 > { ArmL_Offset > ArmL1 > ArmL2,
 *                               ArmR_Offset > ArmR1 > ArmR2,
 *                               Neck_Offset > Neck1 }
 *         - LegL_Offset > LegL1 > LegL2, LegR_Offset > LegR1 > LegR2
 *
 * Two consequences drive everything below:
 *  1. Body parts are NOT attached to bones. Each is a separate SkinnedMesh sharing one
 *     skeleton, so equipping a part means swapping that mesh's geometry (remapping
 *     skin indices into the base skeleton's bone order first).
 *  2. Accessories DO attach to bones: hats to `Neck1`, back items to `Spine2`.
 *
 * player.glb ships no animation clips, so the character is posed, not animated.
 */

/** The forearm bone; anything held rides at the hand on its end. */
const HAND_BONE = 'ArmR2'

/**
 * Walks the loaded rig and collects everything later operations need.
 *
 * @param {import('three').Object3D} root
 */
export function collectRig(root) {
  const rig = {
    root,
    skeleton: null,
    /** slot -> SkinnedMesh */
    partMeshes: {},
    /** slot -> the pristine geometry to restore on unequip */
    originalGeometries: {},
    /** bone name -> { bone, origPos, origQuat, origScale } */
    bones: {},
    hatBone: null,
    backBone: null,
    neckOffsetBindY: 0,
    skinnedMeshes: [],
    /** Rest Y of the character root, so the run-cycle bob can return to it. */
    rootRestY: root.position.y,
    /** Right forearm, the palm on it (bone-local) and its rest orientation, inverted. */
    handBone: null,
    handPoint: null,
    handRestInv: null,
    /** bone name -> inverse of its rest transform in model space (see restInverses). */
    restInverse: {},
    /** Pairs worn on hands and feet, placed every frame (placeFollowers). */
    followers: [],
    /** Shoulder to the bottom of the hand in the rest pose, in rig units (0: unknown). */
    armLen: 0,
    /** The proportions' armLength, as last applied (the stretch is measured against it). */
    armLengthScale: 1,
  }

  const meshBySlot = new Map(
    Object.entries(PART_SLOTS).map(([slot, cfg]) => [cfg.mesh.toLowerCase(), slot]),
  )

  root.traverse((node) => {
    if (node.isSkinnedMesh) {
      node.castShadow = true
      node.receiveShadow = true
      rig.skinnedMeshes.push(node)
      if (!rig.skeleton) rig.skeleton = node.skeleton

      const slot = meshBySlot.get((node.name || '').toLowerCase())
      if (slot) {
        rig.partMeshes[slot] = node
        rig.originalGeometries[slot] = node.geometry.clone()
      }
    } else if (node.isMesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })

  const skeleton = rig.skeleton
  if (skeleton) {
    for (const bone of skeleton.bones) {
      // Proportions are re-applied every frame from these rest values.
      bone.matrixAutoUpdate = true
      rig.bones[bone.name] = {
        bone,
        origPos: bone.position.clone(),
        origQuat: bone.quaternion.clone(),
        origScale: bone.scale.clone(),
      }
    }

    // Bone local axes are NOT world-aligned in this rig: a limb bone's local X
    // points along world -Z and its local Z along world -X, so rotating a leg about
    // its local X swings it sideways instead of forward/back. The offsets differ per
    // bone (Spine1 is identity, ArmL2 is off by ~14 degrees), so rather than hardcode
    // an axis, record for each bone the local-space axis matching each character-space
    // axis and animate about those.
    root.updateMatrixWorld(true)
    const rootQuat = new Quaternion()
    root.getWorldQuaternion(rootQuat)
    const rootQuatInv = rootQuat.invert()
    const boneWorld = new Quaternion()

    for (const bone of skeleton.bones) {
      const entry = rig.bones[bone.name]
      if (!entry) continue
      bone.getWorldQuaternion(boneWorld)
      // Bone orientation relative to the character, then inverted: this maps a
      // character-space axis into the bone's own local frame.
      const relInv = rootQuatInv.clone().multiply(boneWorld).invert()
      /** Local axis to rotate about for forward/back swing. */
      entry.axisX = new Vector3(1, 0, 0).applyQuaternion(relInv).normalize()
      /** Local axis to rotate about for lateral sway. */
      entry.axisZ = new Vector3(0, 0, 1).applyQuaternion(relInv).normalize()
      /** Local axis to rotate about for a twist. */
      entry.axisY = new Vector3(0, 1, 0).applyQuaternion(relInv).normalize()
    }

    rig.restInverse = restInverses(root)

    // The rubber arms are stretched against the arm's real length: shoulder joint to the
    // bottom of the hand, in the bind pose.
    const shoulder = skeleton.bones.find((b) => b.name === 'ArmL1')
    const handEnd = skeleton.bones.find((b) => b.name === 'ArmL2_leaf')
    if (shoulder && handEnd) rig.armLen = shoulder.getWorldPosition(new Vector3()).distanceTo(handEnd.getWorldPosition(new Vector3()))

    // The palm: the bottom of the right arm mesh, a little up from its end, found in
    // the bind pose and kept in the forearm bone's frame so it follows the arm. (A
    // custom character has no such mesh: its wrist bone then.)
    const handBone = skeleton.bones.find((b) => b.name === HAND_BONE)
    const arm = rig.partMeshes.arm_R
    const wrist = skeleton.bones.find((b) => b.name === 'ArmR2_leaf')
    if (handBone && (arm || wrist)) {
      let palm
      if (arm) {
        const box = new Box3().setFromObject(arm)
        palm = new Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.06, (box.min.z + box.max.z) / 2)
      } else {
        palm = wrist.getWorldPosition(new Vector3())
      }
      rig.handBone = handBone
      rig.handPoint = handBone.worldToLocal(palm)
      rig.handRestInv = rootQuatInv.clone().multiply(handBone.getWorldQuaternion(new Quaternion())).invert()
    }

    rig.hatBone = skeleton.bones.find((b) => b.name === HAT_BONE) || null
    rig.backBone = skeleton.bones.find((b) => b.name === BACK_BONE) || null

    const neckIndex = skeleton.bones.findIndex((b) => b.name === NECK_OFFSET_BONE)
    if (neckIndex >= 0) {
      // elements[13] is the Y translation of the inverted bind matrix.
      rig.neckOffsetBindY = skeleton.boneInverses[neckIndex].clone().invert().elements[13]
    }
  }

  return rig
}

/**
 * For every bone, the inverse of its rest transform in the model's own space:
 * inverse(inverse(model.matrixWorld) * bone.matrixWorld). Call straight after the GLB
 * loads, before any pose or proportions. Accessories are placed from these, not from
 * skeleton.boneInverses - player.glb's leaf bones bind 90 degrees off their rest pose,
 * which would turn hand items sideways.
 */
export function restInverses(model) {
  model.updateMatrixWorld(true)
  const modelInv = new Matrix4().copy(model.matrixWorld).invert()
  const out = {}
  model.traverse((node) => {
    if (node.isBone) out[node.name] = new Matrix4().multiplyMatrices(modelInv, node.matrixWorld).invert()
  })
  return out
}

/**
 * Bloxity textures are authored unflipped and pixel-art filtered.
 *
 * They are also sRGB images. A plain TextureLoader leaves them tagged as linear, which
 * makes three skip the sRGB decode and the avatar renders pale and washed out.
 */
export function configureAvatarTexture(texture) {
  if (!texture) return texture
  texture.colorSpace = SRGBColorSpace
  texture.flipY = false
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Applies the skin texture to every skinned mesh of the base body.
 * The base body ships with an empty texture, so this always runs - with skin "0"
 * standing in when nothing is equipped.
 */
export function applySkin(rig, texture) {
  if (!texture) return
  for (const mesh of rig.skinnedMeshes) {
    if (!mesh.material) continue
    mesh.material.map = texture
    mesh.material.needsUpdate = true
  }
}

/**
 * Swaps a body part's geometry onto its base skinned mesh.
 *
 * A part GLB carries its own skeleton whose bone *order* may differ from the base
 * rig's. Its `skinIndex` attribute therefore has to be remapped by bone name, or the
 * limb deforms against the wrong bones.
 *
 * @param {object} rig from `collectRig`
 * @param {string} slot key of PART_SLOTS
 * @param {import('three').Object3D|null} partScene loaded GLB scene, or null to reset
 */
export function applyPart(rig, slot, partScene) {
  const targetMesh = rig.partMeshes[slot]
  if (!targetMesh) return

  // Unequipped / failed download: restore the part baked into player.glb.
  if (!partScene) {
    const original = rig.originalGeometries[slot]
    if (original && targetMesh.geometry !== original) targetMesh.geometry = original
    return
  }

  let skinnedSource = null
  let plainSource = null
  partScene.traverse((node) => {
    if (node.isSkinnedMesh && !skinnedSource) skinnedSource = node
    else if (node.isMesh && !plainSource) plainSource = node
  })

  if (!skinnedSource) {
    // Some parts ship as plain meshes; use them as-is.
    if (plainSource) targetMesh.geometry = plainSource.geometry
    return
  }

  const baseSkeleton = rig.skeleton
  if (!baseSkeleton || !skinnedSource.skeleton) {
    targetMesh.geometry = skinnedSource.geometry
    return
  }

  const geometry = skinnedSource.geometry.clone()

  const baseIndexByName = new Map()
  baseSkeleton.bones.forEach((bone, i) => baseIndexByName.set(bone.name, i))

  const remap = new Map()
  skinnedSource.skeleton.bones.forEach((bone, i) => {
    const baseIndex = baseIndexByName.get(bone.name)
    if (baseIndex !== undefined) remap.set(i, baseIndex)
  })

  const skinIndex = geometry.getAttribute('skinIndex')
  if (skinIndex) {
    const array = skinIndex.array
    for (let i = 0; i < array.length; i += 1) {
      const mapped = remap.get(array[i])
      if (mapped !== undefined) array[i] = mapped
    }
    skinIndex.needsUpdate = true
  }

  targetMesh.geometry = geometry
}

/** What the merged body keeps of each part, and each attribute's size. */
const BODY_ATTRIBUTES = [
  ['position', 3],
  ['normal', 3],
  ['uv', 2],
  ['skinIndex', 4],
  ['skinWeight', 4],
]

/**
 * A part's geometry as plain, non-indexed float attributes: parts come from different
 * GLBs (indexed or not, interleaved or not, 8- or 16-bit skin indices), and only
 * matching layouts merge.
 */
function plainGeometry(source) {
  const g = source.index ? source.toNonIndexed() : source.clone()
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  const count = g.getAttribute('position').count
  const out = new BufferGeometry()
  for (const [name, size] of BODY_ATTRIBUTES) {
    const attr = g.getAttribute(name)
    const array = new Float32Array(count * size)
    if (attr) {
      for (let i = 0; i < count; i += 1) {
        for (let k = 0; k < size; k += 1) array[i * size + k] = attr.getComponent(i, k)
      }
    } else if (name === 'skinWeight') {
      // An unskinned part follows its first bone fully.
      for (let i = 0; i < count; i += 1) array[i * 4] = 1
    }
    out.setAttribute(name, new BufferAttribute(array, size))
  }
  g.dispose()
  return out
}

/**
 * Merges the six body parts into one skinned mesh on the same skeleton, so a whole
 * character is one draw call instead of six. The parts stay (hidden) as the source for
 * the next re-assembly. Call after the parts and skin are applied; returns the body,
 * or null if there's nothing to merge.
 */
export function mergeBody(rig) {
  const parts = rig.skinnedMeshes
  if (!rig.skeleton || parts.length === 0) return null
  const arms = new Set([rig.partMeshes.arm_L, rig.partMeshes.arm_R])
  const pieces = parts.map((mesh) => {
    const piece = plainGeometry(mesh.geometry)
    // 1 on the arms: the shader paints them as the arms you've equipped (armStyles.js).
    const count = piece.getAttribute('position').count
    piece.setAttribute('aArm', new BufferAttribute(new Float32Array(count).fill(arms.has(mesh) ? 1 : 0), 1))
    return piece
  })
  const geometry = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  if (!geometry) return null
  const body = new SkinnedMesh(geometry, patchArmMaterial(new MeshLambertMaterial({ map: parts[0].material?.map ?? null })))
  body.name = 'merged_body'
  body.castShadow = true
  body.receiveShadow = true
  // Skinned bounds don't follow the pose; the avatar is always near the camera anyway.
  body.frustumCulled = false
  parts[0].parent.add(body)
  body.bind(rig.skeleton, parts[0].bindMatrix)
  for (const mesh of parts) mesh.visible = false
  return body
}

/** Removes and frees a body made by mergeBody. */
export function disposeMergedBody(body) {
  if (!body) return
  body.parent?.remove(body)
  body.geometry.dispose()
  body.material.dispose()
}

const _origin = new Matrix4()
const _mirror = new Matrix4().makeScale(-1, 1, 1)

function prepare(object) {
  object.traverse((child) => {
    if (child.isMesh) child.castShadow = true
  })
  object.matrixAutoUpdate = false
  return object
}

/** Places `object` under `parent` with a fixed local matrix. */
function fixUnder(parent, object, local) {
  prepare(object)
  object.matrix.copy(local)
  object.matrixWorldNeedsUpdate = true
  parent.add(object)
  return object
}

/** Mirrors a copy of a hand/shoe mesh across x (and turns its faces back outwards). */
function mirrored(object) {
  const copy = object.clone(true)
  copy.traverse((child) => {
    if (child.isMesh) {
      child.material = child.material.clone()
      child.material.side = DoubleSide
    }
  })
  return copy
}

/**
 * Wears `object` (already textured) in `slot` (WORN_SLOTS) on a player.glb avatar.
 * Head and back items sit at the SDK's offsets on their bone; neck, chest and waist at
 * restInverse(bone) * translate(origin), so they follow the bone (shoulder width and
 * torso scale move the bones, so they follow those too); hands and shoes go on as a
 * pair that follows the bones' position and rotation only. Returns everything added.
 */
export function attachAccessory(rig, slot, object) {
  const cfg = WORN_SLOTS[slot]
  if (!cfg || !object) return []
  const bone = rig.bones[cfg.bone]?.bone
  if (!bone) return []
  if (cfg.local) return [fixUnder(bone, object, _origin.makeTranslation(...cfg.local))]
  const rest = rig.restInverse[cfg.bone]
  if (!rest) return []
  const local = new Matrix4().copy(rest).multiply(_origin.makeTranslation(...cfg.origin))
  if (!cfg.mirror) return [fixUnder(bone, object, local)]
  return wearPair(rig, cfg, object, local, new Matrix4().copy(rig.restInverse[cfg.mirror] ?? rest).multiply(_mirror).multiply(_origin.makeTranslation(...cfg.origin)))
}

function wearPair(rig, cfg, object, localL, localR) {
  const holder = rig.root.parent ?? rig.root
  const out = []
  for (const [boneName, item, local] of [
    [cfg.bone, object, localL],
    [cfg.mirror, mirrored(object), localR],
  ]) {
    const bone = rig.bones[boneName]?.bone
    if (!bone) continue
    prepare(item)
    holder.add(item)
    rig.followers.push({ object: item, bone, local })
    out.push(item)
  }
  return out
}

/**
 * A custom character (the player's own uploaded one, see PlayerAvatar) wearing `object`
 * in `slot`. `character` is the SDK's description ({ rig: { anchors, ... } }) and
 * `baseRestInverse` player.glb's rest inverses: the items keep their player.glb
 * placement, fitted to the character.
 *   - head, back, neck, chest, waist: local = M * placement in player.glb model space,
 *     M from the SDK's characterAccessoryMatrix(character, bone) (or, for an older
 *     character without one, scale(anchor) * the usual local).
 *   - hands, shoes: scale(anchor) * restInverse(player.glb bone) * translate(origin).
 */
export function attachToCharacter(rig, slot, object, character, baseRestInverse, accessoryMatrix) {
  const cfg = WORN_SLOTS[slot]
  if (!cfg || !object) return []
  const bone = rig.bones[cfg.bone]?.bone
  if (!bone) return []
  const anchor = (name) => {
    const a = character?.rig?.anchors?.[name]
    const s = Array.isArray(a) ? a : Number.isFinite(a) ? [a, a, a] : [1, 1, 1]
    return new Matrix4().makeScale(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1)
  }
  const origin = cfg.origin ?? [0, 0, 0]
  if (cfg.mirror) {
    const restL = baseRestInverse[cfg.bone]
    const restR = baseRestInverse[cfg.mirror] ?? restL
    if (!restL) return []
    const localL = anchor(cfg.bone).multiply(restL).multiply(_origin.makeTranslation(...origin))
    const localR = anchor(cfg.mirror).multiply(restR).multiply(_mirror).multiply(_origin.makeTranslation(...origin))
    return wearPair(rig, cfg, object, localL, localR)
  }
  const placement = new Matrix4().makeTranslation(...(cfg.model ?? origin))
  const m = accessoryMatrix?.(character, cfg.bone)
  if (Array.isArray(m) && m.length === 16) return [fixUnder(bone, object, new Matrix4().fromArray(m).multiply(placement))]
  // Older character: the anchor's scale on the usual local.
  const usual = cfg.local ? new Matrix4().makeTranslation(...cfg.local) : new Matrix4().copy(baseRestInverse[cfg.bone] ?? new Matrix4()).multiply(_origin.makeTranslation(...origin))
  return [fixUnder(bone, object, anchor(cfg.bone).multiply(usual))]
}

const _fp = new Vector3()
const _fq = new Quaternion()
const _fs = new Vector3()
const _one = new Vector3(1, 1, 1)
const _holderInv = new Matrix4()
const _fm = new Matrix4()

/**
 * Hands and shoes: each frame, compose(bone position, bone rotation, scale 1) * local,
 * in the space of the object holding them - so they ride the limb without being
 * stretched by arm length or height. Run after the pose.
 */
export function placeFollowers(rig) {
  const followers = rig.followers
  if (followers.length === 0) return
  const holder = followers[0].object.parent
  if (!holder) return
  holder.updateWorldMatrix(true, false)
  _holderInv.copy(holder.matrixWorld).invert()
  for (const f of followers) {
    f.bone.updateWorldMatrix(true, false)
    _fm.multiplyMatrices(_holderInv, f.bone.matrixWorld).decompose(_fp, _fq, _fs)
    f.object.matrix.compose(_fp, _fq, _one).multiply(f.local)
    f.object.matrixWorldNeedsUpdate = true
  }
}

/**
 * Applies Bloxity body proportions.
 *
 * Must run every frame: each bone is reset to its rest transform before the
 * multipliers are re-applied, which is what makes the result idempotent and lets
 * proportion changes take effect live.
 *
 * `height`, `armLength`, `headScale` and `neckHeight` are applied exactly as the
 * Bloxity portal does, so the in-game body matches the preview. The remaining three
 * (`shoulderWidth`, `torsoScaleX`, `legOffsetX`) are not implemented in the SDK's
 * preview renderer; they are applied here in the spirit of their names and are the
 * ones to sanity-check against the portal.
 */
export function applyProportions(rig, proportions) {
  const skeleton = rig.skeleton
  if (!skeleton) return
  // Runs even with no proportions (another player's look not in yet): the reset to the
  // rest pose below is what keeps the per-frame posing from piling up rotations.
  proportions ??= {}

  const height = proportions.height ?? 1
  const armLength = proportions.armLength ?? 1
  rig.armLengthScale = armLength
  const headScale = proportions.headScale ?? 1
  const neckHeight = proportions.neckHeight ?? 1
  const shoulderWidth = proportions.shoulderWidth ?? 1
  const torsoScaleX = proportions.torsoScaleX ?? 1
  const legOffsetX = proportions.legOffsetX ?? 1

  // Overall height is a scale on the character root, not on a bone.
  rig.root.scale.set(1, height, 1)

  for (const bone of skeleton.bones) {
    const rest = rig.bones[bone.name]
    if (!rest) continue

    const { origScale, origPos, origQuat } = rest
    bone.position.copy(origPos)
    bone.quaternion.copy(origQuat)
    bone.scale.copy(origScale)

    const name = bone.name

    if (name.startsWith('Arm')) {
      bone.scale.y = origScale.y * armLength
      // Not in the SDK preview: widen the shoulders by pushing the arm roots out.
      if (name === 'ArmL_Offset' || name === 'ArmR_Offset') {
        bone.position.x = origPos.x * shoulderWidth
      }
    } else if (name === NECK_OFFSET_BONE) {
      // Keeps the head sitting on the neck as height/headScale change, then applies
      // neckHeight against the bind-pose offset.
      bone.position.y += (height - headScale) * origPos.y
      bone.position.y += rig.neckOffsetBindY * (neckHeight - 1) * 0.8
    } else if (name === HAT_BONE) {
      // Divided by height so the head stays uniform inside the stretched root.
      bone.scale.set(
        origScale.x * headScale,
        origScale.y * (headScale / height),
        origScale.z * headScale,
      )
    } else if (name === BACK_BONE) {
      // Not in the SDK preview: torso width.
      bone.scale.x = origScale.x * torsoScaleX
    } else if (name === 'LegL_Offset' || name === 'LegR_Offset') {
      // Not in the SDK preview: leg splay, mirrored about the rig centre.
      bone.position.x = origPos.x * legOffsetX
    }
  }
}

/* ---------------------------------------------------------------------------
 * Procedural animation
 *
 * player.glb ships zero animation clips, so the body is posed directly on the bones
 * from the shared pose (playerPose.js). Rotations are *multiplied onto* whatever
 * applyProportions() just wrote, so this must run immediately after it in the same
 * frame - proportions reset each bone to its rest pose, the clean base a pose needs.
 * ------------------------------------------------------------------------- */

const _animQ = new Quaternion()

/** The arm's length (shoulder to the bottom of the hand) the shared pose assumes, in metres. */
const POSE_ARM = 0.675

/**
 * Stretches an arm like rubber: `s` times as long along the bone (its local Y runs down
 * the arm, so the forearm and hand go with it), and thinner as it goes, as rubber does.
 */
function stretchArm(rig, name, s) {
  if (Math.abs(s - 1) < 0.002) return
  const bone = rig.bones[name]?.bone
  if (!bone) return
  const thin = Math.min(1.15, Math.max(0.5, 1 / Math.sqrt(s)))
  bone.scale.y *= s
  bone.scale.x *= thin
  bone.scale.z *= thin
}

/** Rotates a bone about one of its precomputed character-space axes. */
function rotateBone(rig, name, which, angle) {
  if (!angle) return
  const entry = rig.bones[name]
  const axis = entry?.[which]
  if (!axis) return
  entry.bone.quaternion.multiply(_animQ.setFromAxisAngle(axis, angle))
}

/**
 * Poses the rig for the current motion state.
 *
 * @param {object} rig from `collectRig`
 * @param {object} motion see `computePose`
 * @param {number} unitsPerMetre rig units in one world metre, for the body's lift
 */
export function animateRig(rig, motion, unitsPerMetre = 1) {
  if (!rig?.skeleton || !motion) return
  const pose = computePose(motion)
  for (const name of POSED_BONES) {
    const joint = pose.bones[name]
    rotateBone(rig, name, 'axisX', joint.swing)
    rotateBone(rig, name, 'axisZ', joint.sway)
    rotateBone(rig, name, 'axisY', joint.twist)
  }
  rig.root.position.y = rig.rootRestY + pose.lift * unitsPerMetre
  // Rubber arms. The pose assumes player.glb's arm at 1.8 m; an avatar with longer or
  // shorter arms stretches them less or more, so the hands still land where aimed (a
  // relaxed arm stays its own length).
  const armMetres = rig.armLen > 0 ? (rig.armLen * rig.armLengthScale) / unitsPerMetre : POSE_ARM
  const fit = POSE_ARM / Math.max(0.05, armMetres)
  const fitted = (s) => (s <= 1 ? Math.max(0.6, s) : Math.max(1, s * fit))
  stretchArm(rig, 'ArmL1', fitted(pose.stretchL))
  stretchArm(rig, 'ArmR1', fitted(pose.stretchR))
}

/* ---------------------------------------------------------------------------
 * Emotes
 *
 * A Boxity emote clip gives, per bone, keys `[time, xDeg, yDeg, zDeg]`: rotation
 * deltas over the BIND pose, as an XYZ euler right-multiplied onto the bone's bind
 * quaternion (`bind * euler(x, y, z)`). Between keys the value eases with a smoothstep;
 * before the first key / after the last it holds that key. A looping clip wraps its
 * time on `len`.
 *
 * Runs after animateRig: each emoted bone is blended from the procedural pose towards
 * the emote pose by the player's weight, which ramps over EMOTE_BLEND seconds in and
 * out. Bones the clip doesn't name keep the procedural pose; bones the rig doesn't have
 * are ignored.
 * ------------------------------------------------------------------------- */

const EMOTE_BLEND = 0.1
const DEG = Math.PI / 180
const _emoteEuler = new Euler(0, 0, 0, 'XYZ')
const _emoteQ = new Quaternion()
const _emoteTarget = new Quaternion()

/** Per-avatar playback state for `updateEmote`. Allocate once per avatar. */
export function createEmotePlayer() {
  return { id: null, clip: null, time: 0, weight: 0 }
}

/** Writes the clip's value for one track at `t` into _emoteEuler (radians). */
function sampleTrack(keys, t) {
  const last = keys.length - 1
  let a = keys[0]
  let b = keys[0]
  let s = 0
  if (t >= keys[last][0]) {
    a = keys[last]
    b = a
  } else if (t > keys[0][0]) {
    let i = 1
    while (i < last && keys[i][0] <= t) i += 1
    a = keys[i - 1]
    b = keys[i]
    const span = b[0] - a[0]
    s = span > 0 ? (t - a[0]) / span : 1
    s = s * s * (3 - 2 * s)
  }
  _emoteEuler.set((a[1] + (b[1] - a[1]) * s) * DEG, (a[2] + (b[2] - a[2]) * s) * DEG, (a[3] + (b[3] - a[3]) * s) * DEG, 'XYZ')
}

/**
 * Advances `player` (from createEmotePlayer) towards emote `id` (null = none) and poses
 * the rig with it. `getClip(id)` looks a clip up in the catalog (bloxity/emotes.js);
 * an id it doesn't know is treated as no emote until it does.
 */
export function updateEmote(rig, player, id, delta, getClip) {
  if (!rig?.skeleton || !player) return
  if ((id || null) !== player.id) {
    const clip = id ? getClip(id) : null
    if (clip) {
      // A new emote blends in from wherever the body is now.
      player.id = id
      player.clip = clip
      player.time = 0
      player.weight = 0
    } else {
      player.id = null
    }
  }

  if (player.id) {
    player.time += delta
    player.weight = Math.min(1, player.weight + delta / EMOTE_BLEND)
  } else {
    player.weight = Math.max(0, player.weight - delta / EMOTE_BLEND)
    if (player.weight === 0) player.clip = null
  }
  const clip = player.clip
  if (!clip || player.weight <= 0) return

  const t = clip.loop ? player.time % clip.len : player.time
  const w = player.weight * player.weight * (3 - 2 * player.weight)
  const tracks = clip.tracks
  for (let i = 0; i < tracks.length; i += 1) {
    const entry = rig.bones[tracks[i].bone]
    if (!entry) continue
    sampleTrack(tracks[i].keys, t)
    _emoteTarget.copy(entry.origQuat).multiply(_emoteQ.setFromEuler(_emoteEuler))
    if (w >= 1) entry.bone.quaternion.copy(_emoteTarget)
    else entry.bone.quaternion.slerp(_emoteTarget, w)
  }
}

const _parentInv = new Matrix4()
const _boneQ = new Quaternion()
const _parentQ = new Quaternion()
const _scratchP = new Vector3()
const _scratchS = new Vector3()

/**
 * Puts `hand` (an object in one of the avatar's ancestors) on the palm, turned by as
 * much as the forearm has turned from its rest pose. Run after `animateRig`.
 */
export function placeHand(rig, hand) {
  const bone = rig.handBone
  const parent = hand?.parent
  if (!bone || !parent) return
  // Refreshes the whole chain down to the forearm, the hand's parent included.
  bone.updateWorldMatrix(true, false)
  _parentInv.copy(parent.matrixWorld).invert()
  hand.position.copy(rig.handPoint).applyMatrix4(bone.matrixWorld).applyMatrix4(_parentInv)
  bone.matrixWorld.decompose(_scratchP, _boneQ, _scratchS)
  parent.matrixWorld.decompose(_scratchP, _parentQ, _scratchS)
  hand.quaternion.copy(_parentQ.invert()).multiply(_boneQ).multiply(rig.handRestInv)
}

const _ra = new Vector3()
const _rb = new Vector3()
const _rd = new Vector3()
const _rx = new Vector3()
const _ry = new Vector3()
const _rz = new Vector3()
const _rm = new Matrix4()
const _rInv = new Matrix4()
const ARM_ENDS = [
  ['ArmL1', 'ArmL2_leaf'],
  ['ArmR1', 'ArmR2_leaf'],
]

/**
 * Lays an avatar's rubber arms (armStyles.createRubberArms, a child of the avatar's group)
 * along its posed arms: each from the shoulder joint to where the arm now ends, as long
 * as the rubber has stretched it. The hand hangs palm forward, turning palm down as the
 * arm reaches out, and bends back at the wrist the more the arm points down - so arms
 * dragging along the floor drag their hands flat behind them. Run after the pose.
 * Returns false (and hides them) when not `enabled` or for a rig without those bones.
 */
export function placeRubberArms(rig, arms, enabled = true) {
  const parent = arms.parent
  const ok = enabled && Boolean(parent) && ARM_ENDS.every(([a, b]) => rig.bones[a] && rig.bones[b])
  arms.visible = ok
  if (!ok) return false
  parent.updateWorldMatrix(true, false)
  _rInv.copy(parent.matrixWorld).invert()
  for (let i = 0; i < 2; i += 1) {
    const top = rig.bones[ARM_ENDS[i][0]].bone
    const end = rig.bones[ARM_ENDS[i][1]].bone
    end.updateWorldMatrix(true, false)
    _ra.setFromMatrixPosition(top.matrixWorld).applyMatrix4(_rInv)
    _rb.setFromMatrixPosition(end.matrixWorld).applyMatrix4(_rInv)
    _rd.subVectors(_rb, _ra)
    const length = _rd.length()
    if (length < 1e-4) _rd.set(0, -1, 0)
    else _rd.divideScalar(length)
    // Which way the palm faces: forward hanging down, down reaching out.
    const dy = Math.abs(_rd.y)
    _rz.set(0, dy - 1, dy).addScaledVector(_rd, -(dy * _rd.z + (dy - 1) * _rd.y))
    if (_rz.lengthSq() < 1e-6) _rz.set(1, 0, 0).addScaledVector(_rd, -_rd.x)
    _rz.normalize()
    _ry.copy(_rd).negate()
    _rx.crossVectors(_ry, _rz)
    arms.setMatrixAt(i, _rm.makeBasis(_rx, _ry, _rz).setPosition(_ra))
    const bend = 1.45 * Math.min(1, Math.max(0, (-_rd.y - 0.4) / 0.4))
    arms.setPose(i, length, bend, _ra.x >= 0 ? 1 : -1)
  }
  arms.instanceMatrix.needsUpdate = true
  return true
}
