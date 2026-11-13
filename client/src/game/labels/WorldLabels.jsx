import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { Group } from 'three'

import { getGame, useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { LabelBatch } from './LabelBatch'
import { lobbyLabels } from './lobbyLabels'
import { getActiveLabelBatch, setActiveLabelBatch } from './registry'

/**
 * All floating lobby text, batched (see LabelBatch). Builds asynchronously once the
 * font is ready; the world is playable before it appears.
 */
export function WorldLabels() {
  const maxDistance = useQuality((s) => s.settings.labelDistance)
  const playable = useGame((s) => s.playable)
  // The portal's sign says where it goes, so the signs are rebuilt in a new world.
  const world = useGame((s) => s.profile.world)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const [batch, setBatch] = useState(null)

  // Signs aren't needed to start playing; draw them once the game is on screen.
  useEffect(() => {
    if (!playable) return undefined
    const next = new LabelBatch({ pageSize: useQuality.getState().settings.maxTexture })
    const { profile, sphinxStock } = getGame()
    for (const label of lobbyLabels(profile, { sphinxStock })) next.add(label.id, label.position, label.spec, label)
    let cancelled = false
    // After the HUD's first paint: wait for an idle moment (or at most 1.5 s).
    const idle = new Promise((resolve) =>
      'requestIdleCallback' in window ? requestIdleCallback(resolve, { timeout: 1500 }) : setTimeout(resolve, 300),
    )
    idle
      .then(() => {
        if (cancelled) return null
        performance.mark('pp:labels-start')
        return next.build()
      })
      // Compile the label shader before the signs appear, so showing them can't stall
      // a frame. (A batch thrown away mid-build - the view rebuilt for a new graphics
      // level - comes back empty: nothing to compile.)
      .then((meshes) => (!cancelled && meshes?.length && !import.meta.env.DEV ? gl.compileAsync(new Group().add(...meshes), camera, scene).catch(() => null) : null))
      .then(() => {
        performance.mark('pp:labels-end')
        if (cancelled) return
        setActiveLabelBatch(next)
        setBatch(next)
      })
    return () => {
      cancelled = true
      if (getActiveLabelBatch() === next) setActiveLabelBatch(null)
      next.dispose()
    }
  }, [playable, world, gl, camera, scene])

  useEffect(() => {
    batch?.setMaxDistance(maxDistance)
  }, [batch, maxDistance])

  if (!batch) return null
  return batch.meshes.map((mesh) => <primitive key={mesh.uuid} object={mesh} />)
}

export default WorldLabels
