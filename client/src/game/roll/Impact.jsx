import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Euler, Matrix4, Mesh, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three'

import { zoneIndexAt } from '@shared/logic'

import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { fireBurst } from '../fx/fxQueue'
import { sharedMaterials, STYLE } from '../materials'
import { tireGlow } from '../tire'
import { zones } from '../worldLook'
import { slopeY, SLOPE_EULER_X, trackPoint } from './path'
import { roll } from './rollControl'
import { STAGE_LOOKS } from './themes'

/**
 * The ball thumping down on the turf at the end of its arc (rollControl's `impact`): a
 * football landing, cartoon style - nothing cracks, nothing breaks. Where it hits, the
 * turf dips into a soft round dent with a lighter lip round it; a white shockwave ring
 * races out over the pitch with a ring of light in the ball's own colour behind it; and
 * chunky little tufts of grass and clods of soil pop up, bounce once and vanish, with a
 * divot of turf flipping over through the air. The ball bounces and comes to rest in the
 * dent (path.rideState). The harder the kick landed (PERFECT high, WEAK low), the bigger
 * all of it.
 *
 * The dent and rings are one procedural quad (no texture, all round shapes - no lines or
 * cracks); the tufts, clods and divot are one pool of boxes, one draw call - fewer of
 * them on presets without particles. Everything is in the colours of the stage's turf.
 * Nothing is allocated while it plays.
 */

const TUFTS = 22
const TUFTS_LOW = 10
const CLODS = 8
const CLODS_LOW = 4
/** The pool: tufts, then clods, then the one divot. */
const POOL = TUFTS + CLODS + 1
const DIVOT = POOL - 1
const GRAVITY = 26
/** Pieces vanish this long after they come to rest (popping away, shrinking). */
const VANISH = 0.35
/** Whatever happens, every piece is gone by then. */
const MAX_LIFE = 2.6
/** The dent's radius on the turf: bigger the higher the ball fell. */
const dentRadius = (peak) => 2 + peak * 0.14

const SOIL = new Color('#6b4426')
const SOIL_DARK = new Color('#4a2e1a')
const ZERO = new Matrix4().makeScale(0, 0, 0)
const WHITE = new Color('#ffffff')
const _turf = new Color()
const _turfLight = new Color()
const _turfDark = new Color()

const splashVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const splashFragment = /* glsl */ `
  uniform float uAge;
  uniform vec3 uGlow;
  uniform vec3 uTurf;
  varying vec2 vUv;
  void main() {
    // -1..1 across the quad: the dent fills the middle, the rings run out to the edge.
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float fade = 1.0 - smoothstep(2.6, 3.6, uAge);
    // Pressed in at once with a little squash-and-settle, as the ball thumps down.
    float press = 1.0 - pow(1.0 - clamp(uAge / 0.1, 0.0, 1.0), 3.0);
    float dentR = 0.19 * (press + 0.12 * sin(clamp(uAge / 0.4, 0.0, 1.0) * 3.14159) * (1.0 - press * 0.5));

    // The dent: darker turf, shaded deepest in the middle and on the side away from the
    // sun, with soft round edges.
    float dent = 1.0 - smoothstep(dentR * 0.75, dentR, r);
    float lit = dot(r > 0.0001 ? p / r : vec2(0.0), normalize(vec2(-0.6, 0.8)));
    vec3 dentCol = uTurf * mix(0.55, 0.8, smoothstep(0.0, dentR, r)) * (0.92 - 0.1 * lit);
    // Its lip: a soft lighter ring of turf pushed up round it, lit on the sun's side.
    float lip = (1.0 - smoothstep(0.0, 0.05, abs(r - dentR - 0.03))) * press;
    vec3 lipCol = mix(uTurf * 1.25, vec3(1.0), 0.15) * (0.9 + 0.15 * lit);

    // Two rings racing out over the pitch: a sharp white shockwave, and a softer ring of
    // light in the ball's own colour just behind it.
    float r1 = uAge * 2.6;
    float r2 = uAge * 1.8;
    float ring1 = (1.0 - smoothstep(0.0, 0.04, abs(r - r1))) * (1.0 - smoothstep(0.05, 0.45, uAge));
    float ring2 = (1.0 - smoothstep(0.0, 0.1, abs(r - r2))) * (1.0 - smoothstep(0.1, 0.7, uAge));

    vec3 col = lipCol;
    float alpha = lip * 0.8;
    col = mix(col, dentCol, dent);
    alpha = max(alpha, dent * 0.85);
    col = mix(col, uGlow * 1.2 + vec3(0.15), ring2);
    alpha = max(alpha, ring2 * 0.7 * step(r, 1.0));
    col = mix(col, vec3(1.0), ring1);
    alpha = max(alpha, ring1 * 0.9 * step(r, 1.0));

    alpha *= fade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`

/** Lying flat on the slope, like the field's painted numbers. */
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2 + SLOPE_EULER_X, 0, 0))
const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _at = new Vector3()

function createSplash() {
  const material = new ShaderMaterial({
    uniforms: {
      uAge: { value: 99 },
      uGlow: { value: new Color('#ffb347') },
      uTurf: { value: new Color('#2fbf47') },
    },
    vertexShader: splashVertex,
    fragmentShader: splashFragment,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  })
  const mesh = new Mesh(new PlaneGeometry(1, 1), material)
  mesh.quaternion.copy(FLAT)
  mesh.renderOrder = 2
  // Never hidden, only shrunk to nothing between landings: a hidden mesh isn't compiled
  // with the rest of the kick (Roll.jsx), and compiling its shader at the moment the
  // ball lands would freeze a weak GPU right then. Shrunk, it costs one empty draw call.
  mesh.scale.setScalar(0)
  mesh.frustumCulled = false
  return mesh
}

/** Every piece's state, made once: its flight, its tumble, its size, when it came to rest. */
const pieces = Array.from({ length: POOL }, () => ({
  on: false,
  pos: new Vector3(),
  vel: new Vector3(),
  axis: new Vector3(0, 1, 0),
  angle: 0,
  spin: 0,
  size: new Vector3(1, 1, 1),
  /** Bounces left before it settles. */
  bounces: 1,
  /** Seconds after the landing it came to rest, or -1 while it's still moving. */
  restAt: -1,
}))

/** Throws piece `c` up out of the landing at `at`, `a` its direction across the turf (radians). */
function launch(c, at, a, speedOut, speedUp) {
  c.on = true
  c.restAt = -1
  c.bounces = 1
  c.pos.copy(at)
  c.vel.set(Math.cos(a) * speedOut, speedUp, Math.sin(a) * speedOut)
  c.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
  c.angle = Math.random() * 3
}

export default function Impact() {
  const splashRef = useRef(null)
  const sprayRef = useRef(null)
  /** The impact (its impactAt) the effect was last started for, and when the spray flew. */
  const shown = useRef({ at: 0, sprayAt: 0 })
  const assets = useMemo(() => {
    const spray = createBoxInstances(POOL, sharedMaterials().toy, STYLE.SMOOTH)
    spray.castShadow = false
    return { splash: createSplash(), spray }
  }, [])

  useEffect(
    () => () => {
      assets.splash.geometry.dispose()
      assets.splash.material.dispose()
      disposeBlocks(assets.spray)
    },
    [assets],
  )

  useFrame((_state, rawDelta) => {
    const splash = splashRef.current
    const spray = sprayRef.current
    if (!splash || !spray) return
    const dt = Math.min(rawDelta, 0.05)
    const now = performance.now()
    const st = shown.current

    if (!roll.active || !roll.impactAt) {
      splash.scale.setScalar(0)
      spray.count = 0
      return
    }

    if (st.at !== roll.impactAt) {
      // A new landing: press the dent in where it hit, in this stage's turf, and throw
      // the tufts.
      st.at = roll.impactAt
      st.sprayAt = now
      // A PERFECT kick lands hardest, a WEAK one barely marks the grass.
      const grade = roll.hit === 'perfect' ? 1.3 : roll.hit === 'great' ? 1.12 : roll.hit === 'weak' ? 0.7 : 1
      const size = dentRadius(roll.impactPeak) * grade
      const power = Math.min(1, (roll.impactPeak / 32) * grade)
      trackPoint(roll.impactMeter, roll.impact.x, 0.11, splash.position)
      splash.scale.setScalar(size * 4)
      const look = STAGE_LOOKS[zones()[zoneIndexAt(roll.impactMeter)]?.theme] || STAGE_LOOKS.grassy
      _turf.set(look.turf[0])
      _turfLight.set(look.turf[1]).lerp(WHITE, 0.12)
      _turfDark.set(look.turf[0]).multiplyScalar(0.72)
      const u = splash.material.uniforms
      u.uTurf.value.copy(_turf)
      u.uGlow.value.copy(tireGlow(roll.tireId))

      const full = getQuality().particles
      const tufts = full ? TUFTS : TUFTS_LOW
      const clods = full ? CLODS : CLODS_LOW
      const at = splash.position
      for (let i = 0; i < POOL; i += 1) pieces[i].on = false
      // Chunky tufts of grass popping up and out all round, in the turf's greens.
      for (let i = 0; i < tufts; i += 1) {
        const c = pieces[i]
        const a = (i / tufts) * Math.PI * 2 + Math.random() * 0.5
        launch(c, _at.set(at.x + Math.cos(a) * 0.5, at.y + 0.15, at.z + Math.sin(a) * 0.5), a, (2 + Math.random() * 4) * (0.7 + 0.5 * power), (5 + Math.random() * 6) * (0.75 + 0.45 * power))
        c.spin = (Math.random() - 0.5) * 12
        const k = (0.16 + Math.random() * 0.12) * (0.85 + 0.4 * power)
        c.size.set(k, k * 0.75, k)
        spray.setColorAt(i, i % 3 === 0 ? _turfLight : i % 3 === 1 ? _turf : _turfDark)
      }
      // A few clods of soil, lower and heavier.
      for (let j = 0; j < clods; j += 1) {
        const i = TUFTS + j
        const c = pieces[i]
        const a = (j / clods) * Math.PI * 2 + Math.random() * 0.8
        launch(c, _at.set(at.x, at.y + 0.15, at.z), a, 1.5 + Math.random() * 3 * (0.6 + 0.6 * power), 4 + Math.random() * 4)
        c.spin = (Math.random() - 0.5) * 10
        const k = 0.13 + Math.random() * 0.12 * (0.7 + 0.6 * power)
        c.size.set(k, k * 0.8, k)
        spray.setColorAt(i, j % 2 ? SOIL : SOIL_DARK)
      }
      // The divot: a slab of turf thrown up, flipping over once, landing upside down a
      // little way back towards the kicker.
      const d = pieces[DIVOT]
      launch(d, _at.set(at.x + 0.3, at.y + 0.15, at.z + 0.6), Math.PI / 2 + (Math.random() - 0.5) * 0.6, 2.2 + power * 1.5, 7 + power * 3)
      d.axis.set(1, 0, 0)
      d.angle = 0
      d.spin = Math.PI / ((2 * (7 + power * 3)) / GRAVITY)
      d.bounces = 0
      d.size.set(0.8 + power * 0.3, 0.12, 0.55 + power * 0.2)
      spray.setColorAt(DIVOT, _turfDark)
      for (let i = 0; i < POOL; i += 1) if (!pieces[i].on) spray.setMatrixAt(i, ZERO)
      spray.instanceColor.needsUpdate = true
      // A light puff of grass dust where it hit.
      fireBurst(at.x, at.y + 0.3, at.z, 'turf')
    }

    splash.material.uniforms.uAge.value = (now - roll.impactAt) / 1000

    const age = (now - st.sprayAt) / 1000
    let alive = false
    for (let i = 0; i < POOL; i += 1) {
      const c = pieces[i]
      if (!c.on) continue
      // Gone: a while after it came to rest (the divot lies there a little longer).
      const linger = i === DIVOT ? 1.2 : VANISH
      if (age > MAX_LIFE || (c.restAt >= 0 && age > c.restAt + linger)) {
        c.on = false
        spray.setMatrixAt(i, ZERO)
        continue
      }
      alive = true
      if (c.restAt < 0) {
        c.vel.y -= GRAVITY * dt
        c.pos.addScaledVector(c.vel, dt)
        c.angle += c.spin * dt
        const floor = slopeY(c.pos.z) + c.size.y * 0.5
        if (c.pos.y < floor) {
          c.pos.y = floor
          if (c.bounces > 0) {
            // One little hop, then it settles.
            c.bounces -= 1
            c.vel.set(c.vel.x * 0.45, Math.abs(c.vel.y) * 0.3, c.vel.z * 0.45)
            c.spin *= 0.5
          } else {
            c.restAt = age
            // The divot lands flat, upside down.
            if (i === DIVOT) c.angle = Math.PI
          }
        }
      }
      // Popping away once it has settled: a quick shrink to nothing.
      const shrink = c.restAt < 0 ? 1 : Math.max(0, 1 - (age - c.restAt - (linger - VANISH)) / VANISH)
      _q.setFromAxisAngle(c.axis, c.angle)
      spray.setMatrixAt(i, _m.compose(c.pos, _q, _s.copy(c.size).multiplyScalar(Math.min(1, shrink))))
    }
    spray.count = alive ? POOL : 0
    if (alive) spray.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive ref={splashRef} object={assets.splash} />
      <primitive ref={sprayRef} object={assets.spray} />
    </>
  )
}
