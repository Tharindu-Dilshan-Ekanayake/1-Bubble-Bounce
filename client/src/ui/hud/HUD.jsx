import { useCallback } from 'react'

import { setSpeedTunnelElement } from '../../game/roll/hudLink'
import { useGame } from '../../store/game'
import EggPanel from './EggPanel'
import InteractPrompt from './InteractPrompt'
import LeftMenu from './LeftMenu'
import HealthBar from './HealthBar'
import PassButtons from './PassButtons'
import HitFlash from './HitFlash'
import RollButton from './RollButton'
import RollOverlay from './RollOverlay'
import StatsPanel from './StatsPanel'
import TopBar from './TopBar'
import TopCenter from './TopCenter'

/**
 * The heads-up display, laid out like the reference: Rebirths and Wins top-left over
 * the menu tiles, the passes on the right, your Health, level bar and Health packs
 * bottom-centre, the tutorial top-centre, and sound, daily rewards, leaderboards and
 * your name tag top-right.
 *
 * The root ignores pointer events so the canvas and joystick underneath keep working;
 * only the buttons themselves opt back in. While a panel is open the HUD steps aside,
 * as in the reference.
 */
/**
 * The speed tunnel: white streaks rushing outwards and a soft haze round the screen's
 * edges, the middle left clear - the sides blur past as the ball flies. A plain DOM
 * layer under the rest of the HUD (no post-processing, so it's on every preset); the
 * roll writes its strength straight to it (hudLink.writeSpeed), never through React.
 */
function SpeedTunnel() {
  const ref = useCallback((el) => setSpeedTunnelElement(el), [])
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: 0, visibility: 'hidden' }}>
      <div className="pp-tunnel absolute" />
      <div className="pp-tunnel-haze absolute inset-0" />
    </div>
  )
}

export function HUD() {
  const panelOpen = useGame((s) => s.panel !== null)
  // While your ball flies the side menus clear out, as in the reference.
  const rolling = useGame((s) => Boolean(s.roll || s.rollResult))
  return (
    <div className="pp-font pointer-events-none absolute inset-0 z-20 select-none">
      <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: panelOpen ? 0 : 1, visibility: panelOpen ? 'hidden' : 'visible' }}>
        <SpeedTunnel />
        <TopBar />
        <StatsPanel />
        {/* Hidden, not unmounted, while rolling: remounting them at the moment of the
            push-off cost a visible hitch on slow phones. display: none (not visibility)
            takes them out of style and layout altogether, so the counters changing every
            frame of a flight don't re-lay them out each time. */}
        <div style={{ display: rolling ? 'none' : 'contents' }}>
          <LeftMenu />
          <PassButtons />
          <TopCenter />
        </div>
        <HealthBar />
        <RollButton />
        <InteractPrompt />
        <EggPanel />
        <RollOverlay />
        <HitFlash />
      </div>
    </div>
  )
}

export default HUD
