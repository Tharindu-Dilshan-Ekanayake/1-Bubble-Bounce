import { DAY_MS, dayNumber, QUEST_TIERS, STREAK_MAX_DAYS, streakMultiplier } from '@shared/balance'
import { questBonusReward, questDone, questReward, questText } from '@shared/engage'
import { formatClock, formatNumber } from '@shared/format'
import { streakDays } from '@shared/logic'

import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import RewardIcon from '../RewardIcon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/** Each tier's badge colours. */
const TIER_GRADIENTS = [
  'linear-gradient(180deg, #b6ff6a 0%, #57e83a 50%, #19b52a 100%)',
  'linear-gradient(180deg, #b4efff 0%, #4cb8ff 50%, #2477e8 100%)',
  'linear-gradient(180deg, #ffb0a0 0%, #ff5a4a 50%, #d62020 100%)',
]

/** A claim button, or what's in the way of one. */
function ClaimButton({ state, onClaim, label }) {
  if (state === 'ready') {
    return (
      <button
        type="button"
        onClick={onClaim}
        className="pp-btn pp-bounce"
        style={{ width: u(200), height: u(72), borderRadius: u(8), background: GRADIENTS.greenButton, border: `${u(4)} solid #111`, fontSize: u(40) }}
      >
        <StrokeText stroke={u(8)}>Claim!</StrokeText>
      </button>
    )
  }
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: u(200), height: u(72), borderRadius: u(8), background: GRADIENTS.greyButton, border: `${u(4)} solid #111`, fontSize: u(30), gap: u(6) }}
    >
      {state === 'claimed' && <Icon name="check" size={u(40)} />}
      <StrokeText stroke={u(7)}>{state === 'claimed' ? 'Done' : label}</StrokeText>
    </div>
  )
}

function ProgressBar({ value, max, color = 'linear-gradient(180deg, #fff27a 0%, #ffc61e 50%, #ff9a12 100%)' }) {
  const f = Math.min(1, value / Math.max(1e-9, max))
  return (
    <div className="relative w-full overflow-hidden" style={{ height: u(34), borderRadius: u(17), border: `${u(4)} solid #111`, background: '#2a2f3a' }}>
      <div className="h-full origin-left" style={{ transform: `scaleX(${f})`, background: color }} />
      <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: u(24) }}>
        <StrokeText stroke={u(5)}>
          {formatNumber(Math.floor(value))} / {formatNumber(max)}
        </StrokeText>
      </div>
    </div>
  )
}

function QuestCard({ quest, index, profile }) {
  const tier = QUEST_TIERS[quest.tier]
  const reward = questReward(profile, index)
  const done = questDone(quest)
  const state = quest.claimed ? 'claimed' : done ? 'ready' : 'locked'
  return (
    <div
      className="flex items-center"
      style={{
        gap: u(16),
        padding: u(14),
        borderRadius: u(8),
        border: `${u(5)} solid #111`,
        background: done && !quest.claimed ? 'linear-gradient(180deg, #4a5a2a, #2e3a1a)' : 'linear-gradient(180deg, #3a3f4a, #2a2e36)',
      }}
    >
      <div className="flex flex-col items-center" style={{ width: u(130), gap: u(6) }}>
        <span className="flex items-center justify-center" style={{ width: u(126), height: u(44), borderRadius: u(22), background: TIER_GRADIENTS[quest.tier], border: `${u(4)} solid #111`, fontSize: u(26) }}>
          <StrokeText stroke={u(6)}>{tier.label}</StrokeText>
        </span>
        <Icon name="quest" size={u(70)} />
      </div>
      <div className="flex flex-1 flex-col" style={{ gap: u(10), minWidth: 0 }}>
        <span style={{ fontSize: u(36) }}>
          <StrokeText stroke={u(7)} style={{ whiteSpace: 'normal' }}>
            {questText(quest)}
          </StrokeText>
        </span>
        <ProgressBar value={quest.progress} max={quest.target} />
      </div>
      <div className="flex flex-col items-center" style={{ gap: u(8) }}>
        <div className="flex items-center" style={{ gap: u(6), fontSize: u(30) }}>
          <Icon name="trophy" size={u(44)} />
          <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
            +{formatNumber(reward.wins)}
          </StrokeText>
          {reward.item && <RewardIcon icon={reward.item} size={u(48)} />}
        </div>
        <ClaimButton state={state} label={done ? 'Claim' : 'In progress'} onClaim={() => actions.claimQuest(index)} />
      </div>
    </div>
  )
}

/** The login streak: how many days, what it's paying, and what tomorrow brings. */
function StreakCard({ profile, now }) {
  const days = streakDays(profile, now)
  const mult = streakMultiplier(days)
  const next = streakMultiplier(days + 1)
  const maxed = days >= STREAK_MAX_DAYS
  return (
    <div className="flex items-center" style={{ gap: u(14), padding: u(12), borderRadius: u(8), border: `${u(5)} solid #111`, background: 'linear-gradient(180deg, #ff9a3a, #e8541e)' }}>
      <Icon name="flame" size={u(96)} />
      <div className="flex flex-1 flex-col" style={{ gap: u(4) }}>
        <span style={{ fontSize: u(44) }}>
          <StrokeText stroke={u(9)}>{days > 0 ? `DAY ${days} STREAK!` : 'START A STREAK TODAY!'}</StrokeText>
        </span>
        <span style={{ fontSize: u(28) }}>
          <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
            {maxed
              ? `MAX STREAK: x${mult.toFixed(1)} Wins on every launch! Keep it going every day.`
              : `x${mult.toFixed(1)} Wins on every launch - come back tomorrow for x${next.toFixed(1)}! Miss a day and it starts again.`}
          </StrokeText>
        </span>
      </div>
      <div className="flex flex-col items-center" style={{ fontSize: u(26) }}>
        <StrokeText stroke={u(6)}>New quests in</StrokeText>
        <span style={{ fontSize: u(40) }}>
          <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
            {formatClock((dayNumber(now) + 1) * DAY_MS - now)}
          </StrokeText>
        </span>
      </div>
    </div>
  )
}

/**
 * Daily quests: the login streak up top, today's three quests (an EASY, a MEDIUM and a
 * HARD one) with their progress and rewards, and the bonus chest for finishing all three.
 * New ones every day at midnight UTC (the countdown says when).
 */
export function QuestsPanel() {
  const profile = useGame((s) => s.profile)
  const now = useNow(1000)
  const quests = profile.quests
  const allClaimed = quests.list.length > 0 && quests.list.every((q) => q.claimed)
  const bonus = questBonusReward(profile)
  const claimedCount = quests.list.filter((q) => q.claimed).length
  return (
    <Panel title="DAILY QUESTS" icon="quest" width={1040}>
      <div className="flex flex-col" style={{ gap: u(14) }}>
        <StreakCard profile={profile} now={now} />
        {quests.list.map((quest, i) => (
          <QuestCard key={`${quests.day}-${i}`} quest={quest} index={i} profile={profile} />
        ))}
        <div className="flex items-center" style={{ gap: u(16), padding: u(14), borderRadius: u(8), border: `${u(5)} solid #111`, background: 'linear-gradient(135deg, #ff4fd8 0%, #ff9a1f 30%, #ffe53b 55%, #4ef05a 80%, #2fc6ff 100%)' }}>
          <Icon name="items" size={u(96)} />
          <div className="flex flex-1 flex-col" style={{ gap: u(8) }}>
            <span style={{ fontSize: u(38) }}>
              <StrokeText stroke={u(8)}>QUEST CHEST: finish all three!</StrokeText>
            </span>
            <ProgressBar value={claimedCount} max={quests.list.length || 3} color="linear-gradient(180deg, #ffffff, #ffd6f2)" />
          </div>
          <div className="flex flex-col items-center" style={{ gap: u(8) }}>
            <div className="flex items-center" style={{ gap: u(6), fontSize: u(30) }}>
              <Icon name="trophy" size={u(44)} />
              <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
                +{formatNumber(bonus.wins)}
              </StrokeText>
              <RewardIcon icon="egg:unicorn" size={u(48)} />
            </div>
            <ClaimButton state={quests.bonus ? 'claimed' : allClaimed ? 'ready' : 'locked'} label="Locked" onClaim={actions.claimQuestBonus} />
          </div>
        </div>
      </div>
    </Panel>
  )
}

export default QuestsPanel
