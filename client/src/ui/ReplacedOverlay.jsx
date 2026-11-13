import { playHere } from '../net/connection'
import { useGame } from '../store/game'
import StrokeText from './StrokeText'
import { ChunkyButton } from './hud/parts'
import { GRADIENTS, u } from './hud/style'

/**
 * Shown when this window was replaced: the same account (every tab of one browser is
 * the same guest) joined the lobby from another window, which now has the game. One
 * account can only be in the lobby once, so its save can't be played from two places.
 */
export function ReplacedOverlay() {
  const replaced = useGame((s) => s.net.mode === 'replaced')
  if (!replaced) return null
  return (
    <div className="pp-font absolute inset-0 z-50 flex items-center justify-center bg-black/55">
      <div
        className="flex flex-col items-center text-center"
        style={{
          gap: u(22),
          padding: `${u(34)} ${u(44)}`,
          borderRadius: u(28),
          border: `${u(5)} solid #111`,
          background: 'linear-gradient(180deg, rgba(58, 68, 98, 0.97), rgba(26, 30, 46, 0.97))',
          boxShadow: `0 ${u(8)} 0 #111`,
        }}
      >
        <span style={{ fontSize: u(54) }}>
          <StrokeText stroke={u(10)} gradient={GRADIENTS.gold}>
            Playing in another window
          </StrokeText>
        </span>
        <span style={{ fontSize: u(28), maxWidth: u(720) }}>
          <StrokeText stroke={u(6)}>You joined the lobby from another tab or window, so the game moved there.</StrokeText>
        </span>
        <ChunkyButton gradient={GRADIENTS.greenButton} onClick={playHere} radius={20} border={5} style={{ height: u(96), padding: `0 ${u(46)}` }}>
          <span style={{ fontSize: u(46) }}>
            <StrokeText stroke={u(9)}>Play here</StrokeText>
          </span>
        </ChunkyButton>
      </div>
    </div>
  )
}

export default ReplacedOverlay
