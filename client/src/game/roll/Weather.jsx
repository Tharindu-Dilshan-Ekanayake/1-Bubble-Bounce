import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { zoneIndexAt } from '@shared/logic'

import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { zones } from '../worldLook'
import { roll } from './rollControl'

/**
 * Something in the air of every stage while your ball flies over it: snow on the Frozen
 * Tundra, autumn leaves at High School, blossom petals at College, embers rising off the
 * Volcano, bubbles over the Coral Arena, fireflies in the jungle, sparkles in the Candy
 * Bowl, star dust in space...
 *
 * One fixed pool of little glowing boxes (one draw call) kept in a box round the camera:
 * whatever drifts out of it, or is left behind as the camera races on, comes back in
 * ahead. Only on presets with particles; nothing is drawn on LOW.
 */

const COUNT = 160
/** The box round the camera they fill: across, up and down, and ahead of it. */
const SPAN_X = 34
const SPAN_Y = 18
const AHEAD = 55
const BEHIND = 6

/**
 * Each kind: colours, size [x, y, z], drift velocity [x, y, z] (m/s), how much it sways
 * and tumbles, and whether it twinkles.
 */
const KINDS = {
  pollen: { colors: ['#ffffff', '#fff3a0', '#ffd6f0'], size: [0.24, 0.24, 0.24], vel: [0.3, 0.3, 0], sway: 0.6, spin: 1 },
  leaves: { colors: ['#ff8a1e', '#e8452c', '#ffc12a'], size: [0.7, 0.12, 0.5], vel: [0.6, -1.6, 0], sway: 1.4, spin: 4 },
  petals: { colors: ['#ffb8d8', '#ff9cc8', '#ffffff'], size: [0.5, 0.1, 0.4], vel: [0.5, -1.2, 0], sway: 1.2, spin: 4 },
  sand: { colors: ['#f0d080', '#e8c46e'], size: [0.2, 0.2, 0.2], vel: [6, -0.3, 0], sway: 0.4, spin: 2 },
  snow: { colors: ['#ffffff', '#e6f6ff'], size: [0.36, 0.36, 0.36], vel: [0.2, -2, 0], sway: 0.8, spin: 1 },
  embers: { colors: ['#ff6a1e', '#ffb21e', '#ff3b1e'], size: [0.32, 0.32, 0.32], vel: [0, 2.6, 0], sway: 0.6, spin: 3, twinkle: true },
  bubbles: { colors: ['#bff4ff', '#ffffff', '#7fe2ff'], size: [0.52, 0.52, 0.52], vel: [0, 1.8, 0], sway: 0.7, spin: 0.5 },
  fireflies: { colors: ['#e6ff5a', '#9dff6a', '#fff27a'], size: [0.28, 0.28, 0.28], vel: [0, 0.2, 0], sway: 1.6, spin: 0, twinkle: true },
  sparkles: { colors: ['#ff5fd2', '#5fd6ff', '#ffe45c', '#8dff4f', '#c46bff'], size: [0.32, 0.32, 0.32], vel: [0, 0.5, 0], sway: 0.5, spin: 5, twinkle: true },
  dust: { colors: ['#ffffff', '#cfd8ff', '#ffe6fb'], size: [0.2, 0.2, 0.2], vel: [0.2, 0.1, 0], sway: 0.3, spin: 0, twinkle: true },
}

/** Which kind fills each stage theme's air (none in some, for a change). */
const BY_THEME = {
  grassy: 'pollen',
  autumn: 'leaves',
  desert: 'sand',
  jungle: 'fireflies',
  frozen: 'snow',
  cherry: 'petals',
  candy: 'sparkles',
  mushroom: 'fireflies',
  volcano: 'embers',
  swamp: 'fireflies',
  crystal: 'sparkles',
  ocean: 'bubbles',
  neon: 'sparkles',
  rainbow: 'sparkles',
  moon: 'dust',
  aurora: 'snow',
  space: 'dust',
  cosmic: 'sparkles',
}

const KIND_COLORS = Object.fromEntries(Object.entries(KINDS).map(([id, k]) => [id, k.colors.map((c) => new Color(c))]))

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _axis = new Vector3()

/** A fresh spot for particle `i` somewhere in the box ahead of the camera at `cam`. */
function respawn(pt, cam, anywhere) {
  pt.pos.set(cam.x + (Math.random() - 0.5) * SPAN_X, cam.y + (Math.random() - 0.5) * SPAN_Y, cam.z - (anywhere ? Math.random() : 0.15 + Math.random() * 0.85) * AHEAD)
}

export function Weather() {
  const ref = useRef(null)
  const state = useRef({ kind: null, points: Array.from({ length: COUNT }, (_, i) => ({ pos: new Vector3(), phase: i * 1.7, axis: new Vector3(1, 0, 0) })) })
  const mesh = useMemo(() => {
    const m = createBoxInstances(COUNT, sharedMaterials().toy, STYLE.GLOW)
    m.count = 0
    return m
  }, [])

  useEffect(() => () => disposeBlocks(mesh), [mesh])

  useFrame((frame, rawDelta) => {
    const pts = ref.current
    if (!pts) return
    const st = state.current
    const kindId = roll.active && getQuality().particles ? BY_THEME[zones()[zoneIndexAt(Math.max(0, roll.meter))].theme] : null
    if (!kindId) {
      pts.count = 0
      st.kind = null
      return
    }
    const kind = KINDS[kindId]
    const cam = frame.camera.position
    // A new stage's air: recolour the pool and spread it out round the camera.
    if (st.kind !== kindId) {
      st.kind = kindId
      const colors = KIND_COLORS[kindId]
      for (let i = 0; i < COUNT; i += 1) {
        const pt = st.points[i]
        respawn(pt, cam, true)
        pt.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
        pts.setColorAt(i, colors[i % colors.length])
      }
      if (pts.instanceColor) pts.instanceColor.needsUpdate = true
    }
    const delta = Math.min(rawDelta, 0.05)
    const t = frame.clock.elapsedTime
    for (let i = 0; i < COUNT; i += 1) {
      const pt = st.points[i]
      const p = pt.pos
      p.x += (kind.vel[0] + Math.sin(t * 1.3 + pt.phase) * kind.sway) * delta
      p.y += (kind.vel[1] + Math.cos(t * 1.1 + pt.phase) * kind.sway * 0.5) * delta
      p.z += kind.vel[2] * delta
      // Out of the box (left behind, or drifted off): back in, ahead.
      if (p.z > cam.z + BEHIND || p.z < cam.z - AHEAD || Math.abs(p.x - cam.x) > SPAN_X / 2 || Math.abs(p.y - cam.y) > SPAN_Y / 2) {
        respawn(pt, cam, false)
      }
      const twinkle = kind.twinkle ? 0.55 + 0.45 * Math.sin(t * 6 + pt.phase * 3) : 1
      _q.setFromAxisAngle(_axis.copy(pt.axis), t * kind.spin + pt.phase)
      _s.set(kind.size[0] * twinkle, kind.size[1] * twinkle, kind.size[2] * twinkle)
      pts.setMatrixAt(i, _m.compose(_p.copy(p), _q, _s))
    }
    pts.count = COUNT
    pts.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}

export default Weather
