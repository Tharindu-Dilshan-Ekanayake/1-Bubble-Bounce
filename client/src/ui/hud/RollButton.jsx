import { useCallback, useEffect, useRef, useState } from 'react'

import { HIT_GRADES, hitGrade, hitReach } from '@shared/balance'

import { sfx } from '../../audio/sfx'
import { cancelPull, grab, launch, letGo } from '../../game/launch'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/** With Auto Launch on, the next launch starts this long after you're back at the posts. */
const AUTO_DELAY_MS = 700
/** Auto Launch lets go this long after reaching full stretch. */
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

/**
 * The launch posts' HUD: the stretch meter and the LAUNCH! button, shown by the posts.
 * Walk up to the posts and you grab them by themselves (or press E /
 * Enter); then walk BACK with your joystick or keys - your arms stretch like rubber and
 * the stretch meter fills with how far back you've got (out of how far your arms reach).
 * At full stretch the rubber twangs and the meter bounces off the top. Stop pulling back
 * (let go of the stick or key - the button works too) to fly out between the posts: the fuller the meter, the further you fly and the more it pays
 * (HIT_GRADES) - let go right at the top of a twang for PERFECT. With the Auto Launch pass,
 * a toggle under it grabs, walks back and lets go for you every time you're back (a plain
 * launch, no meter). Jumping lets go of the posts without launching.
 *
 * The meter is moved straight on the DOM every animation frame (the player keeps
 * launch.charge up to date); React only hears about grabbing and letting go.
 */
export function RollButton() {
  const near = useGame((s) => s.zone.atPosts && !s.roll && !s.rollResult && !s.panel)
  const ownsAuto = useGame((s) => Boolean(s.profile.passes.autoRoll))
  const autoOn = useGame((s) => Boolean(s.profile.passes.autoRoll && s.profile.settings.autoRoll))
  /** Holding the posts right now (mirrors launch.gripping for React). */
  const [gripping, setGripping] = useState(false)
  const [auto, setAuto] = useState(false)
  const lastPress = useRef(-Infinity)
  const fillRef = useRef(null)
  const labelRef = useRef(null)
  const hintRef = useRef(null)
  const visible = near || gripping

  const doGrab = useCallback((byAuto = false) => {
    if (launch.gripping || launch.released) return
    grab(byAuto)
    sfx.stretchStart()
    setGripping(true)
    setAuto(byAuto)
  }, [])

  /** Lets go; `plain` sends no meter reading (Auto Launch). */
  const doLetGo = useCallback((plain = false) => {
    if (!launch.gripping) return
    const charge = letGo()
    sfx.stretchStop()
    setGripping(false)
    setAuto(false)
    actions.roll(plain ? undefined : Math.round(charge * 1000) / 1000)
  }, [])

  const press = useCallback(() => {
    const now = performance.now()
    if (now - lastPress.current < PRESS_COOLDOWN_MS) return
    lastPress.current = now
    if (launch.gripping) doLetGo()
    else doGrab()
  }, [doGrab, doLetGo])

  // You can also grab the posts by walking up to them and let go by stopping pulling
  // back (Player.jsx), with no button: keep the meter in step with that.
  useEffect(() => {
    if (!visible) return undefined
    const id = setInterval(() => {
      setGripping(launch.gripping)
      setAuto(launch.auto)
    }, 80)
    return () => clearInterval(id)
  }, [visible])

  // A panel opened or the launch started: let go of the posts.
  const panel = useGame((s) => s.panel)
  const rolling = useGame((s) => Boolean(s.roll))
  const [blocked, setBlocked] = useState(false)
  if (Boolean(panel || rolling) !== blocked) {
    setBlocked(Boolean(panel || rolling))
    if (panel || rolling) {
      setGripping(false)
      setAuto(false)
    }
  }
  useEffect(() => {
    if (!blocked || !launch.gripping) return
    cancelPull()
    sfx.stretchStop()
  }, [blocked])

  useEffect(() => {
    if (!visible) return undefined
    const onKey = (e) => {
      if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) press()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, press])

  // Auto Launch: grab and walk back by itself every time you're back at the posts.
  useEffect(() => {
    if (!near || !autoOn || gripping) return undefined
    const id = setTimeout(() => doGrab(true), AUTO_DELAY_MS)
    return () => clearTimeout(id)
  }, [near, autoOn, gripping, doGrab])

  // The meter, every frame, while gripping (and noticing a jump letting go).
  useEffect(() => {
    if (!gripping) return undefined
    let raf = 0
    const tick = () => {
      if (!launch.gripping) {
        // Let go some other way (a jump): put the meter away.
        sfx.stretchStop()
        setGripping(false)
        setAuto(false)
        return
      }
      const charge = launch.charge
      sfx.stretchSet(charge, launch.full)
      if (auto && launch.full && performance.now() - launch.fullSince > AUTO_HOLD_MS) {
        doLetGo(true)
        return
      }
      if (fillRef.current) fillRef.current.style.width = `${charge * 100}%`
      // The grade letting go now would get, in its colour, and how far it would fling
      // you: "LET GO! PERFECT x1.5". Both layers of the outlined text (StrokeText).
      const grade = hitGrade(charge)
      const text = launch.full ? `RELEASE! ${grade.label.replace(/[!.]+$/, '')} x${hitReach(charge).toFixed(1)}` : `WALK BACK! ${Math.round(launch.back)}m / ${Math.round(launch.max)}m`
      for (const layer of labelRef.current?.querySelectorAll('.pp-text-stroke, .pp-text-fill') ?? []) layer.textContent = text
      const fill = labelRef.current?.querySelector('.pp-text-fill')
      if (fill) fill.style.color = launch.full ? GRADE_COLORS[grade.id] : '#ffffff'
      if (hintRef.current) hintRef.current.style.opacity = launch.full ? '0' : '1'
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [gripping, auto, doLetGo])

  if (!visible) return null
  return (
    <>
      {/* The stretch meter, up under the top bar: the middle of the screen is you,
          walking back from the posts. */}
      {gripping && !auto && (
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(150) }}>
          <span ref={labelRef} className="whitespace-nowrap" style={{ fontSize: u(54), color: '#ffffff' }}>
            <StrokeText stroke={u(11)}>WALK BACK! 0%</StrokeText>
          </span>
          <div
            className="relative overflow-hidden"
            style={{
              width: u(560),
              height: u(54),
              borderRadius: u(27),
              border: `${u(6)} solid #1b1b1f`,
              background: '#2a1f4a',
              boxShadow: `0 ${u(6)} 0 rgba(0,0,0,0.35)`,
            }}
          >
            {/* The grade bands, faint, along the top end of the meter. */}
            {BANDS.map((b) => (
              <div key={b.id} className="absolute top-0 bottom-0" style={{ left: `${b.from * 100}%`, right: 0, background: BAND_COLORS[b.id], opacity: 0.32 }} />
            ))}
            {/* The stretch itself: a rubber band filling up. */}
            <div
              ref={fillRef}
              className="absolute top-0 bottom-0 left-0"
              style={{
                width: '0%',
                background: 'repeating-linear-gradient(135deg, #ff5fa8 0 14px, #ff8fd0 14px 28px)',
                borderRight: `${u(5)} solid #ffffff`,
              }}
            />
            {BANDS.map((b) => (
              <div key={`${b.id}-mark`} className="absolute top-0 bottom-0" style={{ left: `${b.from * 100}%`, width: u(4), background: '#1b1b1f', opacity: 0.6 }} />
            ))}
          </div>
          <span ref={hintRef} className="flex items-center" style={{ fontSize: u(32), marginTop: u(10), gap: u(8) }}>
            <Icon name="arrowDown" size={u(40)} />
            <StrokeText stroke={u(7)}>Walk BACK to stretch your arms - then RELEASE at the very top!</StrokeText>
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(300) }}>
        {/* No button: walking up to the posts grabs them, letting go of the stick launches. */}
        {!gripping && (
          <span style={{ fontSize: u(34) }}>
            <StrokeText stroke={u(7)}>Walk up to the posts, pull BACK, then release!</StrokeText>
          </span>
        )}
        {ownsAuto && (
          <ChunkyButton
            gradient={autoOn ? GRADIENTS.goldButton : GRADIENTS.greyButton}
            onClick={() => actions.setSetting('autoRoll', !autoOn)}
            title="Auto Launch"
            radius={10}
            border={4}
            style={{ height: u(56), padding: `0 ${u(20)}`, marginTop: u(12) }}
          >
            <span style={{ fontSize: u(32) }}>
              <StrokeText stroke={u(7)}>Auto Launch: {autoOn ? 'ON' : 'OFF'}</StrokeText>
            </span>
          </ChunkyButton>
        )}
      </div>
    </>
  )
}

export default RollButton
