import { useState } from 'react'

import { AD_REWARDS, GEM_PRODUCTS, PETS, SHOP } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { buyGems, isRewardedAvailable, useGemsBalance, watchRewardedAd } from '../../bloxity/services'
import { buy } from '../../net/shop'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import PetIcon from '../PetIcon'
import RewardIcon from '../RewardIcon'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const SECTIONS = [
  { title: 'Passes', items: ['healthX2', 'winsX2', 'autoRoll'] },
  { title: 'Training Pads', items: ['padVeryOp', 'padBest'] },
  { title: 'Specials', items: ['sphinx'] },
]

const ICONS = {
  healthX2: 'heart',
  winsX2: 'trophy',
  autoRoll: 'tire',
  padVeryOp: 'portal',
  padBest: 'portal',
}

const BLURBS = {
  healthX2: 'Double every Power gain, forever',
  winsX2: 'Double the Wins from every launch, forever',
  autoRoll: 'Stretches and launches you from the Launch Pad',
  padVeryOp: 'Unlocks the x40 Diamond Pad',
  padBest: 'Unlocks the x100 Galaxy Pad',
  sphinx: `Limited: x${formatNumber(PETS.sphinx.mult)} Power pet`,
}

const BLURB_STYLE = { color: '#3a2a10', fontFamily: 'system-ui, sans-serif', fontWeight: 700 }

/** A shop card: icon, name, what it does, and its button. */
function Card({ icon, name, blurb, faded, children }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ padding: u(10), borderRadius: u(8), border: `${u(5)} solid #111`, background: faded ? GRADIENTS.greyButton : GRADIENTS.rewardCard }}
    >
      {icon}
      <span style={{ fontSize: u(name.length > 12 ? 24 : 30), lineHeight: 1.1 }}>
        <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
          {name}
        </StrokeText>
      </span>
      <span className="whitespace-normal" style={{ fontSize: u(18), minHeight: u(44), margin: `${u(4)} 0` }}>
        <span style={BLURB_STYLE}>{blurb}</span>
      </span>
      {children}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: u(40), marginBottom: u(8) }}>
      <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
        {children}
      </StrokeText>
    </div>
  )
}

const GRID = { gridTemplateColumns: `repeat(auto-fill, minmax(${u(200)}, 1fr))`, gap: u(12) }

/**
 * Boxity Gems: real-currency extras, priced by Boxity's catalog (the game only names
 * the sku). The purchase is confirmed to the game server by Boxity, which then grants
 * it; offline it's granted here once Boxity says it went through.
 */
function GemsSection() {
  const balance = useGemsBalance()
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const purchase = async (sku) => {
    setBusy(sku)
    setMessage(null)
    const result = await buyGems(sku)
    setBusy(null)
    if (!result.success) setMessage(result.error ? `Purchase not completed: ${result.error}` : 'Purchase not completed')
  }
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between" style={{ gap: u(10) }}>
        <SectionTitle>Gems Shop</SectionTitle>
        {balance !== null && (
          <span style={{ fontSize: u(30) }}>
            <StrokeText stroke={u(6)} fill="#7fe2ff">
              {formatNumber(balance)} Gems
            </StrokeText>
          </span>
        )}
      </div>
      <div className="grid" style={GRID}>
        {Object.entries(GEM_PRODUCTS).map(([sku, product]) => (
          <Card key={sku} icon={<RewardIcon icon={product.icon} size={u(96)} />} name={product.name} blurb={product.blurb}>
            <ChunkyButton gradient={GRADIENTS.blueButton} disabled={busy !== null} onClick={() => purchase(sku)} className="w-full" style={{ height: u(58) }}>
              <span style={{ fontSize: u(30) }}>
                <StrokeText stroke={u(6)}>{busy === sku ? '...' : 'Buy with Gems'}</StrokeText>
              </span>
            </ChunkyButton>
          </Card>
        ))}
      </div>
      {message && (
        <p className="m-0 text-center" style={{ fontSize: u(24), marginTop: u(8) }}>
          <StrokeText stroke={u(5)} fill="#ffd27a">
            {message}
          </StrokeText>
        </p>
      )}
    </div>
  )
}

/** Free potions for watching an ad (Boxity rewarded ads), when Boxity has one to show. */
function FreeSection() {
  const [state, setState] = useState({})
  if (!isRewardedAvailable()) return null
  const watch = async (placement) => {
    setState((s) => ({ ...s, [placement]: 'watching' }))
    const result = await watchRewardedAd(placement)
    setState((s) => ({ ...s, [placement]: result.ok ? 'done' : 'retry' }))
  }
  return (
    <div>
      <SectionTitle>Free Rewards</SectionTitle>
      <div className="grid" style={GRID}>
        {Object.entries(AD_REWARDS).map(([placement, reward]) => {
          const status = state[placement]
          return (
            <Card key={placement} icon={<Icon name={reward.icon} size={u(96)} />} name={reward.label} blurb="Watch a short ad to get it">
              <ChunkyButton
                gradient={GRADIENTS.greenButton}
                disabled={status === 'watching'}
                onClick={() => watch(placement)}
                className="w-full"
                style={{ height: u(58) }}
              >
                <span style={{ fontSize: u(28) }}>
                  <StrokeText stroke={u(6)}>{status === 'watching' ? '...' : status === 'retry' ? 'Try again later' : status === 'done' ? 'Got it!' : 'Watch Ad'}</StrokeText>
                </span>
              </ChunkyButton>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/** Everything Wins can buy besides balls, eggs and Health packs, grouped, plus Gems and free rewards. */
export function StorePanel() {
  const passes = useGame((s) => s.profile.passes)
  const wins = useGame((s) => s.profile.wins)
  return (
    <Panel title="STORE" width={1080}>
      <div className="flex flex-col" style={{ gap: u(18) }}>
        <FreeSection />
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <SectionTitle>{section.title}</SectionTitle>
            <div className="grid" style={GRID}>
              {section.items.map((id) => {
                const product = SHOP[id]
                const owned = product.kind === 'pass' && passes[id]
                const icon = id === 'sphinx' ? <PetIcon id="sphinx" size={u(96)} /> : <Icon name={ICONS[id]} size={u(96)} />
                return (
                  <Card key={id} icon={icon} name={product.name} blurb={BLURBS[id]} faded={owned}>
                    <ChunkyButton
                      gradient={owned ? GRADIENTS.greyButton : GRADIENTS.greenButton}
                      disabled={owned}
                      onClick={() => buy(id)}
                      className="w-full"
                      style={{ height: u(58) }}
                    >
                      {owned ? (
                        <span style={{ fontSize: u(30) }}>
                          <StrokeText stroke={u(6)}>Owned</StrokeText>
                        </span>
                      ) : (
                        <Price amount={product.price} size={32} afford={wins >= product.price} />
                      )}
                    </ChunkyButton>
                  </Card>
                )
              })}
            </div>
          </div>
        ))}
        <GemsSection />
      </div>
    </Panel>
  )
}

export default StorePanel
