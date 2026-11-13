import { ITEMS } from '@shared/balance'
import { formatClock } from '@shared/format'

import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const itemIcon = (id) => {
  const item = ITEMS[id]
  return item.kind === 'egg' ? `egg:${item.egg}` : id
}

/** Backpack: potions to drink and egg vouchers to open, plus running boost timers. */
export function ItemsPanel() {
  const items = useGame((s) => s.profile.items)
  const boosts = useGame((s) => s.profile.boosts)
  const closePanel = useGame((s) => s.closePanel)
  const now = useNow(1000)
  const owned = Object.keys(ITEMS).filter((id) => (items[id] || 0) > 0)
  const active = [
    ['potionHealth', 'x2 Power', boosts.health],
    ['potionWins', 'x2 Wins', boosts.wins],
  ].filter(([, , end]) => end > now)

  return (
    <Panel title="ITEMS" width={900}>
      {active.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: u(16), marginBottom: u(14) }}>
          {active.map(([icon, label, end]) => (
            <div key={icon} className="flex items-center" style={{ gap: u(8), padding: `${u(6)} ${u(14)}`, borderRadius: u(30), background: 'rgba(255,255,255,0.08)', fontSize: u(32) }}>
              <Icon name={icon} size={u(48)} />
              <StrokeText stroke={u(6)}>
                {label} · {formatClock(end - now)}
              </StrokeText>
            </div>
          ))}
        </div>
      )}
      {owned.length === 0 ? (
        <div className="flex flex-col items-center" style={{ padding: u(40), gap: u(10) }}>
          <Icon name="items" size={u(120)} />
          <span style={{ fontSize: u(34) }}>
            <StrokeText stroke={u(7)}>No items - claim Rewards to get potions and eggs!</StrokeText>
          </span>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${u(190)}, 1fr))`, gap: u(14) }}>
          {owned.map((id) => {
            const item = ITEMS[id]
            const isEgg = item.kind === 'egg'
            return (
              <div
                key={id}
                className="relative flex flex-col items-center"
                style={{ padding: u(10), borderRadius: u(8), border: `${u(5)} solid #111`, background: GRADIENTS.rewardCard }}
              >
                <span className="absolute" style={{ top: u(4), right: u(10), fontSize: u(36) }}>
                  <StrokeText stroke={u(7)}>x{items[id]}</StrokeText>
                </span>
                <Icon name={itemIcon(id)} size={u(110)} />
                <span className="text-center" style={{ fontSize: u(28), margin: `${u(4)} 0 ${u(8)}` }}>
                  <StrokeText stroke={u(6)}>{item.name}</StrokeText>
                </span>
                <ChunkyButton
                  gradient={isEgg ? GRADIENTS.purpleButton : GRADIENTS.greenButton}
                  onClick={() => {
                    if (isEgg) {
                      // The reveal plays over the world, not over this panel.
                      closePanel()
                      actions.openEggItem(id)
                    } else {
                      actions.usePotion(id)
                    }
                  }}
                  className="w-full"
                  style={{ height: u(58) }}
                >
                  <span style={{ fontSize: u(34) }}>
                    <StrokeText stroke={u(7)}>{isEgg ? 'Open' : 'Use'}</StrokeText>
                  </span>
                </ChunkyButton>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

export default ItemsPanel
