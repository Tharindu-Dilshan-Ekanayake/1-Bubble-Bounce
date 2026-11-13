import { useEffect, useRef } from 'react'

import { PET_ICON_SIZE, usePetIcon } from '../game/pets/petIcons'
import Icon from './Icon'

/**
 * A pet's portrait, rendered from its 3D model (see petIcons.js) and drawn onto a small
 * canvas - no image to encode or decode. Shows a faint placeholder for the frame or two
 * before the portrait is ready (normally it already is: they're rendered while loading).
 *
 * @param {{ id: string, size: string|number, className?: string, style?: object }} props
 */
export function PetIcon({ id, size, className = '', style }) {
  const bitmap = usePetIcon(id)
  const ref = useRef(null)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !bitmap) return
    ctx.clearRect(0, 0, PET_ICON_SIZE, PET_ICON_SIZE)
    ctx.drawImage(bitmap, 0, 0)
  }, [bitmap])

  if (!bitmap) return <Icon name="pets" size={size} className={className} style={{ opacity: 0.25, ...style }} />
  return (
    <canvas
      ref={ref}
      width={PET_ICON_SIZE}
      height={PET_ICON_SIZE}
      className={`pointer-events-none select-none ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  )
}

export default PetIcon
