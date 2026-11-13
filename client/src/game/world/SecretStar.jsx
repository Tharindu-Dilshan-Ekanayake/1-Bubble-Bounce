import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, ExtrudeGeometry, Matrix4, Quaternion, Shape, Vector3 } from 'three'

import { STAR } from '@shared/world'

import { useGame } from '../../store/game'
import { createToyInstances, PropBuilder } from '../blocks'
import { createGlowInstances, disposeGlow } from '../glow'
import { sharedMaterials, STYLE } from '../materials'

/** The star's points' reach and its waist, in metres: about 1.2 wide. */
const OUTER = 0.62
const INNER = 0.27
const SPARKLES = 4

/** A chunky five-point gold star, extruded and bevelled, standing upright facing +Z. */
function starGeometry() {
  const shape = new Shape()
  for (let i = 0; i < 10; i += 1) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? INNER : OUTER
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  shape.closePath()
  const extruded = new ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 1 })
  extruded.translate(0, 0, -0.11)
  const p = new PropBuilder()
  p.add(extruded, { color: '#ffd21f', style: STYLE.GLOW })
  extruded.dispose()
  return p.build()
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _up = new Vector3(0, 1, 0)
const _flat = new Quaternion()

/** The star itself: spins and bobs behind the leaderboards, in a soft gold halo with sparkles round it. */
function Star() {
  const starRef = useRef(null)
  const glowRef = useRef(null)
  const assets = useMemo(() => {
    const star = createToyInstances(starGeometry(), sharedMaterials().toy, 1)
    star.count = 1
    const glows = createGlowInstances(1 + SPARKLES, 0.9)
    const gold = new Color('#ffd86a')
    const white = new Color('#fff8e0')
    glows.setColorAt(0, gold)
    for (let i = 1; i <= SPARKLES; i += 1) glows.setColorAt(i, white)
    glows.count = 1 + SPARKLES
    return { star, glows }
  }, [])

  useEffect(
    () => () => {
      assets.star.geometry.dispose()
      assets.star.dispose()
      disposeGlow(assets.glows)
    },
    [assets],
  )

  useFrame((state) => {
    const star = starRef.current
    const glows = glowRef.current
    if (!star || !glows) return
    const t = state.clock.elapsedTime
    const y = STAR.y + Math.sin(t * 1.8) * 0.12
    _p.set(STAR.x, y, STAR.z)
    star.setMatrixAt(0, _m.compose(_p, _q.setFromAxisAngle(_up, t * 1.4), _s.setScalar(1)))
    star.instanceMatrix.needsUpdate = true
    glows.setMatrixAt(0, _m.compose(_p, _flat, _s.setScalar(2.6)))
    for (let i = 1; i <= SPARKLES; i += 1) {
      const a = t * 1.1 + (i * Math.PI * 2) / SPARKLES
      const twinkle = 0.25 + 0.2 * Math.sin(t * 5 + i * 1.7)
      _p.set(STAR.x + Math.cos(a) * 0.95, y + Math.sin(a * 2) * 0.35, STAR.z + Math.sin(a) * 0.95)
      glows.setMatrixAt(i, _m.compose(_p, _flat, _s.setScalar(twinkle)))
    }
    glows.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive ref={glowRef} object={assets.glows} />
      <primitive ref={starRef} object={assets.star} />
    </>
  )
}

/**
 * Palm Beach's Secret Star, tucked behind the middle leaderboards at the back of the plaza
 * (shared/world STAR): shown only in Palm Beach, and only until you've found it - the
 * moment it's found (the server's pickup) it's gone. Two draw calls (the star on the
 * shared toy material, its halo and sparkles on the shared glow one), nothing allocated
 * per frame.
 */
export function SecretStar() {
  const show = useGame((s) => s.profile.world === 1 && !s.profile.secretStars?.world2)
  return show ? <Star /> : null
}

export default SecretStar
