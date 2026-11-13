import { CylinderGeometry, ExtrudeGeometry, Shape } from 'three'

/**
 * Shared geometry factories. Anything used by more than one mesh is created once at
 * module level and reused; factories here are for the one-off merges.
 */

/** A flat disc facing +Z (a cylinder turned on its side). */
export function disc(radius, depth = 0.1, segments = 32) {
  const g = new CylinderGeometry(radius, radius, depth, segments)
  g.rotateX(Math.PI / 2)
  return g
}

/** An n-pointed star facing +Z, extruded `depth`. */
export function star(points, outer, inner, depth = 0.25) {
  const shape = new Shape()
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 })
  g.translate(0, 0, -depth / 2)
  return g
}
