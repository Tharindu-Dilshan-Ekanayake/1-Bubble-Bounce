import { GEM_PRODUCTS } from '@shared/balance'

import { actions, send } from '../net/actions'
import { currentRoomId, isOnline } from '../net/connection'
import { getGame } from '../store/game'
import { getSDK, safeCall } from './sdk'
import { getBloxityState, useBloxityStore } from './store'

/**
 * Boxity services for the game's UI: rewarded ads, Gems, friends and invites, screen
 * ads and the portal's leaderboards. Plain functions - call them from anywhere.
 *
 * Every call is safe without the SDK (offline, outside Boxity, script blocked): it
 * reports "not available" instead of throwing. Async ones never reject.
 *
 * Grants are never decided here. Online, the game server verifies Boxity's word (the
 * rewarded-ad token, the Gems webhook). Offline there is no server, so the offline
 * stand-in (net/localServer.js) grants - and it is only told to after Boxity reported
 * a completed ad / a successful purchase.
 */

const errorText = (err) => (err instanceof Error ? err.message : String(err ?? 'error'))

/** Is the game playing offline against its local stand-in? */
const playingOffline = () => !isOnline() && getGame().net.mode === 'offline'

// --- Rewarded ads ---------------------------------------------------------------------

/** True when Boxity can show a rewarded ad here (inside the portal, ads enabled). */
export function isRewardedAvailable() {
  const sdk = getSDK()
  return Boolean(safeCall(sdk?.ads?.isAvailable?.bind(sdk.ads)))
}

/**
 * Shows a rewarded ad for `placement` ('health-potion', 'wins-potion', ...) and, if it
 * was watched to the end, claims the reward.
 *
 * @returns {Promise<{ ok: boolean, status: string, reason?: string }>} `ok` once the
 *   claim was sent (the reward itself arrives as a profile update / 'reward' event);
 *   `status` is Boxity's ('completed', 'skipped', 'disabled', 'error', ...).
 */
export async function watchRewardedAd(placement) {
  try {
    const sdk = getSDK()
    if (typeof sdk?.ads?.showRewarded !== 'function') return { ok: false, status: 'disabled', reason: 'no-sdk' }
    const result = await sdk.ads.showRewarded(placement)
    const status = result?.status || 'error'
    if (status !== 'completed') return { ok: false, status, reason: result?.reason }

    if (isOnline()) {
      // The server checks the token with Boxity once; no token, no reward.
      if (!result.rewardToken) return { ok: false, status, reason: 'no-reward-token' }
      actions.adReward(placement, result.rewardToken)
      return { ok: true, status }
    }
    if (playingOffline()) {
      actions.adReward(placement, result.rewardToken ?? null)
      return { ok: true, status }
    }
    return { ok: false, status, reason: 'not-connected' }
  } catch (err) {
    return { ok: false, status: 'error', reason: errorText(err) }
  }
}

// --- Gems -----------------------------------------------------------------------------

const gemsApi = () => {
  const sdk = getSDK()
  return sdk?.gems || sdk?.bux || null
}

/** Re-reads the signed-in player's Gems balance into the store (null for guests). */
export async function refreshGemsBalance() {
  const store = useBloxityStore.getState()
  const user = store.user
  const gems = gemsApi()
  if (!user || typeof gems?.getBalance !== 'function') {
    store.setGems(null)
    return null
  }
  try {
    const balance = Number(await gems.getBalance())
    // Signed out (or someone else signed in) meanwhile: that answer is stale.
    if (useBloxityStore.getState().user !== user) return getBloxityState().gems
    const value = Number.isFinite(balance) ? balance : null
    useBloxityStore.getState().setGems(value)
    return value
  } catch (err) {
    console.warn('[bloxity] Gems balance unavailable', err)
    return getBloxityState().gems
  }
}

/** The last known Gems balance, or null when unknown. */
export function getGemsBalance() {
  return getBloxityState().gems
}

/** React hook: the Gems balance (null when unknown); re-renders when it changes. */
export function useGemsBalance() {
  return useBloxityStore((s) => s.gems)
}

/**
 * Buys Gems product `sku` (a key of GEM_PRODUCTS). Boxity shows its own confirmation
 * with the price; the game never shows or decides prices.
 *
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function buyGems(sku) {
  try {
    if (!Object.hasOwn(GEM_PRODUCTS, sku)) return { success: false, error: 'Unknown product' }
    const gems = gemsApi()
    if (typeof gems?.requestPurchase !== 'function') return { success: false, error: 'Gems are not available here' }
    // Only the sku: price and grant are Boxity's and the server's business.
    const result = await gems.requestPurchase(sku)
    if (!result?.success) return { success: false, error: result?.error || 'Purchase cancelled' }

    // Online, the server applies the grant Boxity's webhook recorded; offline, the
    // local stand-in grants it.
    if (isOnline()) actions.gemsCheck()
    else if (playingOffline()) send('gemsLocal', { sku })
    refreshGemsBalance()
    return { success: true }
  } catch (err) {
    return { success: false, error: errorText(err) }
  }
}

// --- Friends and invites ----------------------------------------------------------------

/** Re-reads the signed-in player's Boxity friends into the store ([] for guests). */
export async function refreshFriends() {
  const store = useBloxityStore.getState()
  const user = store.user
  const social = getSDK()?.social
  if (!user || typeof social?.getFriends !== 'function') {
    store.setFriends([])
    return []
  }
  try {
    const friends = await social.getFriends()
    if (useBloxityStore.getState().user !== user) return getBloxityState().friends
    const list = Array.isArray(friends) ? friends : []
    useBloxityStore.getState().setFriends(list)
    return list
  } catch (err) {
    console.warn('[bloxity] friends unavailable', err)
    return getBloxityState().friends
  }
}

/**
 * React hook: the player's Boxity friends, `[{ _id, username, displayName, pfp,
 * presence: { status: 'online'|'in_game'|'offline', gameName? } }]`.
 */
export function useFriends() {
  return useBloxityStore((s) => s.friends)
}

/** Makes sure Boxity knows the room we're in before anything builds a join link. */
function reportRoom() {
  const game = getSDK()?.game
  safeCall(game?.updateRoom?.bind(game), currentRoomId() || '')
}

/** A shareable link that brings friends into this game (and room), or null. */
export function getInviteLink() {
  const social = getSDK()?.social
  if (typeof social?.getInviteFriendsLink !== 'function') return null
  reportRoom()
  return safeCall(social.getInviteFriendsLink.bind(social)) || null
}

/** Invites Boxity friend `userId` to this room. Resolves true when the invite was sent. */
export async function inviteFriend(userId) {
  try {
    const social = getSDK()?.social
    if (!userId || typeof social?.inviteFriend !== 'function') return false
    reportRoom()
    return Boolean(await social.inviteFriend(userId))
  } catch (err) {
    console.warn('[bloxity] invite failed', err)
    return false
  }
}

// --- Screen ads -----------------------------------------------------------------------

let screenType = null

/**
 * Tells Boxity which screen the player is on, for its screen ads: 'gameplay' normally,
 * 'panel' while a modal panel is open. integration.js switches this automatically
 * from the game store's `panel`; calling it again with the same type does nothing.
 */
export function setScreen(type) {
  if (!type || type === screenType) return
  const ads = getSDK()?.ads
  if (typeof ads?.screen !== 'function') return
  screenType = type
  safeCall(ads.screen.bind(ads), type)
}

/** Takes Boxity's screen ads down (teardown). */
export function hideScreen() {
  if (!screenType) return
  screenType = null
  const ads = getSDK()?.ads
  safeCall(ads?.hideScreen?.bind(ads))
}

// --- Leaderboards ----------------------------------------------------------------------

/**
 * Opens Boxity's leaderboard overlay on board `id` ('rebirths', 'wins', 'distance',
 * 'playtime'). False when the portal can't show it (then show the game's own).
 */
export function openBoxityLeaderboard(id) {
  const board = getSDK()?.leaderboard
  return Boolean(safeCall(board?.open?.bind(board), id))
}

// --- Account --------------------------------------------------------------------------

/** Called by BloxityProvider on every login/logout: loads or clears the account data. */
export function onAccountChanged(user) {
  if (user) {
    refreshFriends()
    refreshGemsBalance()
  } else {
    useBloxityStore.getState().setFriends([])
    useBloxityStore.getState().setGems(null)
  }
}

/** React hook: true while Boxity plays an ad break (pause rendering then). */
export function useAdBreak() {
  return useBloxityStore((s) => s.adBreak)
}
