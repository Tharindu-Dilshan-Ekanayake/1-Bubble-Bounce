import { useCallback, useEffect, useRef } from 'react'

import { tapBounce } from '../../game/roll/rollControl'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { u } from './style'

/** PERFECT BOUNCEs this session after which the "tap when it lands" hint stops showing. */
const HINT_UNTIL = 3
let perfectsThisSession = 0

/**
 * While you bounce, the whole screen is the tap: tap (or click, Space, E, Enter) the
 * moment the bubble touches down for a PERFECT BOUNCE (rollControl.tapBounce judges it;
 * the ring on the ground - BounceRing - closes in on the beat). Under the HUD's buttons,
 * so they still work. A hint along the bottom until you've landed a few.
 */
export function BounceTap() {
  const rolling = useGame((s) => Boolean(s.roll))
  const hintRef = useRef(null)

  const tap = useCallback(() => {
    const grade = tapBounce(performance.now())
    if (grade === 'perfect') {
      perfectsThisSession += 1
      if (perfectsThisSession >= HINT_UNTIL && hintRef.current) hintRef.current.style.display = 'none'
    }
  }, [])

  useEffect(() => {
    if (!rolling) return undefined
    const onKey = (e) => {
      if (e.repeat) return
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
        e.preventDefault()
        tap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rolling, tap])

  if (!rolling) return null
  return (
    <div
      className="pointer-events-auto absolute inset-0 touch-none"
      onPointerDown={(e) => {
        e.preventDefault()
        tap()
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {perfectsThisSession < HINT_UNTIL && (
        <span ref={hintRef} className="pp-tap-hint pointer-events-none absolute left-1/2 whitespace-nowrap" style={{ bottom: u(300), fontSize: u(40) }}>
          <StrokeText stroke={u(8)} fill="#fff27a">
            TAP when the bubble LANDS!
          </StrokeText>
        </span>
      )}
    </div>
  )
}

export default BounceTap
