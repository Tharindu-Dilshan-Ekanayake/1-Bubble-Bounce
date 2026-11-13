import { useMemo, useState } from 'react'

import { MAX_EQUIPPED_PETS, MAX_PET_INVENTORY, PETS, RARITIES } from '@shared/balance'
import { formatMultiplier } from '@shared/format'
import { petMultiplier, petSortKey } from '@shared/logic'

import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import PetIcon from '../PetIcon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

function PetCard({ pet, equipped, selected, onClick }) {
  const info = PETS[pet.id]
  const rarity = RARITIES[info.rarity]
  return (
    <button
      type="button"
      onClick={onClick}
      className="pp-btn relative flex flex-col items-center justify-center"
      style={{
        height: u(150),
        borderRadius: u(12),
        border: `${u(5)} solid ${selected ? '#ffffff' : '#111'}`,
        background: `radial-gradient(circle at 50% 40%, ${rarity.color}cc, ${rarity.color}55 60%, rgba(20,22,26,0.9))`,
        boxShadow: selected ? `0 0 0 ${u(3)} #111` : 'none',
      }}
    >
      <PetIcon id={pet.id} size={u(112)} />
      <span className="absolute" style={{ bottom: u(2), fontSize: u(28) }}>
        <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
          {formatMultiplier(info.mult)}
        </StrokeText>
      </span>
      {equipped && <Icon name="check" size={u(40)} className="absolute" style={{ top: u(4), right: u(4) }} />}
    </button>
  )
}

/** Pet inventory: equip up to three, equip-best, delete. */
export function PetsPanel() {
  const profile = useGame((s) => s.profile)
  const [selectedUid, setSelectedUid] = useState(null)

  const sorted = useMemo(
    () => [...profile.pets].sort((a, b) => petSortKey(profile, b) - petSortKey(profile, a)),
    [profile],
  )
  const selected = profile.pets.find((p) => p.uid === selectedUid) || null
  const selectedInfo = selected ? PETS[selected.id] : null
  const isEquipped = selected ? profile.equippedPets.includes(selected.uid) : false

  return (
    <Panel title="PETS" width={980}>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: u(12), marginBottom: u(14) }}>
        <span style={{ fontSize: u(36) }}>
          <StrokeText stroke={u(7)}>
            Equipped {profile.equippedPets.length}/{MAX_EQUIPPED_PETS}
          </StrokeText>
        </span>
        <span style={{ fontSize: u(36) }}>
          <StrokeText stroke={u(7)} gradient={GRADIENTS.gold}>
            Pet Power {formatMultiplier(petMultiplier(profile))}
          </StrokeText>
        </span>
        <span style={{ fontSize: u(30) }}>
          <StrokeText stroke={u(6)}>
            {profile.pets.length}/{MAX_PET_INVENTORY}
          </StrokeText>
        </span>
        <ChunkyButton gradient={GRADIENTS.greenButton} onClick={() => actions.equipBestPets()} style={{ height: u(64), padding: `0 ${u(20)}` }}>
          <span style={{ fontSize: u(32) }}>
            <StrokeText stroke={u(7)}>Equip Best</StrokeText>
          </span>
        </ChunkyButton>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center" style={{ padding: u(40), gap: u(12) }}>
          <Icon name="egg:basic" size={u(120)} />
          <span style={{ fontSize: u(36) }}>
            <StrokeText stroke={u(7)}>No pets yet - hatch an egg!</StrokeText>
          </span>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${u(140)}, 1fr))`, gap: u(10), maxHeight: '44vh', overflowY: 'auto', padding: u(4) }}>
          {sorted.map((pet) => (
            <PetCard
              key={pet.uid}
              pet={pet}
              equipped={profile.equippedPets.includes(pet.uid)}
              selected={pet.uid === selectedUid}
              onClick={() => setSelectedUid(pet.uid === selectedUid ? null : pet.uid)}
            />
          ))}
        </div>
      )}

      {selected && (
        <div className="flex flex-wrap items-center" style={{ gap: u(14), marginTop: u(16), padding: u(12), borderRadius: u(12), background: 'rgba(255,255,255,0.06)' }}>
          <PetIcon id={selected.id} size={u(110)} />
          <div className="flex flex-1 flex-col" style={{ minWidth: u(220) }}>
            <span style={{ fontSize: u(44) }}>
              <StrokeText stroke={u(8)}>{selectedInfo.name}</StrokeText>
            </span>
            <span style={{ fontSize: u(30) }}>
              <StrokeText stroke={u(6)} fill={RARITIES[selectedInfo.rarity].color}>
                {RARITIES[selectedInfo.rarity].name} · {formatMultiplier(selectedInfo.mult)} Power
              </StrokeText>
            </span>
          </div>
          <ChunkyButton
            gradient={isEquipped ? GRADIENTS.greyButton : GRADIENTS.greenButton}
            onClick={() => (isEquipped ? actions.unequipPet(selected.uid) : actions.equipPet(selected.uid))}
            style={{ height: u(76), padding: `0 ${u(24)}` }}
          >
            <span style={{ fontSize: u(36) }}>
              <StrokeText stroke={u(7)}>{isEquipped ? 'Unequip' : 'Equip'}</StrokeText>
            </span>
          </ChunkyButton>
          <ChunkyButton
            gradient={GRADIENTS.redButton}
            onClick={() => {
              actions.deletePet(selected.uid)
              setSelectedUid(null)
            }}
            style={{ height: u(76), padding: `0 ${u(24)}` }}
          >
            <span style={{ fontSize: u(36) }}>
              <StrokeText stroke={u(7)}>Delete</StrokeText>
            </span>
          </ChunkyButton>
        </div>
      )}
    </Panel>
  )
}

export default PetsPanel
