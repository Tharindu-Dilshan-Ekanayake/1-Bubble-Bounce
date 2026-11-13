import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

import { formatGain } from '@shared/format'

import { sfx } from '../../audio/sfx'
import { iconUrl } from '../../ui/icons'
import { runtime } from '../runtime'
import { roll } from '../roll/rollControl'
import { drainTrainFx } from './fxQueue'
import { spawnPopup, spawnScattered, updatePopups } from './popups'

const _at = new Vector3()
const HEART_ICON = iconUrl('heart')
const LEVEL_GRADIENT = 'linear-gradient(180deg, #e0faff 0%, #7fe2ff 45%, #2fa8ff 100%)'
const ROLLING_GAIN = { iconUrl: HEART_ICON }

/** One gain's popup by wherever you're watching: on a pad, walking, or your rolling tire. */
function showGain(event) {
  const rolling = roll.active
  const at = rolling ? roll.position : runtime.player.position
  const follow = rolling ? roll.position : null
  if (rolling) {
    // Rolling: scattered over the screen with the trophies.
    spawnScattered(`+${formatGain(event.gain)}`, ROLLING_GAIN)
  } else {
    _at.set(at.x + (Math.random() - 0.5) * 3, at.y + 0.8 + Math.random() * 1.2, at.z + (Math.random() - 0.5) * 1.5)
    spawnPopup(`+${formatGain(event.gain)}`, _at, { iconUrl: HEART_ICON })
  }
  sfx.gain(event.source !== 'pad')
  if (event.leveledUp) {
    _at.set(at.x, at.y + 2.8, at.z)
    const text = event.maxed ? 'MAX LEVEL!' : event.levels > 1 ? `LEVEL UP! x${event.levels}` : 'LEVEL UP!'
    spawnPopup(text, _at, { gradient: LEVEL_GRADIENT, scale: 1.5, life: 1600, follow })
  }
}

/**
 * Health-gain feedback: a "+3" heart popup by your character for every gain - a pad
 * step, walking, or the ticks while your tire rolls - and LEVEL UP! when one lands.
 * Also moves every live popup each frame.
 */
export function GainFX() {
  const size = useThree((s) => s.size)

  useFrame((state) => {
    drainTrainFx(showGain)
    updatePopups(state.camera, size.width, size.height)
  })

  return null
}

export default GainFX
