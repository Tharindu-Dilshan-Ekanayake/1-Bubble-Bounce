import { SHOP } from '@shared/balance'

import { sfx } from '../audio/sfx'
import { getGame } from '../store/game'
import { actions } from './actions'

/**
 * Buys a shop item with Wins. The authority checks and charges; this only spares a
 * round trip when the answer is obviously no (the price already shows red).
 */
export function buy(productId) {
  const item = SHOP[productId]
  if (!item) return
  const { profile } = getGame()
  if (item.kind === 'pass' && profile.passes[productId]) return
  if (profile.wins < item.price) {
    sfx.error()
    return
  }
  actions.purchase(productId)
}
