import { useEffect } from 'react'

import { EGGS, MULTI_HATCH } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import PetIcon from '../PetIcon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

function KeyButton({ letter, label, gradient, onClick, active, disabled }) {
  return (
    <ChunkyButton
      gradient={gradient}
      onClick={onClick}
      disabled={disabled}
      radius={18}
      border={5}
      className="flex-col"
      style={{ width: u(128), height: u(104), lineHeight: 1, outline: active ? `${u(5)} solid #fff` : 'none' }}
    >
      <span style={{ fontSize: u(60) }}>
        <StrokeText stroke={u(11)}>{letter}</StrokeText>
      </span>
      <span style={{ fontSize: u(28) }}>
        <StrokeText stroke={u(6)}>{label}</StrokeText>
      </span>
    </ChunkyButton>
  )
}

/**
 * The hatch panel that pops up beside an egg stand: the egg's pets with their odds and
 * the Hatch / Multi / Auto buttons (E / R / T), as in the reference.
 */
export function EggPanel() {
  const eggId = useGame((s) => s.zone.egg)
  const hidden = useGame((s) => Boolean(s.panel || s.roll || s.rollResult || s.hatch))
  const wins = useGame((s) => s.profile.wins)
  const autoHatch = useGame((s) => s.autoHatch)
  const setAutoHatch = useGame((s) => s.setAutoHatch)
  const egg = EGGS[eggId]

  // Walking away stops auto-hatching.
  useEffect(() => {
    if (!eggId && autoHatch) setAutoHatch(false)
  }, [eggId, autoHatch, setAutoHatch])

  useEffect(() => {
    if (!egg || hidden) return undefined
    const onKey = (e) => {
      if (e.repeat) return
      if (e.code === 'KeyE') actions.hatch(eggId, 1)
      else if (e.code === 'KeyR') actions.hatch(eggId, MULTI_HATCH)
      else if (e.code === 'KeyT') setAutoHatch(!autoHatch)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [egg, eggId, hidden, autoHatch, setAutoHatch])

  if (!egg || hidden) return null
  const cost = egg.cost.wins

  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: '23%' }}>
      <div
        style={{
          width: u(440),
          padding: u(14),
          borderRadius: u(22),
          background: 'rgba(22, 26, 32, 0.82)',
          border: `${u(5)} solid #0b0c0e`,
        }}
      >
        <div className="flex items-center justify-between" style={{ fontSize: u(48), padding: `0 ${u(6)}` }}>
          <StrokeText stroke={u(9)}>{`${egg.name} Egg`}</StrokeText>
          <span className="flex items-center" style={{ gap: u(4) }}>
            <Icon name="trophy" size={u(48)} />
            <StrokeText stroke={u(9)} gradient={wins >= cost ? GRADIENTS.gold : 'linear-gradient(180deg,#ffb0a8,#ff4a3b)'}>
              {formatNumber(cost)}
            </StrokeText>
          </span>
        </div>
        <div className="grid grid-cols-2" style={{ gap: u(6), marginTop: u(6) }}>
          {egg.pets.map(([petId, chance]) => (
            <div key={petId} className="relative flex items-center justify-center" style={{ height: u(150) }}>
              <PetIcon id={petId} size={u(150)} />
              <span className="absolute" style={{ right: u(22), bottom: u(6), fontSize: u(40) }}>
                <StrokeText stroke={u(8)}>{chance}%</StrokeText>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex" style={{ gap: u(14), marginTop: u(-14) }}>
        <KeyButton letter="E" label="Hatch" gradient={GRADIENTS.greenButton} onClick={() => actions.hatch(eggId, 1)} />
        <KeyButton letter="R" label="Multi" gradient={GRADIENTS.goldButton} onClick={() => actions.hatch(eggId, MULTI_HATCH)} />
        <KeyButton letter="T" label="Auto" gradient={GRADIENTS.purpleButton} active={autoHatch} onClick={() => setAutoHatch(!autoHatch)} />
      </div>
    </div>
  )
}

export default EggPanel
