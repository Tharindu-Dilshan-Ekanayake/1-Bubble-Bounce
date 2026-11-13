import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { BackSide } from 'three'

import { useQuality } from '../store/quality'
import { skyUniforms } from './skyState'

/** Unit dome, scaled to just inside the camera's far plane for the current preset. */
const SKY_RADIUS = 1

const skyVertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Game-day sky, all in one shader: the zenith-to-horizon gradient, a big soft glow round
 * the low sun (and a bright core in its middle), a scatter of thin streaky high clouds lit
 * warm on the sun's side, and - for the night stages - stars. No textures, no geometry
 * beyond the dome, nothing done per frame on the CPU.
 */
const skyFragmentShader = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform float exponent;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform float glow;
  uniform float clouds;
  uniform float stars;

  varying vec3 vDirection;

  float skyHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float h = dir.y;
    // Below the horizon stays horizon-coloured, matching the fog on distant ground.
    vec3 color = mix(horizonColor, topColor, pow(max(h, 0.0), exponent));

    // The low sun: a wide warm haze, a tighter glow and a bright core.
    float s = max(dot(dir, normalize(sunDirection)), 0.0);
    color += sunColor * glow * (0.35 * pow(s, 6.0) + 0.45 * pow(s, 40.0) + 1.2 * pow(s, 900.0));

    // Thin high clouds: long streaks across the sky, thinning towards the zenith and
    // gone below the horizon, lit warm towards the sun.
    if (clouds > 0.0 && h > 0.0) {
      vec2 p = dir.xz / (h + 0.18);
      float n = skyNoise(p * vec2(0.9, 5.0) + vec2(3.1, 7.7)) * 0.65 + skyNoise(p * vec2(2.3, 11.0)) * 0.35;
      float streak = smoothstep(0.62 - 0.22 * clouds, 0.9, n) * smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.55, 0.95, h));
      vec3 lit = mix(vec3(1.0, 0.96, 0.92), sunColor, 0.35 + 0.65 * pow(s, 3.0));
      color = mix(color, lit, streak * 0.7 * clouds);
    }

    // Stars on the night stages: a fixed scatter, brightest overhead.
    if (stars > 0.0 && h > 0.0) {
      vec3 cell = floor(dir * 260.0);
      float star = step(0.9965, skyHash(cell.xz + cell.y * 17.0));
      color += vec3(star * stars * smoothstep(0.05, 0.4, h));
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * The sky dome. Follows the camera so the horizon always sits at eye level and the dome
 * can never be walked out of. Its colours are skyUniforms (worldLook.js sets the lobby's,
 * the kick field each stage's).
 */
export function Sky() {
  const ref = useRef(null)
  const camera = useThree((s) => s.camera)
  const radius = useQuality((s) => s.settings.viewDistance) * 0.9

  useFrame(() => {
    ref.current?.position.copy(camera.position)
  })

  return (
    <mesh ref={ref} renderOrder={-1} frustumCulled={false} scale={radius}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
      <shaderMaterial side={BackSide} depthWrite={false} uniforms={skyUniforms} vertexShader={skyVertexShader} fragmentShader={skyFragmentShader} />
    </mesh>
  )
}

export default Sky
