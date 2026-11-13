import { useCallback, useEffect, useRef, useState } from 'react'

import { HIT_GRADES, hitGrade, hitReach } from '@shared/balance'

import { sfx } from '../../audio/sfx'
import { cancelBlow, launch, releaseBlow, startBlow } from '../../game/launch'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/** With Auto Bounce on, the next bubble starts this long after you're back in the zone. */
const AUTO_DELAY_MS = 700
/** Auto Bounce lets go this long after the bubble reaches full size. */
const AUTO_HOLD_MS = 200
/** A press is ignored this soon after the last (a double tap, a bouncing key). */
const PRESS_COOLDOWN_MS = 250

/** The meter's coloured bands, from the grades: each runs from its `min` to the top. */
const BANDS = HIT_GRADES.filter((g) => g.min > 0).map((g) => ({ id: g.id, from: g.min }))
const BAND_COLORS = {
  perfect: 'linear-gradient(180deg, #fff6a3 0%, #ffd21f 55%, #ff9c00 100%)',
  great: 'linear-gradient(180deg, #d9ff9a 0%, #5fe83a 55%, #1fb52a 100%)',
  good: 'linear-gradient(180deg, #bff4ff 0%, #4fc8ff 55%, #1f8ae0 100%)',
}
/** Each grade's colour for the live label over the meter. */
const GRADE_COLORS = { perfect: '#ffd21f', great: '#7dff4a', good: '#9fe8ff', weak: '#ff6a5a' }
/** The soap-film fill of the meter. */
const FILM = 'linear-gradient(90deg, #9fe8ff 0%, #c9b8ff 30%, #ffb8e8 55%, #fff1a8 78%, #b8ffd8 100%)'

/**
 * The BLOW ZONE's HUD: a big green BLOW button and, while you hold it, the blow meter.
 * Hold BLOW (or E / Enter) anywhere on the zone: you blow a giant bubble out of your wand
 * and the meter fills as it grows; at full size the bubble wobbles and the meter bounces
 * off the top. Let go to hop in and bounce away: the fuller the meter, the further you go
 * and the more it pays (HIT_GRADES) - let go right at the top of a wobble for PERFECT.
 * With the Auto Bounce pass, a toggle under it blows and lets go for you every time
 * you're back (a plain bounce, no meter). Jumping pops the bubble without bouncing.
 *
 * The meter is moved straight on the DOM every animation frame (the player keeps
 * launch.charge up to date); React only hears about starting and letting go.
 */
export function RollButton() {
  const near = useGame((s) => s.zone.rollZone && !s.roll && !s.rollResult && !s.panel)
  const ownsAuto = useGame((s) => Boolean(s.profile.passes.autoRoll))
  const autoOn = useGame((s) => Boolean(s.profile.passes.autoRoll && s.profile.settings.autoRoll))
  /** Blowing right now (mirrors launch.charging for React). */
  const [blowing, setBlowing] = useState(false)
  const [auto, setAuto] = useState(false)
  const lastPress = useRef(-Infinity)
  const fillRef = useRef(null)
  const labelRef = useRef(null)
  const hintRef = useRef(null)
  const visible = near || blowing

  const doStart = useCallback((byAuto = false) => {
    if (launch.charging || launch.released) return
    const now = performance.now()
    if (!byAuto && now - lastPress.current < PRESS_COOLDOWN_MS) return
    lastPress.current = now
    startBlow(now, byAuto)
    sfx.stretchStart()
    setBlowing(true)
    setAuto(byAuto)
  }, [])

  /** Lets go; `plain` sends no meter reading (Auto Bounce). */
  const doRelease = useCallback((plain = false) => {
    if (!launch.charging) return
    const charge = releaseBlow()
    sfx.stretchStop()
    setBlowing(false)
    setAuto(false)
    actions.roll(plain ? undefined : Math.round(charge * 1000) / 1000)
  }, [])

  // The player can let go too (held too long) or pop it (a jump): keep in step.
  useEffect(() => {
    if (!visible) return undefined
    const id = setInterval(() => {
      setBlowing(launch.charging)
      setAuto(launch.auto)
    }, 80)
    return () => clearInterval(id)
  }, [visible])

  // A panel opened or the bounce started: the bubble you were blowing pops.
  const panel = useGame((s) => s.panel)
  const rolling = useGame((s) => Boolean(s.roll))
  const [blocked, setBlocked] = useState(false)
  if (Boolean(panel || rolling) !== blocked) {
    setBlocked(Boolean(panel || rolling))
    if (panel || rolling) {
      setBlowing(false)
      setAuto(false)
    }
  }
  useEffect(() => {
    if (!blocked || !launch.charging) return
    cancelBlow()
    sfx.stretchStop()
  }, [blocked])

  // E or Enter: hold to blow, let go to bounce.
  useEffect(() => {
    if (!visible) return undefined
    const isKey = (e) => e.code === 'KeyE' || e.code === 'Enter'
    const down = (e) => {
      if (!e.repeat && isKey(e)) doStart()
    }
    const up = (e) => {
      if (isKey(e) && launch.charging && !launch.auto) doRelease()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [visible, doStart, doRelease])

  // Auto Bounce: blows by itself every time you're back in the zone.
  useEffect(() => {
    if (!near || !autoOn || blowing) return undefined
    const id = setTimeout(() => doStart(true), AUTO_DELAY_MS)
    return () => clearTimeout(id)
  }, [near, autoOn, blowing, doStart])

  // The meter, every frame, while blowing (and noticing the bubble going some other way).
  useEffect(() => {
    if (!blowing) return undefined
    let raf = 0
    const tick = () => {
      if (!launch.charging) {
        sfx.stretchStop()
        setBlowing(false)
        setAuto(false)
        return
      }
      const charge = launch.charge
      sfx.stretchSet(charge, launch.full)
      if (auto && launch.full && performance.now() - launch.fullSince > AUTO_HOLD_MS) {
        doRelease(true)
        return
      }
      if (fillRef.current) fillRef.current.style.width = `${charge * 100}%`
      // The grade letting go now would get, in its colour, and how far it would send you:
      // "LET GO! PERFECT x1.5". Both layers of the outlined text (StrokeText).
      const grade = hitGrade(charge)
      const text = launch.full ? `LET GO! ${grade.label.replace(/[!.]+$/, '')} x${hitReach(charge).toFixed(1)}` : `BLOWING... ${Math.round(charge * 100)}%`
      for (const layer of labelRef.current?.querySelectorAll('.pp-text-stroke, .pp-text-fill') ?? []) layer.textContent = text
      const fill = labelRef.current?.querySelector('.pp-text-fill')
      if (fill) fill.style.color = launch.full ? GRADE_COLORS[grade.id] : '#ffffff'
      if (hintRef.current) hintRef.current.style.opacity = launch.full ? '0' : '1'
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [blowing, auto, doRelease])

  if (!visible) return null
  const release = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (launch.charging && !launch.auto) doRelease()
  }
  return (
    <>
      {/* The blow meter, up under the top bar: the middle of the screen is you and the
          bubble swelling in front of you. */}
      {blowing && !auto && (
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(150) }}>
          <span ref={labelRef} className="whitespace-nowrap" style={{ fontSize: u(54), color: '#ffffff' }}>
            <StrokeText stroke={u(11)}>BLOWING... 0%</StrokeText>
          </span>
          <div
            className="relative overflow-hidden"
            style={{
              width: u(560),
              height: u(54),
              borderRadius: u(27),
              border: `${u(6)} solid #1b1b1f`,
              background: '#203a6a',
              boxShadow: `0 ${u(6)} 0 rgba(0,0,0,0.35)`,
            }}
          >
            {BANDS.map((b) => (
              <div key={b.id} className="absolute top-0 bottom-0" style={{ left: `${b.from * 100}%`, right: 0, background: BAND_COLORS[b.id], opacity: 0.32 }} />
            ))}
            <div ref={fillRef} className="absolute top-0 bottom-0 left-0" style={{ width: '0%', background: FILM, borderRight: `${u(5)} solid #ffffff` }} />
            {BANDS.map((b) => (
              <div key={`${b.id}-mark`} className="absolute top-0 bottom-0" style={{ left: `${b.from * 100}%`, width: u(4), background: '#1b1b1f', opacity: 0.6 }} />
            ))}
          </div>
          <span ref={hintRef} className="flex items-center" style={{ fontSize: u(32), marginTop: u(10) }}>
            <StrokeText stroke={u(7)}>Keep holding - let go when the bubble is BIGGEST!</StrokeText>
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(300) }}>
        {!auto && (
          <ChunkyButton
            gradient={blowing ? GRADIENTS.goldButton : GRADIENTS.greenButton}
            onPointerDown={(e) => {
              e.preventDefault()
              e.currentTarget.setPointerCapture?.(e.pointerId)
              doStart()
            }}
            onPointerUp={release}
            onPointerCancel={release}
            title="Blow"
            radius={16}
            border={6}
            className="touch-none"
            style={{ width: u(520), height: u(140), flexDirection: 'column' }}
          >
            {/* Both lines sit inside the button, the hint kept clear of the border. */}
            <span className="flex flex-col items-center" style={{ position: 'absolute', inset: 0, justifyContent: 'center', padding: `0 ${u(18)}` }}>
              <span style={{ fontSize: u(68), lineHeight: 1 }}>
                <StrokeText stroke={u(12)}>{blowing ? 'LET GO!' : 'BLOW'}</StrokeText>
              </span>
              <span className="whitespace-nowrap" style={{ fontSize: u(24), lineHeight: 1.15, marginTop: u(8) }}>
                <StrokeText stroke={u(6)}>{blowing ? 'at the biggest!' : 'Hold, then bounce as far as you can!'}</StrokeText>
              </span>
            </span>
          </ChunkyButton>
        )}
        {ownsAuto && (
          <ChunkyButton
            gradient={autoOn ? GRADIENTS.goldButton : GRADIENTS.greyButton}
            onClick={() => actions.setSetting('autoRoll', !autoOn)}
            title="Auto Bounce"
            radius={10}
            border={4}
            style={{ height: u(56), padding: `0 ${u(20)}`, marginTop: u(12) }}
          >
            <span style={{ fontSize: u(32) }}>
              <StrokeText stroke={u(7)}>Auto Bounce: {autoOn ? 'ON' : 'OFF'}</StrokeText>
            </span>
          </ChunkyButton>
        )}
      </div>
    </>
  )
}

export default RollButton
