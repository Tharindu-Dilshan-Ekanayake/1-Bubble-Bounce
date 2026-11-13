import { useEffect, useRef } from 'react'

import { POPUP_POOL_SIZE, registerPopupElements } from '../game/fx/popups'
import { iconUrl } from './icons'
import { GRADIENTS, u } from './hud/style'

const SLOTS = Array.from({ length: POPUP_POOL_SIZE }, (_, i) => i)

/**
 * The DOM side of the popup pool: renders the fixed set of elements once and hands
 * them to popups.js, which moves them without React.
 */
export function PopupLayer() {
  const refs = useRef([])

  useEffect(() => {
    registerPopupElements(refs.current)
  }, [])

  return (
    <div className="pp-font pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      {SLOTS.map((i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="absolute left-0 top-0 items-center whitespace-nowrap"
          // Moved every frame (popups.js): its own layer, and contained, so each move
          // restyles this popup alone rather than invalidating the whole page.
          style={{ display: 'none', fontSize: u(40), gap: u(4), willChange: 'transform, opacity', contain: 'layout style' }}
        >
          <img src={iconUrl('heart')} alt="" style={{ width: u(46), height: u(46) }} />
          <span className="pp-text">
            <span data-popup-text aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(9) }} />
            <span
              data-popup-text
              className="pp-text-fill"
              style={{
                backgroundImage: GRADIENTS.gold,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

export default PopupLayer
