import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { getBloxityState } from '../bloxity/store'
import { launch } from './launch'
import { placeLocalBubble } from './remote/nameplates'
import { PULL_DIST } from './roll/path'
import { runtime } from './runtime'

/** How high above the player's feet the camera aims. */
const LOOK_HEIGHT = 1.6

const MIN_DISTANCE = 4
const MAX_DISTANCE = 26

// Pitch limits, in radians. Stops the camera flipping over the top or sinking
// under the ground.
const MIN_PITCH = -0.05
const MAX_PITCH = 1.2

const DRAG_SENSITIVITY = 0.005
const TOUCH_SENSITIVITY = 0.007
const ZOOM_SENSITIVITY = 0.012

// Higher = snappier. Framerate-independent via the exp() smoothing below.
const POSITION_SMOOTHING = 10
const LOOK_SMOOTHING = 14

const _desired = new Vector3()
const _target = new Vector3()
/** How far the view has swung round for the stretch (0-1), eased. */
let stretchView = 0

/**
 * Third-person orbit camera around the player.
 *
 * Mouse: drag (either button) orbits, wheel zooms. Touch: one-finger drag orbits (the
 * joystick owns the left side of the screen as a separate element), pinch zooms.
 *
 * Orbit state lives in `runtime.camera`, so the roll can hand the camera
 * back exactly where it took it from. Drag speed is scaled by the player's Boxity
 * camera_sensitivity setting. Also places your own chat bubble each frame, once the
 * camera has moved (it needs the final camera to project).
 */
export function FollowCamera() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const lookAt = useRef(new Vector3())
  const initialised = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    if (!el) return undefined

    /** pointerId -> last { x, y } */
    const pointers = new Map()
    let pinchDistance = 0

    const orbit = runtime.camera

    const onPointerDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture?.(e.pointerId)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }

    const onPointerMove = (e) => {
      const last = pointers.get(e.pointerId)
      if (!last) return

      if (pointers.size >= 2) {
        last.x = e.clientX
        last.y = e.clientY
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        orbit.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, orbit.distance - (d - pinchDistance) * 0.04))
        pinchDistance = d
        return
      }

      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last.x = e.clientX
      last.y = e.clientY
      const sensitivity =
        (e.pointerType === 'touch' ? TOUCH_SENSITIVITY : DRAG_SENSITIVITY) * getBloxityState().cameraSensitivity
      orbit.yaw -= dx * sensitivity
      orbit.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, orbit.pitch + dy * sensitivity))
    }

    const endDrag = (e) => {
      pointers.delete(e.pointerId)
      el.releasePointerCapture?.(e.pointerId)
    }

    const onWheel = (e) => {
      // Without this the page scrolls behind the canvas.
      e.preventDefault()
      orbit.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, orbit.distance + e.deltaY * ZOOM_SENSITIVITY))
    }

    // Right-dragging otherwise opens the browser context menu mid-orbit.
    const onContextMenu = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('contextmenu', onContextMenu)
    // passive:false is required for preventDefault() on wheel to take effect.
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame((state, rawDelta) => {
    if (runtime.camera.mode !== 'follow') {
      // Whoever owns the camera now is moving it; pick up smoothly when it's handed back.
      lookAt.current.copy(runtime.player.position).setY(runtime.player.position.y + LOOK_HEIGHT)
      placeLocalBubble(camera, state.size.width, state.size.height)
      return
    }
    const delta = Math.min(rawDelta, 0.05)
    const p = runtime.player.position
    // Holding the launch posts: swing round to three-quarters on, back and a little lower,
    // so the stretching arms and the posts stay in view (and clear of the LAUNCH button
    // below), more the further back you've walked.
    const want = launch.gripping || launch.released ? 0.35 + 0.65 * Math.min(1, launch.back / PULL_DIST) : 0
    stretchView += (want - stretchView) * (1 - Math.exp(-6 * delta))
    _target.set(p.x, p.y + LOOK_HEIGHT - 1.3 * stretchView, p.z)

    // Spherical -> cartesian. yaw 0 puts the camera south of the player, looking north.
    const yaw = runtime.camera.yaw + 0.75 * stretchView
    const pitch = runtime.camera.pitch + 0.16 * stretchView
    const distance = runtime.camera.distance + 1.5 * stretchView
    const horizontal = Math.cos(pitch) * distance
    _desired.set(
      _target.x + Math.sin(yaw) * horizontal,
      Math.max(_target.y + Math.sin(pitch) * distance, 0.6),
      _target.z + Math.cos(yaw) * horizontal,
    )

    // After a slide the camera is far down the hill; jump back rather than swoop.
    if (runtime.camera.snap) {
      runtime.camera.snap = false
      initialised.current = false
    }

    if (!initialised.current) {
      // Avoid a long swoop in from wherever the default camera started.
      camera.position.copy(_desired)
      lookAt.current.copy(_target)
      initialised.current = true
    }

    camera.position.lerp(_desired, 1 - Math.exp(-POSITION_SMOOTHING * delta))
    lookAt.current.lerp(_target, 1 - Math.exp(-LOOK_SMOOTHING * delta))
    camera.lookAt(lookAt.current)
    camera.updateMatrixWorld()
    placeLocalBubble(camera, state.size.width, state.size.height)
  })

  return null
}

export default FollowCamera
