import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'

import { useQuality } from '../../store/quality'
import { createBubbleMaterial } from '../bubbles'
import { drainPuffs, PUFF_STREAM } from './puffQueue'

/** Bubbles in the pool: plenty on MEDIUM/HIGH, a lean stream on LOW. */
const POOL = 64
const POOL_LOW = 24
const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _c = new Color()
const ZERO = new Matrix4().makeScale(0, 0, 0)

/**
 * How each kind of puff flies: launch speed (min, spread), life in seconds (min, spread),
 * radius (min, spread), how fast the air slows it (per second), how fast it rises.
 */
const KINDS = [
  { speed: 1.6, speedSpread: 1.6, life: 1.2, lifeSpread: 0.8, size: 0.13, sizeSpread: 0.15, drag: 1.6, lift: 0.6 },
  { speed: 2.8, speedSpread: 1.6, life: 2.2, lifeSpread: 0.9, size: 0.2, sizeSpread: 0.25, drag: 0.6, lift: 0.4 },
]

const pieces = Array.from({ length: POOL }, () => ({ life: 0, age: 0, pos: new Vector3(), vel: new Vector3(), size: 0.1, wob: 0, drag: 1, lift: 0.5 }))

/** Where queued puffs go this frame: the pool's mesh, its live size, the next slot, whether any were tinted. */
const spawning = { mesh: null, pool: POOL, next: 0, coloured: false }

/** Starts one puff from the queue (drainPuffs' callback: one function, no per-frame closure). */
function spawnPuff(x, y, z, dx, dz, color, kind) {
  const i = spawning.next % spawning.pool
  spawning.next = (i + 1) % spawning.pool
  const p = pieces[i]
  const k = KINDS[kind === PUFF_STREAM ? 1 : 0]
  const len = Math.hypot(dx, dz) || 1
  const speed = k.speed + Math.random() * k.speedSpread
  p.life = k.life + Math.random() * k.lifeSpread
  p.age = 0
  p.size = k.size + Math.random() * k.sizeSpread
  p.wob = Math.random() * 6.28
  p.drag = k.drag
  p.lift = k.lift
  p.pos.set(x, y, z)
  p.vel.set((dx / len) * speed + (Math.random() - 0.5) * 0.9, 0.35 + Math.random() * 0.8, (dz / len) * speed + (Math.random() - 0.5) * 0.9)
  spawning.mesh.setColorAt(i, _c.set(color))
  spawning.coloured = true
}

/**
 * The little bubbles blown out of wands (fx/puffQueue.js queues them): a stream of them
 * flowing off your wand through a Blow Pad's giant hoop while you blow, a puff at every
 * tap of BLOW, other players' too. Each drifts off the way it was blown, rises, wobbles
 * and pops. One pooled InstancedMesh of low-poly soap-film spheres, tinted per bubble:
 * one draw call, none when nothing's flying. They're what you do in this game, so they
 * stay on every preset - LOW keeps a lean pool (POOL_LOW: ~3k triangles at most).
 */
export function Puffs() {
  const low = useQuality((s) => !s.settings.particles)
  const ref = useRef(null)

  const mesh = useMemo(() => {
    const m = new InstancedMesh(new SphereGeometry(1, 10, 7), createBubbleMaterial({ opacity: 0.95 }), POOL)
    for (let i = 0; i < POOL; i += 1) {
      m.setMatrixAt(i, ZERO)
      // Colours exist from the start, so the shader is compiled with them once.
      m.setColorAt(i, _c.set(0xbfe9ff))
    }
    m.frustumCulled = false
    m.visible = false
    m.renderOrder = 2
    return m
  }, [])

  useEffect(
    () => () => {
      for (const p of pieces) p.life = 0
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    },
    [mesh],
  )

  useFrame((_state, rawDelta) => {
    const instanced = ref.current
    if (!instanced) return
    const delta = Math.min(rawDelta, 0.05)
    // LOW draws only the first POOL_LOW instances; anything beyond is retired.
    const pool = low ? POOL_LOW : POOL
    if (instanced.count !== pool) {
      for (let i = pool; i < POOL; i += 1) {
        pieces[i].life = 0
        instanced.setMatrixAt(i, ZERO)
      }
      instanced.count = pool
    }
    spawning.mesh = instanced
    spawning.pool = pool
    spawning.coloured = false
    drainPuffs(spawnPuff)
    if (spawning.coloured && instanced.instanceColor) instanced.instanceColor.needsUpdate = true

    let alive = false
    for (let i = 0; i < pool; i += 1) {
      const p = pieces[i]
      if (p.life <= 0) continue
      p.age += delta
      if (p.age >= p.life) {
        p.life = 0
        instanced.setMatrixAt(i, ZERO)
        alive = true
        continue
      }
      alive = true
      // Slowing as the air takes them, drifting upwards, wobbling.
      p.vel.multiplyScalar(1 - delta * p.drag)
      p.vel.y += delta * p.lift
      p.pos.addScaledVector(p.vel, delta)
      const t = p.age / p.life
      const grow = Math.min(1, t * 8) * (t > 0.9 ? 1 + (t - 0.9) * 4 : 1)
      const wobble = 1 + Math.sin(p.age * 11 + p.wob) * 0.08
      _s.set(p.size * grow * wobble, (p.size * grow) / wobble, p.size * grow)
      instanced.setMatrixAt(i, _m.compose(p.pos, _q, _s))
    }
    instanced.visible = alive
    if (alive) instanced.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}

export default Puffs
