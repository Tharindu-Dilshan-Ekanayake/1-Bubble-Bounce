import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three'

import { getQuality } from '../../store/quality'
import { takeFireBurst } from './fxQueue'

/**
 * The burst off the paddle on a good hit, by grade: PERFECT's fire - a flash, a column
 * of flame puffs roaring upwards, white-hot then yellow, orange, red, fading to smoke as
 * they rise and swell, and bright sparks shooting high and raining back down - GREAT's
 * electric-blue blast, and GOOD's spray of sparkles.
 *
 * One instanced mesh of camera-facing glowing sprites (procedural: no texture), a
 * fixed pool, nothing allocated while it plays. On LOW about half as many.
 * Started with fxQueue's `fireBurst(x, y, z)`.
 */

const FLAMES = 36
const SPARKS = 44
const FLASH = 1
const POOL = FLASH + FLAMES + SPARKS
/** How much of each a LOW preset throws. */
const LOW_SHARE = 0.55
const SPARK_GRAVITY = 20

const colors = (list) => list.map((c) => new Color(c))
/**
 * Each kind of burst: flame colours by age (hottest first), spark colours, the flash,
 * how many flames and sparks (shares of the pool), and how fast and high they fly.
 */
const KINDS = {
  perfect: {
    ramp: colors(['#fff6b0', '#ffd21f', '#ff9a12', '#ff5a14', '#e0241a', '#5a2a24']),
    sparks: colors(['#ffffff', '#fff6a3', '#ffd21f', '#ffae3a']),
    flash: new Color('#fff0b0'),
    flames: 1,
    sparkShare: 1,
    speed: 1,
  },
  great: {
    ramp: colors(['#9ff0ff', '#3fd0ff', '#1f9aff', '#2f5fe0', '#6a3cff', '#2a1a50']),
    sparks: colors(['#ffffff', '#5fe0ff', '#3fa8ff', '#8affc8']),
    flash: new Color('#5fd6ff'),
    flames: 0.6,
    sparkShare: 1,
    speed: 0.8,
  },
  dust: {
    // The ground smash: a billow of pale dust thrown out low and wide, and pebbles.
    ramp: colors(['#fffaf0', '#f2e8d6', '#e2d4bc', '#cdbd9f', '#b8a784', '#a8987a']),
    sparks: colors(['#8a6a4a', '#b9a48a', '#6a4a30', '#d8c8a8']),
    flash: new Color('#fff6e0'),
    flames: 1,
    sparkShare: 0.6,
    speed: 0.32,
    spread: 3.6,
    size: 1.7,
  },
  turf: {
    // A football thumping onto grass: a small, low puff of pale grass dust and flecks of
    // green and soil - a landing on a pitch, not a smash through the ground.
    ramp: colors(['#ffffff', '#f2f6e8', '#e2ead2', '#cfdbbb', '#bccaa6', '#aebc98']),
    sparks: colors(['#3ad456', '#2fbf47', '#9ae07a', '#6b4426']),
    flash: new Color('#f6fff0'),
    flames: 0.4,
    sparkShare: 0.8,
    speed: 0.26,
    spread: 2.2,
    size: 1,
  },
  good: {
    ramp: colors(['#ffffff', '#fff6c8', '#ffe27a', '#ffd21f', '#ffb21e', '#ffffff']),
    sparks: colors(['#ffffff', '#fff6a3', '#ffd21f', '#ff9ee0']),
    flash: new Color('#fffbe0'),
    flames: 0,
    sparkShare: 0.7,
    speed: 0.6,
  },
}

const vertexShader = /* glsl */ `
  attribute vec2 aGlow;
  varying vec3 vColor;
  varying vec2 vUv;
  varying vec2 vGlow;
  void main() {
    vec3 centre = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float size = length(instanceMatrix[0].xyz);
    vec4 mv = modelViewMatrix * vec4(centre, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vColor = instanceColor;
    vUv = uv;
    vGlow = aGlow;
  }
`
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying vec2 vUv;
  varying vec2 vGlow;
  void main() {
    // x = brightness (0 = gone), y = softness: 0 a hard spark, 1 a soft flame puff.
    float r = length(vUv - 0.5) * 2.0;
    float core = 1.0 - smoothstep(mix(0.15, 0.0, vGlow.y), 1.0, r);
    // Normal blending, not additive: over a bright sky additive glow washes out to
    // white, and fire has to read orange and red. A hot, lighter middle.
    float a = core * vGlow.x;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * (1.0 + 0.35 * (1.0 - r)), min(1.0, a));
    #include <colorspace_fragment>
  }
`

/** The pool's state, made once. */
const flames = Array.from({ length: FLAMES }, () => ({ life: 0, max: 1, pos: new Vector3(), vel: new Vector3(), size: 1 }))
const sparks = Array.from({ length: SPARKS }, () => ({ life: 0, max: 1, pos: new Vector3(), vel: new Vector3(), size: 0.15 }))
const flash = { life: 0, pos: new Vector3() }
/** The flame colours of the burst playing now. */
let ramp = KINDS.perfect.ramp

const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _c = new Color()
const ZERO = new Matrix4().makeScale(0, 0, 0)

function createMesh() {
  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute('aGlow', new InstancedBufferAttribute(new Float32Array(POOL * 2), 2))
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  })
  const mesh = new InstancedMesh(geometry, material, POOL)
  for (let i = 0; i < POOL; i += 1) {
    mesh.setColorAt(i, KINDS.perfect.flash)
    mesh.setMatrixAt(i, ZERO)
  }
  // Never hidden (so it's compiled with everything else), just empty when idle.
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 6
  return mesh
}

export default function FireBurst() {
  const ref = useRef(null)
  const mesh = useMemo(() => createMesh(), [])

  useEffect(
    () => () => {
      for (const p of flames) p.life = 0
      for (const p of sparks) p.life = 0
      flash.life = 0
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    },
    [mesh],
  )

  useFrame((_state, rawDelta) => {
    const m = ref.current
    if (!m) return
    const dt = Math.min(rawDelta, 0.05)
    const glow = m.geometry.getAttribute('aGlow')

    const pending = takeFireBurst()
    if (pending) {
      const { x, y, z } = pending
      const kind = KINDS[pending.kind] ?? KINDS.perfect
      ramp = kind.ramp
      const share = getQuality().particles ? 1 : LOW_SHARE
      m.setColorAt(0, kind.flash)
      flash.life = 0.3
      flash.pos.set(x, y, z)
      for (let i = 0; i < FLAMES; i += 1) {
        const p = flames[i]
        if (i >= FLAMES * share * kind.flames) {
          p.life = 0
          continue
        }
        p.max = 0.9 + Math.random() * 0.6
        p.life = p.max
        p.pos.set(x + (Math.random() - 0.5) * 0.6, y - 0.2 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6)
        const a = Math.random() * Math.PI * 2
        const out = Math.random() * 2.2 * (kind.spread ?? 1)
        p.vel.set(Math.cos(a) * out, (9 + Math.random() * 11) * kind.speed, Math.sin(a) * out)
        p.size = (1 + Math.random() * 0.8) * (kind.size ?? 1)
      }
      for (let i = 0; i < SPARKS; i += 1) {
        const p = sparks[i]
        if (i >= SPARKS * share * kind.sparkShare) {
          p.life = 0
          continue
        }
        p.max = 0.9 + Math.random() * 0.7
        p.life = p.max
        p.pos.set(x, y, z)
        const a = Math.random() * Math.PI * 2
        const out = 1 + Math.random() * 6
        p.vel.set(Math.cos(a) * out * kind.speed, (10 + Math.random() * 14) * kind.speed, Math.sin(a) * out * kind.speed)
        p.size = 0.12 + Math.random() * 0.12
        m.setColorAt(FLASH + FLAMES + i, kind.sparks[i % kind.sparks.length])
      }
      m.instanceColor.needsUpdate = true
    }

    let alive = false
    // The flash: a white-hot ball swelling and gone in a blink.
    if (flash.life > 0) {
      flash.life -= dt
      const k = Math.max(0, flash.life / 0.3)
      m.setMatrixAt(0, _m.compose(flash.pos, _q, _s.setScalar(1.5 + (1 - k) * 4)))
      glow.setXY(0, k * 0.8, 1)
      alive = true
    } else {
      m.setMatrixAt(0, ZERO)
    }
    // The flames: roaring up, slowing, swelling, cooling from white to smoke.
    for (let i = 0; i < FLAMES; i += 1) {
      const p = flames[i]
      const slot = FLASH + i
      if (p.life <= 0) {
        m.setMatrixAt(slot, ZERO)
        continue
      }
      alive = true
      p.life -= dt
      const age = 1 - Math.max(0, p.life) / p.max
      p.vel.multiplyScalar(1 - dt * 1.8)
      p.vel.y += 4 * dt
      p.pos.addScaledVector(p.vel, dt)
      const r = age * (ramp.length - 1)
      const ri = Math.min(ramp.length - 2, Math.floor(r))
      m.setColorAt(slot, _c.copy(ramp[ri]).lerp(ramp[ri + 1], r - ri))
      m.setMatrixAt(slot, _m.compose(p.pos, _q, _s.setScalar(p.size * (0.6 + age * 1.8))))
      glow.setXY(slot, Math.min(1, (1 - age) * 1.4), 1)
    }
    // The sparks: shooting up, arcing over and raining down, twinkling as they go.
    for (let i = 0; i < SPARKS; i += 1) {
      const p = sparks[i]
      const slot = FLASH + FLAMES + i
      if (p.life <= 0) {
        m.setMatrixAt(slot, ZERO)
        continue
      }
      alive = true
      p.life -= dt
      p.vel.y -= SPARK_GRAVITY * dt
      p.vel.multiplyScalar(1 - dt * 0.6)
      p.pos.addScaledVector(p.vel, dt)
      const k = Math.max(0, p.life) / p.max
      m.setMatrixAt(slot, _m.compose(p.pos, _q, _s.setScalar(p.size * (0.7 + 0.3 * Math.sin(p.life * 40)))))
      glow.setXY(slot, Math.min(1, k * 1.6), 0)
    }

    m.count = alive ? POOL : 0
    if (alive) {
      m.instanceMatrix.needsUpdate = true
      m.instanceColor.needsUpdate = true
      glow.needsUpdate = true
    }
  })

  return <primitive ref={ref} object={mesh} />
}
