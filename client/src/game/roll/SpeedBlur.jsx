import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Mesh, OrthographicCamera, Scene, ShaderMaterial, SRGBColorSpace, Vector2, WebGLRenderTarget } from 'three'

import { roll } from './rollControl'

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Blur starts at this speed (m/s) and is full by this one. */
const BLUR_FROM = 35
const BLUR_FULL = 220
/** Where the canyon vanishes on screen (uv, y up): everything smears away from here. */
const VANISH = new Vector2(0.5, 0.57)
const _size = new Vector2()

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform float uAmount;
  uniform vec2 uCenter;
  varying vec2 vUv;
  void main() {
    vec2 toCenter = uCenter - vUv;
    // Sharp through the middle where the rider is, smearing harder out to the sides
    // (and a little at the top and bottom), as a camera rushing forward would.
    float edge = smoothstep(0.22, 0.95, length(vec2(toCenter.x * 2.0, toCenter.y * 1.1)));
    float reach = uAmount * edge * 0.16;
    // A per-pixel offset into the steps hides their banding as fine grain.
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < SAMPLES; i++) {
      float t = (float(i) + jitter) / float(SAMPLES);
      sum += texture2D(tScene, vUv + toCenter * reach * t).rgb;
    }
    gl_FragColor = vec4(sum / float(SAMPLES), 1.0);
    #include <colorspace_fragment>
  }
`

/** The render target the scene goes into, and the full-screen pass that blurs it out. */
function createPass(samples, antialias) {
  // sRGB storage: 8 bits a channel without the banding linear values would show. 2x
  // MSAA keeps the sharp middle smooth: about 42 MB at 1920x1080, where 4x is about 75.
  const target = new WebGLRenderTarget(1, 1, { samples: antialias ? 2 : 0 })
  target.texture.colorSpace = SRGBColorSpace
  const geometry = new BufferGeometry()
  // One triangle covering the screen.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  const material = new ShaderMaterial({
    defines: { SAMPLES: samples },
    uniforms: { tScene: { value: target.texture }, uAmount: { value: 0 }, uCenter: { value: VANISH } },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new Mesh(geometry, material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  return {
    target,
    material,
    scene,
    camera: new OrthographicCamera(),
    amount: 0,
    dispose() {
      target.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}

/**
 * Motion blur down the sides of the screen while your tire rolls fast: the scene is drawn
 * into a render target, then onto the screen through a zoom blur that leaves the
 * middle (the rider) sharp and smears the edges away from the canyon's vanishing
 * point, more the faster you go. Below BLUR_FROM it renders straight to the screen
 * as usual, so a slow roll costs nothing extra.
 *
 * Post-processing, so MEDIUM and HIGH only (`motionBlur` samples). Mounted only while
 * sliding: its frame callback has priority 1, which takes the rendering over from R3F
 * until it unmounts.
 *
 * @param {{ samples: number, antialias: boolean }} props
 */
export function SpeedBlur({ samples, antialias }) {
  const gl = useThree((s) => s.gl)
  const passRef = useRef(null)
  /** The renderer, kept to hand stats counting back to it on the way out. */
  const glRef = useRef(null)

  useEffect(() => {
    const pass = createPass(samples, antialias)
    passRef.current = pass
    // Compiled now, during the push-off, not mid-ride when the blur first kicks in.
    gl.compileAsync(pass.scene, pass.camera).catch(() => {})
    return () => {
      passRef.current = null
      pass.dispose()
    }
  }, [gl, samples, antialias])

  useEffect(
    () => () => {
      if (glRef.current) glRef.current.info.autoReset = true
    },
    [],
  )

  useFrame((state, rawDelta) => {
    const { gl: renderer, scene, camera } = state
    glRef.current = renderer
    // Two renders a frame: count both in the stats (PerfProbe), not just the last.
    renderer.info.autoReset = false
    renderer.info.reset()
    const pass = passRef.current
    const delta = Math.min(rawDelta, 0.05)
    const want = roll.active && !roll.stopped && !roll.crashed ? smoothstep(BLUR_FROM, BLUR_FULL, roll.speed) : 0
    if (pass) pass.amount += (want - pass.amount) * (1 - Math.exp(-4 * delta))
    if (!pass || pass.amount < 0.01) {
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
      return
    }
    // Kept the size of the screen's drawing buffer (resizes, DPR changes).
    renderer.getDrawingBufferSize(_size)
    if (pass.target.width !== _size.x || pass.target.height !== _size.y) pass.target.setSize(_size.x, _size.y)
    pass.material.uniforms.uAmount.value = pass.amount
    renderer.setRenderTarget(pass.target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    renderer.render(pass.scene, pass.camera)
  }, 1)

  return null
}

export default SpeedBlur
