import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { zoneIndexAt } from '@shared/logic'

import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { perWorld } from '../worldLook'
import { COS, SIN, TIRE_SIZE } from './path'
import { roll } from './rollControl'
import { ZONE_THEMES } from './themes'

/** Spray pieces in flight at once. (Each tire's own trail is TireTrail.) */
const SPRAY = 72
const GRAVITY = 16

const DOWN_TRACK = new Vector3(0, -SIN, -COS)
const SLOPE_NORMAL = new Vector3(0, COS, -SIN)
const WHITE = new Color('#ffffff')
/** What the tire throws up in each zone: its floor, lightened. */
const sprayColors = perWorld((zs) => zs.map((z) => new Color(ZONE_THEMES[z.theme].floor).lerp(WHITE, 0.55)))

const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _side = new Vector3()

const spray = Array.from({ length: SPRAY }, () => ({ life: 0, max: 1, size: 0.2, pos: new Vector3(), vel: new Vector3() }))

/**
 * Throws `count` dust pieces up from where the tire touches the floor: `spread`
 * sideways, `lift` upwards, `back` behind it (so they're left behind). `st.next` is the
 * pool's write head.
 */
function emit(pieces, st, count, spread, lift, back) {
  const color = sprayColors()[zoneIndexAt(Math.max(0, roll.meter))]
  for (let i = 0; i < count; i += 1) {
    const p = spray[st.next]
    pieces.setColorAt(st.next, color)
    st.next = (st.next + 1) % SPRAY
    const side = (Math.random() - 0.5) * 2
    _side.set(1, 0, 0)
    p.pos.copy(roll.position).addScaledVector(DOWN_TRACK, -0.4).addScaledVector(_side, side * 0.45).addScaledVector(SLOPE_NORMAL, 0.1 - TIRE_SIZE)
    p.vel.copy(DOWN_TRACK).multiplyScalar(-back * (0.5 + Math.random()))
    p.vel.addScaledVector(_side, side * spread * (0.6 + Math.random() * 0.8))
    p.vel.addScaledVector(SLOPE_NORMAL, lift * (0.5 + Math.random()))
    p.max = 0.45 + Math.random() * 0.4
    p.life = p.max
    p.size = 0.14 + Math.random() * 0.2
  }
  if (pieces.instanceColor) pieces.instanceColor.needsUpdate = true
}

/**
 * The roll's dust, on presets with particles: dirt, sand or snow kicked up behind the
 * tire (a puff when it lands, pops out or falls over). A fixed pool, one draw call,
 * nothing drawn when nothing's alive.
 */
export function RollFX() {
  const sprayRef = useRef(null)
  const state = useRef({ next: 0, owed: 0, landedSeen: 0, kickSeen: 0, stoppedSeen: false })

  const assets = useMemo(() => {
    const pieces = createBoxInstances(SPRAY, sharedMaterials().toy, STYLE.SMOOTH)
    pieces.count = SPRAY
    pieces.visible = false
    return { pieces }
  }, [])

  useEffect(
    () => () => {
      for (const p of spray) p.life = 0
      disposeBlocks(assets.pieces)
    },
    [assets],
  )

  useFrame((_frame, rawDelta) => {
    const pieces = sprayRef.current
    if (!pieces) return
    const delta = Math.min(rawDelta, 0.05)
    const on = getQuality().particles
    const st = state.current

    if (roll.active && on) {
      if (roll.phase === 'launch') {
        // Waiting for the kick.
      } else if (roll.phase === 'ride' && !roll.crashed) {
        // The kick lands: a burst of dust from under the tire as it goes.
        if (roll.kickedAt !== st.kickSeen) {
          st.kickSeen = roll.kickedAt
          emit(pieces, st, 16, 3.2, 3, 5)
        }
        if (!roll.airborne && roll.speed > 6) {
          st.owed += delta * Math.min(50, roll.speed * 0.4)
          const n = Math.floor(st.owed)
          st.owed -= n
          if (n > 0) emit(pieces, st, n, 1.6, 2.4, Math.min(8, roll.speed * 0.06))
        }
        if (roll.landedAt !== st.landedSeen) {
          st.landedSeen = roll.landedAt
          emit(pieces, st, 18, 4.5, 4, 2)
        }
      } else if (!st.stoppedSeen) {
        st.stoppedSeen = true
        emit(pieces, st, 22, 5, 3.5, 1)
      }
    } else if (!roll.active) {
      st.stoppedSeen = false
      st.owed = 0
    }

    // --- Spray --------------------------------------------------------------------
    let alive = false
    for (let i = 0; i < SPRAY; i += 1) {
      const p = spray[i]
      if (p.life <= 0) continue
      p.life -= delta
      if (p.life <= 0 || !on) {
        p.life = 0
        pieces.setMatrixAt(i, _m.makeScale(0, 0, 0))
        alive = true
        continue
      }
      alive = true
      p.vel.y -= GRAVITY * delta
      p.vel.multiplyScalar(1 - delta * 2)
      p.pos.addScaledVector(p.vel, delta)
      _s.setScalar(p.size * (p.life / p.max))
      pieces.setMatrixAt(i, _m.compose(p.pos, _q, _s))
    }
    pieces.visible = alive
    if (alive) pieces.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={sprayRef} object={assets.pieces} />
}

export default RollFX
