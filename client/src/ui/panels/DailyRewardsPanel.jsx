import { DAILY_REWARDS } from '@shared/balance'
import { formatClock } from '@shared/format'
import { dailyStatus } from '@shared/logic'

import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import RewardIcon from '../RewardIcon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

function StatusButton({ status, onClaim, big }) {
  const height = u(big ? 90 : 58)
  const font = u(big ? 62 : status.state === 'next' ? 30 : 34)
  if (status.state === 'ready') {
    return (
      <button
        type="button"
        onClick={onClaim}
        className="pp-btn w-full"
        style={{ height, borderRadius: u(5), background: GRADIENTS.greenButton, border: `${u(4)} solid #111`, fontSize: font }}
      >
        <StrokeText stroke={u(big ? 11 : 8)}>Claim!</StrokeText>
      </button>
    )
  }
  const text = status.state === 'claimed' ? 'Claimed' : status.state === 'next' ? formatClock(status.unlocksIn) : 'LOCKED'
  return (
    <div
      className="flex w-full items-center justify-center"
      style={{ height, borderRadius: u(5), background: GRADIENTS.greyButton, border: `${u(4)} solid #111`, fontSize: font, gap: u(6) }}
    >
      {status.state === 'claimed' && <Icon name="check" size={u(big ? 56 : 38)} />}
      <StrokeText stroke={u(big ? 11 : 8)}>{text}</StrokeText>
    </div>
  )
}

function DayCard({ day, status, big = false }) {
  const reward = DAILY_REWARDS[day]
  return (
    <div
      className="relative flex flex-col items-center"
      style={{
        padding: u(big ? 12 : 8),
        borderRadius: u(4),
        border: `${u(5)} solid #111`,
        background: big
          ? 'linear-gradient(135deg, #ff4fd8 0%, #ff9a1f 22%, #ffe53b 40%, #4ef05a 58%, #2fc6ff 76%, #8a5cff 100%)'
          : 'linear-gradient(180deg, #ffe45c 0%, #ffc21f 40%, #ff9a12 100%)',
        boxShadow: `inset 0 ${u(5)} 0 rgba(255,255,255,0.45)`,
      }}
    >
      <div
        className="w-full text-center"
        style={{
          fontSize: u(big ? 96 : 46),
          lineHeight: 1.05,
          background: big ? 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0))' : 'linear-gradient(180deg, #ffd23a, #ff9a12)',
          margin: `${u(-4)} ${u(-4)} ${u(4)}`,
        }}
      >
        <StrokeText stroke={u(big ? 16 : 10)}>Day {day + 1}</StrokeText>
      </div>
      {!big && (
        <div className="whitespace-nowrap" style={{ fontSize: u(reward.label.length > 9 ? 27 : 33) }}>
          <StrokeText stroke={u(7)}>{reward.label}</StrokeText>
        </div>
      )}
      <div className="relative flex flex-1 items-center justify-center" style={{ minHeight: u(big ? 300 : 126) }}>
        <RewardIcon icon={reward.icon} size={u(big ? 270 : 120)} />
        {!big && reward.sub && (
          <span className="absolute" style={{ right: u(-6), bottom: u(-2), fontSize: u(46) }}>
            <StrokeText stroke={u(9)} gradient={GRADIENTS.gold}>
              {reward.sub}
            </StrokeText>
          </span>
        )}
      </div>
      {big && (
        <div style={{ fontSize: u(70), marginBottom: u(28) }}>
          <StrokeText stroke={u(13)}>{reward.label}</StrokeText>
        </div>
      )}
      <StatusButton status={status} big={big} onClaim={() => actions.claimDaily(day)} />
    </div>
  )
}

/** Seven-day login rewards: days 1-6 in a grid, the big Day 7 card on the right. */
export function DailyRewardsPanel() {
  const profile = useGame((s) => s.profile)
  const now = useNow(1000)
  const status = dailyStatus(profile, now)

  return (
    <Panel title="DAILY REWARDS" width={1040}>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1.55fr', gap: u(14) }}>
        <div className="col-span-3 grid grid-cols-3" style={{ gap: u(14) }}>
          {[0, 1, 2, 3, 4, 5].map((day) => (
            <DayCard key={day} day={day} status={status[day]} />
          ))}
        </div>
        <DayCard day={6} status={status[6]} big />
      </div>
    </Panel>
  )
}

export default DailyRewardsPanel
