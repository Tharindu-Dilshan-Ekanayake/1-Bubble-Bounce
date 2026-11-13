import { useFrame, useLoader } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Box3, MeshLambertMaterial, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import {
  assetUrls,
  baseBodyUrl,
  isRealId,
  PART_SLOTS,
  skinCompositeUrl,
  skinIdOrDefault,
  WORN_SLOTS,
} from '../bloxity/avatarAssets'
import { loadCharacterGLB, loadOBJ, loadPartGLB, loadTexture } from '../bloxity/avatarLoader'
import { getSDK, safeCall } from '../bloxity/sdk'
import { useBloxity } from '../bloxity/BloxityContext'
import { getEmoteClip, updateLocalEmote } from '../bloxity/emotes'
import { shareLook } from '../net/connection'
import { getGame } from '../store/game'
import { createRubberArms, disposeRubberArms, setArmLook } from './armStyles'
import {
  animateRig,
  applyPart,
  applyProportions,
  applySkin,
  attachAccessory,
  attachToCharacter,
  collectRig,
  createEmotePlayer,
  disposeMergedBody,
  mergeBody,
  placeFollowers,
  placeRubberArms,
  placeHand,
  restInverses,
  updateEmote,
} from './avatarRig'

/**
 * Keeps the avatar breathing when it is rendered outside the game (a menu preview,
 * say) with no physics body feeding it motion.
 */
const _idleMotion = { time: 0, speed: 0, grounded: true, maxSpeed: 6 }
function fallbackMotion(delta) {
  _idleMotion.time += delta
  return _idleMotion
}

/**
 * A Bloxity avatar wearing `equipped` with `proportions`, assembled at runtime: yours,
 * or another player's from what the server tells us they wear.
 *
 * `player.glb` is the base humanoid rig: six skinned meshes (head, torso, two arms,
 * two legs) sharing one skeleton. Assembly means, per equipped slot:
 *   - body parts  -> swap the matching mesh's geometry
 *   - hat / back  -> attach an OBJ to the Neck1 / Spine2 bone
 *   - skin        -> set one texture as the map on every skinned mesh
 * then the six parts are merged into one skinned mesh, so a whole character is a
 * single draw call (plus one per hat or back item).
 *
 * Any slot that is unequipped or 404s leaves the base body's own part in place. The
 * whole thing re-assembles when `equipped` changes.
 *
 * A player wearing their own uploaded character (`equipped.characterId`) gets that GLB
 * instead of player.glb - same 22 bones, so every pose and emote plays on it - with no
 * skin, body parts or proportions, and their accessories fitted to it. If it can't be
 * found or loaded, the regular avatar shows. `local` says whether this is your own
 * avatar (the SDK describes yours and other players' characters differently).
 *
 * @param {{ equipped?: object, proportions?: object, onReady?: () => void,
 *   onStep?: (text: string) => void, targetHeight?: number, motionRef?: object,
 *   handRef?: object, emoteSource?: () => string|null }} props
 *   `motionRef.current` is the motion state playerPose poses the body from; its
 *   `emote` field (a Boxity emote id, or null) plays that emote over the pose - for
 *   another player, set it from their anim ('emote:<id>'). `emoteSource`, if given, is
 *   asked for the emote id every frame instead (your own avatar uses it).
 *   `targetHeight` is the world-space height to fit the avatar into, in the game's
 *   own units: Bloxity authors the rig ~6.4 units tall with the feet at y=0, far bigger
 *   than the game's metric scale, so the model is measured and rescaled. `handRef` is
 *   an object beside the avatar that gets moved onto the right palm every frame, for
 *   anything held. `onStep` reports loading progress. `armsId`, if given, is asked every
 *   frame which arms (shared/balance.js TIRES id) this player wears: their arms are
 *   painted to match (armStyles.js) - the starter Noodle Arms keep the avatar's own skin.
 */
export const BloxityAvatar = forwardRef(function BloxityAvatar(
  { equipped, proportions, onReady, onStep, targetHeight = 1.8, motionRef, handRef, emoteSource, armsId, local = false, ...props },
  ref,
) {
  // three's own GLTFLoader (the one the cosmetics use too), not drei's useGLTF, which
  // would bundle a second loader plus Draco/Meshopt/KTX2 decoders this GLB never needs.
  const { scene: baseScene } = useLoader(GLTFLoader, baseBodyUrl())
  const [assembled, setAssembled] = useState(false)
  /** The merged body currently shown; replaced on every re-assembly. */
  const bodyRef = useRef(null)
  /** Their own uploaded character, once loaded: { info, scene }; null = player.glb. */
  const custom = useCustomCharacter(equipped, local)

  // The GLTF cache hands back one shared scene. Clone via SkeletonUtils so this
  // instance gets an independent, still-working skeleton.
  const character = useMemo(() => cloneSkeleton(custom?.scene ?? baseScene), [custom, baseScene])
  // player.glb's rest pose: hands and shoes on a custom character are placed from it.
  const baseRest = useMemo(() => restInverses(baseScene), [baseScene])

  // Rig lookup tables (bones, part meshes, pristine geometries) built once per clone.
  const rig = useMemo(() => {
    const collected = collectRig(character)

    // The base body ships with an empty texture; give every skinned mesh its own
    // material instance so a skin swap here can't leak into another avatar. A custom
    // character keeps its own texture.
    for (const mesh of collected.skinnedMeshes) {
      // Lambert: these settings made Standard look matte anyway, and Lambert is far
      // cheaper to compile and to shade.
      mesh.material = new MeshLambertMaterial({ color: 0xffffff, map: custom ? (mesh.material?.map ?? null) : null })
    }

    if (!collected.skeleton) {
      console.warn('[bloxity] player.glb has no skeleton - avatar will not deform')
    }
    return collected
  }, [character, custom])

  // Measured once, from player.glb's bind pose, before proportions touch the root
  // scale. A custom character uses the same fit: both are 6.4-unit rigs, feet at y 0.
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(baseScene)
    const size = box.getSize(new Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return { scale: 1, footOffset: 0 }
    const scale = targetHeight / size.y
    // The rig's feet sit at its bbox minimum; drop the group so they land on y=0
    // of the parent (which Player positions at the bottom of the capsule).
    return { scale, footOffset: -box.min.y * scale }
  }, [baseScene, targetHeight])

  // --- Assemble equipped cosmetics --------------------------------------------
  useEffect(() => {
    let cancelled = false
    const holder = bodyRef
    // Accessories are re-attached on every rebuild; track them so the previous
    // hat/back can be removed rather than stacking up.
    const attached = []

    onStep?.('Loading avatar…')

    const jobs = []

    if (custom) {
      // Their own character: only its texture (if the GLB doesn't carry one) and what
      // they wear on it.
      if (custom.info?.textureUrl) {
        jobs.push(loadTexture(custom.info.textureUrl).then((texture) => ({ kind: 'characterTexture', texture })))
      }
    } else {
      // Skin always loads - "0" is the fallback, since the base body has no baked map.
      // With a face, shirt or pants worn it's the server-composited version; if that
      // can't be fetched, the bare skin is better than an untextured body.
      const compositeUrl = skinCompositeUrl(equipped)
      const plainSkinUrl = assetUrls.skinTexture(skinIdOrDefault(equipped?.skinId))
      jobs.push(
        (compositeUrl ? loadTexture(compositeUrl) : Promise.resolve(null))
          .then((texture) => texture || loadTexture(plainSkinUrl))
          .then((texture) => ({ kind: 'skin', texture })),
      )

      // Body parts: fetch only real ids; a missing slot resets to the base geometry.
      for (const [slot, cfg] of Object.entries(PART_SLOTS)) {
        const id = equipped?.[cfg.idKey]
        if (!isRealId(id)) {
          jobs.push(Promise.resolve({ kind: 'part', slot, scene: null }))
          continue
        }
        jobs.push(
          loadPartGLB(assetUrls.part(slot, id)).then((scene) => ({
            kind: 'part',
            slot,
            scene,
          })),
        )
      }
    }

    // Everything worn: hat, hair and mask together, back, neck, chest, waist, hands, shoes.
    for (const [slot, cfg] of Object.entries(WORN_SLOTS)) {
      const id = equipped?.[cfg.idKey]
      if (!isRealId(id)) continue
      jobs.push(
        Promise.all([loadOBJ(cfg.mesh(id)), loadTexture(cfg.texture(id))]).then(
          ([object, texture]) => ({ kind: 'accessory', accessory: slot, object, texture }),
        ),
      )
    }
    const accessoryMatrix = custom ? characterAccessoryMatrix() : null

    Promise.all(jobs)
      .then((results) => {
        if (cancelled) return

        for (const result of results) {
          // One bad slot must not take the rest of the character down.
          try {
            if (result.kind === 'characterTexture') {
              if (result.texture) for (const mesh of rig.skinnedMeshes) if (!mesh.material.map) mesh.material.map = result.texture
              for (const mesh of rig.skinnedMeshes) mesh.material.needsUpdate = true
            } else if (result.kind === 'skin') {
              applySkin(rig, result.texture)
            } else if (result.kind === 'part') {
              applyPart(rig, result.slot, result.scene)
            } else if (result.kind === 'accessory' && result.object) {
              if (result.texture) {
                result.object.traverse((child) => {
                  if (child.isMesh) {
                    child.material = new MeshLambertMaterial({ map: result.texture })
                  }
                })
              }
              const added = custom
                ? attachToCharacter(rig, result.accessory, result.object, custom.info, baseRest, accessoryMatrix)
                : attachAccessory(rig, result.accessory, result.object)
              attached.push(...added)
            }
          } catch (err) {
            console.warn(`[bloxity] failed to apply ${result.kind}`, err)
          }
        }

        // One draw call for the body: merge the assembled parts. (A custom character
        // is drawn as it comes.)
        if (custom) {
          setAssembled(true)
          return
        }
        try {
          disposeMergedBody(holder.current)
          holder.current = mergeBody(rig)
        } catch (err) {
          console.warn('[bloxity] could not merge the body; drawing its parts', err)
          for (const mesh of rig.skinnedMeshes) mesh.visible = true
        }
        setAssembled(true)
      })
      .catch((err) => {
        console.warn('[bloxity] avatar assembly failed; showing base body', err)
        if (!cancelled) setAssembled(true)
      })

    return () => {
      cancelled = true
      rig.followers.length = 0
      for (const object of attached) {
        object.parent?.remove(object)
        object.traverse((child) => {
          child.geometry?.dispose()
          if (child.isMesh) child.material?.dispose()
        })
      }
    }
  }, [rig, equipped, onStep, custom, baseRest])

  // Frees what this avatar made when it goes (other players come and go). Loaded
  // part scenes and textures are shared through the loader cache, so they stay.
  useEffect(() => {
    const holder = bodyRef
    return () => {
      disposeMergedBody(holder.current)
      holder.current = null
      for (const mesh of rig.skinnedMeshes) mesh.material.dispose()
      for (const geometry of Object.values(rig.originalGeometries)) geometry.dispose()
    }
  }, [rig])

  // --- Proportions and pose -----------------------------------------------------
  // Applied per frame rather than in an effect: every bone is reset to its rest pose
  // and re-scaled each pass, which keeps it idempotent and survives anything else
  // that touches the skeleton.
  const proportionsRef = useRef(proportions)
  useEffect(() => {
    proportionsRef.current = proportions
  }, [proportions])
  /** This avatar's emote playback (blend weight, clip time). */
  const emotePlayer = useMemo(() => createEmotePlayer(), [])
  /** The rubber arms drawn in place of the avatar's own, for a game avatar (`armsId`). */
  const wantsArms = Boolean(armsId)
  const rubberArms = useMemo(() => (wantsArms ? createRubberArms() : null), [wantsArms])
  useEffect(() => () => rubberArms && disposeRubberArms(rubberArms), [rubberArms])

  useFrame((_state, delta) => {
    try {
      // Order matters: proportions reset every bone to its rest pose, and the
      // animation then rotates on top of that clean base.
      // A custom character takes no proportions (this still resets its rest pose).
      applyProportions(rig, custom ? null : proportionsRef.current)
      const motion = motionRef?.current ?? fallbackMotion(delta)
      animateRig(rig, motion, 1 / fit.scale)
      // A Boxity emote, blended over the pose (see avatarRig.updateEmote).
      const emote = emoteSource ? emoteSource() : motion.emote
      updateEmote(rig, emotePlayer, emote, Math.min(delta, 0.1), getEmoteClip)
      placeFollowers(rig)
      if (handRef?.current) placeHand(rig, handRef.current)
      if (armsId) {
        const id = armsId()
        // Rubber arms instead of the blocky ones (not on a custom character).
        const shown = rubberArms ? placeRubberArms(rig, rubberArms, !custom) : false
        rubberArms?.setArm(id)
        setArmLook(bodyRef.current?.material, id, shown)
      }
    } catch {
      // A malformed payload must not kill the render loop.
    }
  })

  // Signal readiness only once the model is actually standing there.
  useEffect(() => {
    if (assembled) onReady?.()
  }, [assembled, onReady])

  return (
    <group ref={ref} {...props}>
      {/* Fit scale lives on this wrapper, not on `character` - applyProportions
          overwrites the character's own scale every frame. */}
      <group scale={fit.scale} position={[0, fit.footOffset, 0]}>
        <primitive object={character} />
      </group>
      {rubberArms && <primitive object={rubberArms} />}
    </group>
  )
})

/**
 * Your own avatar: whatever your Bloxity account (or guest) is wearing. Also tells the
 * other players, so they see you dressed the same. Plays the emotes Boxity asks for
 * (bloxity/emotes.js) until you move.
 */
export const PlayerAvatar = forwardRef(function PlayerAvatar(props, ref) {
  const { avatar, proportions, game } = useBloxity()
  useEffect(() => shareLook(avatar, proportions), [avatar, proportions])
  return (
    <BloxityAvatar
      ref={ref}
      {...props}
      equipped={avatar}
      proportions={proportions}
      local
      onStep={game.loadingStep}
      emoteSource={updateLocalEmote}
      armsId={yourArms}
    />
  )
})

/** The arms you've equipped, for your avatar's paint. */
const yourArms = () => getGame().profile.equippedTire

/** The SDK's characterAccessoryMatrix(character, bone), or null on an SDK without it. */
function characterAccessoryMatrix() {
  const avatar = getSDK()?.avatar
  if (typeof avatar?.characterAccessoryMatrix !== 'function') return null
  return (character, bone) => safeCall(avatar.characterAccessoryMatrix.bind(avatar), character, bone) ?? null
}

/**
 * The uploaded character `equipped.characterId` names, loaded: { info, scene } - or
 * null for the regular avatar (none worn, none found, or its GLB failed). Yours comes
 * from avatar.getCharacter(), anyone else's from avatar.getCharacterFor(equipped).
 */
function useCustomCharacter(equipped, local) {
  const characterId = isRealId(equipped?.characterId) ? String(equipped.characterId) : null
  const [loaded, setLoaded] = useState(null)
  // Read when the character changes; other slots changing mustn't reload it.
  const equippedRef = useRef(equipped)
  useEffect(() => {
    equippedRef.current = equipped
  }, [equipped])
  useEffect(() => {
    if (!characterId) return undefined
    let cancelled = false
    const avatar = getSDK()?.avatar
    const describe = local ? avatar?.getCharacter : avatar?.getCharacterFor
    Promise.resolve(typeof describe === 'function' ? describe.call(avatar, equippedRef.current) : null)
      .then((info) => (info?.glbUrl ? loadCharacterGLB(info.glbUrl).then((scene) => (scene ? { id: characterId, info, scene } : null)) : null))
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setLoaded(result)
      })
    return () => {
      cancelled = true
    }
  }, [characterId, local])
  return characterId && loaded?.id === characterId ? loaded : null
}

useLoader.preload(GLTFLoader, baseBodyUrl())

export default PlayerAvatar
