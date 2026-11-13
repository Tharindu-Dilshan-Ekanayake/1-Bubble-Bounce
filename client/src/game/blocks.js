import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { STYLE } from './materials'

/**
 * Batching helpers. The world is thousands of boxes; drawn one mesh each it would blow
 * the draw-call budget many times over. Instead every module adds its boxes to a
 * BlockSet, and the whole set becomes a single InstancedMesh.
 */

const UNIT_BOX = new BoxGeometry(1, 1, 1)
/** White vertex colours for the unit box: the toy material reads vertex colours, and
 *  a box's colour comes from its instance colour instead. */
const UNIT_BOX_COLORS = new BufferAttribute(new Float32Array(UNIT_BOX.getAttribute('position').count * 3).fill(1), 3)

const colorCache = new Map()
/** Parses and caches '#rrggbb' colours; scene builders call this thousands of times. */
export function toColor(value) {
  if (value instanceof Color) return value
  let c = colorCache.get(value)
  if (!c) {
    c = new Color(value)
    colorCache.set(value, c)
  }
  return c
}

const FIELDS = 13

/**
 * A bag of axis-aligned (optionally Y-rotated) boxes.
 *
 * Positions are box centres. `addOn` is the usual entry point: it sits a box on a base
 * height instead, which is how almost everything in a blocky world is placed.
 */
export class BlockSet {
  constructor() {
    this.data = []
  }

  get count() {
    return this.data.length / FIELDS
  }

  /** Rotations are radians, applied in X, Y, Z order; nearly everything uses Y only. */
  add(x, y, z, sx, sy, sz, color, style = STYLE.STUDS, rotY = 0, rotX = 0, rotZ = 0) {
    const c = toColor(color)
    this.data.push(x, y, z, sx, sy, sz, rotX, rotY, rotZ, c.r, c.g, c.b, style)
    return this
  }

  /** Box resting on `base` (its bottom face at that height). */
  addOn(x, base, z, sx, sy, sz, color, style = STYLE.STUDS, rotY = 0) {
    return this.add(x, base + sy / 2, z, sx, sy, sz, color, style, rotY)
  }

  /** Appends every box of another set. */
  merge(other) {
    for (let i = 0; i < other.data.length; i += 1) this.data.push(other.data[i])
    return this
  }

  /**
   * Builds the InstancedMesh. Each mesh gets its own geometry object (it needs its own
   * per-instance style attribute) but they all share the unit box's vertex buffers.
   */
  build(material) {
    const count = this.count
    const geometry = new BufferGeometry()
    geometry.setIndex(UNIT_BOX.index)
    for (const name of ['position', 'normal', 'uv']) {
      geometry.setAttribute(name, UNIT_BOX.getAttribute(name))
    }
    geometry.setAttribute('color', UNIT_BOX_COLORS)

    const styles = new Float32Array(Math.max(count, 1))
    geometry.setAttribute('aStyle', new InstancedBufferAttribute(styles, 1))

    const mesh = new InstancedMesh(geometry, material, Math.max(count, 1))
    mesh.count = count
    const matrix = new Matrix4()
    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3()
    const color = new Color()
    const euler = new Euler()

    for (let i = 0; i < count; i += 1) {
      const o = i * FIELDS
      const d = this.data
      position.set(d[o], d[o + 1], d[o + 2])
      scale.set(d[o + 3], d[o + 4], d[o + 5])
      quaternion.setFromEuler(euler.set(d[o + 6], d[o + 7], d[o + 8]))
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, color.setRGB(d[o + 9], d[o + 10], d[o + 11]))
      styles[i] = d[o + 12]
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Bounds over all instances, so the batch is frustum-culled as a whole.
    mesh.computeBoundingSphere()
    mesh.computeBoundingBox()
    mesh.matrixAutoUpdate = false
    return mesh
  }
}

/** Disposes an InstancedMesh built by BlockSet (its geometry is its own). */
export function disposeBlocks(mesh) {
  if (!mesh) return
  mesh.geometry.dispose()
  mesh.dispose?.()
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _e = new Euler()

/**
 * Merges arbitrary geometry into one vertex-coloured mesh: for props that aren't boxes
 * (targets, eggs, stars). Every part gets a flat colour and a style, then the lot is
 * merged so the whole prop set costs one draw call.
 */
export class PropBuilder {
  constructor() {
    this.parts = []
    /** Optional Matrix4 applied to every part added while it is set. */
    this.transform = null
  }

  /**
   * @param {BufferGeometry} geometry template; not modified
   * @param {{ position?: number[], rotation?: number[], scale?: number|number[],
   *           color?: string, style?: number }} options rotation is Euler XYZ radians
   */
  add(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, color = '#ffffff', style = STYLE.SMOOTH } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals()

    _p.fromArray(position)
    _q.setFromEuler(_e.set(rotation[0], rotation[1], rotation[2]))
    if (Array.isArray(scale)) _s.fromArray(scale)
    else _s.setScalar(scale)
    _m.compose(_p, _q, _s)
    g.applyMatrix4(_m)
    if (this.transform) g.applyMatrix4(this.transform)

    const n = g.getAttribute('position').count
    const c = toColor(color)
    const colors = new Float32Array(n * 3)
    const styles = new Float32Array(n)
    for (let i = 0; i < n; i += 1) {
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
      styles[i] = style
    }
    g.setAttribute('color', new BufferAttribute(colors, 3))
    g.setAttribute('aStyle', new BufferAttribute(styles, 1))
    this.parts.push(g)
    return this
  }

  /** Box shorthand, positioned by its centre. */
  box(x, y, z, sx, sy, sz, color, style = STYLE.STUDS, rotation = [0, 0, 0]) {
    return this.add(UNIT_BOX, { position: [x, y, z], scale: [sx, sy, sz], color, style, rotation })
  }

  build() {
    if (this.parts.length === 0) return null
    const merged = mergeGeometries(this.parts, false)
    for (const part of this.parts) part.dispose()
    this.parts = []
    merged.computeBoundingSphere()
    return merged
  }
}

const _identity = new Matrix4()
const _white = new Color(1, 1, 1)

/**
 * A merged prop geometry (vertex colours, per-vertex aStyle) drawn as a single
 * instance, so it shares the instanced toy shader program with everything else.
 */
export function asToyInstance(geometry, material) {
  const mesh = new InstancedMesh(geometry, material, 1)
  mesh.setMatrixAt(0, _identity)
  mesh.setColorAt(0, _white)
  mesh.computeBoundingSphere()
  return mesh
}

/** Up to `max` copies of a merged prop geometry, in its own vertex colours. Starts empty. */
export function createToyInstances(geometry, material, max) {
  const mesh = new InstancedMesh(geometry, material, max)
  for (let i = 0; i < max; i += 1) mesh.setColorAt(i, _white)
  mesh.count = 0
  mesh.frustumCulled = false
  return mesh
}

/**
 * `max` unit boxes in one style, placed with setMatrixAt and tinted with setColorAt.
 * Starts empty, every box at zero scale.
 */
export function createBoxInstances(max, material, style = STYLE.SMOOTH) {
  const set = new BlockSet()
  for (let i = 0; i < max; i += 1) set.add(0, 0, 0, 0, 0, 0, '#ffffff', style)
  const mesh = set.build(material)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = true
  return mesh
}
