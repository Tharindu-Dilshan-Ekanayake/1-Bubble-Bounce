import { useEffect } from 'react'

import { EGGS, PETS, RARITIES } from '@shared/balance'

import { actions } from '../net/actions'
import { getGame, useGame } from '../store/game'
import Icon from './Icon'
import PetIcon from './PetIcon'
import StrokeText from './StrokeText'
import { u } from './hud/style'

/** Egg shake, crack, reveal: total time before the overlay closes itself. */
const SHOW_MS = 3400

function Reveal({ pet, eggId, index }) {
  const info = PETS[pet.id]
  const rarity = RARITIES[info.rarity]
  const delay = index * 0.12
  return (
    <div className="relative flex flex-col items-center" style={{ width: u(330) }}>
      <div className="relative flex items-center justify-center" style={{ width: u(300), height: u(300) }}>
        <div
          className="pp-rays absolute inset-0 rounded-full"
          style={{
            background: `repeating-conic-gradient(${rarity.color}aa 0deg 12deg, transparent 12deg 30deg)`,
            animationDelay: `${1.25 + delay}s`,
          }}
        />
        {eggId && (
          <div className="pp-egg absolute" style={{ animationDelay: `${delay}s` }}>
            <Icon name={`egg:${eggId}`} size={u(230)} />
          </div>
        )}
        <div className="pp-flash absolute rounded-full bg-white" style={{ width: u(260), height: u(260), animationDelay: `${1.15 + delay}s` }} />
        <div className="pp-pet relative" style={{ animationDelay: `${(eggId ? 1.25 : 0.1) + delay}s` }}>
          <PetIcon id={pet.id} size={u(250)} />
        </div>
      </div>
      <div className="pp-pet flex flex-col items-center" style={{ animationDelay: `${(eggId ? 1.35 : 0.2) + delay}s` }}>
        <span style={{ fontSize: u(54) }}>
          <StrokeText stroke={u(10)}>{info.name}</StrokeText>
        </span>
        <span style={{ fontSize: u(38) }}>
          <StrokeText stroke={u(8)} fill={rarity.color}>
            {rarity.name} · x{info.mult}
          </StrokeText>
        </span>
      </div>
    </div>
  )
}

/**
 * The hatch reveal: eggs wobble harder and harder, crack in a flash, and the pets pop
 * out over rays in their rarity colour. Click to skip. With Auto on, the next egg is
 * ordered when this one closes.
 */
export function HatchOverlay() {
  const hatch = useGame((s) => s.hatch)
  const setHatch = useGame((s) => s.setHatch)

  useEffect(() => {
    if (!hatch) return undefined
    const id = setTimeout(() => setHatch(null), SHOW_MS)
    return () => clearTimeout(id)
  }, [hatch, setHatch])

  // Auto hatch: order an egg when switched on, and again each time a reveal closes,
  // for as long as the Wins last.
  const autoHatch = useGame((s) => s.autoHatch)
  useEffect(() => {
    if (hatch || !autoHatch) return
    const { zone, profile, setAutoHatch } = getGame()
    const egg = EGGS[zone.egg]
    if (!egg?.cost.wins) return
    if (profile.wins < egg.cost.wins) {
      setAutoHatch(false)
      return
    }
    actions.hatch(zone.egg, 1)
  }, [hatch, autoHatch])

  if (!hatch) return null
  return (
    <div
      className="pp-font pointer-events-auto absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.25), rgba(0,0,0,0.6))' }}
      onPointerDown={() => setHatch(null)}
    >
      <div className="flex flex-wrap items-center justify-center" style={{ gap: u(20) }}>
        {hatch.pets.map((pet, i) => (
          <Reveal key={pet.uid} pet={pet} eggId={hatch.eggId} index={i} />
        ))}
      </div>
    </div>
  )
}

export default HatchOverlay
