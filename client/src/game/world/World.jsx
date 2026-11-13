import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { Group, Mesh } from 'three'

import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { asToyInstance, BlockSet, disposeBlocks, PropBuilder } from '../blocks'
import { glowTime } from '../glow'
import { createToyMaterial, sharedMaterials, toyTime } from '../materials'
import { venueOf } from '../sceneStyle'
import { createGroundGeometry, createGroundMap } from './ground'
import { buildEggStands } from './eggs'
import { buildPortalFrame } from './portalFrame'
import { createPaintedSigns } from './signs'
import { buildRollZone } from './rollZone'
import { buildPads, buildShop } from './structures'
import { buildHills } from './hills'
import { addScoreboard } from './terrain'

/**
 * The static lobby: ground plane, every box (hills, trees, pull-up bars, stages) in
 * one InstancedMesh, and every non-box prop (mats, rings...) merged into one mesh, plus
 * the painted signs (one atlas, one mesh). Four draw calls for the whole environment - five
 * at Palm Beach, whose ocean is a plane of its own.
 *
 * Built for the world you're in (its venue: sceneStyle VENUES) and rebuilt, the old one
 * disposed, when you step through the portal (the screen is faded out for it). Quality only
 * decides crowd and decor density at build time and whether the result casts/receives
 * realtime shadows.
 */
export function World() {
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const playable = useGame((s) => s.playable)
  const world = useGame((s) => s.profile.world || 0)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const [signs, setSigns] = useState([])

  // Drives every animated toy-material style (water...) and the sea.
  useFrame((state) => {
    toyTime.value = state.clock.elapsedTime
    glowTime.value = state.clock.elapsedTime
  })

  // The painted lettering waits until the game is on screen and the browser is idle
  // (painting its atlas was ~170 ms of a slow phone's start-up), and its shader is
  // compiled before it shows, so it can't stall a frame - as the world labels do.
  useEffect(() => {
    if (!playable) return undefined
    let made = []
    let cancelled = false
    const dispose = (list) => {
      for (const sign of list) {
        sign.geometry.dispose()
        sign.material.dispose()
        sign.texture.dispose()
      }
    }
    const idle = new Promise((resolve) =>
      'requestIdleCallback' in window ? requestIdleCallback(resolve, { timeout: 1000 }) : setTimeout(resolve, 200),
    )
    idle
      .then(() => (cancelled ? [] : createPaintedSigns(useQuality.getState().settings.maxTexture, world)))
      .then(async (list) => {
        if (cancelled) {
          dispose(list)
          return
        }
        made = list
        const probe = new Group()
        for (const sign of list) probe.add(new Mesh(sign.geometry, sign.material))
        // (Not in dev: StrictMode's remount disposes materials mid-compile - ShaderWarmup.)
        if (!import.meta.env.DEV) await gl.compileAsync(probe, camera, scene).catch(() => null)
        if (!cancelled) setSigns(list)
      })
    return () => {
      cancelled = true
      dispose(made)
    }
  }, [playable, gl, camera, scene, world])

  const { blocks, ground, props } = useMemo(() => {
    performance.mark('pp:world-start')
    const { decorDensity, maxTexture } = useQuality.getState().settings
    const set = new BlockSet()
    // Candy mesas all round the canyon (sandstone at Palm Beach), the scoreboard on the south one.
    buildHills(set, { density: decorDensity, venue: venueOf(world) })
    addScoreboard(set, venueOf(world))
    const propBuilder = new PropBuilder()
    buildPads(set, propBuilder)
    buildShop(set, { detail: decorDensity >= 0.75, world })
    buildRollZone(set, propBuilder, { detail: decorDensity >= 0.75, world })
    buildPortalFrame(set)
    buildEggStands(set)

    const map = createGroundMap(maxTexture, world)
    const groundMaterial = createToyMaterial({ instanced: false, vertexColors: false, map, studScale: 2 })

    performance.mark('pp:world-end')
    return {
      blocks: set.build(sharedMaterials().blocks),
      props: asToyInstance(propBuilder.build(), sharedMaterials().toy),
      ground: { geometry: createGroundGeometry(world), material: groundMaterial, map },
    }
  }, [world])

  useEffect(
    () => () => {
      disposeBlocks(blocks)
      props.geometry.dispose()
      props.dispose()
      ground.geometry.dispose()
      ground.material.dispose()
      ground.map.dispose()
    },
    [blocks, ground, props],
  )

  return (
    <>
      <mesh geometry={ground.geometry} material={ground.material} receiveShadow={shadows} />
      <primitive object={blocks} castShadow={shadows} receiveShadow={shadows} />
      <primitive object={props} castShadow={shadows} receiveShadow={shadows} />
      {signs.map((sign) => (
        <mesh key={sign.texture.uuid} geometry={sign.geometry} material={sign.material} position={sign.position} rotation={sign.rotation} renderOrder={1} />
      ))}
    </>
  )
}

export default World
