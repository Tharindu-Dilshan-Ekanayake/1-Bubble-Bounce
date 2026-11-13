import { useEffect } from 'react'

import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { u } from '../hud/style'

/** The red square X that sits on every panel's top-right corner. */
export function CloseButton({ onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="pp-btn pointer-events-auto absolute flex items-center justify-center"
      style={{
        width: u(96),
        height: u(96),
        background: 'linear-gradient(180deg, #ff6a5c 0%, #ee2233 55%, #c4101f 100%)',
        border: `${u(5)} solid #111`,
        borderRadius: u(6),
        boxShadow: `inset 0 0 0 ${u(4)} #ffffff, 0 ${u(4)} 0 rgba(0,0,0,0.4)`,
        fontSize: u(78),
        lineHeight: 1,
        ...style,
      }}
    >
      <StrokeText stroke={u(10)}>X</StrokeText>
    </button>
  )
}

/**
 * The game's modal panel: dark rounded frame, a big outlined title riding the top edge
 * and the red X on the corner, as in the reference's Daily Rewards and Rebirth windows.
 * Escape or a click outside closes it.
 *
 * @param {{ title: string, icon?: string, width?: number, children: React.ReactNode,
 *           footer?: React.ReactNode, onClose?: () => void }} props `width` in reference
 *   pixels; `icon` sits in front of the title
 */
export function Panel({ title, icon, width = 920, children, footer, onClose }) {
  const closePanel = useGame((s) => s.closePanel)
  const close = onClose || closePanel
  // Long titles shrink to stay clear of the close button.
  const titleSize = Math.min(92, (width - 190) / (title.length * 0.62))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div
      className="pp-font pointer-events-auto absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.18)' }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      {/* Room for the close button at the right, and to scroll on short screens. */}
      <div className="pp-panel-in relative flex flex-col items-center" style={{ width: `min(${u(width)}, calc(100vw - ${u(60)} - 16px))` }}>
        <div
          className="relative w-full"
          style={{
            marginTop: u(56),
            padding: `${u(52)} ${u(22)} ${u(22)}`,
            borderRadius: u(10),
            // As solid as the player's Boxity background_transparency setting (integration.js).
            background: 'linear-gradient(180deg, rgb(30 33 38 / var(--panel-alpha, 0.94)), rgb(18 20 24 / var(--panel-alpha, 0.94)))',
            border: `${u(6)} solid #0b0c0e`,
            boxShadow: `inset 0 0 0 ${u(3)} rgba(255,255,255,0.08), 0 ${u(10)} ${u(30)} rgba(0,0,0,0.35)`,
            maxHeight: `calc(100vh - ${u(56)} - 24px)`,
            overflowY: 'auto',
          }}
        >
          {children}
        </div>
        <div className="absolute flex items-center leading-none" style={{ left: u(icon ? 10 : 60), top: u(8 + (92 - titleSize) * 0.6), fontSize: u(titleSize), gap: u(8) }}>
          {icon && <Icon name={icon} size={u(titleSize * 1.4)} style={{ marginTop: u(-titleSize * 0.3) }} />}
          <StrokeText stroke={u(titleSize * 0.17)}>{title}</StrokeText>
        </div>
        <CloseButton onClick={close} style={{ right: u(-24), top: u(20) }} />
        {footer}
      </div>
    </div>
  )
}

export default Panel
