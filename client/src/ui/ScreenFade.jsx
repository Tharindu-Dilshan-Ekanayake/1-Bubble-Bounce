import { setFadeElement } from './fade'

/** The element fade.js flashes; invisible and click-through the rest of the time. */
export function ScreenFade() {
  return (
    <div
      ref={setFadeElement}
      className="pointer-events-none absolute inset-0 z-[60]"
      style={{ opacity: 0, background: 'radial-gradient(circle at 50% 45%, #ffffff 0%, #f2fbff 55%, #c9ecff 100%)' }}
    />
  )
}

export default ScreenFade
