import { useEffect, useMemo } from 'react'
import { CircleGeometry, Color, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, SphereGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { mulberry32 } from '@shared/rng'
import { PAD_COUNT, PAD_HEIGHT, PAD_X, padCenterZ, padHoopRadius, ROLL_ARCH, ROLL_ZONE, SPAWN } from '@shared/world'

import { useQuality } from '../../store/quality'
import { createBubbleMaterial } from '../bubbles'
import { ARCH_HOOP } from './rollZone'
import { PAD_THEMES, HOOP_X, hoopCentreY } from './structures'

/** Pastel soap-film tints for the free-floating bubbles. */
const TINTS = ['#bfefff', '#ffd6f6', '#d8c8ff', '#c8ffe8', '#fff3b8', '#ffffff'].map((c) => new Color(c))

/**
 * Bubbles everywhere in the lobby: streaming out of every Blow Pad's giant hoop, rising
 * over the Blow Zone's wand arch, drifting about the spawn. Each rises from its spot,
 * wobbling, swells in and pops at the top of its climb, then starts again - all in the
 * vertex shader (bubbles.js DRIFT): nothing moves on the CPU, ever. One InstancedMesh,
 * one draw call; how many there are follows the preset's decor density (a handful on LOW).
 * Plus the soap films across the giant hoops: one more.
 */
export function AmbientBubbles() {
  const density = useQuality((s) => s.settings.decorDensity)

  const mesh = useMemo(() => {
    const rand = mulberry32(77)
    const spots = []
    const per = (n) => Math.max(1, Math.round(n * Math.max(0.25, density)))
    // [x, y, z, spread, rise, size, count, tint (Color or null: random pastel)]
    for (let i = 0; i < PAD_COUNT; i += 1) {
      const theme = PAD_THEMES[i]
      spots.push([HOOP_X + 0.8, hoopCentreY(i), padCenterZ(i), padHoopRadius(i) * 0.8, 6.5, 0.32, per(9), new Color(theme.ring)])
      spots.push([PAD_X, PAD_HEIGHT + 0.6, padCenterZ(i), 1.6, 3.5, 0.18, per(2), null])
    }
    const zoneZ = (ROLL_ZONE.minZ + ROLL_ZONE.maxZ) / 2
    spots.push([0, 13, ROLL_ARCH.z, 7, 9, 0.45, per(14), null])
    spots.push([-ROLL_ARCH.x, 2, ROLL_ARCH.z, 2, 8, 0.3, per(4), null])
    spots.push([ROLL_ARCH.x, 2, ROLL_ARCH.z, 2, 8, 0.3, per(4), null])
    spots.push([0, 0.6, zoneZ, 11, 5, 0.3, per(10), null])
    spots.push([SPAWN.x, 1, SPAWN.z - 4, 9, 6, 0.32, per(10), null])

    const count = spots.reduce((n, s) => n + s[6], 0)
    // Low-poly: they're small and on the move. Its own geometry, for its own attributes.
    const geometry = new SphereGeometry(1, 10, 7)
    const base = new Float32Array(count * 4)
    const drift = new Float32Array(count * 4)
    const mesh = new InstancedMesh(geometry, createBubbleMaterial({ drift: true, opacity: 0.9 }), count)
    const identity = new Matrix4()
    let k = 0
    for (const [x, y, z, spread, rise, size, n, tint] of spots) {
      for (let j = 0; j < n; j += 1, k += 1) {
        const a = rand() * Math.PI * 2
        const r = Math.sqrt(rand()) * spread
        base.set([x + Math.cos(a) * r, y + rand() * 0.5, z + Math.sin(a) * r, size * (0.6 + rand() * 0.8)], k * 4)
        // phase, speed (cycles/s), rise (m), wobble (m)
        drift.set([rand(), 0.08 + rand() * 0.1, rise * (0.7 + rand() * 0.6), 0.2 + rand() * 0.4], k * 4)
        mesh.setMatrixAt(k, identity)
        mesh.setColorAt(k, tint ? tint.clone().lerp(TINTS[k % TINTS.length], 0.45) : TINTS[k % TINTS.length])
      }
    }
    geometry.setAttribute('aBase', new InstancedBufferAttribute(base, 4))
    geometry.setAttribute('aDrift', new InstancedBufferAttribute(drift, 4))
    // Their instance matrices are all identity (the shader places them): never culled.
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    return mesh
  }, [density])

  // The soap films across every giant hoop - the Blow Pads' and the arch's - shimmering
  // in the same soap-film shader: one merged mesh, one draw call.
  const films = useMemo(() => {
    const discs = []
    for (let i = 0; i < PAD_COUNT; i += 1) {
      const g = new CircleGeometry(padHoopRadius(i) - 0.15, 32)
      g.rotateY(Math.PI / 2)
      g.translate(HOOP_X + 0.03, hoopCentreY(i), padCenterZ(i))
      discs.push(g)
    }
    const arch = new CircleGeometry(ARCH_HOOP.r - 0.32, 40)
    arch.translate(ARCH_HOOP.x, ARCH_HOOP.y, ARCH_HOOP.z + 0.05)
    discs.push(arch)
    const geometry = mergeGeometries(discs)
    for (const g of discs) g.dispose()
    const material = createBubbleMaterial({ id: 'soap', opacity: 0.55 })
    material.side = DoubleSide
    const film = new Mesh(geometry, material)
    film.renderOrder = 2
    return film
  }, [])

  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    },
    [mesh],
  )
  useEffect(
    () => () => {
      films.geometry.dispose()
      films.material.dispose()
    },
    [films],
  )

  return (
    <>
      <primitive object={mesh} />
      <primitive object={films} />
    </>
  )
}

export default AmbientBubbles
