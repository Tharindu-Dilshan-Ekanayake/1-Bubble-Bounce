import { fireBurst } from './game/fx/fxQueue'
import { launch, releaseBlow, startBlow } from './game/launch'
import { runtime } from './game/runtime'
import { showHit } from './game/roll/hudLink'
import { beginRoll, roll, tapBounce } from './game/roll/rollControl'
import { actions } from './net/actions'
import { remotePlayers } from './net/remotePlayers'
import { useGame } from './store/game'
import { useQuality } from './store/quality'

/**
 * `?debug` in the URL exposes game internals on `window.__pp` for the automated
 * perf/screenshot checks and console poking. Off by default; changes nothing else.
 */
export function installDebugHooks() {
  if (typeof window === 'undefined') return
  if (!new URLSearchParams(window.location.search).has('debug')) return
  window.__pp = { runtime, useGame, useQuality, actions, remotePlayers, roll, beginRoll, tapBounce, blow: { launch, startBlow, releaseBlow }, fx: { fireBurst, showHit } }
}
