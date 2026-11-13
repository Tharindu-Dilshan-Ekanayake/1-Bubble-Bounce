import { setAdBreakMuted, setMasterVolume, setMusicVolume } from '../audio/sfx'
import { respawn, runtime } from '../game/runtime'
import { getGame, useGame } from '../store/game'
import { QUALITY_LEVELS, useQuality } from '../store/quality'
import { handleChatMessage } from './chat'
import { loadEmotes, playLocalEmote, stopLocalEmote } from './emotes'
import { safeCall, toUnsubscribe } from './sdk'
import { hideScreen, setScreen } from './services'
import { getBloxityState, useBloxityStore } from './store'

/**
 * Everything the game wires into the Boxity SDK besides auth and the avatar (those stay
 * in BloxityProvider): features, leaderboards, ad breaks, the portal's settings menu,
 * portal-sent player events (respawn, emotes), chat bubbles, gameplay lifecycle and
 * screen ads, and - when playing offline - leaderboard scores.
 *
 * `setupOnce` runs once per page right after `init()`; `installIntegration` runs per
 * provider mount and returns its teardown (StrictMode mounts twice in dev).
 */

/** Boards the game declares; scores come from the game server (or, offline, below). */
export const LEADERBOARDS = [
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'wins', label: 'Total Wins', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'distance', label: 'Longest Flight (m)', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'playtime', label: 'Minutes Played', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
]

/** Once per page, right after `Legion.SDK.init()`. */
export function setupOnce(sdk) {
  // Boxity draws the emote picker once a game says it can play emotes.
  safeCall(sdk.game?.registerFeature?.bind(sdk.game), 'emotes')
  safeCall(sdk.leaderboard?.define?.bind(sdk.leaderboard), LEADERBOARDS)
}

/** Subscribes `fn` through an SDK `on*` method if it exists; returns the unsubscribe. */
function subscribe(target, method, fn) {
  return toUnsubscribe(safeCall(target?.[method]?.bind(target), fn))
}

// --- Ad breaks ------------------------------------------------------------------------

function setAdBreak(on) {
  if (getBloxityState().adBreak === on) return
  useBloxityStore.getState().setAdBreak(on)
  setAdBreakMuted(on)
}

// --- Settings (the Boxity portal menu) --------------------------------------------------

const QUALITY_FROM_SETTING = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', ultra: 'HIGH' }

function parseNumber(value, min, max, fallback) {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/**
 * `settings.listen(key, cb)` both registers a control in the portal menu and calls `cb`
 * straight away with the current value - which, before the portal has sent the
 * player's real settings, is Boxity's default (graphics "High"). So for each setting:
 * `initial` is true for that first value (and for `triggerAll()` right after), and
 * `changed` is true when a later value differs from the last one seen.
 */
const SETTINGS = {
  master_volume(value) {
    setMasterVolume(parseNumber(value, 0, 100, 100) / 100)
  },
  music_volume(value) {
    setMusicVolume(parseNumber(value, 0, 100, 100) / 100)
  },
  graphics_quality(value, { initial, changed }) {
    const level = QUALITY_FROM_SETTING[String(value).trim().toLowerCase()]
    if (!level) return
    const quality = useQuality.getState()
    if (initial) {
      // Never let the default raise an auto-detected weak device; only a lower setting
      // applies, and as a non-manual choice (the FPS monitor may still drop it).
      if (QUALITY_LEVELS.indexOf(level) < QUALITY_LEVELS.indexOf(quality.level)) quality.setLevel(level, false)
      return
    }
    // The player picked it in the portal menu: a manual choice.
    if (changed) quality.setLevel(level, true)
  },
  show_fps(value) {
    useBloxityStore.getState().setSetting({ showFps: value === 'true' })
  },
  camera_sensitivity(value) {
    useBloxityStore.getState().setSetting({ cameraSensitivity: parseNumber(value, 0.1, 5, 1) })
  },
  enable_chat(value) {
    useBloxityStore.getState().setSetting({ chatEnabled: value !== 'false' })
  },
  background_transparency(value) {
    // How solid the panels' dark backgrounds are (0.2-1): a CSS variable Panel.jsx reads.
    document.documentElement.style.setProperty('--panel-alpha', String(parseNumber(value, 0.2, 1, 0.9)))
  },
  fullscreen(value, { initial, changed }, sdk) {
    // Only on a change the player made: the initial "false" must not exit a fullscreen
    // the portal itself entered, and fullscreen needs the portal anyway.
    if (initial || !changed) return
    const portal = sdk.portal
    if (value === 'true') safeCall(portal?.requestFullscreen?.bind(portal))
    else if (value === 'false') safeCall(portal?.exitFullscreen?.bind(portal))
  },
}

function installSettings(sdk) {
  const settings = sdk.settings
  if (typeof settings?.listen !== 'function') return () => {}
  const unsubscribers = []
  const lastSeen = new Map()
  let starting = true
  for (const [key, apply] of Object.entries(SETTINGS)) {
    const listener = (raw) => {
      const value = raw === undefined || raw === null ? '' : String(raw)
      const first = !lastSeen.has(key)
      const changed = !first && lastSeen.get(key) !== value
      lastSeen.set(key, value)
      try {
        apply(value, { initial: starting || first, changed }, sdk)
      } catch (err) {
        console.warn(`[bloxity] setting ${key} failed`, err)
      }
    }
    unsubscribers.push(toUnsubscribe(safeCall(settings.listen.bind(settings), key, listener)))
  }
  safeCall(settings.triggerAll?.bind(settings))
  starting = false
  return () => unsubscribers.forEach((fn) => safeCall(fn))
}

// --- Player events from the portal ---------------------------------------------------

function onPlayerEvent(event, data) {
  switch (event) {
    case 'respawn_request':
      // Not while your tire is rolling: you're frozen at the Roll Zone until it stops.
      if (runtime.player.frozen) return
      stopLocalEmote()
      respawn()
      runtime.camera.snap = true
      return
    case 'play_emote':
      playLocalEmote(typeof data === 'string' ? data : data?.id ?? data?.emoteId)
      return
    default:
      // 'chat_message_sent', 'pointer_lock_changed' and anything newer: nothing to do
      // (chat bubbles come from chat.onMessage).
      return
  }
}

function installPlayerEvents(sdk) {
  const player = sdk.player
  if (typeof player?.onEvent === 'function') {
    return subscribe(player, 'onEvent', (event, data) => {
      try {
        onPlayerEvent(event, data)
      } catch (err) {
        console.warn('[bloxity] player event failed', event, err)
      }
    })
  }
  // Older SDK builds: only the respawn request.
  return subscribe(player, 'onRespawnRequest', () => onPlayerEvent('respawn_request'))
}

// --- Gameplay lifecycle + screen ads ---------------------------------------------------

/** gameplayStart is reported once per page (and again after a bfcache restore). */
let gameplayStarted = false

function installLifecycle(sdk) {
  const game = sdk.game
  const start = () => {
    if (gameplayStarted) return
    gameplayStarted = true
    safeCall(game?.gameplayStart?.bind(game))
  }
  /** Screen ads: 'panel' while a modal panel is open, 'gameplay' otherwise. */
  const sync = (state) => {
    if (!state.playable) return
    start()
    setScreen(state.panel ? 'panel' : 'gameplay')
  }
  sync(getGame())
  const unsubscribe = useGame.subscribe((state, prev) => {
    if (state.playable !== prev.playable || state.panel !== prev.panel) sync(state)
  })

  const onPageHide = () => {
    if (!gameplayStarted) return
    gameplayStarted = false
    safeCall(game?.gameplayEnd?.bind(game))
  }
  const onPageShow = (e) => {
    if (e.persisted) sync(getGame())
  }
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  return () => {
    unsubscribe()
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    hideScreen()
  }
}

// --- Leaderboards while offline -----------------------------------------------------------

/** At most one round of submissions this often. */
const OFFLINE_SUBMIT_MS = 15000

function boardScores(profile) {
  const stats = profile?.stats || {}
  return {
    rebirths: Math.floor(Number(profile?.rebirths) || 0),
    wins: Math.floor(Number(stats.totalWins) || 0),
    distance: Math.floor(Number(stats.bestDistance) || 0),
    playtime: Math.floor((Number(stats.playtime) || 0) / 60),
  }
}

/**
 * Online, the game server submits leaderboard scores. Offline (no server, see
 * net/localServer.js) nobody would, so the browser does: after profile changes (each
 * roll, rebirth...), throttled, and only scores higher than the last sent ("best" mode
 * boards keep the best anyway). Signed-in players only: a guest has no board entry.
 */
function installOfflineLeaderboards(sdk) {
  const board = sdk.leaderboard
  if (typeof board?.submit !== 'function') return () => {}
  let sent = {}
  let sentFor = null
  let timer = null
  let lastAt = 0

  const flush = () => {
    timer = null
    lastAt = performance.now()
    const { net, profile } = getGame()
    const user = getBloxityState().user
    if (net.mode !== 'offline' || !user || !safeCall(sdk.auth?.getToken?.bind(sdk.auth))) return
    if (sentFor !== user._id) {
      sent = {}
      sentFor = user._id
    }
    for (const [id, score] of Object.entries(boardScores(profile))) {
      if (!(score > (sent[id] ?? 0))) continue
      sent[id] = score
      Promise.resolve(safeCall(board.submit.bind(board), id, score)).catch((err) => {
        console.warn(`[bloxity] leaderboard ${id} submit failed`, err)
        delete sent[id]
      })
    }
  }

  const unsubscribe = useGame.subscribe((state, prev) => {
    if (state.profile === prev.profile || state.net.mode !== 'offline' || timer) return
    timer = setTimeout(flush, Math.max(0, lastAt + OFFLINE_SUBMIT_MS - performance.now()))
  })
  return () => {
    unsubscribe()
    clearTimeout(timer)
    timer = null
  }
}

// --- Install --------------------------------------------------------------------------

/** Wires the SDK into the game; returns the teardown. Never throws. */
export function installIntegration(sdk) {
  const teardown = []
  const guard = (label, install) => {
    try {
      teardown.push(install())
    } catch (err) {
      console.warn(`[bloxity] ${label} setup failed`, err)
    }
  }

  // Ad breaks: pause (the scene stops rendering on `adBreak`) and mute, then resume
  // with the player's own audio settings untouched.
  guard('ads', () => {
    const offStart = subscribe(sdk.ads, 'onBreakStart', () => setAdBreak(true))
    const offEnd = subscribe(sdk.ads, 'onBreakEnd', () => setAdBreak(false))
    return () => {
      offStart()
      offEnd()
      setAdBreak(false)
    }
  })
  guard('settings', () => installSettings(sdk))
  guard('player events', () => installPlayerEvents(sdk))
  guard('chat', () => subscribe(sdk.chat, 'onMessage', (m) => handleChatMessage(sdk, m)))
  guard('lifecycle', () => installLifecycle(sdk))
  guard('leaderboards', () => installOfflineLeaderboards(sdk))
  loadEmotes()

  return () => teardown.forEach((fn) => safeCall(fn))
}
