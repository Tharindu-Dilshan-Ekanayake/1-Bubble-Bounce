import { healthForLevel, levelCap } from '@shared/balance'
import { formatMultiplier, formatNumber } from '@shared/format'
import { gainMultiplier, healthPacks, isMaxLevel, levelProgress } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame, useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { ChunkyButton, Price } from './parts'
import { u } from './style'

/** Width of the whole bar, in reference pixels: every row lines up to it. */
const WIDTH = 900

const PACK_GRADIENTS = [
  'linear-gradient(180deg, #ffe25a 0%, #ffb21e 55%, #f08a0a 100%)',
  'linear-gradient(180deg, #ff8a7a 0%, #ff3b3b 50%, #d4142a 100%)',
  'linear-gradient(135deg, #ff5fd2 0%, #8a5cff 35%, #2fb8ff 70%, #5cff9a 100%)',
]

const BAR_FILL = 'linear-gradient(180deg, #c6ff7a 0%, #6fe04a 50%, #26ad3c 100%)'
const HEALTH_FILL = 'linear-gradient(180deg, #ffe0e8 0%, #ff9cb2 45%, #ff5c7c 100%)'
const BOOST = 'linear-gradient(180deg, #fff6a8 0%, #ffd52a 50%, #ff9c00 100%)'

/**
 * "Level 12 ... 6/10", as in the reference: your level, and how much of the Health this
 * level needs you have. At max level it reads "MAX LEVEL 15 ... Rebirth!" and opens the
 * rebirth panel.
 */
function LevelBar() {
  const level = useGame((s) => s.profile.level)
  const health = useGame((s) => s.profile.health)
  const maxed = useGame((s) => isMaxLevel(s.profile))
  const fill = useGame((s) => levelProgress(s.profile))
  const cap = useGame((s) => levelCap(s.profile.rebirths))
  const openPanel = useGame((s) => s.openPanel)
  const from = healthForLevel(level)
  const to = healthForLevel(level + 1)

  return (
    <button
      type="button"
      onClick={maxed ? () => openPanel('rebirth') : undefined}
      className={`relative w-full overflow-hidden text-left ${maxed ? 'pp-btn pointer-events-auto' : 'pointer-events-none'}`}
      style={{
        height: u(70),
        borderRadius: u(12),
        border: `${u(6)} solid #111`,
        background: 'rgba(40, 44, 56, 0.85)',
        boxShadow: `0 ${u(5)} 0 #111, inset 0 ${u(-6)} 0 rgba(0,0,0,0.2)`,
      }}
    >
      {/* Grows by a transform, not its width: the bar fills on every Power gain (twice a
          second on a treadmill), and an animated width re-laid-out the page every frame. */}
      <div className="absolute inset-0 origin-left transition-transform duration-300 ease-out" style={{ transform: `scaleX(${fill})`, background: BAR_FILL }} />
      <div className="absolute" style={{ left: u(10), right: u(10), top: u(5), height: u(12), borderRadius: u(6), background: 'rgba(255,255,255,0.25)' }} />
      <div className="absolute inset-0 flex items-center justify-between" style={{ padding: `0 ${u(18)}`, fontSize: u(50) }}>
        <StrokeText stroke={u(10)}>{maxed ? `MAX LEVEL ${cap}` : `Level ${level}`}</StrokeText>
        <StrokeText stroke={u(10)}>{maxed ? 'Rebirth!' : `${formatNumber(Math.max(0, health - from))}/${formatNumber(to - from)}`}</StrokeText>
      </div>
    </button>
  )
}

/** A Health pack: "+10K" on the button with a heart, its price in Wins in the corner. */
function PackButton({ index, amount, price, afford }) {
  const buy = () => {
    if (getGame().profile.wins < price) {
      sfx.error()
      return
    }
    actions.buyPack(index)
  }
  return (
    <ChunkyButton gradient={PACK_GRADIENTS[index]} onClick={buy} title={`+${formatNumber(amount)} Power`} radius={8} border={5} style={{ width: u(290), height: u(76) }}>
      <Icon name="heart" size={u(62)} className="absolute" style={{ left: u(10) }} />
      <span className="relative" style={{ fontSize: u(48), marginLeft: u(30) }}>
        <StrokeText stroke={u(10)}>+{formatNumber(amount)}</StrokeText>
      </span>
      <span className="absolute" style={{ right: u(8), bottom: u(4) }}>
        <Price amount={price} size={26} afford={afford} />
      </span>
    </ChunkyButton>
  )
}

/**
 * Bottom centre, as in the reference: your Health beside a big heart and the
 * "x2 Health Boost" you're getting from rebirths, pets and potions, the level bar, and
 * the three Health packs.
 */
export function HealthBar() {
  const health = useGame((s) => s.profile.health)
  const rebirths = useGame((s) => s.profile.rebirths)
  const level = useGame((s) => s.profile.level)
  const wins = useGame((s) => s.profile.wins - s.pendingWins)
  const profile = useGame((s) => s.profile)
  // Potions run out on their own; re-read the boost every few seconds.
  const now = useNow(5000)
  const boost = gainMultiplier(profile, now)
  const packs = healthPacks({ level, rebirths })

  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(14), width: u(WIDTH), gap: u(8), contain: 'layout style' }}>
      <div className="relative flex w-full items-end justify-between" style={{ height: u(84) }}>
        <span className="flex items-center" style={{ gap: u(6) }}>
          <Icon name="heart" size={u(96)} />
          <span style={{ fontSize: u(76), lineHeight: 1 }}>
            <StrokeText stroke={u(13)} gradient={HEALTH_FILL}>
              {formatNumber(health)}
            </StrokeText>
          </span>
        </span>
        <span style={{ fontSize: u(36), marginBottom: u(4) }}>
          <StrokeText stroke={u(7)} gradient={BOOST}>
            {formatMultiplier(boost)} Power Boost
          </StrokeText>
        </span>
      </div>
      <LevelBar />
      <div className="flex w-full justify-between" style={{ marginTop: u(4) }}>
        {packs.map((pack, i) => (
          <PackButton key={i} index={i} amount={pack.amount} price={pack.price} afford={wins >= pack.price} />
        ))}
      </div>
    </div>
  )
}

export default HealthBar
