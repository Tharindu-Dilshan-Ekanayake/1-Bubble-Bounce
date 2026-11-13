import { PLAYTIME_REWARDS } from '@shared/balance'
import { formatClock } from '@shared/format'
import { playtimeStatus } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame, useGame } from '../../store/game'
import RewardIcon from '../RewardIcon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { AlertBadge, ChunkyButton } from './parts'
import { u } from './style'

const GIFT_GRADIENT = 'linear-gradient(180deg, #ffc8f6 0%, #e46bff 50%, #a63ce8 100%)'
const READY_GRADIENT = 'linear-gradient(180deg, #c9ff96 0%, #6fe04a 50%, #26ad3c 100%)'

/**
 * The free playtime gift, as a tile on the left menu: the next gift's picture with its
 * countdown on the tile, turning green and bouncing once it's ready - tap to claim.
 * Tapping before then says what's coming. Only this tile ticks once a second.
 */
export function GiftTile() {
  const session = useGame((s) => s.session)
  const now = useNow(1000)
  const next = playtimeStatus(session, now).find((s) => s.state !== 'claimed')
  if (!next) return null
  const reward = PLAYTIME_REWARDS[next.index]
  const ready = next.state === 'ready'
  const onClick = () => {
    if (ready) {
      actions.claimPlaytime(next.index)
      return
    }
    sfx.click()
    getGame().showToast(`FREE GIFT: ${reward.label} in ${formatClock(next.unlocksIn)}`)
  }

  return (
    <ChunkyButton
      gradient={ready ? READY_GRADIENT : GIFT_GRADIENT}
      onClick={onClick}
      title={`Free gift: ${reward.label}`}
      radius={20}
      className={`flex-col ${ready ? 'pp-bounce' : ''}`}
      style={{ width: u(112), height: u(112) }}
    >
      <RewardIcon icon={reward.icon} size={u(78)} />
      <span className="absolute" style={{ bottom: u(-14), fontSize: u(30) }}>
        <StrokeText stroke={u(7)}>{ready ? 'CLAIM!' : formatClock(next.unlocksIn)}</StrokeText>
      </span>
      <span className="absolute" style={{ top: u(-22), fontSize: u(28) }}>
        <StrokeText stroke={u(7)} className="italic">
          Gift
        </StrokeText>
      </span>
      {ready && <AlertBadge size={40} style={{ top: u(-12), right: u(-14) }} />}
    </ChunkyButton>
  )
}

export default GiftTile
