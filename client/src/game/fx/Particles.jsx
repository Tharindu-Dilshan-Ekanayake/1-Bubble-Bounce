import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { useQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { drainBursts } from './fxQueue'

/** Fixed pool: bursts reuse the oldest pieces when it's full. */
const POOL = 160
const GRAVITY = 14

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _s = new Vector3()
/** Size of one confetti piece. */
const PIECE = new Vector3(0.22, 0.22, 0.06)

/** Pool state. Module-level: there is one particle system, mutated every frame. */
const pieces = Array.from({ length: POOL }, () => ({
  life: 0,
  pos: new Vector3(),
  vel: new Vector3(),
  rot: new Vector3(),
  spin: new Vector3(),
}))

const PALETTES = {
  confetti: ['#ff3b5c', '#ffd21f', '#4ef05a', '#2fc6ff', '#b15cff', '#ffffff'].map((c) => new Color(c)),
  gold: ['#ffe45c', '#ffc21f', '#ff9a12', '#ffffff'].map((c) => new Color(c)),
  power: ['#ffd84a', '#ffa21c', '#ffffff'].map((c) => new Color(c)),
  /** Splinters and sawdust from a smashed wooden wall. */
  wood: ['#c98f52', '#a8743f', '#e8c48a', '#8a5a32', '#fff3d6'].map((c) => new Color(c)),
}

/**
 * Confetti bursts (level up, rebirth, landing, purchases). One InstancedMesh, a fixed
 * pool of pieces, no allocation after start-up. Off entirely on presets without
 * particles: bursts queued there are simply dropped.
 */
export function Particles() {
  const enabled = useQuality((s) => s.settings.particles)
  const ref = useRef(null)
  const next = useRef(0)

  const mesh = useMemo(() => {
    // Glowing toy boxes through the shared toy material: no extra shader program.
    // Every piece starts parked at zero scale.
    const m = createBoxInstances(POOL, sharedMaterials().toy, STYLE.GLOW)
    m.count = POOL
    m.visible = false
    return m
  }, [])

  useEffect(
    () => () => {
      // A remounted system (context restore) starts with an empty pool.
      for (const p of pieces) p.life = 0
      disposeBlocks(mesh)
    },
    [mesh],
  )

  useFrame((_state, rawDelta) => {
    const instanced = ref.current
    if (!instanced) return
    const delta = Math.min(rawDelta, 0.05)

    drainBursts((burst) => {
      if (!enabled) return
      const palette = PALETTES[burst.palette] || PALETTES.confetti
      for (let i = 0; i < burst.count; i += 1) {
        const index = next.current
        next.current = (next.current + 1) % POOL
        const p = pieces[index]
        p.life = 1.2 + Math.random() * 0.8
        p.pos.set(burst.x, burst.y, burst.z)
        const a = Math.random() * Math.PI * 2
        const speed = burst.speed * (0.5 + Math.random() * 0.7)
        p.vel.set(Math.cos(a) * speed * 0.6, burst.speed * (0.8 + Math.random() * 0.8), Math.sin(a) * speed * 0.6)
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
        p.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14)
        instanced.setColorAt(index, palette[Math.floor(Math.random() * palette.length)])
      }
      if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    })

    let alive = false
    for (let i = 0; i < POOL; i += 1) {
      const p = pieces[i]
      if (p.life <= 0) continue
      p.life -= delta
      if (p.life <= 0) {
        instanced.setMatrixAt(i, _m.makeScale(0, 0, 0))
        alive = true
        continue
      }
      alive = true
      p.vel.y -= GRAVITY * delta
      p.vel.multiplyScalar(1 - delta * 1.2)
      p.pos.addScaledVector(p.vel, delta)
      p.rot.addScaledVector(p.spin, delta)
      _q.setFromEuler(_e.set(p.rot.x, p.rot.y, p.rot.z))
      _s.copy(PIECE).multiplyScalar(Math.min(1, p.life * 2))
      instanced.setMatrixAt(i, _m.compose(p.pos, _q, _s))
    }
    // Nothing to draw (or particles off): skip the draw call entirely.
    instanced.visible = alive
    if (alive) instanced.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}

export default Particles
