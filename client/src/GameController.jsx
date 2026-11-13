import { useEffect, useRef, useState } from 'react'

import { useBloxity } from './bloxity/BloxityContext'
import { playerIdFor } from './bloxity/identity'
import { startGameTicker } from './game/ticker'
import { startConnection, stopConnection } from './net/connection'

/** Don't hold the game hostage to a slow SDK script: play as guest after this. */
const SDK_GRACE_MS = 4000

/**
 * Non-visual: owns the game's long-running processes - the connection to the authority
 * and the 10 Hz zone ticker - for the lifetime of the app.
 *
 * Waits for the Bloxity SDK to settle (or fail) so the save is opened under the right
 * identity (see bloxity/identity.js for which id that is), then reconnects whenever the
 * player logs in or out - back into the same room, so signing in mid-game never moves
 * you away from the people you were playing with.
 */
export function GameController() {
  const { status, user, guest, identity } = useBloxity()
  const [graceOver, setGraceOver] = useState(false)
  const settled = status === 'ready' || status === 'error' || graceOver
  const playerId = settled ? playerIdFor(user, guest) : null
  const name = identity?.displayName || identity?.username || 'Player'
  // A display-name change shouldn't reconnect; the next connection picks it up.
  const nameRef = useRef(name)
  useEffect(() => {
    nameRef.current = name
  }, [name])
  /** The id the current connection was opened with, to tell a sign-in from a remount. */
  const connectedAs = useRef(null)

  useEffect(() => {
    const id = setTimeout(() => setGraceOver(true), SDK_GRACE_MS)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    const stop = startGameTicker()
    return stop
  }, [])

  useEffect(() => {
    if (!playerId) return undefined
    // A different identity than the one already playing: the player signed in or out.
    const identityChanged = connectedAs.current !== null && connectedAs.current !== playerId
    connectedAs.current = playerId
    startConnection({ id: playerId, name: nameRef.current }, identityChanged ? { mode: 'rejoin' } : undefined)
    return stopConnection
  }, [playerId])

  return null
}

export default GameController
