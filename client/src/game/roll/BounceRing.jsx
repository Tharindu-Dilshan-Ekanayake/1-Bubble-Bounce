import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'

import { GOOD_BOUNCE_WINDOW, PERFECT_BOUNCE_WINDOW } from '@shared/balance'

import { BUBBLE_R } from './path'
import { roll } from './rollControl'

/** The ring shows this long (s) before a touch-down, closing in as it comes. */
const LEAD = 0.85
/** The landing spot's radius on the ground, and how far out the closing ring starts. */
const SPOT = BUBBLE_R * 0.85
const START = SPOT * 3.2
const WHITE = new Color('#ffffff')
const GOLD = new Color('#ffd21f')
const GREEN = new Color('#7dff4a')

/**
 * The PERFECT BOUNCE cue: while you bounce, a ring on the ground under the bubble shrinks
 * onto its landing spot as the next touch-down comes, and lights up when the moment's
 * right - gold for PERFECT, green for GOOD - so the tap (rollControl.tapBounce) has a
 * beat to hit. A thin white ring marks the spot. Two flat rings, two draw calls, and only
 * while a bounce is under way.
 */
export function BounceRing() {
  const ref = useRef(null)
  const parts = useMemo(() => {
    const group = new Group()
    const geometry = new RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2)
    const closing = new Mesh(geometry, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
    const spot = new Mesh(new RingGeometry(0.96, 1, 48).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
    for (const m of [closing, spot]) {
      m.frustumCulled = false
      m.renderOrder = 3
      group.add(m)
    }
    group.visible = false
    return { group, closing, spot }
  }, [])

  useEffect(
    () => () => {
      for (const m of [parts.closing, parts.spot]) {
        m.geometry.dispose()
        m.material.dispose()
      }
    },
    [parts],
  )

  useFrame(() => {
    const group = ref.current
    if (!group) return
    const [closing, spot] = group.children
    if (!roll.active || roll.phase !== 'ride') {
      group.visible = false
      return
    }
    const e = (performance.now() - roll.startedAt - roll.lag) / 1000
    // The next touch-down still to take (or one just gone, inside its GOOD window).
    let dt = Infinity
    for (let k = 0; k < roll.touchdowns.length; k += 1) {
      if (roll.judged[k]) continue
      const gap = roll.touchdowns[k] - e
      if (gap >= -GOOD_BOUNCE_WINDOW) {
        dt = gap
        break
      }
    }
    if (dt > LEAD) {
      group.visible = false
      return
    }
    group.visible = true
    const p = roll.bubblePos
    group.position.set(p.x, 0.16, p.z)
    const closeness = 1 - Math.max(0, dt) / LEAD
    const r = SPOT + (START - SPOT) * Math.max(0, dt) / LEAD
    closing.scale.set(r, 1, r)
    spot.scale.set(SPOT, 1, SPOT)
    const gap = Math.abs(dt)
    const mat = closing.material
    mat.color.copy(gap <= PERFECT_BOUNCE_WINDOW ? GOLD : gap <= GOOD_BOUNCE_WINDOW ? GREEN : WHITE)
    mat.opacity = 0.35 + 0.6 * closeness
    spot.material.opacity = 0.25 + 0.45 * closeness
  })

  return <primitive ref={ref} object={parts.group} />
}

export default BounceRing
