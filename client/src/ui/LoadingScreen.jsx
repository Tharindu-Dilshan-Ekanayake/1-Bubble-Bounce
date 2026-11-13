import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

import { iconUrl } from './icons'
import StrokeText from './StrokeText'

const TIPS = [
  'Stand on a Blow Pad to blow bubbles and gain Breath automatically!',
  'Tap BLOW for even more Breath - on a Blow Pad every tap counts the pad!',
  'More Breath = you bounce further, and every metre pays Wins!',
  'Let go of BLOW when the bubble is biggest for a PERFECT launch: x1.5 distance, x1.6 Wins!',
  'Every bounce earns you more Breath on the way!',
  'TAP the moment your bubble lands for a PERFECT BOUNCE: more distance, Wins and Breath!',
  'Rebirth at max level for x2, x3, x4... Breath and a higher level cap.',
  'Bounce through the village, the town and the city - and on to space!',
  'Spend Wins on new bubbles, pets and better Blow Pads.',
  'Pets multiply all the Breath you gain.',
  'Every bubble is a different shape - collect all 24!',
]

/**
 * The loading screen's backdrop, a launch park at golden hour in plain CSS (no image to
 * download): two floodlights glowing over a deep blue sky that warms to the horizon, the
 * dark line of the far stand, and the striped runway below it. Layers, top first.
 */
const STADIUM_BACKDROP = [
  'radial-gradient(circle at 14% 20%, rgba(255,250,225,0.95) 0 0.9%, rgba(255,236,190,0.35) 3%, transparent 9%)',
  'radial-gradient(circle at 86% 20%, rgba(255,250,225,0.95) 0 0.9%, rgba(255,236,190,0.35) 3%, transparent 9%)',
  'repeating-linear-gradient(180deg, rgba(255,255,255,0.8) 0 3px, transparent 3px 52px) bottom / 100% 40% no-repeat',
  'repeating-linear-gradient(180deg, #2b9a47 0 26px, #37b455 26px 52px) bottom / 100% 40% no-repeat',
  'linear-gradient(180deg, #132f74 0%, #2c5fc0 30%, #f0a067 50%, #ffd08c 54%, #232d48 54.4%, #34436a 60%)',
].join(', ')

/**
 * Full-screen loading overlay. Progress is drei's asset loader progress, blended with a
 * time-based creep so a single large download never looks frozen, and it only reaches
 * 100% when the game reports ready (avatar in place, first frame drawn).
 *
 * @param {{ done: boolean }} props
 */
export function LoadingScreen({ done }) {
  const { progress } = useProgress()
  const [creep, setCreep] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])

  useEffect(() => {
    if (done) return undefined
    const id = setInterval(() => setCreep((c) => Math.min(90, c + (90 - c) * 0.06)), 120)
    return () => clearInterval(id)
  }, [done])

  useEffect(() => {
    if (!done) return undefined
    const id = setTimeout(() => setHidden(true), 450)
    return () => clearTimeout(id)
  }, [done])

  if (hidden) return null
  const shown = done ? 100 : Math.max(creep, Math.min(95, progress * 0.95))

  return (
    <div
      className="pp-font absolute inset-0 z-[100] flex flex-col items-center justify-center gap-8 transition-opacity duration-500"
      style={{
        opacity: done ? 0 : 1,
        background: STADIUM_BACKDROP,
      }}
    >
      <div className="pp-loading-disc" aria-hidden="true">
        <img src={iconUrl('tire')} alt="" width="150" height="150" draggable={false} />
      </div>

      {/* The game's name: +1 ARM over a big rainbow LENGTH, tilted like a sticker. */}
      <h1 className="m-0 flex flex-col items-center text-center leading-none" style={{ transform: 'rotate(-3deg)' }}>
        <span style={{ fontSize: 'clamp(36px, 8vw, 84px)' }}>
          <StrokeText stroke="0.16em" gradient="linear-gradient(180deg, #ffffff 0%, #ffffff 55%, #ffe36b 56%, #ffb21e 100%)">
            +1 ARM
          </StrokeText>
        </span>
        <span style={{ fontSize: 'clamp(44px, 10vw, 118px)', marginTop: '-0.08em' }}>
          <StrokeText
            stroke="0.15em"
            gradient="linear-gradient(90deg, #ff4a4a 0%, #ff9a1e 18%, #ffe23a 36%, #4be05a 54%, #2fd0ff 72%, #b05cff 90%, #ff5fd2 100%)"
          >
            LENGTH
          </StrokeText>
        </span>
        <span className="text-base md:text-xl" style={{ marginTop: '0.4em' }}>
          <StrokeText stroke={5}>BLOW • BOUNCE • COLLECT • REBIRTH</StrokeText>
        </span>
      </h1>

      <div className="w-[min(560px,80vw)]">
        <div className="relative h-9 overflow-hidden rounded-xl border-4 border-black bg-black/40">
          <div
            // Scaled, not resized: it moves while the game is starting up, and a transform
            // never needs a layout.
            className="h-full origin-left rounded-md transition-transform duration-200"
            style={{ transform: `scaleX(${shown / 100})`, background: 'linear-gradient(180deg, #fff27a 0%, #ffc61e 50%, #ff9a12 100%)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-lg">
            <StrokeText stroke={5}>{done ? 'READY!' : `LOADING ${Math.round(shown)}%`}</StrokeText>
          </div>
        </div>
        <p className="mt-4 text-center text-base md:text-lg">
          <StrokeText stroke={4}>{tip}</StrokeText>
        </p>
      </div>
    </div>
  )
}

export default LoadingScreen
