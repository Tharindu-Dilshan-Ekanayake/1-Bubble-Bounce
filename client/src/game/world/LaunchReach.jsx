import { useEffect, useMemo } from 'react'
import { BoxGeometry, MeshBasicMaterial } from 'three'

import { levelCap } from '@shared/balance'
import { LAUNCH_STAND, maxPullFor } from '@shared/world'

import { useGame } from '../../store/game'

/**
 * YOUR REACH: a glowing gold bar across the stretch lane where your arms run out - as far
 * back as you can walk holding the launch posts with the arms you've got at your level.
 * Better arms and levels move it further down the lane, all the way to its 50 m end; so
 * you can see the next upgrade's worth before you buy it. One small mesh, one draw call,
 * moved only when your arms or level change (nothing per frame).
 */
const BAR = new BoxGeometry(4.6, 0.16, 0.42)

export function LaunchReach() {
  const tire = useGame((s) => s.profile.equippedTire)
  const level = useGame((s) => s.profile.level)
  const rebirths = useGame((s) => s.profile.rebirths)
  const material = useMemo(() => new MeshBasicMaterial({ color: '#ffd21f', toneMapped: false }), [])
  useEffect(() => () => material.dispose(), [material])
  const z = LAUNCH_STAND.z + maxPullFor(tire, level, levelCap(rebirths || 0))
  return <mesh geometry={BAR} material={material} position={[LAUNCH_STAND.x, 0.2, z]} />
}

export default LaunchReach
