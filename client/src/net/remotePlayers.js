import { Vector3 } from 'three'

import { createRideState } from '../game/roll/path'
import { runtime } from '../game/runtime'
import { getGame } from '../store/game'

/**
 * Other players, as the network last described them. Network callbacks write here;
 * the renderer reads it each frame and interpolates between snapshots, drawing
 * everyone ~110 ms in the past so 10 Hz updates still move smoothly.
 */

/** sessionId -> remote player */
export const remotePlayers = new Map()

const MAX_SNAPSHOTS = 24

/** Everyone's synced state, whichever world they're in, so a change of world can redraw them. */
const latest = new Map()

export function upsertRemotePlayer(sessionId, state) {
  latest.set(sessionId, state)
  // Only players in your world are drawn: each world feels like its own place.
  if ((state.world || 0) !== (getGame().profile.world || 0)) {
    dropRemotePlayer(sessionId)
    return
  }
  let r = remotePlayers.get(sessionId)
  if (!r) {
    r = {
      sessionId,
      name: '',
      /** Their verified Boxity user id ('' for guests): matches Boxity chat to them. */
      uid: '',
      snaps: [],
      position: new Vector3(state.x, state.y, state.z),
      yaw: state.rotY,
      speed: 0,
      anim: 'idle',
      tireId: 'bicycle',
      /** Their avatar's outfit, parsed from `look`; `lookKey` is the raw string. */
      look: null,
      lookKey: '',
      petIds: [],
      /** Follow state per equipped pet, grown as needed and reused. */
      pets: [],
      walkPhase: 0,
      /** Their launch replayed down the runway (RemotePlayers fills it in while `flying`). */
      flight: createRideState(),
      flying: false,
      pulling: false,
    }
    // Its own point: while they fly it follows them down the runway (RemotePlayers).
    r.shadow = { position: r.position.clone(), size: 1.1, visible: true }
    runtime.shadowCasters.add(r.shadow)
    remotePlayers.set(sessionId, r)
  }
  r.name = state.name
  r.uid = state.uid || ''
  r.anim = state.anim
  r.tireId = state.tireId
  r.level = state.level
  r.rebirths = state.rebirths
  if (state.look !== r.lookKey) {
    r.lookKey = state.look
    try {
      r.look = state.look ? JSON.parse(state.look) : null
    } catch {
      r.look = null
    }
  }
  r.petIds = [...state.petIds]
  while (r.pets.length < r.petIds.length) {
    r.pets.push({ id: '', position: r.position.clone(), yaw: 0, hop: 0 })
  }
  const last = r.snaps[r.snaps.length - 1]
  if (!last || last.x !== state.x || last.y !== state.y || last.z !== state.z || last.r !== state.rotY) {
    r.snaps.push({ t: performance.now(), x: state.x, y: state.y, z: state.z, r: state.rotY })
    if (r.snaps.length > MAX_SNAPSHOTS) r.snaps.shift()
  }
}

/** You changed world: shows the players in the new one, hides the rest. */
export function refreshRemoteWorlds() {
  for (const [sessionId, state] of latest) upsertRemotePlayer(sessionId, state)
}

export function removeRemotePlayer(sessionId) {
  latest.delete(sessionId)
  dropRemotePlayer(sessionId)
}

function dropRemotePlayer(sessionId) {
  const r = remotePlayers.get(sessionId)
  if (!r) return
  runtime.shadowCasters.delete(r.shadow)
  runtime.ghostRolls.delete(sessionId)
  remotePlayers.delete(sessionId)
}

export function clearRemotePlayers() {
  for (const id of [...remotePlayers.keys()]) removeRemotePlayer(id)
  latest.clear()
  runtime.remotePets.length = 0
  runtime.ghostRolls.clear()
}
