import { useCallback, useEffect, useState } from 'react'

import GameController from './GameController'
import { useGame } from './store/game'
import GameScene from './game/GameScene'
import HatchOverlay from './ui/HatchOverlay'
import HUD from './ui/hud/HUD'
import LoadingScreen from './ui/LoadingScreen'
import NameplateLayer from './ui/NameplateLayer'
import { prefetchPanels } from './ui/panels/panelLoaders'
import Panels from './ui/panels/Panels'
import PopupLayer from './ui/PopupLayer'
import ReplacedOverlay from './ui/ReplacedOverlay'
import ScreenFade from './ui/ScreenFade'
import TouchControls from './ui/TouchControls'

function App() {
  const [ready, setReady] = useState(false)
  const handleReady = useCallback(() => {
    setReady(true)
    useGame.getState().setPlayable()
  }, [])

  // The HUD is mounted once the 3D scene is up rather than underneath the loading
  // screen, where its first style/layout/paint (dozens of outlined labels and SVG
  // icons) would delay the scene's own start-up for a screen nobody can see yet.
  useEffect(() => {
    if (!ready) return
    requestAnimationFrame(() => performance.mark('pp:hud-shown'))
    prefetchPanels()
  }, [ready])

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      <GameController />
      <GameScene onReady={handleReady} />
      <TouchControls />
      {ready && (
        <>
          <NameplateLayer />
          <PopupLayer />
          <HUD />
          <Panels />
          <HatchOverlay />
        </>
      )}
      <ScreenFade />
      <ReplacedOverlay />
      <LoadingScreen done={ready} />
    </div>
  )
}

export default App
