import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CircleGeometry, DoubleSide, ShaderMaterial, Vector3 } from 'three'

import { PORTALS } from '@shared/world'

import { PORTAL_CENTER_Y, PORTAL_THEMES } from './portalFrame'

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uLight;
  uniform vec3 uCore;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float a = atan(p.y, p.x);
    // A spiral that winds inwards over time.
    float swirl = sin(a * 3.0 + r * 9.0 - uTime * 3.0);
    vec3 col = mix(uDeep, uLight, smoothstep(-0.2, 0.9, swirl) * (1.0 - r * 0.6));
    col += (1.0 - smoothstep(0.0, 0.35, r)) * uCore;
    float edge = 1.0 - smoothstep(0.92, 1.0, r);
    gl_FragColor = vec4(col, edge * 0.92);
    #include <colorspace_fragment>
  }
`

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** One portal's animated swirl: one quad, one cheap shader, coloured by its theme. */
function PortalSwirl({ portal, geometry }) {
  const ref = useRef(null)
  const material = useMemo(() => {
    const { deep, light, core } = PORTAL_THEMES[portal.id].swirl
    return new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new Vector3(...deep) },
        uLight: { value: new Vector3(...light) },
        uCore: { value: new Vector3(...core) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    })
  }, [portal.id])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    if (ref.current) ref.current.material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <mesh ref={ref} geometry={geometry} material={material} position={[portal.x, PORTAL_CENTER_Y, portal.z]} />
}

/**
 * The world portal's swirl, in World 2's ice blue. Its frame is part of the static
 * blocks (see portalFrame.js).
 */
export function Portal() {
  // Swirl radius, inside the frame; every portal is the same size, so one geometry.
  const geometry = useMemo(() => new CircleGeometry(PORTALS[0].radius - 0.4, 40), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return PORTALS.map((portal) => <PortalSwirl key={portal.id} portal={portal} geometry={geometry} />)
}

export default Portal
