import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Color, Vector3 } from 'three'

import { PAD_YAW } from '@shared/world'

import { remotePlayers } from '../../net/remotePlayers'
import { getQuality } from '../../store/quality'
import { emoteFromAnim } from '../../bloxity/emotes'
import { setBubbleLook } from '../bubbles'
import { emitPuffs, PUFF_STREAM } from '../fx/puffQueue'
import { RUN_CADENCE } from '../kick'
import { BODY, holdsWand, WAND_RING } from '../playerPose'
import { BloxityAvatar } from '../PlayerAvatar'
import { flierTurn } from '../roll/path'
import { tireGlow } from '../tire'
import { Wand } from '../Wand'

/** How often the set of fully drawn players is reconsidered. */
const PICK_MS = 500
/** Top walking speed: full stride amplitude, as for your own character. */
const MAX_SPEED = 10.875
const _up = new Vector3(0, 1, 0)
const _hip = new Vector3()
const _ring = new Vector3()
const _fwd = new Vector3()
const _c = new Color()

/**
 * One other player as their real Bloxity avatar, dressed as they are, and posed by the
 * same playerPose as yours from what the network says they're doing: walking pace,
 * blowing bubbles on a Blow Pad (wand up, little bubbles drifting off it), jumping,
 * blowing their giant bubble in the Blow Zone. Their bounces float the avatar down the
 * valley inside their bubble, replayed from the same numbers as yours (RemotePlayers
 * works the ride out: `r.flight`; BubbleRiders draws the bubble).
 */
function RemoteAvatar({ sessionId, look }) {
  const groupRef = useRef(null)
  const innerRef = useRef(null)
  const wandRef = useRef(null)
  const lastY = useRef(null)
  const lastPuff = useRef(0)
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: MAX_SPEED, vy: 0, stride: 0, charge: -1 })

  useFrame((_state, rawDelta) => {
    const group = groupRef.current
    const inner = innerRef.current
    const wand = wandRef.current
    const r = remotePlayers.get(sessionId)
    if (!group || !inner || !r) return
    const delta = Math.min(rawDelta, 0.05)
    const m = motionRef.current
    m.time += delta
    group.visible = true
    m.charge = -1
    m.pitch = 0
    m.hop = 0
    m.perch = 0
    m.sink = 0
    m.fly = 0
    m.cheer = 0
    m.run = 0
    m.emote = null

    if (r.flying) {
      // Their bounce: floating inside their bubble down the valley, turned about their
      // middle - the group under it, the avatar turned about it.
      const st = r.flight
      group.position.set(st.position.x, st.position.y - BODY.pivot, st.position.z)
      group.quaternion.identity()
      flierTurn(st, inner.quaternion)
      _hip.set(0, BODY.pivot, 0).applyQuaternion(inner.quaternion)
      inner.position.set(-_hip.x, BODY.pivot - _hip.y, -_hip.z)
      m.hop = st.hop
      m.perch = st.perch
      m.sink = st.sink
      m.fly = st.fly
      m.cheer = st.cheer
      m.speed = 0
      m.grounded = true
      if (wand) wand.visible = false
      return
    }

    inner.position.set(0, 0, 0)
    inner.quaternion.identity()
    group.position.copy(r.position)
    const running = r.anim === 'run'
    if (r.pulling) {
      // Blowing their giant bubble: facing the valley, wand held out, puffing.
      group.quaternion.setFromAxisAngle(_up, Math.PI)
      m.charge = 0.5 + 0.5 * Math.sin(m.time * 2)
      m.speed = 0
      m.grounded = true
    } else {
      group.quaternion.setFromAxisAngle(_up, running ? PAD_YAW : r.yaw)
      // On a Blow Pad: blowing bubbles through the wand, as yours does.
      m.run = running ? 1 : 0
      const speed = running ? 0 : r.speed
      m.speed = speed
      m.grounded = r.anim !== 'jump'
      // A Boxity emote they're playing (stood still while it lasts).
      m.emote = emoteFromAnim(r.anim)
      if (m.emote) m.speed = 0
      // Vertical speed from the interpolated height, smoothed: rising vs falling.
      const y = r.position.y
      if (lastY.current !== null) m.vy += ((y - lastY.current) / Math.max(delta, 1e-3) - m.vy) * 0.3
      lastY.current = y
      m.stride += delta * (running ? RUN_CADENCE : 5 + 6 * Math.min(1, speed / MAX_SPEED))
    }

    // The wand: up while they blow, little bubbles drifting off it on every puff.
    if (wand) {
      const up = holdsWand(m)
      wand.visible = up
      if (up) {
        if (wand.userData.bubbleId !== r.tireId) {
          wand.userData.bubbleId = r.tireId
          setBubbleLook(wand.userData.film, r.tireId)
        }
        const now = performance.now()
        if (running && now - lastPuff.current > (Math.PI * 2 * 1000) / RUN_CADENCE) {
          lastPuff.current = now
          wand.updateWorldMatrix(true, false)
          _ring.copy(WAND_RING).applyMatrix4(wand.matrixWorld)
          _fwd.set(1, 0, 0).applyAxisAngle(_up, PAD_YAW - Math.PI / 2)
          emitPuffs(_ring.x, _ring.y, _ring.z, _fwd.x, _fwd.z, 3, _c.copy(tireGlow(r.tireId)).getHex(), PUFF_STREAM)
        }
      }
    }
  })

  return (
    <group ref={groupRef}>
      <group ref={innerRef}>
        <BloxityAvatar equipped={look?.equipped} proportions={look?.proportions} motionRef={motionRef} handRef={wandRef} targetHeight={1.8} />
        <Wand ref={wandRef} />
      </group>
    </group>
  )
}

/**
 * The other players nearest the camera, as their real avatars - standing, walking or
 * training: as many as the quality preset allows (`remoteAvatars`), within
 * `remoteAvatarDistance` - on every preset, everyone in the room, near or far. Anyone
 * beyond those limits would be the cheap blocky figure RemotePlayers draws
 * (`r.fullAvatar` tells it who's covered).
 * Chosen twice a second, never per frame, so React only re-renders when the set of
 * players (or an outfit) actually changes.
 */
export function RemoteAvatars() {
  const camera = useThree((s) => s.camera)
  const [shown, setShown] = useState([])

  useEffect(() => {
    const pick = () => {
      const settings = getQuality()
      const near = []
      for (const r of remotePlayers.values()) {
        r.fullAvatar = false
        const d = camera.position.distanceTo(r.flying ? r.flight.position : r.position)
        if (d < settings.remoteAvatarDistance) near.push([d, r])
      }
      near.sort((a, b) => a[0] - b[0])
      const next = near
        .slice(0, settings.remoteAvatars)
        .map(([, r]) => r)
        .sort((a, b) => (a.sessionId < b.sessionId ? -1 : 1))
      for (const r of next) r.fullAvatar = true
      setShown((prev) => {
        const same = prev.length === next.length && prev.every((p, i) => p.sessionId === next[i].sessionId && p.lookKey === next[i].lookKey)
        return same ? prev : next.map((r) => ({ sessionId: r.sessionId, look: r.look, lookKey: r.lookKey }))
      })
    }
    pick()
    const id = setInterval(pick, PICK_MS)
    return () => clearInterval(id)
  }, [camera])

  return (
    <>
      {shown.map((s) => (
        <Suspense key={`${s.sessionId}:${s.lookKey}`} fallback={null}>
          <RemoteAvatar sessionId={s.sessionId} look={s.look} />
        </Suspense>
      ))}
    </>
  )
}

export default RemoteAvatars
