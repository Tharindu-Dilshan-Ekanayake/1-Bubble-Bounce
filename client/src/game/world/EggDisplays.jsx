import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'

import { EGG_STANDS } from '@shared/world'

import { getQuality } from '../../store/quality'
import { EGG_COLORS } from '../../ui/icons'
import { createGlowInstances, disposeGlow, glowTime } from '../glow'
import { eggHeight } from './eggs'

/**
 * Pattern and halo colour per egg. Shell colours come from EGG_COLORS ([base, dark,
 * spot], shared with the 2D icons) unless overridden here.
 */
const EGG_LOOKS = {
  basic: { pattern: 0, glow: '#9fe8ff', spot: '#6cc8ff', dark: '#2f8fe6' },
  meadow: { pattern: 1, glow: '#7cf08a' },
  sunset: { pattern: 2, glow: '#ffb347' },
  unicorn: { pattern: 3, glow: '#ffb0f0' },
  volcano: { pattern: 4, glow: '#ff6a14' },
  // Palm Beach: sandy white, blue waves rolling round it, seashell spots.
  beach: { pattern: 5, glow: '#5fe6ff', base: '#fff3dc', spot: '#2fb8e0', dark: '#ff8a7a' },
}

const vertexHead = /* glsl */ `
  attribute vec3 aEggSpot;
  attribute vec3 aEggDark;
  attribute float aEggPattern;
  varying vec3 vEggLocal;
  varying vec3 vEggSpot;
  varying vec3 vEggDark;
  varying float vEggPattern;
`
const vertexBody = /* glsl */ `
  vEggLocal = position;
  vEggSpot = aEggSpot;
  vEggDark = aEggDark;
  vEggPattern = aEggPattern;
`
const fragmentHead = /* glsl */ `
  varying vec3 vEggLocal;
  varying vec3 vEggSpot;
  varying vec3 vEggDark;
  varying float vEggPattern;
  uniform float uETime;
  const float ETAU = 6.2831853;
  float eHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
`

/** The six shell patterns, drawn on the unit sphere by latitude and longitude. */
const PATTERN_GLSL = /* glsl */ `
  {
    vec3 p = normalize(vEggLocal);
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.z, p.x);
    float d = vEggPattern + 0.5;
    vec3 base = diffuseColor.rgb;
    vec3 col = base;
    float glow = 0.0;
    if (d < 1.0) {
      // Basic: offset polka dots, and a zigzag band round the middle.
      vec2 cell = vec2(lon / ETAU * 8.0, lat / 3.14159 * 6.0);
      cell.x += step(1.0, mod(floor(cell.y), 2.0)) * 0.5;
      vec2 f = fract(cell) - 0.5;
      float dots = 1.0 - smoothstep(0.2, 0.25, length(f * vec2(1.0, 1.3)));
      float zig = abs(p.y - 0.09 * (abs(fract(lon / ETAU * 10.0) - 0.5) * 4.0 - 1.0));
      float band = 1.0 - smoothstep(0.065, 0.085, zig);
      col = mix(mix(base, vEggSpot, dots), vEggDark, band);
    } else if (d < 2.0) {
      // Meadow: a field of five-petal flowers with sunny middles.
      vec2 cell = vec2(lon / ETAU * 7.0, lat / 3.14159 * 5.0);
      cell.x += step(1.0, mod(floor(cell.y), 2.0)) * 0.5;
      vec2 f = fract(cell) - 0.5;
      float a = atan(f.y, f.x);
      float r = length(f);
      float edge = 0.2 + 0.09 * cos(a * 5.0);
      float petals = 1.0 - smoothstep(edge, edge + 0.04, r);
      float middle = 1.0 - smoothstep(0.07, 0.095, r);
      col = mix(mix(base, vEggSpot, petals), vec3(1.0, 0.84, 0.2), middle);
    } else if (d < 3.0) {
      // Sunset: warm sky fading down to dusk, with rolling stripes.
      col = mix(vEggDark, base, smoothstep(-0.9, 0.8, p.y));
      float wave = sin(lon * 6.0 + p.y * 4.0) * 0.07;
      float stripes = step(0.62, fract((p.y + wave) * 3.2));
      col = mix(col, vEggSpot, stripes * 0.75);
    } else if (d < 4.0) {
      // Unicorn: rainbow swirls on pastel, and twinkling stars.
      vec3 hue = 0.5 + 0.5 * cos(ETAU * (p.y * 0.8 + lon / ETAU + uETime * 0.08 + vec3(0.0, 0.33, 0.67)));
      float swirl = step(0.5, fract(lon / ETAU * 4.0 + p.y * 1.6));
      col = mix(base, mix(base, hue, 0.7), swirl);
      vec2 star = floor(vec2(lon / ETAU * 26.0, lat / 3.14159 * 16.0));
      float twinkle = step(0.92, eHash(star)) * (0.5 + 0.5 * sin(uETime * 4.0 + eHash(star + 3.1) * 6.0));
      col += vec3(twinkle * 0.9);
      glow = twinkle * 0.6;
    } else if (d < 5.0) {
      // Demon: dark shell split by glowing lava cracks that pulse.
      float n = sin(lon * 5.0 + sin(p.y * 7.0) * 1.5) * sin(p.y * 9.0 + sin(lon * 3.0) * 2.0);
      float crack = 1.0 - smoothstep(0.0, 0.13, abs(n));
      col = mix(base, vEggSpot, crack);
      glow = crack * (0.65 + 0.35 * sin(uETime * 3.0));
    } else {
      // Beach: sandy shell, blue waves rolling round it with white foam on their crests,
      // and coral seashell spots on the sand between them.
      float w = p.y + 0.07 * sin(lon * 6.0 + uETime * 1.2);
      float band = fract(w * 2.6 + 0.3);
      float wave = smoothstep(0.42, 0.47, band) * (1.0 - smoothstep(0.72, 0.77, band));
      float foam = (1.0 - smoothstep(0.0, 0.05, abs(band - 0.44))) * 0.9;
      vec2 cell = vec2(lon / ETAU * 9.0, lat / 3.14159 * 7.0);
      vec2 f = fract(cell) - 0.5;
      float shell = (1.0 - smoothstep(0.12, 0.16, length(f * vec2(1.0, 1.4)))) * step(0.55, eHash(floor(cell))) * (1.0 - wave);
      col = mix(mix(base, vEggSpot, wave), vec3(1.0), foam);
      col = mix(col, vEggDark, shell);
    }
    // Lit a touch from above.
    col *= mix(0.86, 1.06, p.y * 0.5 + 0.5);
    diffuseColor.rgb = col;
    totalEmissiveRadiance += vEggSpot * glow;
  }
`

/** Glossy shell: a highlight up and to the side of the view, and a rim light. */
const SHINE_GLSL = /* glsl */ `
  {
    vec3 eV = normalize(vViewPosition);
    vec3 eN = normalize(normal);
    vec3 eH = normalize(normalize(vec3(0.45, 0.85, 0.35)) + eV);
    float eSpec = pow(max(dot(eN, eH), 0.0), 40.0);
    float eRim = pow(1.0 - max(dot(eN, eV), 0.0), 3.0);
    outgoingLight += vec3(0.65) * eSpec + vec3(0.3) * eRim;
  }
`

function eggMaterial() {
  const material = new MeshLambertMaterial({ color: 0xffffff })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PATTERN_GLSL}`)
      .replace('#include <opaque_fragment>', `${SHINE_GLSL}\n#include <opaque_fragment>`)
    // The lobby's clock, which already ticks every frame for the halos.
    shader.uniforms.uETime = glowTime
  }
  material.customProgramCacheKey = () => 'egg-v2'
  return material
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _axis = new Vector3(0, 1, 0)

/**
 * The eggs on their stands: patterned glossy shells that slowly turn and bob, each
 * with a soft halo in its own colour. All five are one draw call (with one shader of
 * their own), the halos another.
 */
export function EggDisplays() {
  const meshRef = useRef(null)
  const glowRef = useRef(null)

  const assets = useMemo(() => {
    const count = EGG_STANDS.length
    const geometry = new SphereGeometry(1, 28, 20)
    const spot = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
    const dark = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
    const pattern = new InstancedBufferAttribute(new Float32Array(count), 1)
    geometry.setAttribute('aEggSpot', spot)
    geometry.setAttribute('aEggDark', dark)
    geometry.setAttribute('aEggPattern', pattern)
    const mesh = new InstancedMesh(geometry, eggMaterial(), count)
    mesh.castShadow = true
    mesh.frustumCulled = false
    const glows = createGlowInstances(count, 0.55)
    const c = new Color()
    EGG_STANDS.forEach((stand, i) => {
      const look = EGG_LOOKS[stand.eggId] || EGG_LOOKS.basic
      const [iconBase, iconDark, iconSpot] = EGG_COLORS[stand.eggId] || EGG_COLORS.basic
      const base = look.base || iconBase
      const spotColor = look.spot || iconSpot
      const darkColor = look.dark || iconDark
      mesh.setColorAt(i, c.set(base))
      c.set(spotColor)
      spot.setXYZ(i, c.r, c.g, c.b)
      c.set(darkColor)
      dark.setXYZ(i, c.r, c.g, c.b)
      pattern.setX(i, look.pattern)
      glows.setColorAt(i, c.set(look.glow))
    })
    glows.count = count
    return { mesh, glows }
  }, [])

  useEffect(
    () => () => {
      assets.mesh.geometry.dispose()
      assets.mesh.material.dispose()
      assets.mesh.dispose()
      disposeGlow(assets.glows)
    },
    [assets],
  )

  useFrame((state) => {
    const mesh = meshRef.current
    const glows = glowRef.current
    if (!mesh || !glows) return
    const t = state.clock.elapsedTime
    const glowSize = getQuality().boardGlow
    EGG_STANDS.forEach((stand, i) => {
      const scale = stand.big ? 1.5 : 1.05
      // The Demon Egg is crowned with horns and wings, so it turns on the spot.
      const bob = stand.big ? 0 : Math.sin(t * 1.5 + i * 1.3) * 0.12
      _p.set(stand.x, eggHeight(stand) + bob, stand.z)
      _q.setFromAxisAngle(_axis, t * 0.5 + i)
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s.set(scale, scale * 1.28, scale)))
      glows.setMatrixAt(i, _m.compose(_p, _q.identity(), _s.setScalar(scale * 3.6 * glowSize)))
    })
    mesh.instanceMatrix.needsUpdate = true
    glows.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive ref={glowRef} object={assets.glows} />
      <primitive ref={meshRef} object={assets.mesh} />
    </>
  )
}

export default EggDisplays
