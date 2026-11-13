import { useEffect, useState } from 'react'

function detectTouch() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

/**
 * Whether to show the touch controls (joystick, jump, the round BLOW button): true on a
 * touchscreen, and on a touchscreen laptop that started with a mouse once a finger lands.
 */
export function useTouch() {
  const [isTouch, setIsTouch] = useState(detectTouch)
  useEffect(() => {
    if (isTouch) return undefined
    const onTouch = (e) => {
      if (e.pointerType === 'touch') setIsTouch(true)
    }
    window.addEventListener('pointerdown', onTouch)
    return () => window.removeEventListener('pointerdown', onTouch)
  }, [isTouch])
  return isTouch
}

export default useTouch
