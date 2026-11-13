import { apiUrl, bloxity } from './bloxityEnv.js'

/**
 * The Boxity platform calls the server makes on a player's behalf: who a joining
 * player really is, and whether a rewarded ad was really watched. Both go to the API
 * from bloxityEnv.js with a short timeout, so a slow platform can delay a join or a
 * reward by a few seconds at most, never hang it.
 *
 * `fetchImpl` and `settings` are parameters so tests can stand in for the network.
 */

const TIMEOUT_MS = 5000
/** Ids are database keys and travel in every save; keep them short. */
const MAX_ID = 80

/**
 * POSTs JSON and returns `{ status, body }` (body null if it isn't JSON). Throws only
 * for a network failure or timeout, so callers can tell "Boxity said no" from "Boxity
 * didn't answer".
 */
export async function postJson(url, payload, { headers = {}, fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/** A guest's save key: their own 'guest-...' id, or anything else made into one. */
export const asGuestId = (id) => (id.startsWith('guest-') ? id : `guest-${id}`).slice(0, MAX_ID)

/**
 * Who a joining player is, from their join options `{ playerId, name, token }`.
 * Resolves `{ playerId, verified, name?, carriedFrom }` or throws to refuse the join.
 *
 * - With a token (a logged-in Boxity player): Boxity verifies it, and the account id
 *   it answers with is the save key - whatever playerId the client claimed. A token
 *   Boxity rejects refuses the join.
 * - Without one, the claimed id is taken as a guest's. Boxity-hosted, it must be a
 *   guest id ('guest-...'), and anything else is made into one: a client can't open
 *   someone's account save by naming their account id. Off Boxity (development) any
 *   id goes.
 * - If Boxity can't be reached, the player still gets in, as a guest (see above), so
 *   an outage on the platform doesn't lock everyone out of the game.
 *
 * Only `verified` players count for Boxity leaderboards and receive Gems purchases.
 */
export async function resolveIdentity(options, { fetchImpl = fetch, settings = bloxity } = {}) {
  const claimed = String(options?.playerId || '').trim().slice(0, MAX_ID)
  const token = typeof options?.token === 'string' && options.token ? options.token : null

  const unverified = () => {
    if (!claimed) throw new Error('Missing player id')
    const playerId = settings.hosted ? asGuestId(claimed) : claimed
    return { playerId, verified: false, carriedFrom: [] }
  }

  if (!token) return unverified()

  let answer
  try {
    answer = await postJson(
      apiUrl('/v1/auth/game-token/verify', settings),
      { gameSlug: settings.gameSlug },
      { headers: { Authorization: `Bearer ${token}` }, fetchImpl },
    )
  } catch (err) {
    console.warn(`[auth] Boxity unreachable, ${claimed || 'player'} joins as a guest:`, err?.message || err)
    return unverified()
  }
  // A platform error isn't a verdict on the player.
  if (answer.status >= 500) {
    console.warn(`[auth] Boxity answered ${answer.status}, ${claimed || 'player'} joins as a guest`)
    return unverified()
  }
  const { valid, user, carriedFrom } = answer.body || {}
  if (!valid || !user?._id) throw new Error('Invalid Boxity session')
  return {
    playerId: String(user._id).slice(0, MAX_ID),
    verified: true,
    // The account's own name beats what the client says it is.
    name: user.displayName || user.username || undefined,
    carriedFrom: Array.isArray(carriedFrom) ? carriedFrom.map(String).filter(Boolean).slice(0, 10) : [],
  }
}

/**
 * Whether Boxity confirms `rewardToken` as a rewarded ad watched to the end. Any
 * failure counts as no: an unconfirmed ad never pays.
 */
export async function verifyAdReward(rewardToken, { fetchImpl = fetch, settings = bloxity } = {}) {
  try {
    const { body } = await postJson(
      apiUrl('/v1/ads/reward/verify', settings),
      { gameSlug: settings.gameSlug, rewardToken },
      { fetchImpl },
    )
    return body?.valid === true
  } catch (err) {
    console.warn('[ads] reward verify failed', err?.message || err)
    return false
  }
}
