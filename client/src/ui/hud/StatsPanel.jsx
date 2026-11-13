import { useEffect } from 'react'

import { crowdBonus, streakMultiplier } from '@shared/balance'
import { formatClock, formatNumber } from '@shared/format'
import { streakDays } from '@shared/logic'

import { remotePlayers } from '../../net/remotePlayers'
import { useGame } from '../../store/game'
import useNow from '../useNow'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

function StatRow({ icon, value, gradient }) {
  return (
    <div className="relative flex items-center" style={{ height: u(86) }}>
      <Icon name={icon} size={u(86)} className="relative" />
      {/* Keyed on the value: every change replays a little bump. */}
      <span key={value} className="pp-bump relative" style={{ fontSize: u(64), marginLeft: u(8) }}>
        <StrokeText stroke={u(12)} gradient={gradient}>
          {value}
        </StrokeText>
      </span>
    </div>
  )
}

/** Active potion timers, shown under the stats while a boost runs. */
function Boosts() {
  const boosts = useGame((s) => s.profile.boosts)
  const now = useNow(1000)
  const active = [
    ['potionHealth', boosts.health],
    ['potionWins', boosts.wins],
  ].filter(([, end]) => end > now)
  if (active.length === 0) return null
  return (
    <div className="flex" style={{ gap: u(10), marginTop: u(4) }}>
      {active.map(([icon, end]) => (
        <div key={icon} className="flex items-center" style={{ fontSize: u(28) }}>
          <Icon name={icon} size={u(54)} />
          <StrokeText stroke={u(6)}>{formatClock(end - now)}</StrokeText>
        </div>
      ))}
    </div>
  )
}

/** A small badge under the stats: an icon, a line and a bonus. */
function Chip({ icon, text, bonus }) {
  return (
    <div className="flex items-center" style={{ fontSize: u(26), gap: u(4), marginTop: u(4) }}>
      <Icon name={icon} size={u(48)} />
      <StrokeText stroke={u(6)}>{text}</StrokeText>
      <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
        {bonus}
      </StrokeText>
    </div>
  )
}

/** Shown once per session: today's streak news. */
let streakToastShown = false

/**
 * The login streak (days in a row and the Wins it adds), and the friends bonus while
 * others share your server. Says today's streak news once, a moment after the game is up.
 */
function Bonuses() {
  const days = useGame((s) => streakDays(s.profile, Date.now()))
  const news = useGame((s) => (s.profileLoaded && s.playable ? s.session.streak : null))
  const showToast = useGame((s) => s.showToast)
  // Other players here (the ones drawn: your world's), counted every couple of seconds.
  useNow(2000)
  const others = remotePlayers.size

  useEffect(() => {
    if (!news || streakToastShown) return undefined
    streakToastShown = true
    const id = setTimeout(() => {
      if (news.broke) showToast('Your streak ended... DAY 1 again - play tomorrow for x1.1 Wins!')
      else if (news.days >= 2) showToast(`DAY ${news.days} STREAK! x${news.multiplier.toFixed(1)} Wins on every launch today!`)
      else showToast('DAY 1 STREAK! Come back tomorrow for x1.1 Wins on every launch!')
    }, 2500)
    return () => clearTimeout(id)
  }, [news, showToast])

  return (
    <>
      {days > 0 && <Chip icon="flame" text={`Day ${days}`} bonus={`x${streakMultiplier(days).toFixed(1)}`} />}
      {others > 0 && <Chip icon="friends" text={`${others} here`} bonus={`+${Math.round((crowdBonus(others) - 1) * 100)}%`} />}
    </>
  )
}

/** Top-left, as in the reference: Rebirths, then Wins, with any running potions and bonuses under them. */
export function StatsPanel() {
  const wins = useGame((s) => s.profile.wins - s.pendingWins)
  const rebirths = useGame((s) => s.profile.rebirths)

  return (
    <div className="hud-stats pointer-events-none absolute flex flex-col" style={{ contain: 'layout style' }}>
      <StatRow icon="rebirth" value={formatNumber(rebirths)} />
      <StatRow icon="trophy" value={formatNumber(wins)} gradient={GRADIENTS.gold} />
      <Boosts />
      <Bonuses />
    </div>
  )
}

export default StatsPanel
