import { schema, t } from '@colyseus/schema'

/**
 * Synced state, kept deliberately small: only what other players need to draw you.
 * Everything private (inventory, items, boosts...) goes to its owner alone as
 * 'profile' messages, never through the shared state.
 */
export const PlayerState = schema(
  {
    name: t.string(),
    /** Their verified Boxity account id ('' for guests), so chat can be matched to them. */
    uid: t.string(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    rotY: t.float32(),
    /** 'idle' | 'walk' | 'run' (pull-ups on a bar) | 'jump' | 'pull' (stretching back on the launch posts) | 'emote:<Boxity emote id>' */
    anim: t.string(),
    /** What their Bloxity avatar wears, as JSON `{ equipped, proportions }` ('' = base). */
    look: t.string(),
    tireId: t.string(),
    /** Equipped pet species, at most 3. */
    petIds: t.array('string'),
    health: t.float64(),
    wins: t.float64(),
    rebirths: t.uint16(),
    /** The world they're in (balance WORLDS): players only see others in theirs. */
    world: t.uint8(),
    level: t.uint16(),
  },
  'PlayerState',
)

export const GameState = schema(
  {
    /** sessionId -> player */
    players: t.map(PlayerState),
    /** Short code for private lobbies ('' for public ones). */
    code: t.string(),
    isPrivate: t.boolean(),
  },
  'GameState',
)
