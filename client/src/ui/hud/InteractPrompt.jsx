import { useEffect } from 'react'

import { PADS, SHOP, TIRES, WORLD_PORTALS, WORLDS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isPadUnlocked } from '@shared/logic'

import { standState } from '../../game/labels/lobbyLabels'
import { actions } from '../../net/actions'
import { buy } from '../../net/shop'
import { useGame } from '../../store/game'
import { u } from './style'

/**
 * What standing on the current spot lets you do, if anything: { title, action, run }.
 * One prompt at a time.
 */
function usePrompt() {
  const stand = useGame((s) => s.zone.stand)
  const owned = useGame((s) => s.profile.ownedTires)
  const equipped = useGame((s) => s.profile.equippedTire)
  const atFreeReward = useGame((s) => s.zone.freeReward)
  const freeTaken = useGame((s) => s.session.freeRewardTaken)
  const padNear = useGame((s) => s.zone.padNear)
  const padLocked = useGame((s) => s.zone.padNear >= 0 && !isPadUnlocked(s.profile, s.zone.padNear))
  const atSphinx = useGame((s) => s.zone.sphinx)
  const atPortal = useGame((s) => s.zone.portal)
  const wins = useGame((s) => s.profile.wins)
  const rebirths = useGame((s) => s.profile.rebirths)
  const inWorld = useGame((s) => s.profile.world)
  const unlocked = useGame((s) => s.profile.world2Unlocked)

  // Walking into the portal takes you through (ticker.js); this says where to.
  if (atPortal) {
    const world = WORLD_PORTALS[atPortal]
    if (inWorld === 1) return { title: WORLDS[0].name, action: 'Step out and back in to go home', run: null }
    if (unlocked || (rebirths >= world.rebirths && wins >= world.wins)) {
      return { title: world.name, action: `x${WORLDS[1].wins} Wins on every launch!`, run: null }
    }
    if (rebirths < world.rebirths) return { title: world.name, action: `Needs ${world.rebirths} Rebirths (you have ${rebirths})`, run: null }
    return { title: world.name, action: `Needs ${formatNumber(world.wins)} Wins (you have ${formatNumber(wins)})`, run: null }
  }

  if (atSphinx) {
    return { title: 'Sphinx - Limited!', action: `Buy - ${formatNumber(SHOP.sphinx.price)} Wins`, run: () => buy('sphinx') }
  }

  if (padLocked) {
    const pad = PADS[padNear]
    const title = `${pad.name} - ${formatNumber(pad.mult)}x Power`
    if (pad.product) {
      return { title, action: `Unlock - ${formatNumber(SHOP[pad.product].price)} Wins`, run: () => buy(pad.product) }
    }
    if (pad.world !== undefined && (inWorld || 0) !== pad.world) {
      return { title, action: `Works in ${WORLDS[pad.world].name} only - go through the portal!`, run: null }
    }
    const word = pad.rebirths === 1 ? 'Rebirth' : 'Rebirths'
    return { title, action: `Locked: needs ${pad.rebirths} ${word}`, run: null }
  }

  if (atFreeReward) {
    return freeTaken
      ? { title: 'Free Reward', action: 'Come back next time!', run: null }
      : { title: 'Free Reward', action: 'Claim', run: () => actions.claimFreeReward() }
  }

  if (stand >= 0) {
    const tire = TIRES[stand]
    const title = `${tire.name} - +${formatNumber(tire.power)} Power`
    const state = standState({ ownedTires: owned, equippedTire: equipped }, stand)
    if (state === 'equipped') return { title, action: 'Equipped', run: null }
    if (state === 'owned') return { title, action: 'Equip', run: () => actions.equipTire(tire.id) }
    if (state === 'locked') return { title, action: `Buy the ${TIRES[stand - 1].name} first`, run: null }
    return { title, action: `Buy - ${formatNumber(tire.cost)} Wins`, run: () => actions.buyTire(tire.id) }
  }
  return null
}

/**
 * Proximity prompt, styled like the platform's own: a dark box with the key to press.
 * E on keyboard; tap the box on touch screens.
 */
export function InteractPrompt() {
  const prompt = usePrompt()
  const busy = useGame((s) => Boolean(s.roll || s.rollResult || s.panel))
  const run = !busy ? prompt?.run : null

  useEffect(() => {
    if (!run) return undefined
    const onKey = (e) => {
      if (e.code === 'KeyE' && !e.repeat) run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  if (!prompt || busy) return null
  return (
    <button
      type="button"
      onClick={() => prompt.run?.()}
      className="pp-btn pointer-events-auto absolute flex items-center text-left text-white"
      style={{
        left: '53%',
        top: '50%',
        gap: u(14),
        padding: `${u(12)} ${u(20)} ${u(12)} ${u(12)}`,
        borderRadius: u(10),
        background: 'rgba(24, 26, 30, 0.78)',
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 600,
      }}
    >
      {prompt.run && (
        <span
          className="flex items-center justify-center rounded-full"
          style={{ width: u(54), height: u(54), border: `${u(3)} solid #fff`, fontSize: u(26) }}
        >
          E
        </span>
      )}
      <span className="flex flex-col leading-tight">
        <span style={{ fontSize: u(20), opacity: 0.75 }}>{prompt.title}</span>
        <span style={{ fontSize: u(28) }}>{prompt.action}</span>
      </span>
    </button>
  )
}

export default InteractPrompt
