import { getSDK, safeCall } from './sdk'

/**
 * Who this player is, for the game server: the single source of the player id, the
 * game slug and the Boxity token every join sends.
 */

/**
 * The game slug from the Boxity developer dashboard: `1-arm-length`. The deploy
 * workflow passes it as VITE_GAME_SLUG; local builds fall back to it.
 */
export const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || '1-arm-length'

const GUEST_KEY = 'pp.guestId'

/**
 * A stable per-browser id for players with no Boxity identity at all (the SDK never
 * loaded) - so every tab of one browser is the same guest, and a new tab takes over
 * from the last. `?tabguest` in the URL gives the tab a guest of its own instead (kept
 * across its reloads), for trying several players from one browser.
 */
function localGuestId() {
  try {
    const storage = new URLSearchParams(window.location.search).has('tabguest') ? sessionStorage : localStorage
    let id = storage.getItem(GUEST_KEY)
    if (!id) {
      id = `guest-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
      storage.setItem(GUEST_KEY, id)
    }
    return id
  } catch {
    return `guest-${Math.random().toString(36).slice(2)}`
  }
}

/**
 * The id the game saves progress under:
 *  1. the signed-in Boxity user's `_id`;
 *  2. else the Boxity guest's `_id`, when the SDK's guest carries one (Boxity moves a
 *     guest's progress onto the account they later create, by that id);
 *  3. else this browser's own local guest id.
 * `?tabguest` always takes 3, so several tabs can be different players.
 */
export function playerIdFor(user, guest) {
  if (user?._id) return String(user._id)
  const tabGuest = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tabguest')
  if (!tabGuest && guest?._id) return String(guest._id)
  return localGuestId()
}

/** The SDK's game token for the server to verify, or null (guest / no SDK). */
export function joinToken() {
  const sdk = getSDK()
  return safeCall(sdk?.auth?.getToken?.bind(sdk.auth)) || null
}

/** Strips the 'legion_' prefix Boxity puts on some user ids (chat messages). */
export function bareUserId(id) {
  return typeof id === 'string' ? id.replace(/^legion_/, '') : ''
}
