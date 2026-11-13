import { AdditiveBlending, Color, InstancedMesh, PlaneGeometry, ShaderMaterial } from 'three'

/**
 * Soft glowing halos for boards and eggs: camera-facing quads with a radial falloff, blended
 * additively. Procedural (no texture) and always instanced - a single board's halo is
 * an instance of one - so every halo shares one shader program.
 *
 * Colour comes from instanceColor; size is the instance (and object) scale.
 */

const vertexShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec3 center = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float size = length(m[0].xyz);
    vec4 mv = viewMatrix * vec4(center, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vColor = uColor;
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #endif
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.0, 1.0, d);
    float pulse = 0.85 + 0.15 * sin(uTime * 4.0);
    float a = core * core * uIntensity * pulse;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`

/** Shared clock for every halo's pulse; advanced once per frame by whoever draws. */
export const glowTime = { value: 0 }

const QUAD = new PlaneGeometry(1, 1)

function glowMaterial(color, intensity) {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uTime: glowTime,
      uIntensity: { value: intensity },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

/** Many halos in one draw call; position/size via setMatrixAt, colour via setColorAt. */
export function createGlowInstances(max, intensity = 0.9) {
  const mesh = new InstancedMesh(QUAD, glowMaterial('#ffffff', intensity), max)
  mesh.setColorAt(0, new Color('#ffffff'))
  mesh.count = 0
  mesh.renderOrder = 5
  mesh.frustumCulled = false
  return mesh
}

/** Disposes a halo made by either factory (the quad is shared and stays). */
export function disposeGlow(mesh) {
  mesh.material.dispose()
  mesh.dispose?.()
}
