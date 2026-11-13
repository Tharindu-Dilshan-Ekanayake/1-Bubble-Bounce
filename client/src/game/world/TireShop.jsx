import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { RARITIES, TIRES } from '@shared/balance'
import { SHOP_STAGES, STAND_SIZE, TIRE_STANDS } from '@shared/world'

import { useGame } from '../../store/game'
import { createBubbleDisplay } from '../bubbles'
import { BlockSet, disposeBlocks } from '../blocks'
import { createGlowInstances, disposeGlow } from '../glow'
import { standLabelSpec, standState } from '../labels/lobbyLabels'
import { updateWorldLabel } from '../labels/registry'
import { sharedMaterials, STYLE } from '../materials'
import { tireGlow, tireRim } from '../tire'

/** Stand colours by state, as in the reference: green equipped, blue owned, red not yet. */
const STAND_COLORS = {
  equipped: new Color('#3fdc4a'),
  owned: new Color('#38c8ff'),
  buy: new Color('#ff3b3b'),
  locked: new Color('#b0262b'),
}

const _m = new Matrix4()
const _p = new Vector3()
const _halo = new Vector3()
const _haloQ = new Quaternion()
const _haloS = new Vector3()

/** Height of a stand's glowing cap above its pad; the bubble floats over it. */
const CAP_TOP = 1.12
/** Showroom bubbles' radius: about 1.9 m across. */
const SHOWN_BUBBLE = 0.95
/** How high a bubble's middle floats over its stand: clear of the cap. */
const HOVER = CAP_TOP + SHOWN_BUBBLE + 0.45

/**
 * Display stands, all in one block set. The first TIRE_STANDS.length blocks are the
 * stands' tops themselves (recoloured by state, so their instance index is the stand
 * index); the trimmings follow.
 */
function buildStands() {
  const set = new BlockSet()
  const slab = STAND_SIZE - 0.4
  for (const stand of TIRE_STANDS) set.addOn(stand.x, stand.y - 0.1, stand.z, slab, 0.3, slab, '#ffffff', STYLE.STUDS)
  for (const stand of TIRE_STANDS) {
    const id = TIRES[stand.index].id
    const { x, y, z } = stand
    // Grey stepped frame, standing clear of the stand's top, like the reference's.
    const e = slab / 2 + 0.1
    for (const side of [-1, 1]) {
      set.addOn(x, y - 0.1, z + side * e, slab + 0.5, 0.45, 0.3, '#c4ccd8', STYLE.SMOOTH)
      set.addOn(x + side * e, y - 0.1, z, 0.3, 0.45, slab + 0.2, '#c4ccd8', STYLE.SMOOTH)
    }
    // A glowing square ring on the stand in the bubble's own colour.
    const glow = tireGlow(id)
    for (const side of [-1, 1]) {
      set.addOn(x, y + 0.2, z + side * 1.25, 2.68, 0.06, 0.18, glow, STYLE.GLOW)
      set.addOn(x + side * 1.25, y + 0.2, z, 0.18, 0.06, 2.32, glow, STYLE.GLOW)
    }
    // Low pedestal with a cap in the bubble's colour.
    set.addOn(x, y + 0.2, z, 1.1, 0.7, 1.1, '#f4f7fb', STYLE.SMOOTH)
    set.addOn(x, y + 0.9, z, 1.5, CAP_TOP - 0.9, 1.5, tireRim(id), STYLE.GLOW)
  }
  // A red carpet down the aisle between the two stages, edged in gold.
  const [front, back] = SHOP_STAGES
  // The gap between the two stages, whichever side of the plaza they're on.
  const aisleX = (Math.max(front.minX, back.minX) + Math.min(front.maxX, back.maxX)) / 2
  const length = front.maxZ - front.minZ
  const midZ = (front.minZ + front.maxZ) / 2
  set.addOn(aisleX, 0, midZ, 2.4, 0.06, length, '#d8263a', STYLE.SMOOTH)
  for (const side of [-1, 1]) set.addOn(aisleX + side * 1.25, 0, midZ, 0.18, 0.1, length, '#ffd21f', STYLE.GLOW)
  return set.build(sharedMaterials().blocks)
}

/**
 * The Bubble Shop: twenty-four display stands on the two showroom stages, each with its
 * bubble - every one a different shape and film (bubbles.js) - floating above it, turning
 * slowly like a trophy on a turntable and bobbing (in the vertex shader: the bubbles never
 * move on the CPU). Stands recolour and their labels rewrite as you buy and equip. Three
 * draw calls: stands, bubbles, halos.
 */
export function TireShop() {
  // As a string: the profile is a fresh copy after every update (a launch, a rep...).
  const ownedKey = useGame((s) => s.profile.ownedTires.join(','))
  const equipped = useGame((s) => s.profile.equippedTire)
  const standsRef = useRef(null)
  const halosRef = useRef(null)
  const ballsRef = useRef(null)

  const assets = useMemo(() => {
    const stands = buildStands()
    const count = TIRES.length
    // Every showroom bubble, merged into one mesh: one draw call.
    const balls = createBubbleDisplay(
      TIRE_STANDS.map((stand) => ({ id: TIRES[stand.index].id, x: stand.x, y: stand.y + HOVER, z: stand.z, scale: SHOWN_BUBBLE })),
    )
    // A soft glow behind each bubble in its rarity's colour: the rarer, the brighter it reads.
    const halos = createGlowInstances(count, 0.45)
    TIRES.forEach((tire, i) => halos.setColorAt(i, new Color(RARITIES[tire.rarity]?.color ?? '#ffffff')))
    halos.count = count
    return { stands, balls, halos }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.stands)
      disposeGlow(assets.halos)
      assets.balls.geometry.dispose()
      assets.balls.material.dispose()
    },
    [assets],
  )

  // Recolour stands and rewrite their labels whenever ownership changes.
  useEffect(() => {
    const stands = standsRef.current
    const profile = { ownedTires: ownedKey.split(','), equippedTire: equipped }
    for (const stand of TIRE_STANDS) {
      const state = standState(profile, stand.index)
      stands?.setColorAt(stand.index, STAND_COLORS[state])
      updateWorldLabel(`stand-${stand.index}`, standLabelSpec(stand.index, state))
    }
    if (stands?.instanceColor) stands.instanceColor.needsUpdate = true
  }, [ownedKey, equipped])

  useFrame((state) => {
    const halos = halosRef.current
    if (!halos) return
    for (const stand of TIRE_STANDS) {
      _p.set(stand.x, stand.y + HOVER, stand.z)
      // Set back behind the bubble as seen from the camera, so it glows round it, not over it.
      _halo.copy(_p).sub(state.camera.position).normalize().multiplyScalar(1.6).add(_p)
      halos.setMatrixAt(stand.index, _m.compose(_halo, _haloQ, _haloS.setScalar(SHOWN_BUBBLE * 4.4)))
    }
    halos.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive ref={standsRef} object={assets.stands} />
      <primitive ref={ballsRef} object={assets.balls} />
      <primitive ref={halosRef} object={assets.halos} />
    </>
  )
}

export default TireShop
