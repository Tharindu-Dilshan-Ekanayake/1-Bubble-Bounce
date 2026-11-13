import { useEffect, useMemo } from 'react'
import { PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from 'three'

import { toyTime } from '../materials'

/** How far the sea reaches: well past the far plane every way, and the whole kick field's length north. */
const SEA = { minX: -3000, maxX: 3000, minZ: -24000, maxZ: 3000 }
/** Its height: under the beach's sand (0) and the kick field's ground (top 0), 30 cm down. */
const SEA_Y = -0.3

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

/**
 * The sea: deep teal to bright turquoise in long rolling swells, a lighter shallow band near
 * the beach, and glints of sunlight sliding across it - all from world position and the
 * shared clock, so it costs one cheap pass and nothing on the CPU. Fogs into the horizon.
 */
const fragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vWorld.xz;
    float swell = sin(p.x * 0.07 + p.y * 0.045 + uTime * 0.8) + 0.6 * sin(p.x * 0.031 - p.y * 0.083 - uTime * 0.55);
    vec3 deep = vec3(0.02, 0.24, 0.36);
    vec3 shallow = vec3(0.1, 0.62, 0.68);
    // Shallower (lighter) close in round the stadium.
    float near = 1.0 - smoothstep(110.0, 260.0, length(p - vec2(0.0, 20.0)));
    vec3 col = mix(deep, shallow, clamp(0.38 + 0.18 * swell + 0.35 * near, 0.0, 1.0));
    // White crests along the swells, and sun glints.
    float crest = smoothstep(1.25, 1.55, swell);
    float glint = pow(max(0.0, sin(p.x * 0.23 + p.y * 0.17 + uTime * 1.7) * sin(p.y * 0.21 - p.x * 0.05 - uTime * 1.3)), 14.0);
    col = mix(col, vec3(0.92, 0.98, 1.0), crest * 0.35 + glint * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/**
 * Palm Beach's ocean, all round the beach and along the east side of the kick field, to
 * the horizon. One draw call; animated through the shared clock (toyTime) only.
 */
export function Ocean() {
  const { geometry, material } = useMemo(() => {
    const g = new PlaneGeometry(SEA.maxX - SEA.minX, SEA.maxZ - SEA.minZ)
    g.rotateX(-Math.PI / 2)
    g.translate((SEA.minX + SEA.maxX) / 2, SEA_Y, (SEA.minZ + SEA.maxZ) / 2)
    const m = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader,
      fragmentShader,
      fog: true,
    })
    // The shared clock itself, so the sea moves without any per-frame work here.
    m.uniforms.uTime = toyTime
    return { geometry: g, material: m }
  }, [])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

export default Ocean
