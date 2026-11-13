import { useEffect, useRef, useState } from 'react'

import { runtime } from '../game/runtime'
import { GRADIENTS } from './hud/style'

/** Joystick travel radius, in CSS pixels. */
const RADIUS = 56

function detectTouch() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

/** The chunky round look of the HUD's buttons, sized in CSS pixels. */
const roundButton = (size, background) => ({
  width: size,
  height: size,
  background,
  border: '4px solid #111',
})

/**
 * On-screen controls for touch devices: a floating joystick that appears wherever the
 * left side of the screen is touched, and a jump button. Everything else is walking
 * onto things: the kick zone, a treadmill, a ball stand.
 *
 * Writes straight into `runtime.input` and moves the knob through refs, so dragging
 * never re-renders React.
 */
export function TouchControls() {
  const [isTouch, setIsTouch] = useState(detectTouch)
  const baseRef = useRef(null)
  const knobRef = useRef(null)
  const active = useRef({ id: null, x: 0, y: 0 })

  // A touchscreen laptop can start with a mouse; show the controls on first touch.
  useEffect(() => {
    if (isTouch) return undefined
    const onTouch = (e) => {
      if (e.pointerType === 'touch') setIsTouch(true)
    }
    window.addEventListener('pointerdown', onTouch)
    return () => window.removeEventListener('pointerdown', onTouch)
  }, [isTouch])

  useEffect(
    () => () => {
      runtime.input.joyX = 0
      runtime.input.joyY = 0
      runtime.input.jump = false
    },
    [],
  )

  if (!isTouch) return null

  const show = (x, y) => {
    const base = baseRef.current
    if (!base) return
    base.style.opacity = '1'
    base.style.left = `${x - RADIUS}px`
    base.style.top = `${y - RADIUS}px`
  }

  const onDown = (e) => {
    if (active.current.id !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    active.current = { id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top }
    show(active.current.x, active.current.y)
  }

  const onMove = (e) => {
    const a = active.current
    if (a.id !== e.pointerId) return
    const rect = e.currentTarget.getBoundingClientRect()
    let dx = e.clientX - rect.left - a.x
    let dy = e.clientY - rect.top - a.y
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
    // Unit direction times strength, with a small dead zone so a resting thumb
    // doesn't creep.
    const strength = Math.max(0, Math.min(len, RADIUS) / RADIUS - 0.08) / 0.92
    runtime.input.joyX = len > 0 ? (dx / Math.min(len, RADIUS)) * strength : 0
    runtime.input.joyY = len > 0 ? (-dy / Math.min(len, RADIUS)) * strength : 0
  }

  const onUp = (e) => {
    if (active.current.id !== e.pointerId) return
    active.current.id = null
    runtime.input.joyX = 0
    runtime.input.joyY = 0
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)'
    if (baseRef.current) baseRef.current.style.opacity = '0.35'
  }

  return (
    <>
      <div
        className="absolute bottom-0 left-0 z-10 h-[62%] w-[42%] touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          ref={baseRef}
          // Resting low in the corner, clear of the menu tiles above it (and, held
          // upright, of the Health bar below it): .touch-joy-rest in index.css.
          className="touch-joy-rest pointer-events-none absolute rounded-full border-4 border-white/70 bg-black/25"
          style={{
            width: RADIUS * 2,
            height: RADIUS * 2,
            opacity: 0.35,
            left: RADIUS,
          }}
        >
          <div
            ref={knobRef}
            className="absolute rounded-full border-4 border-black/40 bg-white/90 shadow-lg"
            style={{ width: RADIUS, height: RADIUS, left: RADIUS / 2, top: RADIUS / 2 }}
          />
        </div>
      </div>

      <button
        type="button"
        aria-label="Jump"
        className="touch-jump pp-btn pp-chunky absolute z-20 flex touch-none items-center justify-center rounded-full text-white"
        style={roundButton(70, GRADIENTS.slate)}
        onPointerDown={(e) => {
          e.preventDefault()
          runtime.input.jump = true
        }}
        onPointerUp={() => {
          runtime.input.jump = false
        }}
        onPointerCancel={() => {
          runtime.input.jump = false
        }}
        onPointerLeave={() => {
          runtime.input.jump = false
        }}
      >
        <span className="pp-gloss" style={{ borderRadius: '35px 35px 20px 20px' }} />
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  )
}

export default TouchControls
