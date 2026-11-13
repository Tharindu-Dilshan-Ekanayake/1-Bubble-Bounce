import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { useQuality } from '../store/quality'
import { runtime } from './runtime'
import { LIGHTS } from './sceneStyle'

const SUN_DIRECTION = new Vector3(...LIGHTS.sunDirection).normalize()
/** How far back along SUN_DIRECTION the light sits from the point it shadows. */
const SUN_DISTANCE = 70
/** Half-size of the square area around the player that receives shadows. */
const SHADOW_EXTENT = 28

/**
 * Golden-hour game-day light: a cool sky fill with a warm bounce off the turf, and a warm,
 * low sun in the north-west (where the sky glows: skyState.sunDirection matches it).
 *
 * Only the HIGH preset casts realtime shadows; lower presets use blob shadows instead
 * (see BlobShadows), so the shadow pass costs nothing there.
 *
 * A directional light's shadow only covers a fixed box around its target, so the sun
 * and its target follow the player, and your ball down the field while it flies.
 */
export function Lighting() {
  const sunRef = useRef(null)
  const scene = useThree((s) => s.scene)
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const mapSize = useQuality((s) => s.settings.shadowMapSize) || 1024

  useLayoutEffect(() => {
    const sun = sunRef.current
    if (!sun) return undefined

    const shadowCamera = sun.shadow.camera
    shadowCamera.left = -SHADOW_EXTENT
    shadowCamera.right = SHADOW_EXTENT
    shadowCamera.top = SHADOW_EXTENT
    shadowCamera.bottom = -SHADOW_EXTENT
    shadowCamera.near = 1
    shadowCamera.far = SUN_DISTANCE * 2
    shadowCamera.updateProjectionMatrix()

    // The target has to be in the scene for its matrix to update as it moves.
    scene.add(sun.target)
    return () => {
      scene.remove(sun.target)
    }
  }, [scene])

  useFrame(() => {
    const sun = sunRef.current
    if (!sun) return
    const p = runtime.camera.mode === 'roll' ? runtime.flightFocus ?? runtime.player.position : runtime.player.position
    // Snap to whole units so the shadow map doesn't shimmer as the target slides.
    sun.target.position.set(Math.round(p.x), Math.round(p.y), Math.round(p.z))
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIRECTION, SUN_DISTANCE)
  })

  return (
    <>
      <hemisphereLight args={[LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.hemiIntensity]} />
      <directionalLight
        ref={sunRef}
        castShadow={shadows}
        color={LIGHTS.sunColor}
        intensity={LIGHTS.sunIntensity}
        position={SUN_DIRECTION.clone().multiplyScalar(SUN_DISTANCE).toArray()}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-radius={LIGHTS.shadowSoftness}
        shadow-intensity={LIGHTS.shadowIntensity}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
    </>
  )
}

export default Lighting
