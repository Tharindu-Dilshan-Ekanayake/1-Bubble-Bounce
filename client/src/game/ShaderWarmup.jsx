import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'

import { linkPrograms } from './linkPrograms'

/** Layer nothing lives on: the main camera looks at it while shaders compile. */
const BLANK_LAYER = 31

/**
 * Compiles every shader program up front, in parallel, before anything is drawn.
 *
 * three otherwise compiles each program on the first frame that uses it, one after
 * another and synchronously, which was the single biggest cost of starting the game
 * on a slow phone. `compileAsync` hands them all to the driver at once (in parallel
 * where KHR_parallel_shader_compile exists) and resolves when they're ready. Until then
 * the camera looks at an empty layer so no frame can trigger a blocking compile.
 *
 * @param {{ onDone: () => void }} props
 */
export function ShaderWarmup({ onDone }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  // A layout effect, not a passive one: it must hide the scene before R3F draws its
  // first frame, or that frame compiles everything synchronously anyway. As the last
  // child of the scene, every sibling's objects are already in the scene by now.
  useLayoutEffect(() => {
    // Dev's StrictMode remount disposes materials mid-compile, which only produces
    // driver warnings; the warm-up is a production start-up optimisation anyway.
    if (import.meta.env.DEV) {
      onDone()
      return undefined
    }
    performance.mark('pp:warmup-effect')
    let cancelled = false
    camera.layers.set(BLANK_LAYER)
    // Lights are matched against the camera's layers, so compile through a camera that
    // sees the real scene, or every program would be built for zero lights.
    const probe = camera.clone()
    probe.layers.set(0)
    performance.mark('pp:compile-start')
    gl.compileAsync(scene, probe)
      .catch((err) => console.warn('[warmup] shader precompile failed', err))
      .finally(() => {
        if (cancelled) return
        // Behind the loading screen: finish linking whatever the driver didn't.
        linkPrograms(gl)
        performance.mark('pp:compile-end')
        camera.layers.set(0)
        onDone()
      })
    return () => {
      cancelled = true
      camera.layers.set(0)
    }
  }, [gl, scene, camera, onDone])

  return null
}

export default ShaderWarmup
