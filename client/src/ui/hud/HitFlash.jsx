import { useCallback } from 'react'

import { HIT_GRADES } from '@shared/balance'

import { setHitElement } from '../../game/roll/hudLink'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { u } from './style'

const gradeOf = (id) => HIT_GRADES.find((g) => g.id === id)
const bonusOf = (id) => gradeOf(id).bonus
/** "+20% DISTANCE": how much further than a plain launch a grade's best launch flies. */
const extraDistance = (id) => `+${Math.round((gradeOf(id).reach[1] - 1) * 100)}% DISTANCE`

/**
 * Each graded hit's title card: its words, their gradient, how big, the light rays'
 * colour behind them (none for GOOD), and the badges popping in under it.
 */
const CARDS = [
  {
    id: 'good',
    title: 'GOOD!',
    size: 150,
    gradient: 'linear-gradient(180deg, #ffffff 0%, #fffbe0 40%, #ffe27a 70%, #ffb21e 100%)',
    rays: null,
    stars: 4,
    badges: [['NICE FLING!', 'linear-gradient(180deg, #ffffff 0%, #ffe27a 100%)']],
  },
  {
    id: 'great',
    title: 'GREAT!',
    size: 175,
    gradient: 'linear-gradient(180deg, #ffffff 0%, #c8f6ff 30%, #5fd6ff 60%, #2f6fe0 100%)',
    rays: 'rgba(95, 214, 255, 0.45)',
    stars: 6,
    badges: [
      [`STRONG FLING ${extraDistance('great')}`, 'linear-gradient(180deg, #8affc8 0%, #2fd0ff 100%)'],
      [`x${bonusOf('great')} WINS`, 'linear-gradient(180deg, #fff27a 0%, #ffb21e 100%)'],
    ],
  },
  {
    id: 'perfect',
    title: 'PERFECT!',
    size: 200,
    gradient: 'linear-gradient(180deg, #ffffff 0%, #fff27a 30%, #ffc21f 55%, #ff6a1e 100%)',
    rays: 'rgba(255, 214, 60, 0.5)',
    stars: 8,
    badges: [
      [`MEGA FLING ${extraDistance('perfect')}`, 'linear-gradient(180deg, #ff9a3a 0%, #ff3b3b 100%)'],
      [`x${bonusOf('perfect')} WINS`, 'linear-gradient(180deg, #fff27a 0%, #ffb21e 100%)'],
    ],
  },
]

/** Stars bursting out from behind the title: [angle (deg), distance (ref px), size]. */
const STARS = [
  [-160, 520, 90],
  [-20, 540, 100],
  [-120, 430, 70],
  [-60, 460, 80],
  [25, 500, 75],
  [160, 530, 70],
  [70, 420, 65],
  [115, 470, 85],
]

/** One grade's card: a flash, rays wheeling out, the title slamming in, badges, stars. */
function Card({ card }) {
  const ref = useCallback((el) => setHitElement(card.id, el), [card.id])
  const scale = card.size / 200
  return (
    <div ref={ref} className="pp-perfect pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="pp-perfect-flash absolute inset-0" />
      {card.rays && <div className="pp-perfect-rays absolute" style={{ '--ray': card.rays }} />}
      <div className="pp-perfect-stack absolute left-1/2 flex flex-col items-center">
        {STARS.slice(0, card.stars).map(([angle, dist, size], i) => (
          <span
            key={i}
            className="pp-perfect-star absolute"
            style={{
              '--dx': u(Math.cos((angle * Math.PI) / 180) * dist * scale),
              '--dy': u(Math.sin((angle * Math.PI) / 180) * dist * scale * 0.6),
              animationDelay: `${0.08 + (i % 3) * 0.04}s`,
            }}
          >
            <Icon name="starGold" size={u(size * scale)} />
          </span>
        ))}
        <div className="pp-perfect-title" style={{ fontSize: u(card.size), lineHeight: 1 }}>
          <StrokeText stroke={u(card.size * 0.16)} gradient={card.gradient}>
            {card.title}
          </StrokeText>
        </div>
        <div className="flex" style={{ gap: u(26), marginTop: u(18) }}>
          {card.badges.map(([text, gradient], i) => (
            <span key={text} className={`pp-perfect-badge pp-perfect-badge-${i + 1}`} style={{ fontSize: u(46) }}>
              <StrokeText stroke={u(10)} gradient={gradient}>
                {text}
              </StrokeText>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * A graded hit's moment on screen - GOOD, GREAT or PERFECT, each grander than the last:
 * a flash, light rays wheeling out from the middle, the title slamming in, overshooting
 * and settling with a wobble, what the hit earns popping in under it, stars bursting
 * out, then the lot flying up and away as the ball blasts off.
 *
 * All CSS animation, restarted from the frame loop by hudLink.showHit (a class toggle on
 * the grade's card): React renders them once and never again.
 */
export function HitFlash() {
  return CARDS.map((card) => <Card key={card.id} card={card} />)
}

export default HitFlash
