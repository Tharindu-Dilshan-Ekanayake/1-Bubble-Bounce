import { runtime } from '../game/runtime'
import { apiUrl } from './env'

/**
 * Boxity emotes.
 *
 * Boxity draws the emote picker itself and tells the game which one to play through
 * `player.onEvent('play_emote', id)`; the game only plays the animation. The catalog
 * comes from `{apiUrl}/v1/avatar/emotes`, fetched once:
 *   [{ id, name, price, free, icon, clip: { len, loop, tracks } }]
 * where `tracks` maps a bone name to keys `[timeSeconds, xDeg, yDeg, zDeg]`: rotation
 * DELTAS over the bind pose (see avatarRig.applyEmote for how they are applied).
 *
 * No ids are hardcoded and nothing is checked for ownership (Boxity only offers what the
 * player owns); an id not in the catalog is ignored.
 *
 * Your own emote is replicated through your animation state: while it plays,
 * `runtime.player.anim` is reported as 'emote:<id>' and other clients play the same id.
 */

/** id -> { id, len, loop, tracks: [{ bone, keys: [[t, xDeg, yDeg, zDeg]] }] } */
const clips = new Map()
let loading = null

const toNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

/** A catalog clip in a shape cheap to sample, or null if it's malformed. */
function normalizeClip(id, clip) {
  if (!clip || typeof clip !== 'object' || !clip.tracks || typeof clip.tracks !== 'object') return null
  const tracks = []
  let lastKey = 0
  for (const [bone, rawKeys] of Object.entries(clip.tracks)) {
    if (!Array.isArray(rawKeys)) continue
    const keys = []
    for (const k of rawKeys) {
      if (!Array.isArray(k)) continue
      const [t, x, y, z] = k.map(toNumber)
      if (t === null) continue
      keys.push([t, x ?? 0, y ?? 0, z ?? 0])
    }
    if (keys.length === 0) continue
    keys.sort((a, b) => a[0] - b[0])
    lastKey = Math.max(lastKey, keys[keys.length - 1][0])
    tracks.push({ bone, keys })
  }
  if (tracks.length === 0) return null
  const len = toNumber(clip.len)
  return { id, len: len && len > 0 ? len : Math.max(lastKey, 0.001), loop: Boolean(clip.loop), tracks }
}

/** Fetches the catalog once; later calls share the same promise. Never rejects. */
export function loadEmotes() {
  if (!loading) {
    loading = fetch(`${apiUrl()}/v1/avatar/emotes`)
      .then((res) => (res.ok ? res.json() : []))
      .then((body) => {
        const list = Array.isArray(body) ? body : Array.isArray(body?.emotes) ? body.emotes : []
        for (const emote of list) {
          const id = emote?.id ?? emote?._id
          if (id === undefined || id === null) continue
          const clip = normalizeClip(String(id), emote.clip)
          if (clip) clips.set(String(id), clip)
        }
        return clips
      })
      .catch((err) => {
        console.warn('[bloxity] emote catalog unavailable', err)
        // Let a later call try again.
        loading = null
        return clips
      })
  }
  return loading
}

/** The playable clip for an emote id, or null when unknown (or not loaded yet). */
export function getEmoteClip(id) {
  return (id && clips.get(String(id))) || null
}

// --- Your own emote -------------------------------------------------------------------

/** The emote you are playing now, or null, and when it started (performance.now()). */
let localEmoteId = null
let localStartedAt = 0
/** Emote ids are only reported in this shape (the server accepts exactly this). */
const REPLICABLE = /^[a-f0-9]{24}$/i

const isMoving = () => runtime.player.speed > 0.5 || !runtime.player.grounded

function startLocal(id) {
  localEmoteId = id
  localStartedAt = performance.now()
}

/**
 * Plays emote `id` on your character (Boxity's play_emote). Unknown ids do nothing; if
 * the catalog is still loading, it plays once it arrives (unless you moved meanwhile).
 * Never throws.
 */
export function playLocalEmote(id) {
  if (typeof id !== 'string' || !id) return
  if (getEmoteClip(id)) {
    startLocal(id)
    return
  }
  const askedAt = performance.now()
  loadEmotes().then(() => {
    if (getEmoteClip(id) && performance.now() - askedAt < 1500 && !isMoving()) startLocal(id)
  })
}

export function stopLocalEmote() {
  localEmoteId = null
}

/**
 * Your current emote id, or null. Called every frame by your avatar: it ends the emote
 * once you move or jump, or when a one-shot clip has played through.
 */
export function updateLocalEmote() {
  if (!localEmoteId) return null
  const clip = getEmoteClip(localEmoteId)
  const elapsed = (performance.now() - localStartedAt) / 1000
  if (!clip || isMoving() || (!clip.loop && elapsed > clip.len)) localEmoteId = null
  return localEmoteId
}

/**
 * Your animation as other players should see it: 'emote:<id>' while emoting, else
 * whatever the controller says. connection.js sends this with every position report.
 */
export function reportedAnim(anim) {
  const id = updateLocalEmote()
  return id && REPLICABLE.test(id) ? `emote:${id}` : anim
}

/** The emote id inside a remote player's anim ('emote:<id>'), or null. */
export function emoteFromAnim(anim) {
  return typeof anim === 'string' && anim.startsWith('emote:') ? anim.slice(6) || null : null
}
