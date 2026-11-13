import { useCallback, useEffect, useRef } from 'react'

import { BLOW_TAP_BURST, BLOW_TAP_RATE } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { baseGain, isPadUnlocked, padGain } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { requestTapPuff } from '../../game/fx/puffQueue'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import { useNow } from '../useNow'
import { useTouch } from '../useTouch'
import StrokeText from '../StrokeText'
import { u } from './style'

/** Held down, BLOW repeats at the rate the server takes taps: no faster. */
const REPEAT_MS = 1000 / BLOW_TAP_RATE + 5
/** A mouse press that ends within this long, having moved less than CLICK_SLOP px, is a click. */
const CLICK_MS = 350
const CLICK_SLOP = 6
const GRADIENT = 'radial-gradient(circle at 35% 30%, #ffffff 0%, #bff4ff 18%, #5fc8ff 48%, #2f6fe8 82%, #2448b8 100%)'

/**
 * Blowing bubbles anywhere but the Blow Zone: every tap blows a puff of little bubbles out
 * of your wand and earns a Breath gain - a Blow Pad's if you're standing on one, your
 * bubble's own anywhere else. On a touchscreen that's the round BLOW button, bottom right
 * (the "+N" on it); with a mouse there's no button: click the scene (a drag still turns
 * the camera), or hold the mouse still to keep blowing. F taps too. Held, it blows as fast
 * as the server counts taps (BLOW_TAP_RATE a second: a quick thumb and an autoclicker get
 * the same). Taps the server would drop are never sent (the same token bucket here), so
 * every puff you see is Breath you get.
 */
export function BlowTap() {
  const hidden = useGame((s) => s.zone.rollZone || Boolean(s.roll || s.rollResult || s.panel))
  const pad = useGame((s) => s.zone.pad)
  const profile = useGame((s) => s.profile)
  const now = useNow(5000)
  const touch = useTouch()
  const buttonRef = useRef(null)
  // `at` 0: the first tap finds the bucket full.
  const bucket = useRef({ tokens: BLOW_TAP_BURST, at: 0 })
  const repeat = useRef(0)
  const onPad = pad >= 0 && isPadUnlocked(profile, pad)
  const gain = onPad ? padGain(profile, pad, now) : baseGain(profile, now)

  const tap = useCallback(() => {
    const b = bucket.current
    const t = performance.now()
    b.tokens = Math.min(BLOW_TAP_BURST, b.tokens + ((t - b.at) / 1000) * BLOW_TAP_RATE)
    b.at = t
    if (b.tokens < 1) return
    b.tokens -= 1
    actions.blow()
    requestTapPuff()
    sfx.blowPuff()
  }, [])

  /** Stops repeating, and lets the button back up (straight on the DOM: no re-render). */
  const stop = useCallback(() => {
    clearInterval(repeat.current)
    repeat.current = 0
    if (buttonRef.current) buttonRef.current.style.transform = 'scale(1)'
  }, [])

  // Hidden (into the Blow Zone, a panel, a bounce) or gone: no more repeats.
  useEffect(() => {
    if (!hidden) return undefined
    clearInterval(repeat.current)
    repeat.current = 0
    return undefined
  }, [hidden])
  useEffect(() => () => clearInterval(repeat.current), [])

  // F taps (a held key repeats at the keyboard's own rate; the bucket keeps it fair).
  useEffect(() => {
    if (hidden) return undefined
    const onKey = (e) => {
      if (e.code === 'KeyF') tap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hidden, tap])

  // Mouse: a click on the scene blows; held still, it keeps blowing; a drag is the camera's.
  useEffect(() => {
    if (hidden) return undefined
    let press = null
    const end = () => {
      clearInterval(repeat.current)
      repeat.current = 0
      press = null
    }
    const onDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target?.tagName !== 'CANVAS') return
      end()
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), held: false }
      repeat.current = setInterval(() => {
        if (!press) return
        if (!press.held) {
          if (performance.now() - press.at < CLICK_MS) return
          press.held = true
        }
        tap()
      }, REPEAT_MS)
    }
    const onMove = (e) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) end()
    }
    const onUp = (e) => {
      if (!press || e.pointerId !== press.id) return
      const click = !press.held && performance.now() - press.at < CLICK_MS
      end()
      if (click) tap()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', end)
      end()
    }
  }, [hidden, tap])

  if (hidden) return null
  // No button without a touchscreen: players click the scene instead.
  if (!touch) return null
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="Blow"
      title="Blow (F)"
      className="hud-blowtap pp-btn pp-chunky pointer-events-auto absolute flex touch-none flex-col items-center justify-center rounded-full"
      style={{
        width: u(190),
        height: u(190),
        background: GRADIENT,
        border: `${u(6)} solid #111`,
        transition: 'transform 60ms',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        e.currentTarget.style.transform = 'scale(0.92)'
        tap()
        clearInterval(repeat.current)
        repeat.current = setInterval(tap, REPEAT_MS)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <span className="pp-gloss" style={{ borderRadius: '50%' }} />
      <span style={{ fontSize: u(50), lineHeight: 1 }}>
        <StrokeText stroke={u(10)}>BLOW</StrokeText>
      </span>
      <span style={{ fontSize: u(32), lineHeight: 1.1 }}>
        <StrokeText stroke={u(7)} fill="#fff27a">
          +{formatNumber(gain)}
        </StrokeText>
      </span>
    </button>
  )
}

export default BlowTap
