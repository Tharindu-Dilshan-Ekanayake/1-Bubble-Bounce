import { lazy, Suspense } from 'react'

import { useGame } from '../../store/game'
import { PANEL_LOADERS } from './panelLoaders'

const PANELS = Object.fromEntries(Object.entries(PANEL_LOADERS).map(([id, load]) => [id, lazy(load)]))

/** Mounts whichever modal panel is open. Only one at a time, like the reference. */
export function Panels() {
  const panel = useGame((s) => s.panel)
  const Component = PANELS[panel]
  if (!Component) return null
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  )
}

export default Panels
