import cors from 'cors'
import express from 'express'
import { defineRoom, defineServer } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'

import { resolveIdentity } from './bloxityApi.js'
import { bloxity } from './bloxityEnv.js'
import { startBloxityLeaderboards } from './bloxityLeaderboards.js'
import { closeStorage, openStorage } from './db.js'
import { gemsWebhook, startGemsPoller } from './gems.js'
import { installRoomReporter } from './legionRoomReporter.js'
import { startLeaderboards } from './leaderboards.js'
import { activePlayers } from './registry.js'
import { GameRoom } from './rooms/GameRoom.js'

// Bloxity Legion injects PORT (HTTP and WebSocket share it); 2567 is Colyseus's usual.
const PORT = Number(process.env.PORT || 2567)

/**
 * Browser origins allowed to call /api: Legion's CLIENT_ORIGIN (the game's site), the
 * Bloxity-hosted frontends (<game>.<play host> and its dev channel, the play host from
 * bloxityEnv.js), extra ones from CLIENT_ORIGINS, and Vite dev servers.
 */
const ALLOWED_ORIGINS = [
  process.env.CLIENT_ORIGIN,
  bloxity.playHost && `https://${bloxity.gameId}.${bloxity.playHost}`,
  bloxity.playHost && `https://${bloxity.gameId}.dev.${bloxity.playHost}`,
  ...(process.env.CLIENT_ORIGINS || '').split(',').map((s) => s.trim()),
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://localhost:5180', 'http://127.0.0.1:5180']),
].filter(Boolean)

/** HTTP endpoints next to the Colyseus matchmaker on the same port. */
function routes(app) {
  // Legion's readiness and liveness probes. Answers at once, whatever else is going on.
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api', cors({ origin: ALLOWED_ORIGINS, credentials: true }))
  app.use('/api', express.json())

  app.get('/api/health', (_req, res) => {
    // `game` lets a development client tell this server from another project's.
    res.json({ ok: true, game: '1-arm-length', players: activePlayers.size })
  })

  /**
   * Auth passthrough for the Bloxity SDK: the frontend POSTs `{ token, user }` from
   * `Legion.SDK.auth.authenticateWithServer('/api/legion-auth')`. The token is checked
   * with Boxity, and the user comes from Boxity's answer, never from the body.
   */
  app.post('/api/legion-auth', async (req, res) => {
    const token = req.body?.token
    if (typeof token !== 'string' || !token) return res.status(401).json({ error: 'Missing token' })
    try {
      const identity = await resolveIdentity({ token, playerId: 'unverified' })
      if (!identity.verified) return res.status(503).json({ error: 'Boxity unavailable' })
      res.json({ accessToken: token, user: { legionId: identity.playerId } })
    } catch {
      res.status(401).json({ error: 'Invalid token' })
    }
  })

  /**
   * Boxity Gems purchases (server to server): recorded here, applied by the pod the
   * buyer plays on. See gems.js.
   */
  app.post('/api/gems/webhook', gemsWebhook)
}

await openStorage()

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    game: defineRoom(GameRoom).enableRealtimeListing(),
  },
  express: routes,
  greet: false,
})

const stopTimers = []

// SIGTERM (a deploy or scale-in) runs Colyseus' graceful shutdown: every room saves
// and hands its players to another pod (GameRoom.onBeforeShutdown), then this.
server.onShutdown(() => {
  for (const stop of stopTimers) stop()
  return closeStorage()
})

await server.listen(PORT)
// After listen: Boxity's "Open Rooms" list, fed from this pod (legionRoomReporter.js).
stopTimers.push(startLeaderboards(), startBloxityLeaderboards(), startGemsPoller(), installRoomReporter())
console.log(
  `[server] listening on port ${PORT} (Boxity ${bloxity.env}, ${bloxity.apiUrl})` +
    `${process.env.POD_NAME ? ` (${process.env.POD_NAME}, ${process.env.BLOXITY_CHANNEL})` : ''}`,
)
