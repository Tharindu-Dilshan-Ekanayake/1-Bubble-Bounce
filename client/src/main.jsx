import '@fontsource/fredoka-one/latin-400.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.jsx'
import { installAudioUnlock, sfx } from './audio/sfx'
import BloxityProvider from './bloxity/BloxityProvider.jsx'
import FpsMeter from './bloxity/FpsMeter.jsx'
import { GAME_SLUG } from './bloxity/identity'
import { installDebugHooks } from './debug'
import './index.css'

// Start-up milestones (pp:*) show up in DevTools' Performance panel and are read by
// the automated load test.
performance.mark('pp:main')
installDebugHooks()
installAudioUnlock()
// Every chunky button clicks.
window.addEventListener('pointerdown', (e) => {
  if (e.target instanceof Element && e.target.closest('.pp-btn')) sfx.click()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Slug comes from VITE_GAME_SLUG in client/.env — see .env.example. */}
    <BloxityProvider gameSlug={GAME_SLUG}>
      <App />
      {/* Boxity's show_fps setting. */}
      <FpsMeter />
    </BloxityProvider>
  </StrictMode>,
)
