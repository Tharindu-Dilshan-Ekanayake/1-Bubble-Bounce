import { applyOfflineProgress, normalizeProfile } from '@shared/logic'
import { PlayerSession } from '@shared/session'

import { runtime } from '../game/runtime'

const SAVE_KEY = 'tr.save.v1'
const TICK_MS = 100
const SAVE_MS = 5000

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * Offline stand-in for the game server: runs the same PlayerSession the Colyseus room
 * runs, against a save in localStorage. Used when no server is configured or it can't
 * be reached, so the game is always playable.
 *
 * @param {{ id: string, name: string, onEvent: (type: string, payload: object) => void }} options
 * @returns {{ send: (type: string, payload?: object) => void, close: () => void }}
 */
export function createLocalServer({ id, name, onEvent }) {
  const profile = normalizeProfile(loadSave(), id, name)
  const startedAt = Date.now()
  // "Keep training while you're offline": credit the pad you logged off on.
  const offline = applyOfflineProgress(profile, startedAt)

  const session = new PlayerSession(profile, {
    now: startedAt,
    // The session mutates its profile in place; the UI must get its own copy or it
    // would never see a change (same reference) and could edit server state.
    emit: (type, payload) => onEvent(type, payload ? structuredClone(payload) : payload),
    getPosition: () => runtime.player.position,
  })

  const save = () => {
    try {
      profile.lastSeen = Date.now()
      localStorage.setItem(SAVE_KEY, JSON.stringify(profile))
    } catch {
      // Storage full or blocked: progress just won't persist this session.
    }
  }

  let last = performance.now()
  const tickId = setInterval(() => {
    const t = performance.now()
    session.tick(Math.min(0.5, (t - last) / 1000), Date.now())
    last = t
  }, TICK_MS)
  const saveId = setInterval(save, SAVE_MS)
  const onHide = () => {
    if (document.visibilityState === 'hidden') save()
  }
  window.addEventListener('beforeunload', save)
  document.addEventListener('visibilitychange', onHide)

  session.sendProfile()
  if (offline) onEvent('offline', offline)

  return {
    send(type, payload) {
      // Offline there is no server to verify Boxity's word, so the two host-only grants
      // are taken here. Both are only ever sent by bloxity/services.js, after Boxity
      // reported a completed rewarded ad / a successful Gems purchase.
      if (type === 'adReward') {
        if (typeof payload?.placement === 'string') session.grantAdReward(payload.placement, Date.now())
        save()
        return
      }
      if (type === 'gemsLocal') {
        if (typeof payload?.sku === 'string') session.grantGemProduct(payload.sku)
        save()
        return
      }
      session.handle(type, payload, Date.now())
    },
    close() {
      clearInterval(tickId)
      clearInterval(saveId)
      window.removeEventListener('beforeunload', save)
      document.removeEventListener('visibilitychange', onHide)
      save()
    },
  }
}
