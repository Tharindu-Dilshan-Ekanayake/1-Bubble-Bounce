import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Euler, Group } from 'three'

import { sfx } from '../audio/sfx'
import { remotePlayers } from '../net/remotePlayers'
import { getGame } from '../store/game'
import { getQuality } from '../store/quality'
import { createBubbleMesh, setBubbleMesh } from './bubbles'
import { burst } from './fx/fxQueue'
import { launch, SMALL_BUBBLES } from './launch'
import { BUBBLE_R } from './roll/path'
import { roll } from './roll/rollControl'
import { runtime } from './runtime'

/** Bubbles drawn at once: yours (and the two little ones you blow first) and up to seven other players'. */
const MAX_BUBBLES = 10
/** The wand's ring is this far in front of you, this high: bubbles being blown grow on from it. */
const RING_AHEAD = 0.75
const RING_Y = 1.55
const _e = new Euler()

/**
 * The two little bubbles you blow before the giant one (launch.js SMALL_BUBBLES): which
 * blow they belong to (its launch.startedAt), where you stood, and whether each has been
 * blown and has popped yet (for their sounds and splashes). They finish their float even
 * if you let go early.
 */
const littles = { startedAt: 0, x: 0, z: 0, blown: [false, false], popped: [false, false] }

/**
 * Shows `mesh` as bubble `id` at (x, y, z), `radius` big, squashed flat (squash < 0) or
 * stretched tall - keeping its volume about the same - and tilted. Allocation-free.
 */
function placeBubble(mesh, id, detail, x, y, z, radius, squash, tiltX, tiltZ) {
  setBubbleMesh(mesh, id, detail)
  mesh.visible = true
  mesh.position.set(x, y, z)
  mesh.scale.set(radius * (1 - squash * 0.5), radius * (1 + squash), radius * (1 - squash * 0.5))
  mesh.rotation.copy(_e.set(tiltX, 0, tiltZ))
}

/**
 * Every bubble someone's in or blowing: yours swelling out of your wand while you hold
 * BLOW in the Blow Zone (launch.js), then the one you ride down the valley, squashing on
 * every touch-down and stretching as it leaves the ground (roll/path.rideState), until it
 * pops; and other players' the same, replayed from the network (RemotePlayers fills in
 * their `flight`). A small pool of meshes - one per bubble in view, each with its own
 * soap-film material instance of one shared program - re-shaped as each rider's bubble.
 * One draw call per bubble actually shown, none otherwise. Lives in the lobby (not the
 * lazily loaded valley), so the first bubble you blow is already compiled.
 */
export function BubbleRiders() {
  const groupRef = useRef(null)
  const pool = useMemo(() => {
    const group = new Group()
    const meshes = []
    for (let i = 0; i < MAX_BUBBLES; i += 1) {
      const mesh = createBubbleMesh('soap', true)
      mesh.visible = false
      meshes.push(mesh)
      group.add(mesh)
    }
    return { group, meshes }
  }, [])

  useEffect(
    () => () => {
      for (const mesh of pool.meshes) mesh.material.dispose()
    },
    [pool],
  )

  useFrame((state) => {
    const meshes = groupRef.current?.children
    if (!meshes) return
    const t = state.clock.elapsedTime
    const detail = getQuality().decorDensity >= 0.5
    let used = 0

    // --- Yours ----------------------------------------------------------------------
    const profile = getGame().profile
    if (roll.active) {
      if (!roll.popped && roll.bubble > 0) {
        const b = roll.bubblePos
        placeBubble(meshes[used++], roll.tireId, detail, b.x, b.y, b.z, BUBBLE_R * roll.bubble, roll.squash, Math.sin(t * 2.1) * 0.12, Math.sin(t * 1.7) * 0.1)
      }
    } else if ((launch.charging || launch.released) && launch.size > 0) {
      // Swelling out of the wand in front of you, facing down the valley - floating at the
      // ring while it's small, resting on the ground once it's big; wobbling once it's
      // full size.
      const p = runtime.player.position
      const radius = BUBBLE_R * launch.size
      const wobble = launch.full ? (1 - launch.charge) * 0.16 : Math.sin(t * 14) * 0.03
      placeBubble(meshes[used++], profile.equippedTire, detail, p.x, Math.max(RING_Y, radius + 0.08), p.z - (RING_AHEAD + radius), radius, -wobble, 0, 0)
    }

    // --- The two little bubbles first ---------------------------------------------------
    if (launch.charging && launch.startedAt !== littles.startedAt) {
      littles.startedAt = launch.startedAt
      littles.x = runtime.player.position.x
      littles.z = runtime.player.position.z
      littles.blown.fill(false)
      littles.popped.fill(false)
    }
    if (littles.startedAt > 0) {
      const since = (performance.now() - littles.startedAt) / 1000
      for (let k = 0; k < SMALL_BUBBLES.length && used < MAX_BUBBLES; k += 1) {
        const b = SMALL_BUBBLES[k]
        const age = since - b.at
        if (age < 0 || littles.popped[k]) continue
        // Only a blow still going starts a little bubble; one already out finishes its float.
        if (!littles.blown[k]) {
          if (!launch.charging) continue
          littles.blown[k] = true
          sfx.blowPuff()
        }
        const ringX = littles.x + 0.12
        if (age < b.grow) {
          // Swelling on the ring.
          const radius = b.r * (0.15 + 0.85 * Math.sin((Math.PI / 2) * (age / b.grow)))
          placeBubble(meshes[used++], profile.equippedTire, detail, ringX, RING_Y, littles.z - (RING_AHEAD + radius), radius, Math.sin(age * 30) * 0.06, 0, 0)
        } else if (age < b.grow + b.drift) {
          // Off the ring: drifting up and away to one side, wobbling, then...
          const d = age - b.grow
          placeBubble(
            meshes[used++],
            profile.equippedTire,
            detail,
            ringX + b.side * (0.9 * d + 0.15 * Math.sin(d * 5)),
            RING_Y + 0.9 * d + 0.35 * d * d,
            littles.z - (RING_AHEAD + b.r) - 0.8 * d,
            b.r * (1 + 0.06 * Math.sin(d * 9)),
            Math.sin(d * 11) * 0.08,
            0,
            Math.sin(d * 3) * 0.3,
          )
        } else {
          // ...POP: a little splash of soap and a tiny pop.
          littles.popped[k] = true
          const d = b.drift
          sfx.smallPop()
          burst({ x: ringX + b.side * 0.9 * d, y: RING_Y + 0.9 * d + 0.35 * d * d, z: littles.z - (RING_AHEAD + b.r) - 0.8 * d, count: 12, palette: 'bubble', speed: 3 })
        }
      }
      if (littles.popped.every(Boolean) || since > 6) littles.startedAt = 0
    }

    // --- Everyone else's ------------------------------------------------------------
    for (const r of remotePlayers.values()) {
      if (used >= MAX_BUBBLES) break
      if (r.flying) {
        const st = r.flight
        if (st.popped || st.bubble <= 0) continue
        const b = st.bubblePos
        placeBubble(meshes[used++], r.tireId || 'soap', detail, b.x, b.y, b.z, BUBBLE_R * st.bubble, st.squash, Math.sin(t * 2.1) * 0.12, 0)
      } else if (r.pulling) {
        // Blowing theirs: swelling and wobbling in front of them.
        const size = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.6))
        const radius = BUBBLE_R * size
        placeBubble(meshes[used++], r.tireId || 'soap', detail, r.position.x, Math.max(RING_Y, radius + 0.08), r.position.z - (RING_AHEAD + radius), radius, Math.sin(t * 12) * 0.03, 0, 0)
      }
    }
    for (let i = used; i < MAX_BUBBLES; i += 1) meshes[i].visible = false
  })

  return <primitive ref={groupRef} object={pool.group} />
}

export default BubbleRiders
