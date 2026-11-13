import {
  BoxGeometry,
  BufferAttribute,
  CapsuleGeometry,
  Color,
  DodecahedronGeometry,
  Euler,
  ExtrudeGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  Quaternion,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { TIRES } from '@shared/balance'

import { glowTime } from './glow'

/**
 * How every bubble looks (shared/balance.js TIRES - the template's "tires" are bubbles):
 * its SHAPE and two colours, drawn by one soap-film shader (BUBBLE_GLSL) that every
 * bubble in the game shares - the one you ride, the ones on the shop's stands, the little
 * ones you blow on a pad. No textures: the rainbow film, the rim and the window
 * highlight are all maths on the normal and the view direction, so one program serves
 * them all.
 *
 *   shape  which geometry (SHAPES): sphere, drop, cube, heart, star, bunny, gem, cloud,
 *          pill, planet, crystal, twin, egg, dodeca, atom, blossom
 *   a, b   the film's two tints (a: the body, b: the swirl through it)
 *   film   how much rainbow shows through the tint (0-1)
 *   glow   how much it shines on its own (0-1)
 *   trail  the colour of your bounce's trail, speed lines and stand trim
 *
 * Every geometry is built once, lazily, to fit a unit sphere (radius 1, centred), so a
 * bubble of any shape is scaled the same way wherever it's drawn.
 */
export const BUBBLE_STYLES = {
  soap: { shape: 'sphere', a: '#bfe9ff', b: '#ffd6f6', film: 0.85, trail: '#bfefff' },
  drop: { shape: 'drop', a: '#4fb8ff', b: '#9fe8ff', film: 0.45, trail: '#5fc8ff' },
  mint: { shape: 'cube', a: '#5fe8b0', b: '#d6fff0', film: 0.4, trail: '#7dffc8' },
  heart: { shape: 'heart', a: '#ff6fb8', b: '#ffd0ea', film: 0.35, trail: '#ff8fd0' },
  star: { shape: 'star', a: '#ffd21f', b: '#fff6a8', film: 0.35, glow: 0.15, trail: '#ffe26a' },
  bunny: { shape: 'bunny', a: '#c9a8ff', b: '#ffe0f4', film: 0.4, trail: '#d6b8ff' },
  gem: { shape: 'gem', a: '#a35cff', b: '#e6c8ff', film: 0.3, glow: 0.1, trail: '#b97bff' },
  cloud: { shape: 'cloud', a: '#f4fbff', b: '#a8dcff', film: 0.5, trail: '#ffffff' },
  pill: { shape: 'pill', a: '#ff4a5a', b: '#ffffff', film: 0.3, trail: '#ff6a7a' },
  planet: { shape: 'planet', a: '#ff9a3a', b: '#ffe0a0', film: 0.35, trail: '#ffb05a' },
  crystal: { shape: 'crystal', a: '#8ff0ff', b: '#ffffff', film: 0.45, glow: 0.1, trail: '#bff8ff' },
  twin: { shape: 'twin', a: '#3fd6c8', b: '#ff9cd6', film: 0.5, trail: '#5fe6d8' },
  egg: { shape: 'egg', a: '#ffc81a', b: '#fff1a8', film: 0.25, glow: 0.18, trail: '#ffd21f' },
  magma: { shape: 'dodeca', a: '#ff4a14', b: '#ffd21f', film: 0.2, glow: 0.35, trail: '#ff6a1c' },
  atom: { shape: 'atom', a: '#3f8cff', b: '#9ff4ff', film: 0.35, glow: 0.2, trail: '#6fb8ff' },
  blossom: { shape: 'blossom', a: '#ff8fc8', b: '#fff0f8', film: 0.4, trail: '#ffa8d6' },
  ruby: { shape: 'heart', a: '#ff1f4a', b: '#ff9cb0', film: 0.25, glow: 0.2, trail: '#ff4a6a' },
  diamond: { shape: 'gem', a: '#e8fbff', b: '#7fd8ff', film: 0.6, glow: 0.25, trail: '#dff8ff' },
  rainbow: { shape: 'star', a: '#ff7ad9', b: '#7affe0', film: 1, glow: 0.3, trail: '#ff9ce6' },
  candy: { shape: 'cloud', a: '#ffb8e8', b: '#9fdcff', film: 0.55, glow: 0.12, trail: '#ffc8ee' },
  galaxy: { shape: 'sphere', a: '#3a1a8a', b: '#ff5fd2', film: 0.55, glow: 0.4, trail: '#b07aff' },
  dragon: { shape: 'egg', a: '#2fd16a', b: '#ffd21f', film: 0.3, glow: 0.3, trail: '#5fe88a' },
  cosmic: { shape: 'planet', a: '#7a3aff', b: '#3fe0ff', film: 0.6, glow: 0.4, trail: '#9a6aff' },
  infinity: { shape: 'twin', a: '#ffffff', b: '#ff5fd2', film: 1, glow: 0.45, trail: '#ffffff' },
}

const FALLBACK = BUBBLE_STYLES.soap
export const bubbleStyle = (id) => BUBBLE_STYLES[id] ?? FALLBACK
/** A bubble's trail colour (the template's tireGlow) and body colour (tireRim). */
export const bubbleTrail = (id) => bubbleStyle(id).trail
export const bubbleBase = (id) => bubbleStyle(id).a

// --- Shapes ---------------------------------------------------------------------------

/** Scales and centres `g` to fit the unit sphere; returns it. */
function fitUnit(g) {
  g.computeBoundingBox()
  const box = g.boundingBox
  const centre = new Vector3()
  box.getCenter(centre)
  g.translate(-centre.x, -centre.y, -centre.z)
  g.computeBoundingSphere()
  const r = g.boundingSphere.radius || 1
  g.scale(1 / r, 1 / r, 1 / r)
  g.computeBoundingSphere()
  return g
}

/** Keeps position + normal only, so differently built parts merge cleanly. */
function plain(g) {
  const out = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal') out.deleteAttribute(name)
  if (!out.getAttribute('normal')) out.computeVertexNormals()
  return out
}

/** Smooth normals across seams (a lathe's, an extrusion's bevel, a box's edges). */
function smoothed(g) {
  const p = plain(g)
  p.deleteAttribute('normal')
  const m = mergeVertices(p, 1e-4)
  m.computeVertexNormals()
  return m
}

/** Flat-faced (gems, crystals): every triangle its own normal. */
function faceted(g) {
  const p = plain(g)
  p.computeVertexNormals()
  return p
}

/** A part of a merged shape: `g` placed, turned (XYZ Euler) and scaled. */
function part(g, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const m = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale))
  return plain(g).applyMatrix4(m)
}

function heartShape() {
  const s = new Shape()
  s.moveTo(0, -1)
  s.bezierCurveTo(-0.15, -0.75, -1.15, -0.2, -1.05, 0.38)
  s.bezierCurveTo(-0.98, 0.86, -0.42, 1.05, 0, 0.62)
  s.bezierCurveTo(0.42, 1.05, 0.98, 0.86, 1.05, 0.38)
  s.bezierCurveTo(1.15, -0.2, 0.15, -0.75, 0, -1)
  return s
}

function starShape(points = 5, outer = 1, inner = 0.48) {
  const s = new Shape()
  for (let i = 0; i <= points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner
    const a = Math.PI / 2 + (i * Math.PI) / points
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  return s
}

const puffy = (shape, depth = 0.5) =>
  new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.38, bevelSize: 0.3, bevelSegments: 5, curveSegments: 14, steps: 1 })

/** Builds shape `name` (unit sphere fit). Called once per shape (cached by bubbleGeometry). */
function buildShape(name, detail) {
  const seg = detail ? 28 : 14
  const ring = detail ? 18 : 10
  const sphere = () => new SphereGeometry(1, seg, ring)
  /** A small part of a merged shape: half the segments. */
  const small = () => new SphereGeometry(1, Math.max(10, seg >> 1), Math.max(8, ring >> 1))
  switch (name) {
    case 'drop': {
      // A teardrop on its side would roll: this one stands, round end down.
      const pts = []
      const n = detail ? 28 : 18
      for (let i = 0; i <= n; i += 1) {
        const t = (i / n) * Math.PI
        pts.push(new Vector2(Math.sin(t) * Math.pow(Math.sin(t / 2), 1.1), -Math.cos(t) * 1.25))
      }
      return smoothed(fitUnit(new LatheGeometry(pts, seg)))
    }
    case 'cube': {
      // A soft cube: a subdivided box pulled part way to a sphere.
      const g = new BoxGeometry(1.6, 1.6, 1.6, 8, 8, 8)
      const p = g.getAttribute('position')
      const v = new Vector3()
      for (let i = 0; i < p.count; i += 1) {
        v.fromBufferAttribute(p, i)
        const len = v.length()
        v.lerp(v.clone().multiplyScalar(1.05 / len), 0.32)
        p.setXYZ(i, v.x, v.y, v.z)
      }
      return smoothed(fitUnit(g))
    }
    case 'heart':
      return smoothed(fitUnit(puffy(heartShape(), 0.55)))
    case 'star':
      return smoothed(fitUnit(puffy(starShape(), 0.5)))
    case 'bunny':
      return fitUnit(
        mergeGeometries([
          plain(sphere()),
          part(small(), { position: [-0.42, 1.25, 0], rotation: [0, 0, 0.22], scale: [0.26, 0.62, 0.2] }),
          part(small(), { position: [0.42, 1.25, 0], rotation: [0, 0, -0.22], scale: [0.26, 0.62, 0.2] }),
        ]),
      )
    case 'gem': {
      const g = new OctahedronGeometry(1, 0)
      g.scale(1, 1.3, 1)
      return faceted(fitUnit(g))
    }
    case 'cloud':
      return fitUnit(
        mergeGeometries([
          plain(sphere()),
          part(small(), { position: [-0.85, -0.2, 0], scale: [0.62, 0.62, 0.62] }),
          part(small(), { position: [0.85, -0.2, 0], scale: [0.62, 0.62, 0.62] }),
          part(small(), { position: [-0.4, 0.55, 0.2], scale: [0.55, 0.55, 0.55] }),
          part(small(), { position: [0.45, 0.5, -0.2], scale: [0.5, 0.5, 0.5] }),
        ]),
      )
    case 'pill':
      return smoothed(fitUnit(new CapsuleGeometry(0.62, 0.95, detail ? 10 : 6, seg)))
    case 'planet':
      return fitUnit(
        mergeGeometries([plain(sphere()), part(new TorusGeometry(1.45, 0.08, 4, seg + 8), { rotation: [Math.PI / 2 - 0.35, 0, 0.2], scale: [1, 1, 0.5] })]),
      )
    case 'crystal':
      return faceted(fitUnit(new IcosahedronGeometry(1, 0)))
    case 'twin':
      return fitUnit(mergeGeometries([part(sphere(), { position: [-0.5, -0.1, 0], scale: [0.8, 0.8, 0.8] }), part(small(), { position: [0.55, 0.15, 0], scale: [0.62, 0.62, 0.62] })]))
    case 'egg': {
      const g = sphere()
      const p = g.getAttribute('position')
      for (let i = 0; i < p.count; i += 1) {
        const y = p.getY(i)
        const k = 1 - 0.2 * Math.max(0, y)
        p.setXYZ(i, p.getX(i) * k, y * 1.25, p.getZ(i) * k)
      }
      return smoothed(fitUnit(g))
    }
    case 'dodeca':
      return faceted(fitUnit(new DodecahedronGeometry(1, 0)))
    case 'atom': {
      const torus = () => new TorusGeometry(1.35, 0.05, 4, seg + 8)
      return fitUnit(
        mergeGeometries([
          plain(sphere()),
          part(torus(), { rotation: [Math.PI / 2, 0, 0], scale: [1, 0.45, 1] }),
          part(torus(), { rotation: [Math.PI / 2, 0, Math.PI / 3], scale: [1, 0.45, 1] }),
          part(torus(), { rotation: [Math.PI / 2, 0, -Math.PI / 3], scale: [1, 0.45, 1] }),
        ]),
      )
    }
    case 'blossom': {
      const petals = []
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2
        petals.push(part(small(), { position: [Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0], rotation: [0, 0, a], scale: [0.5, 0.36, 0.3] }))
      }
      return fitUnit(mergeGeometries([plain(sphere()), ...petals]))
    }
    default:
      return fitUnit(sphere())
  }
}

const geometries = new Map()
/**
 * The geometry of shape `name`, built on first use and shared from then on. `detail`
 * false builds it with fewer segments (the shop's small bubbles, and everything on LOW).
 */
export function bubbleGeometry(name, detail = true) {
  const key = detail ? name : `${name}:lo`
  let g = geometries.get(key)
  if (!g) {
    g = buildShape(name, detail)
    g.computeBoundingSphere()
    geometries.set(key, g)
  }
  return g
}

/** The geometry for bubble `id`. */
export const bubbleShapeOf = (id, detail = true) => bubbleGeometry(bubbleStyle(id).shape, detail)

// --- The soap film ---------------------------------------------------------------------

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying vec3 vWorld;
  varying vec3 vColA;
  varying vec3 vColB;
  varying vec2 vFilmGlow;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec2 uFilmGlow;
  #ifdef DISPLAY
    attribute vec3 aCenter;
    attribute vec3 aColA;
    attribute vec3 aColB;
    attribute vec3 aParams;
  #endif
  #ifdef DRIFT
    attribute vec4 aBase;
    attribute vec4 aDrift;
  #endif
  void main() {
    vec3 p = position;
    vec3 n = normal;
    vColA = uColA;
    vColB = uColB;
    vFilmGlow = uFilmGlow;
    #ifdef DISPLAY
      // A shop bubble: turning on the spot and bobbing over its stand, all on the GPU.
      float spin = uTime * 0.6 + aParams.x;
      float c = cos(spin);
      float s = sin(spin);
      p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
      n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
      p += aCenter + vec3(0.0, sin(uTime * 1.6 + aParams.x) * 0.15, 0.0);
      vColA = aColA;
      vColB = aColB;
      vFilmGlow = aParams.yz;
    #endif
    #ifdef DRIFT
      // An ambient bubble: rising from its base, wobbling, swelling in and popping out
      // at the top - then round again. Nothing is moved on the CPU.
      float t = fract(uTime * aDrift.y + aDrift.x);
      float grow = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.86, 1.0, t));
      p *= aBase.w * grow;
      p += aBase.xyz + vec3(sin(t * 6.2832 + aDrift.x * 7.0) * aDrift.w, t * aDrift.z, cos(t * 5.0 + aDrift.x * 5.0) * aDrift.w);
    #endif
    vec4 world = vec4(p, 1.0);
    #ifdef USE_INSTANCING
      world = instanceMatrix * world;
      n = mat3(instanceMatrix) * n;
    #endif
    world = modelMatrix * world;
    vWorld = world.xyz;
    #ifdef USE_INSTANCING_COLOR
      vColA = instanceColor;
      vColB = mix(instanceColor, vec3(1.0), 0.6);
    #endif
    vec4 mv = viewMatrix * world;
    vViewV = -mv.xyz;
    vNormalV = normalize(mat3(viewMatrix) * normalize(mat3(modelMatrix) * n));
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying vec3 vWorld;
  varying vec3 vColA;
  varying vec3 vColB;
  varying vec2 vFilmGlow;
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(vViewV);
    if (!gl_FrontFacing) n = -n;
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    // Wide enough that a flat face (a star's, a heart's, a cube's) still reads face-on.
    float rim = pow(1.0 - ndv, 1.7);
    // The soap film: thin-film rainbow bands sliding over the surface as it turns.
    float swirl = sin(vWorld.x * 1.7 + vWorld.z * 0.9 + uTime * 0.9) + sin(vWorld.y * 2.1 - uTime * 0.7);
    vec3 film = 0.55 + 0.45 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + ndv * 1.4 + swirl * 0.12 + uTime * 0.04));
    vec3 tint = mix(vColA, vColB, 0.5 + 0.5 * sin(vWorld.y * 1.3 + swirl));
    vec3 col = mix(tint, film, vFilmGlow.x * (0.25 + 0.6 * rim));
    // A bright window highlight up top, a softer one opposite, and a sheen.
    float hiA = smoothstep(0.93, 0.985, dot(n, normalize(vec3(-0.42, 0.62, 0.66))));
    float hiB = smoothstep(0.96, 1.0, dot(n, normalize(vec3(0.5, -0.45, 0.74)))) * 0.45;
    vec3 h = normalize(normalize(vec3(-0.3, 0.8, 0.5)) + v);
    float spec = pow(max(dot(n, h), 0.0), 48.0) * 0.6;
    col = col * (0.75 + rim * 0.8 + vFilmGlow.y * 0.6) + vec3(hiA + hiB + spec);
    float alpha = clamp((0.3 + rim * 0.7 + vFilmGlow.y * 0.25 + hiA + hiB + spec) * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`

/**
 * The soap-film material. `display` animates merged shop bubbles round their own
 * centres (aCenter/aColA/aColB/aParams attributes); `drift` animates ambient bubbles
 * rising from their bases (aBase/aDrift instanced attributes). Neither: a plain bubble
 * tinted by `a`/`b` (or by instance colours on an InstancedMesh). Program code is the
 * same across every variant's defines, and the time is the shared glow clock.
 */
export function createBubbleMaterial({ id = 'soap', display = false, drift = false, opacity = 1 } = {}) {
  const style = bubbleStyle(id)
  const defines = {}
  if (display) defines.DISPLAY = ''
  if (drift) defines.DRIFT = ''
  return new ShaderMaterial({
    uniforms: {
      uTime: glowTime,
      uOpacity: { value: opacity },
      uColA: { value: new Color(style.a) },
      uColB: { value: new Color(style.b) },
      uFilmGlow: { value: new Vector2(style.film ?? 0.5, style.glow ?? 0) },
    },
    defines,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  })
}

/** Re-tints a plain bubble material as bubble `id`. Allocation-free. */
export function setBubbleLook(material, id) {
  const style = bubbleStyle(id)
  const u = material.uniforms
  u.uColA.value.set(style.a)
  u.uColB.value.set(style.b)
  u.uFilmGlow.value.set(style.film ?? 0.5, style.glow ?? 0)
}

/** A plain bubble mesh for bubble `id` (a rider, a launch bubble). */
export function createBubbleMesh(id = 'soap', detail = true) {
  const mesh = new Mesh(bubbleShapeOf(id, detail), createBubbleMaterial({ id }))
  mesh.userData.bubbleId = id
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  return mesh
}

/** Turns `mesh` into bubble `id`: its shape and tint. Cheap when it already is. */
export function setBubbleMesh(mesh, id, detail = true) {
  if (mesh.userData.bubbleId === id) return
  mesh.userData.bubbleId = id
  mesh.geometry = bubbleShapeOf(id, detail)
  setBubbleLook(mesh.material, id)
}

/**
 * Every shop bubble in one mesh, one draw call: each `items[i] = { id, x, y, z, scale }`
 * merged at its own place, turning and bobbing in the vertex shader. Rebuilt never: the
 * stands don't move.
 */
export function createBubbleDisplay(items) {
  const parts = items.map((item, i) => {
    const style = bubbleStyle(item.id)
    // The shop's bubbles are small: the low-detail shapes are plenty.
    const g = bubbleShapeOf(item.id, false).clone()
    const plainG = g.index ? g.toNonIndexed() : g
    plainG.scale(item.scale, item.scale, item.scale)
    const count = plainG.getAttribute('position').count
    const centre = new Float32Array(count * 3)
    const colA = new Float32Array(count * 3)
    const colB = new Float32Array(count * 3)
    const params = new Float32Array(count * 3)
    const a = new Color(style.a)
    const b = new Color(style.b)
    for (let v = 0; v < count; v += 1) {
      centre.set([item.x, item.y, item.z], v * 3)
      colA.set([a.r, a.g, a.b], v * 3)
      colB.set([b.r, b.g, b.b], v * 3)
      params.set([i * 0.7, style.film ?? 0.5, style.glow ?? 0], v * 3)
    }
    plainG.setAttribute('aCenter', new BufferAttribute(centre, 3))
    plainG.setAttribute('aColA', new BufferAttribute(colA, 3))
    plainG.setAttribute('aColB', new BufferAttribute(colB, 3))
    plainG.setAttribute('aParams', new BufferAttribute(params, 3))
    for (const name of Object.keys(plainG.attributes)) {
      if (!['position', 'normal', 'aCenter', 'aColA', 'aColB', 'aParams'].includes(name)) plainG.deleteAttribute(name)
    }
    if (g !== plainG) g.dispose()
    return plainG
  })
  const geometry = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  const mesh = new Mesh(geometry, createBubbleMaterial({ display: true }))
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  return mesh
}

/** Every bubble id, in shop order. */
export const BUBBLE_IDS = TIRES.map((t) => t.id)
