/**
 * Process-wide bookkeeping shared by every room: who is playing where, and which rooms
 * are alive. Progress is per player, not per lobby, so a player may only be in one
 * room at a time - this is what enforces that.
 */

/** playerId -> { room, client } */
export const activePlayers = new Map()

/** Every live GameRoom, for cross-room broadcasts (stock counters, boards). */
export const liveRooms = new Set()

export function broadcastAll(type, payload) {
  for (const room of liveRooms) room.broadcast(type, payload)
}
