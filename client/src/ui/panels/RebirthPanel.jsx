import { levelCap, nextRebirthGift, rebirthMultiplier } from '@shared/balance'
import { formatMultiplier } from '@shared/format'
import { isMaxLevel, rebirthProgress, rebirthSkipPrice } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame, useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const CARD_GRADIENTS = {
  health: 'linear-gradient(180deg, #8ff0ff 0%, #2fb8ff 50%, #1677ff 100%)',
  after: 'linear-gradient(180deg, #c6ff7a 0%, #6fe04a 50%, #26ad3c 100%)',
  level: 'linear-gradient(180deg, #ffe25a 0%, #ffb21e 55%, #f08a0a 100%)',
}
const PURPLE = 'linear-gradient(180deg, #ffd6ff 0%, #e27bff 50%, #a93cf0 100%)'
const LEVEL_FILL = 'linear-gradient(180deg, #c6ff7a 0%, #6fe04a 50%, #26ad3c 100%)'

function StatCard({ kind, text }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden"
      style={{
        height: u(104),
        borderRadius: u(22),
        background: CARD_GRADIENTS[kind],
        border: `${u(5)} solid #111`,
        boxShadow: `inset 0 ${u(5)} 0 rgba(255,255,255,0.45), inset 0 -${u(6)} 0 rgba(0,0,0,0.18)`,
      }}
    >
      <span className="relative" style={{ fontSize: u(text.length > 11 ? 50 : 60) }}>
        <StrokeText stroke={u(11)}>{text}</StrokeText>
      </span>
    </div>
  )
}

/**
 * Rebirth, as in the reference: what you have now against what the next rebirth gives
 * (Health multiplier and max level), your progress to max level, and the Rebirth button
 * once you're there - or Skip, for Wins, before then.
 */
export function RebirthPanel() {
  const rebirths = useGame((s) => s.profile.rebirths)
  const level = useGame((s) => s.profile.level)
  const progress = useGame((s) => rebirthProgress(s.profile))
  const ready = useGame((s) => isMaxLevel(s.profile))
  const skipPrice = useGame((s) => rebirthSkipPrice(s.profile))
  const canSkip = useGame((s) => s.profile.wins >= skipPrice)
  const autoRebirth = useGame((s) => s.profile.settings.autoRebirth)
  const cap = levelCap(rebirths)
  const gift = nextRebirthGift(rebirths)

  const skip = () => {
    if (getGame().profile.wins < skipPrice) {
      sfx.error()
      return
    }
    actions.skipRebirth()
  }

  return (
    <Panel title="Rebirth" icon="rebirth" width={920}>
      <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr', columnGap: u(20), rowGap: u(16) }}>
        <div className="text-center" style={{ fontSize: u(58) }}>
          <StrokeText stroke={u(11)}>Now</StrokeText>
        </div>
        <div />
        <div className="text-center" style={{ fontSize: u(58) }}>
          <StrokeText stroke={u(11)}>After Rebirth</StrokeText>
        </div>

        <StatCard kind="health" text={`${formatMultiplier(rebirthMultiplier(rebirths))} Power`} />
        <Icon name="fastForward" size={u(80)} />
        <StatCard kind="after" text={`${formatMultiplier(rebirthMultiplier(rebirths + 1))} Power`} />

        <StatCard kind="level" text={`Max Level ${cap}`} />
        <Icon name="fastForward" size={u(80)} />
        <StatCard kind="level" text={`Max Level ${levelCap(rebirths + 1)}`} />
      </div>

      <p className="m-0 text-center" style={{ fontSize: u(46), marginTop: u(18) }}>
        <StrokeText stroke={u(9)} gradient={PURPLE}>
          Rebirth resets your Level and Power!
        </StrokeText>
      </p>
      {gift && (
        <p className="m-0 flex items-center justify-center" style={{ fontSize: u(40), marginTop: u(8), gap: u(10) }}>
          <Icon name="egg:volcano" size={u(56)} />
          <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
            {gift.rebirths === rebirths + 1 ? 'This rebirth' : `Rebirth ${gift.rebirths}`} gives {gift.label}!
          </StrokeText>
        </p>
      )}

      <div
        className="relative mx-auto overflow-hidden"
        style={{ width: '88%', marginTop: u(12), height: u(76), borderRadius: u(38), border: `${u(5)} solid #111`, background: '#eef6ff' }}
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: LEVEL_FILL, borderRadius: u(32) }} />
        <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: u(50) }}>
          <StrokeText stroke={u(10)}>
            Level {level}/{cap}
          </StrokeText>
        </div>
      </div>

      <div className="flex" style={{ marginTop: u(26), gap: u(22) }}>
        <ChunkyButton
          disabled={!ready}
          onClick={() => actions.rebirth()}
          gradient={ready ? GRADIENTS.greenButton : GRADIENTS.greyButton}
          className="flex-1"
          style={{ height: u(108) }}
          radius={22}
          border={5}
        >
          <span style={{ fontSize: u(60) }}>
            <StrokeText stroke={u(12)}>{ready ? 'REBIRTH!' : `Need Level ${cap}`}</StrokeText>
          </span>
        </ChunkyButton>
        {!ready && (
          <ChunkyButton onClick={skip} gradient={GRADIENTS.rainbow} className="flex-1" style={{ height: u(108), gap: u(16) }} radius={22} border={5}>
            <span style={{ fontSize: u(60) }}>
              <StrokeText stroke={u(12)}>Skip</StrokeText>
            </span>
            <Price amount={skipPrice} size={48} afford={canSkip} />
          </ChunkyButton>
        )}
      </div>

      <label className="pointer-events-auto flex cursor-pointer items-center justify-center" style={{ marginTop: u(18), gap: u(12), fontSize: u(32) }}>
        <input
          type="checkbox"
          checked={autoRebirth}
          onChange={(e) => actions.setSetting('autoRebirth', e.target.checked)}
          style={{ width: u(34), height: u(34), accentColor: '#3fdc4a' }}
        />
        <StrokeText stroke={u(7)}>Auto Rebirth at max level</StrokeText>
      </label>
    </Panel>
  )
}

export default RebirthPanel
