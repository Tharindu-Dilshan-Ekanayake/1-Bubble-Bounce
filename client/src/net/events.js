import { TIRES, TUTORIAL, WORLDS } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { sfx } from '../audio/sfx'
import { burst, queueTrainFx } from '../game/fx/fxQueue'
import { runtime } from '../game/runtime'
import { beginRoll, roll } from '../game/roll/rollControl'
import { getGame } from '../store/game'
import { fadeThrough } from '../ui/fade'
import { refreshRemoteWorlds } from './remotePlayers'

/** A point above wherever you're watching: you in the lobby, or your rolling tire. */
const atPlayer = (dy = 1.2) => {
  const p = roll.active ? roll.position : runtime.player.position
  return { x: p.x, y: p.y + dy, z: p.z }
}

/**
 * Applies one authority event to the client: updates the store and kicks off any
 * visual effect. The same handler serves the Colyseus connection and offline mode.
 */
export function handleServerEvent(type, payload) {
  const game = getGame()
  switch (type) {
    case 'profile': {
      const before = game.profile
      game.setProfile(payload.profile, payload.session)
      if ((payload.profile.world || 0) !== (before.world || 0)) refreshRemoteWorlds()
      // Celebrate the big moments, whatever caused them.
      if (game.profileLoaded && payload.profile.rebirths > before.rebirths) {
        sfx.rebirth()
        burst({ ...atPlayer(), count: 60, speed: 9 })
      } else if (game.profileLoaded && payload.profile.ownedTires.length > before.ownedTires.length) {
        // A new ball: a shower of confetti and its name up in lights.
        sfx.buy()
        sfx.wins()
        burst({ ...atPlayer(2.5), count: 60, palette: 'confetti', speed: 9 })
        const tire = TIRES.find((t) => t.id === payload.profile.equippedTire)
        // The first ball bought ends the tutorial: say so too.
        const done = before.tutorialStep < TUTORIAL.length && payload.profile.tutorialStep >= TUTORIAL.length
        if (tire) game.showToast(`NEW ARMS: ${tire.name}!${done ? ' Tutorial complete - have fun!' : ''}`)
      }
      break
    }

    case 'train':
      game.patchProfile({
        health: payload.health,
        level: payload.level,
        // Gains from rolling and walking aren't pad training.
        ...(payload.source === 'pad' ? { lastPad: payload.pad } : {}),
      })
      queueTrainFx(payload)
      if (payload.leveledUp) {
        sfx.levelUp()
        burst({ ...atPlayer(1.8), count: 24, palette: 'power', speed: 6 })
      }
      break

    case 'roll': {
      // (How well you let go shows as you shoot past the posts: rollControl.)
      beginRoll(payload)
      break
    }

    case 'quest':
      // One of today's quests finished: a chime and a nudge to claim it.
      sfx.levelUp()
      game.showToast(`QUEST COMPLETE: ${payload.text}! Claim it in Quests`)
      break

    case 'streak':
      // Played past midnight: the streak's next day starts now.
      sfx.wins()
      game.showToast(`DAY ${payload.days} STREAK! x${payload.multiplier.toFixed(1)} Wins on every launch`)
      break

    case 'pack':
      sfx.buy()
      burst({ ...atPlayer(2), count: 30, palette: 'power', speed: 7 })
      break

    case 'hatch':
      game.setHatch({ eggId: payload.eggId, pets: payload.pets, id: Date.now() })
      if (payload.eggId) {
        setTimeout(sfx.crack, 1100)
        setTimeout(sfx.reveal, 1250)
      } else {
        sfx.reveal()
      }
      break

    case 'offline':
      game.openPanel('offline', payload)
      break

    case 'badge':
      // (After the moment it was earned in - usually a launch - so that frame stays light.)
      setTimeout(() => sfx.wins(), 1200)
      break

    case 'star': {
      // Palm Beach's Secret Star, found: a shower of gold and the news.
      sfx.wins()
      sfx.levelUp()
      burst({ ...atPlayer(2), count: 70, palette: 'gold', speed: 10 })
      game.showToast('SECRET STAR FOUND! x2 POWER FOREVER!')
      break
    }

    case 'world': {
      // Through the portal: a flash of white while the new world's sky and track go
      // in (GameScene follows profile.world), and a fanfare.
      fadeThrough(() => {})
      sfx.rebirth()
      burst({ ...atPlayer(2), count: 60, palette: 'confetti', speed: 9 })
      const world = WORLDS[payload.world]
      game.showToast(
        payload.world === 1
          ? `WELCOME TO ${world.name.toUpperCase()}! x${world.wins} Wins on every launch!${payload.first ? ' A Secret Star is hidden here...' : ''}`
          : `Back in ${world.name}!`,
      )
      break
    }

    case 'reward':
      // A rewarded ad or a Gems purchase landed.
      sfx.buy()
      burst({ ...atPlayer(2), count: 40, palette: 'gold', speed: 8 })
      game.showToast(`${payload.label}${payload.wins ? ` +${formatNumber(payload.wins)} Wins` : ''}!`)
      break

    default:
      break
  }
}
