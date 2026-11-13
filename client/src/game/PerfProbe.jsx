import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

/**
 * Publishes renderer stats on `window.__ppPerf` once a second: draw calls, triangles,
 * FPS, live textures/geometries. Read by the automated perf check and handy in the
 * console; costs a few property writes per frame.
 *
 * Counts are for the last completed frame (three resets them at the start of each
 * render, and frame callbacks run before it).
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const acc = useRef({ frames: 0, since: 0, maxCalls: 0, maxTriangles: 0 })

  // With ?debug, the scene and camera too, for the automated texture-memory audit and
  // close-up screenshots (set runtime.camera.mode to anything else to steer it).
  useEffect(() => {
    if (!window.__pp) return
    window.__ppScene = scene
    window.__ppCamera = camera
    window.__ppGl = gl
  }, [scene, camera, gl])

  useFrame(() => {
    const info = gl.info
    const a = acc.current
    a.frames += 1
    a.maxCalls = Math.max(a.maxCalls, info.render.calls)
    a.maxTriangles = Math.max(a.maxTriangles, info.render.triangles)

    const now = performance.now()
    if (a.since === 0) a.since = now
    if (now - a.since < 1000) return
    window.__ppPerf = {
      fps: Math.round((a.frames * 1000) / (now - a.since)),
      calls: info.render.calls,
      triangles: info.render.triangles,
      maxCalls: a.maxCalls,
      maxTriangles: a.maxTriangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0,
      pixelRatio: gl.getPixelRatio(),
    }
    a.frames = 0
    a.since = now
    a.maxCalls = 0
    a.maxTriangles = 0
  })

  return null
}

export default PerfProbe
