import { useEffect, useRef } from 'react'

import { NAMEPLATE_POOL_SIZE, registerNameplateElements } from '../game/remote/nameplates'

const SLOTS = Array.from({ length: NAMEPLATE_POOL_SIZE }, (_, i) => i)

/**
 * A chat bubble: white, rounded, dark text, wrapped to a couple of lines. Boxity's own
 * text (`chat.bubbleText`) is already trimmed to a bubble's length.
 */
const BUBBLE_STYLE = {
  display: 'none',
  maxWidth: 'max(160px, calc(var(--px) * 360))',
  width: 'max-content',
  padding: '0.35em 0.7em',
  borderRadius: '0.9em',
  background: 'rgba(255, 255, 255, 0.96)',
  color: '#1b1f24',
  boxShadow: '0 0.15em 0 rgba(0, 0, 0, 0.35)',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  fontWeight: 600,
  fontSize: 'max(12px, calc(var(--px) * 22))',
  lineHeight: 1.25,
  textAlign: 'center',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
}

/**
 * DOM side of the other players' name tags; positioned by the 3D frame loop. Chunky
 * white lettering in the game's font with a thick dark outline and a drop under it,
 * with that player's latest Boxity chat message in a bubble above it. One more bubble
 * floats over your own character for your messages.
 */
export function NameplateLayer() {
  const refs = useRef([])
  const localRef = useRef(null)
  useEffect(() => {
    registerNameplateElements(refs.current, localRef.current)
    return () => registerNameplateElements([], null)
  }, [])
  return (
    <div className="pointer-events-none absolute inset-0 z-[14] overflow-hidden">
      {SLOTS.map((i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="pp-text"
          style={{
            // Inline, so .pp-text's position: relative can't override it.
            position: 'absolute',
            left: 0,
            top: 0,
            display: 'none',
            fontSize: 'max(15px, calc(var(--px) * 32))',
            letterSpacing: '0.02em',
            willChange: 'transform',
          }}
        >
          {/* Above the name, centred on it; out of the flow so the tag's anchor (its
              bottom centre) stays on the name. */}
          <div
            data-bubble=""
            style={{ ...BUBBLE_STYLE, position: 'absolute', left: '50%', bottom: '100%', marginBottom: '0.3em', transform: 'translateX(-50%)', letterSpacing: 0 }}
          />
          {/* An outlined copy behind and a clean white one on top, like StrokeText: one
              element with a thick text-stroke draws stray bits of outline on phones. */}
          <span data-name="" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: '0.24em', WebkitTextStrokeColor: '#121218', color: '#121218' }} />
          <span data-name="" className="pp-text-fill" style={{ color: '#ffffff' }} />
        </div>
      ))}
      <div ref={localRef} style={{ ...BUBBLE_STYLE, position: 'absolute', left: 0, top: 0, willChange: 'transform' }} />
    </div>
  )
}

export default NameplateLayer
