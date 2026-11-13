import { useCallback, useEffect } from 'react'

import { formatDistance, formatNumber } from '@shared/format'

import { sfx } from '../../audio/sfx'
import { setRollHudElement } from '../../game/roll/hudLink'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

/**
 * Top centre while your ball flies: a rainbow bar of the lane's stages with your marker
 * moving along it, "1,050 yd" under it and the stage's name. All three are written
 * straight to the DOM from the frame loop (see hudLink), never through React - and the
 * whole counter is contained, so those writes re-lay-out this box alone.
 */
const RAINBOW_BAR = 'linear-gradient(90deg, #ff4a4a 0%, #ff9a1e 17%, #ffe23a 33%, #4be05a 50%, #2fd0ff 67%, #3a6bff 83%, #ff5fd2 100%)'
const DISTANCE_GRADIENT = 'linear-gradient(180deg, #e0faff 0%, #7fe2ff 45%, #2f8ff2 100%)'

function DistanceCounter() {
  // A callback ref: registered when the element mounts, cleared when it unmounts.
  const ref = useCallback((el) => setRollHudElement(el), [])
  return (
    // Below the top-right buttons, so the bar never runs under them.
    <div ref={ref} className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(96), width: u(1300), maxWidth: '86vw', contain: 'layout style' }}>
      <div className="relative w-full" style={{ height: u(30) }}>
        <div className="absolute inset-0" style={{ border: `${u(5)} solid #111`, borderRadius: u(16), background: RAINBOW_BAR }} />
        {/* The marker rides a track as wide as the bar, slid by a transform (a % of the
            track's own width): moving it never needs a layout. */}
        <div data-zone-marker className="absolute inset-0" style={{ willChange: 'transform' }}>
          <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Icon name="tire" size={u(64)} />
          </div>
        </div>
      </div>
      <span className="pp-text" style={{ fontSize: u(100), lineHeight: 1, marginTop: u(14) }}>
        <span data-distance aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(20) }}>
          0 yd
        </span>
        <span data-distance className="pp-text-fill" style={{ color: '#ffffff' }}>
          0 yd
        </span>
      </span>
      <span className="pp-text" style={{ fontSize: u(56), marginTop: u(6) }}>
        <span data-zone aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(12) }} />
        <span data-zone data-zone-fill className="pp-text-fill" style={{ WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }} />
      </span>
    </div>
  )
}

/** How many trophies fly to the Wins counter, and where each bursts out to first. */
const FLYERS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + 0.3
  const r = 110 + (i % 3) * 45
  return { sx: Math.cos(a) * r, sy: Math.sin(a) * r * 0.7, delay: 0.35 + i * 0.06 }
})

/**
 * The Wins flying home: a ring of trophies bursts out of the result and streams into
 * the Wins counter in the top-left (which bumps as they land - see StatsPanel), with a
 * coin ping for each.
 */
function FlyingTrophies() {
  useEffect(() => sfx.coins(FLYERS.length), [])
  return FLYERS.map((f, i) => (
    <span
      key={i}
      className="pp-fly pointer-events-none absolute left-1/2 top-[48%]"
      style={{ '--sx': u(f.sx), '--sy': u(f.sy), animationDelay: `${f.delay}s` }}
    >
      <Icon name="trophy" size={u(70)} />
    </span>
  ))
}

/**
 * Once the ball stops, as in the reference: "1,516 m!" with "+1,516 Wins" under it, and
 * a big tilted NEW BEST! over them when it's your furthest kick yet.
 */
function RollResult({ result }) {
  return (
    <>
      <FlyingTrophies key={`fly-${result.id}`} />
      {/* Centred by the pp-result animation's own transform. */}
      <div key={result.id} className="pp-result pointer-events-none absolute left-1/2 top-[44%] flex flex-col items-center">
        {result.best && (
          <div style={{ fontSize: u(120), transform: 'rotate(-8deg)', marginBottom: u(-10) }}>
            <StrokeText stroke={u(22)} gradient={GRADIENTS.priceShort}>
              NEW BEST!
            </StrokeText>
          </div>
        )}
        <div style={{ fontSize: u(118), transform: 'rotate(-6deg)' }}>
          <StrokeText stroke={u(22)} gradient={DISTANCE_GRADIENT}>
            {formatDistance(result.distance)}!
          </StrokeText>
        </div>
        <div className="flex items-center" style={{ gap: u(12), fontSize: u(84), transform: 'rotate(-6deg)' }}>
          <Icon name="trophy" size={u(110)} />
          <StrokeText stroke={u(16)} gradient={GRADIENTS.gold}>
            +{formatNumber(result.wins + result.prize)} Wins
          </StrokeText>
        </div>
      </div>
    </>
  )
}

/** How long a toast stays up. */
const TOAST_MS = 3500

/** A celebration banner across the middle: a new zone, an ad reward, a Gems purchase. */
function Toast() {
  const toast = useGame((s) => s.toast)
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => {
      if (useGame.getState().toast === toast) useGame.setState({ toast: null })
    }, TOAST_MS)
    return () => clearTimeout(id)
  }, [toast])
  if (!toast) return null
  return (
    <div
      key={toast.id}
      className="pp-result pointer-events-none absolute left-1/2 top-[16%] flex flex-col items-center text-center"
      style={{ fontSize: u(60), animationDuration: `${TOAST_MS}ms`, width: 'max-content', maxWidth: '92vw' }}
    >
      <StrokeText stroke={u(12)} gradient={GRADIENTS.gold} style={{ whiteSpace: 'normal' }}>
        {toast.text}
      </StrokeText>
    </div>
  )
}

export function RollOverlay() {
  // The distance counter is for the flight; the result takes over once it lands.
  const rolling = useGame((s) => Boolean(s.roll && !s.rollResult))
  const result = useGame((s) => s.rollResult)
  return (
    <>
      {rolling && <DistanceCounter />}
      {result && <RollResult result={result} />}
      <Toast />
    </>
  )
}

export default RollOverlay
