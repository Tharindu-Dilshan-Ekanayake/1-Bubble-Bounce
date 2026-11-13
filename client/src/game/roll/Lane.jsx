import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  CanvasTexture,
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'

import { zoneIndexAt } from '@shared/logic'

import { getQuality } from '../../store/quality'
import { BlockSet, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { PALETTE, TEAM, venueOf } from '../sceneStyle'
import { PIECE_PARTS, sceneryPiece } from './scenery'
import { activeWorld, blendSky, zones } from '../worldLook'
import { SLOPE_EULER_X, slopeBoxMatrix, trackPoint } from './path'
import { roll } from './rollControl'
import { stageLookAt, stageLooks } from './stageLooks'
import { LANE_STRIPE } from './themes'

/**
 * The bounce valley: a long strip running north from the Blow Zone, every stage in the
 * ground of its own scene (shared/balance.js ZONES `scene`: meadow grass, a village's
 * dirt road, town and city asphalt, harbour planks, beach sand, snow, candy, moon dust...)
 * in a checker of light and dark squares - each stage in a bright colour of its own
 * (stageLooks.js), the strip and ground beside it tinted to match - a white line every 10 metres (a heavier one
 * every 50) with its distance painted beside it ("1,340 m"), a tall yellow distance gate
 * every 100 metres to bounce over, a banner arch over the start of every stage with its
 * name and length ("Maple Town - 112 M"), and either side the stage's scenery
 * (scenery.js): cottages, barns, houses, skyscrapers, lighthouses, palms, igloos, candy
 * houses, giant mushrooms, crystals, domes. Each stage brings its own sky too (blended in
 * as the bubble gets there: ZONE_THEMES), and a glowing line across the valley where it
 * starts.
 *
 * Nothing is built per stretch of valley. A fixed set of pieces - ground squares, turf
 * bands, yard lines/gates/arches, CITY_SLOTS pieces of scenery, a pool of numerals and the
 * banner arches' name boards - is moved along to wherever you're looking (the bubble in
 * flight, the start from the lobby) and recoloured for the stage it lands in. Six draw
 * calls, the same at 60 m or 16 km, and nothing allocated while it runs. On LOW the
 * scenery is sparser and the view shorter (the preset's decorDensity and viewDistance).
 *
 * Layers that lie on each other are always at least 3 cm apart (turf 0.04, lines 0.05-0.09,
 * stage lines 0.14, everything standing on the turf from 0.04), so nothing z-fights.
 */

const STRIPE = LANE_STRIPE
/** Bands drawn at once: an even number, so each band keeps its light/dark as it's reused. */
const STRIPES = 128
/** Width of the pitch. */
export const LANE_WIDTH = 18
const FIELD_WIDTH = 280
/** The field and pitch start this far behind the focus (never before the start line). */
const BEHIND = 40
const FIELD_LENGTH = STRIPES * STRIPE
/** The ground is laid in squares this long, each in its stage's look. */
const SEGMENT = 8
const SEGMENTS = FIELD_LENGTH / SEGMENT
/** Ground boxes: the squares, the pitch's two sidelines, the rails along the boards, then the stage lines. */
const EDGE = SEGMENTS
const CAP = SEGMENTS + 2
const STAGE_LINE = SEGMENTS + 4
const STAGE_LINES = 7
/** The top of the turf; everything standing on it starts here. */
const TURF_TOP = 0.04
/** The venue of the world being shown (sceneStyle VENUES): its colours, and whether it's the beach. */
const venue = () => venueOf(activeWorld())
/** The edge rails stand here, along the valley; the turf runs out to SIDE_TURF_X either side. */
const WALL_X = LANE_WIDTH / 2 + 1.2
const SIDE_TURF_X = 44

/** Scenery: one piece every CITY_EVERY metres, alternating sides, PARTS boxes each. */
const CITY_EVERY = 8
const CITY_SLOTS = Math.ceil(FIELD_LENGTH / CITY_EVERY) + 2
const PARTS = PIECE_PARTS

/** Parsed colours, by hex, so recolouring allocates nothing once warmed up. */
const colorCache = new Map()
function colorOf(hex) {
  let c = colorCache.get(hex)
  if (!c) {
    c = new Color(hex)
    colorCache.set(hex, c)
  }
  return c
}

/** The rainbow stages' floor: every band round the rainbow. */
const RAINBOW = ['#ff5a5a', '#ff9a2e', '#ffd93a', '#5fdc4a', '#3fd6e8', '#4f86ff', '#a465ff', '#ff6bd0']
/**
 * The valley floor's colour for band `k` at metre `meter`: the stage's own light or dark
 * square (stageLooks.js) - round the rainbow, band by band, on a rainbow stage.
 */
const runwayAt = (meter, k) => {
  if (zones()[zoneIndexAt(meter)].scene === 'rainbow') return colorOf(RAINBOW[Math.floor(k / 2) % RAINBOW.length])
  return stageLookAt(meter).runway[k % 2]
}
/** Each stage's sky, parsed once per world. */
/** A stable pseudo-random 0-1 for piece `k` (and a salt): the same on every client. */
function hash(k, salt) {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2d)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

// --- Lines, distance gates, floodlights and banner arches (one box mesh) -----------------

const YARD_EVERY = 10
const YARD_LINES = Math.ceil(FIELD_LENGTH / YARD_EVERY) + 2
const POST_EVERY = 100
const POST_SLOTS = 8
const POST_PARTS = 5
const TOWER_SLOTS = 8
const TOWER_PARTS = 2
const BANNERS = 8
const BANNER_PARTS = 4
const GOALPOSTS = YARD_LINES
const TOWERS = GOALPOSTS + POST_SLOTS * POST_PARTS
const ARCHES = TOWERS + TOWER_SLOTS * 2 * TOWER_PARTS
/** The distance gates' height (to their beam) and half their spread. */
const GATE_HEIGHT = 12
const POST_HALF = 4.1
/** The banner arches stand at the pitch's edges (their pillars between the sideline and the boards). */
const ARCH_HALF = LANE_WIDTH / 2 + 0.6
const ARCH_HEIGHT = 9
/** Banner boards: size on the arch, and the height of their middle. */
const BANNER = { width: 14, height: 3.5, y: 7.4 }
const YELLOW = '#ffd21f'
const WHITE = '#f4f7fb'
const NAVY = TEAM.navy

/** Every mark's colour and style by its role, in slot order (placed and re-placed in placeMarks). */
function createMarks() {
  const set = new BlockSet()
  for (let i = 0; i < YARD_LINES; i += 1) set.add(0, 0, 0, 0, 0, 0, WHITE, STYLE.SMOOTH)
  for (let i = 0; i < POST_SLOTS; i += 1) {
    set.add(0, 0, 0, 0, 0, 0, WHITE, STYLE.SMOOTH)
    for (let part = 1; part < POST_PARTS; part += 1) set.add(0, 0, 0, 0, 0, 0, YELLOW, STYLE.SMOOTH)
  }
  for (let i = 0; i < TOWER_SLOTS * 2; i += 1) {
    set.add(0, 0, 0, 0, 0, 0, '#cfd6e4', STYLE.SMOOTH)
    set.add(0, 0, 0, 0, 0, 0, '#fffbe0', STYLE.GLOW)
  }
  for (let i = 0; i < BANNERS; i += 1) {
    set.add(0, 0, 0, 0, 0, 0, YELLOW, STYLE.STRIPES)
    set.add(0, 0, 0, 0, 0, 0, YELLOW, STYLE.STRIPES)
    set.add(0, 0, 0, 0, 0, 0, YELLOW, STYLE.GLOW)
    set.add(0, 0, 0, 0, 0, 0, NAVY, STYLE.SMOOTH)
  }
  const mesh = set.build(sharedMaterials().blocks)
  mesh.frustumCulled = false
  return mesh
}

/** Distances painted beside every line: "1,340 m". */
const MARK_EVERY = YARD_EVERY
const MAX_GLYPHS = 340
/** Glyph cells in the atlas, and their size on the runway (metres). */
const CHARS = '0123456789,m'
const COMMA = 10
const UNIT_M = 11
const GLYPH_W = 1.6
const GLYPH_H = 2.6
const ADVANCE = { digit: 1.4, comma: 0.7, space: 0.8 }
const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'

/** Glyphs lie flat on the slope, upright as read from behind (looking down the field). */
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2 + SLOPE_EULER_X, 0, 0))
const _m = new Matrix4()
const _p = new Vector3()
const _s = new Vector3()
const ZERO = new Matrix4().makeScale(0, 0, 0)
/** One label's glyph cells, reused: at most "99,999,999 m". */
const label = new Int8Array(20)
/** Stage starts in the laid stretch (yard lines there make way for the stage line). */
const starts = new Float64Array(STAGE_LINES + 1)

/** Writes the glyph cells of "1,344" for yard `n` into `label`; returns how many. */
function spell(n) {
  let digits = 0
  let count = 0
  // Digits right to left, a comma every three, then turned round in place.
  do {
    if (digits > 0 && digits % 3 === 0) label[count++] = COMMA
    label[count++] = n % 10
    n = Math.floor(n / 10)
    digits += 1
  } while (n > 0 && count < 13)
  for (let i = 0, j = count - 1; i < j; i += 1, j -= 1) {
    const t = label[i]
    label[i] = label[j]
    label[j] = t
  }
  return count
}

/** The atlas: each character white with a soft dark edge, in its own cell. */
function glyphAtlas(size) {
  const cell = size / 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = Math.round(cell * 1.6)
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  const draw = () => {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = `${Math.round(canvas.height * 0.8)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (let i = 0; i < CHARS.length; i += 1) {
      const x = (i + 0.5) * cell
      const y = canvas.height * 0.54
      ctx.lineWidth = canvas.height * 0.08
      ctx.strokeStyle = 'rgba(30, 40, 90, 0.35)'
      ctx.strokeText(CHARS[i], x, y)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(CHARS[i], x, y)
    }
    texture.needsUpdate = true
  }
  draw()
  document.fonts?.load(`64px ${FONT}`).then(draw, () => null)
  return texture
}

const glyphVertex = /* glsl */ `
  attribute float aGlyph;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = vec2((aGlyph + uv.x) / 16.0, uv.y);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`
const glyphFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uFar;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    // Fades out far down the field rather than shimmering into mush.
    float a = t.a * 0.9 * (1.0 - smoothstep(uFar * 0.6, uFar, vDepth));
    if (a < 0.02) discard;
    gl_FragColor = vec4(t.rgb, a);
    #include <colorspace_fragment>
  }
`

function createGlyphs() {
  const atlas = glyphAtlas(Math.min(512, getQuality().maxTexture || 512))
  const geometry = new PlaneGeometry(1, 1)
  const glyph = new InstancedBufferAttribute(new Float32Array(MAX_GLYPHS), 1)
  geometry.setAttribute('aGlyph', glyph)
  const material = new ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uFar: { value: 300 } },
    vertexShader: glyphVertex,
    fragmentShader: glyphFragment,
    transparent: true,
    depthWrite: false,
  })
  const mesh = new InstancedMesh(geometry, material, MAX_GLYPHS)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  mesh.userData.atlas = atlas
  return mesh
}

// --- The banner boards: one atlas row per arch, one instanced plane ------------------------

/** Atlas: BANNERS rows, each a quarter as tall as it is wide (the board's shape). */
const BANNER_COLS = 512
const BANNER_ROW = BANNER_COLS / 4

/** Paints arch `slot`'s board: name over its length, on navy in a gold frame. */
function drawBanner(canvas, slot, name, sub, frame = '#ffb81f') {
  const ctx = canvas.getContext('2d')
  // Laid out in BANNER_COLS units; the canvas may be smaller (createBanners).
  const k = canvas.width / BANNER_COLS
  ctx.setTransform(k, 0, 0, k, 0, 0)
  const y0 = slot * BANNER_ROW
  ctx.clearRect(0, y0, BANNER_COLS, BANNER_ROW)
  ctx.fillStyle = frame
  ctx.fillRect(0, y0, BANNER_COLS, BANNER_ROW)
  ctx.fillStyle = NAVY
  ctx.fillRect(7, y0 + 7, BANNER_COLS - 14, BANNER_ROW - 14)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  // The name as big as fits.
  ctx.font = `64px ${FONT}`
  const size = Math.min(66, (64 * (BANNER_COLS - 56)) / Math.max(1, ctx.measureText(name).width))
  ctx.font = `${size}px ${FONT}`
  const y = y0 + BANNER_ROW * 0.4
  ctx.lineWidth = size * 0.16
  ctx.strokeStyle = '#05091c'
  ctx.strokeText(name, BANNER_COLS / 2, y)
  const gradient = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45)
  gradient.addColorStop(0, '#fffbd0')
  gradient.addColorStop(0.5, '#ffd21f')
  gradient.addColorStop(1, '#ff9c00')
  ctx.fillStyle = gradient
  ctx.fillText(name, BANNER_COLS / 2, y)
  ctx.font = `26px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(sub, BANNER_COLS / 2, y0 + BANNER_ROW * 0.8)
}

const bannerVertex = /* glsl */ `
  attribute float aRow;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    // Canvas row 0 is the top of the atlas (flipY), so its v is the highest.
    vUv = vec2(uv.x, (${BANNERS}.0 - aRow - 1.0 + uv.y) / ${BANNERS}.0);
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const bannerFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(texture2D(uAtlas, vUv).rgb, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function createBanners() {
  const canvas = document.createElement('canvas')
  // Scaled down to the preset's texture cap (LOW: 256 x 512), drawn through that scale.
  const k = Math.min(1, (getQuality().maxTexture || 512) / (BANNER_ROW * BANNERS))
  canvas.width = Math.round(BANNER_COLS * k)
  canvas.height = Math.round(BANNER_ROW * BANNERS * k)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  const geometry = new PlaneGeometry(1, 1)
  const rows = new InstancedBufferAttribute(new Float32Array(BANNERS), 1)
  for (let i = 0; i < BANNERS; i += 1) rows.setX(i, i)
  geometry.setAttribute('aRow', rows)
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uAtlas: { value: null } }]),
    vertexShader: bannerVertex,
    fragmentShader: bannerFragment,
    fog: true,
  })
  // Set after the merge, never through it: UniformsUtils.merge clones textures, and the
  // boards would sample a frozen copy - showing stale names (or black) once re-lettered.
  material.uniforms.uAtlas.value = texture
  const mesh = new InstancedMesh(geometry, material, BANNERS)
  for (let i = 0; i < BANNERS; i += 1) mesh.setMatrixAt(i, ZERO)
  mesh.frustumCulled = false
  mesh.userData = { canvas, texture, texts: new Array(BANNERS).fill(null) }
  return mesh
}

/** Draws every board again (the font has just loaded). */
function redrawBanners(mesh) {
  const { canvas, texture, texts } = mesh.userData
  texts.forEach((t, slot) => t && drawBanner(canvas, slot, t[0], t[1], t[2]))
  texture.needsUpdate = true
}

/** The ground's squares, the pitch's sidelines, the rails along the boards, and the stage lines. */
function createField() {
  const set = new BlockSet()
  for (let i = 0; i < SEGMENTS; i += 1) set.add(0, 0, 0, 1, 1, 1, PALETTE.asphalt, STYLE.ROAD)
  for (let i = 0; i < 2; i += 1) set.add(0, 0, 0, 1, 1, 1, '#ffffff', STYLE.GLOW)
  for (let i = 0; i < 2; i += 1) set.add(0, 0, 0, 1, 1, 1, TEAM.gold, STYLE.GLOW)
  for (let i = 0; i < STAGE_LINES; i += 1) set.add(0, 0, 0, 1, 1, 1, '#ffffff', STYLE.GLOW)
  const mesh = set.build(sharedMaterials().blocks)
  mesh.frustumCulled = false
  return mesh
}

/** The skyline's boxes, PARTS to a building, placed and coloured as they come into view. */
function createCity() {
  const set = new BlockSet()
  for (let i = 0; i < CITY_SLOTS * PARTS; i += 1) set.add(0, 0, 0, 0, 0, 0, '#ffffff', STYLE.SMOOTH)
  const mesh = set.build(sharedMaterials().blocks)
  mesh.frustumCulled = false
  return mesh
}

const _sceneryOut = []
const _q = new Quaternion()
const _eul = new Euler()

/**
 * Piece `k` of scenery in its slot: whatever its stage's scene puts beside the valley
 * (scenery.js), on alternating sides, at a spot picked by a seeded hash - the same on
 * every client. The first 60 m (by the Blow Zone) stay clear; on LOW every other pair of
 * pieces is left out.
 */
function placeScenery(mesh, styles, k, sparse) {
  const slot = (k % CITY_SLOTS) * PARTS
  const metre = k * CITY_EVERY + CITY_EVERY / 2
  const side = k % 2 ? 1 : -1
  const skip = metre < 60 || (sparse && k % 4 >= 2)
  const parts = skip ? null : sceneryPiece(zones()[zoneIndexAt(metre)].scene, k, side, (salt) => hash(k, salt), (w) => side * (LANE_WIDTH / 2 + 3.5 + w / 2 + hash(k, 11) * 3), _sceneryOut)
  for (let i = 0; i < PARTS; i += 1) {
    if (!parts || i >= parts.length) {
      mesh.setMatrixAt(slot + i, ZERO)
      continue
    }
    const [px, py, pz, sx, sy, sz, c, style, rx = 0, ry = 0, rz = 0] = parts[i]
    trackPoint(metre + pz, px, py, _p)
    _q.setFromEuler(_eul.set(rx, ry, rz))
    mesh.setMatrixAt(slot + i, _m.compose(_p, _q, _s.set(sx, sy, sz)))
    mesh.setColorAt(slot + i, colorOf(c))
    styles[slot + i] = style
  }
}

/**
 * The turf's bands: instance k % STRIPES is band k, light or dark by k's parity, in its
 * stage's greens - the pitch itself, then (after them) the sideline turf either side of it,
 * out past the stands, mown in the same bands.
 */
function createStripes() {
  const set = new BlockSet()
  for (let i = 0; i < STRIPES; i += 1) set.add(0, 0, 0, 1, 1, 1, PALETTE.turf[i % 2], STYLE.CHECKER)
  for (let i = 0; i < STRIPES * 2; i += 1) set.add(0, 0, 0, 1, 1, 1, PALETTE.turf[(i >> 1) % 2], STYLE.SMOOTH)
  const mesh = set.build(sharedMaterials().blocks)
  mesh.frustumCulled = false
  return mesh
}

const mark = (marks, i, m, x, h, sx, sy, sz) => marks.setMatrixAt(i, slopeBoxMatrix(m, x, h, sx, sy, sz, 0, _m))

/**
 * Lays the yard lines, goalposts, floodlights and banner arches for the stretch from
 * `from` on. The arches' name boards (`banners`) are re-lettered only where the stage in
 * a slot has changed (`laid.banners`).
 */
function placeMarks(marks, banners, from, laid) {
  const to = from + FIELD_LENGTH
  const stages = zones()
  // Where stages start in this stretch: their glowing line replaces the yard line there.
  let nStarts = 0
  for (let i = 1; i < stages.length && nStarts < starts.length; i += 1) {
    if (stages[i].start >= from - 2 && stages[i].start <= to + 2) starts[nStarts++] = stages[i].start
  }
  // A white line across the pitch every 10 yards, heavier every 50.
  const j0 = Math.ceil(from / YARD_EVERY)
  for (let j = j0; j < j0 + YARD_LINES; j += 1) {
    const m = j * YARD_EVERY
    let clash = false
    for (let s = 0; s < nStarts; s += 1) if (Math.abs(starts[s] - m) < 1.2) clash = true
    if (clash) marks.setMatrixAt(j % YARD_LINES, ZERO)
    else mark(marks, j % YARD_LINES, m, 0, 0.07, LANE_WIDTH, 0.04, j % 5 === 0 ? 0.7 : 0.35)
  }
  // A distance gate every 100 metres (not at the start): a banner strip, two pillars, the
  // beam across their tops and a marker on it.
  const p0 = Math.max(1, Math.ceil(from / POST_EVERY))
  for (let p = p0; p < p0 + POST_SLOTS; p += 1) {
    const base = GOALPOSTS + (p % POST_SLOTS) * POST_PARTS
    const m = p * POST_EVERY
    if (m > to) {
      for (let i = 0; i < POST_PARTS; i += 1) marks.setMatrixAt(base + i, ZERO)
      continue
    }
    mark(marks, base, m, 0, GATE_HEIGHT - 0.7, POST_HALF * 2 - 0.4, 0.5, 0.4)
    mark(marks, base + 1, m, -POST_HALF, GATE_HEIGHT / 2, 0.6, GATE_HEIGHT, 0.6)
    mark(marks, base + 2, m, POST_HALF, GATE_HEIGHT / 2, 0.6, GATE_HEIGHT, 0.6)
    mark(marks, base + 3, m, 0, GATE_HEIGHT, POST_HALF * 2 + 0.6, 0.6, 0.6)
    mark(marks, base + 4, m, 0, GATE_HEIGHT + 0.75, 0.9, 0.9, 0.9)
  }
  // A floodlight tower either side every 100 yards, halfway between the posts, behind the pavilions.
  const t0 = Math.max(0, Math.ceil((from - 50) / 100))
  for (let t = t0; t < t0 + TOWER_SLOTS; t += 1) {
    const m = t * 100 + 50
    for (let side = 0; side < 2; side += 1) {
      const base = TOWERS + ((t % TOWER_SLOTS) * 2 + side) * TOWER_PARTS
      if (m > to) {
        marks.setMatrixAt(base, ZERO)
        marks.setMatrixAt(base + 1, ZERO)
        continue
      }
      if (!venue().beach) {
        marks.setMatrixAt(base, ZERO)
        marks.setMatrixAt(base + 1, ZERO)
        continue
      }
      const s = side ? 1 : -1
      mark(marks, base, m, s * 27, TURF_TOP + 8.5, 1, 17, 1)
      mark(marks, base + 1, m, s * 26.1, 18, 0.8, 3, 5.4)
    }
  }
  // A banner arch over the start of each stage in view, its name board on the front.
  for (let i = 0; i < BANNERS * BANNER_PARTS; i += 1) marks.setMatrixAt(ARCHES + i, ZERO)
  for (let i = 0; i < BANNERS; i += 1) banners.setMatrixAt(i, ZERO)
  for (let i = 0; i < stages.length; i += 1) {
    // The first stage's arch stands just past the start line; the rest at their starts.
    const m = i === 0 ? 8 : stages[i].start
    if (m < from - 30 || m > to) continue
    const slot = i % BANNERS
    const base = ARCHES + slot * BANNER_PARTS
    const gate = stageLooks()[i].accent
    mark(marks, base, m, -ARCH_HALF, TURF_TOP + ARCH_HEIGHT / 2, 0.8, ARCH_HEIGHT, 0.8)
    mark(marks, base + 1, m, ARCH_HALF, TURF_TOP + ARCH_HEIGHT / 2, 0.8, ARCH_HEIGHT, 0.8)
    mark(marks, base + 2, m, 0, ARCH_HEIGHT + 0.64, ARCH_HALF * 2 + 0.8, 1.2, 1.2)
    mark(marks, base + 3, m, 0, BANNER.y, BANNER.width + 0.4, BANNER.height + 0.4, 0.4)
    for (let part = 0; part < 3; part += 1) marks.setColorAt(base + part, gate)
    banners.setMatrixAt(slot, slopeBoxMatrix(m - 0.45, 0, BANNER.y, BANNER.width, BANNER.height, 1, 0, _m))
    const key = `${laid.world}:${i}`
    if (laid.banners[slot] !== key) {
      laid.banners[slot] = key
      const length = (stages[i + 1]?.start ?? stages[i].start + 100) - stages[i].start
      const frame = stageLooks()[i].accentHex
      banners.userData.texts[slot] = [stages[i].name, `${length} M`, frame]
      drawBanner(banners.userData.canvas, slot, stages[i].name, `${length} M`, frame)
      banners.userData.texture.needsUpdate = true
    }
  }
  marks.instanceMatrix.needsUpdate = true
  marks.instanceColor.needsUpdate = true
  banners.instanceMatrix.needsUpdate = true
}

export default function Lane() {
  const scene = useThree((s) => s.scene)
  const fieldRef = useRef(null)
  const stripesRef = useRef(null)
  const cityRef = useRef(null)
  const glyphsRef = useRef(null)
  const marksRef = useRef(null)
  const bannersRef = useRef(null)
  /**
   * What the pieces were last laid out for: the first band, the first marker, the world,
   * the scenery density, and which building, pavilion segment and banner each slot holds.
   */
  const laidFor = useRef({
    band: -1,
    mark: -1,
    far: 0,
    world: -1,
    sparse: false,
    slots: new Int32Array(CITY_SLOTS).fill(-1),
    banners: new Array(BANNERS).fill(null),
  })
  const assets = useMemo(
    () => ({
      field: createField(),
      stripes: createStripes(),
      city: createCity(),
      glyphs: createGlyphs(),
      marks: createMarks(),
      banners: createBanners(),
    }),
    [],
  )

  // The boards' lettering again once the font is in.
  useEffect(() => {
    let cancelled = false
    document.fonts?.load(`64px ${FONT}`).then(
      () => !cancelled && redrawBanners(assets.banners),
      () => null,
    )
    return () => {
      cancelled = true
    }
  }, [assets])

  useEffect(
    () => () => {
      disposeBlocks(assets.field)
      disposeBlocks(assets.stripes)
      disposeBlocks(assets.city)
      disposeBlocks(assets.marks)
      assets.glyphs.geometry.dispose()
      assets.glyphs.material.dispose()
      assets.glyphs.userData.atlas.dispose()
      assets.glyphs.dispose()
      assets.banners.geometry.dispose()
      assets.banners.material.dispose()
      assets.banners.userData.texture.dispose()
      assets.banners.dispose()
    },
    [assets],
  )

  useFrame((_state, delta) => {
    const field = fieldRef.current
    const stripes = stripesRef.current
    const city = cityRef.current
    const glyphs = glyphsRef.current
    const marks = marksRef.current
    const banners = bannersRef.current
    if (!field || !stripes || !city || !glyphs || !marks || !banners) return
    const focus = roll.active ? Math.max(0, roll.meter) : 0

    // The sky of the stage the ball is over, eased in. (Roll.jsx puts the lobby's back after.)
    if (roll.active) blendSky(stageLookAt(focus).sky, 1 - Math.exp(-2.5 * Math.min(delta, 0.1)), scene.fog)

    const laid = laidFor.current
    const band = Math.floor(Math.max(0, focus - BEHIND) / STRIPE)
    const world = activeWorld()
    const beach = venue().beach
    const sparse = getQuality().decorDensity < 0.5
    if (world !== laid.world || sparse !== laid.sparse) {
      // Another world's stages, or another density of scenery: lay everything afresh.
      laid.world = world
      laid.sparse = sparse
      laid.band = -1
      laid.slots.fill(-1)
      laid.banners.fill(null)
    }

    if (band !== laid.band) {
      laid.band = band
      const from = band * STRIPE
      const mid = from + FIELD_LENGTH / 2
      // The ground's squares, each in the ground of the stage's scene.
      const fieldStyles = field.geometry.getAttribute('aStyle')
      const first = Math.floor(from / SEGMENT)
      for (let j = first; j < first + SEGMENTS; j += 1) {
        const slot = j % SEGMENTS
        const m = j * SEGMENT + SEGMENT / 2
        field.setMatrixAt(slot, slopeBoxMatrix(m, 0, -0.5, FIELD_WIDTH, 1, SEGMENT, 0, _m))
        field.setColorAt(slot, stageLookAt(m).ground)
        fieldStyles.array[slot] = STYLE.STUDS
      }
      for (let side = 0; side < 2; side += 1) {
        const s = side ? 1 : -1
        field.setMatrixAt(EDGE + side, slopeBoxMatrix(mid, s * (LANE_WIDTH / 2 + 0.35), 0.08, 0.7, 0.04, FIELD_LENGTH, 0, _m))
        if (beach) field.setMatrixAt(CAP + side, slopeBoxMatrix(mid, s * WALL_X, TURF_TOP + 1.32, 0.7, 0.12, FIELD_LENGTH, 0, _m))
        else field.setMatrixAt(CAP + side, ZERO)
        field.setColorAt(CAP + side, colorOf(venue().accent))
      }
      // A glowing line across the pitch where each stage starts, in its colour.
      const stages = zones()
      let line = 0
      for (let i = 1; i < stages.length && line < STAGE_LINES; i += 1) {
        const start = stages[i].start
        if (start < from || start > from + FIELD_LENGTH) continue
        field.setMatrixAt(STAGE_LINE + line, slopeBoxMatrix(start, 0, 0.11, LANE_WIDTH - 0.2, 0.06, 1.4, 0, _m))
        field.setColorAt(STAGE_LINE + line, stageLooks()[i].accent)
        line += 1
      }
      for (; line < STAGE_LINES; line += 1) field.setMatrixAt(STAGE_LINE + line, ZERO)
      field.instanceMatrix.needsUpdate = true
      field.instanceColor.needsUpdate = true
      fieldStyles.needsUpdate = true

      // Skyline coming into view takes the slots of the buildings left behind.
      const cityStyles = city.geometry.getAttribute('aStyle')
      const k0 = Math.floor(from / CITY_EVERY)
      let placed = false
      for (let k = k0; k < k0 + CITY_SLOTS; k += 1) {
        if (laid.slots[k % CITY_SLOTS] === k) continue
        laid.slots[k % CITY_SLOTS] = k
        placeScenery(city, cityStyles.array, k, sparse)
        placed = true
      }
      if (placed) {
        city.instanceMatrix.needsUpdate = true
        city.instanceColor.needsUpdate = true
        cityStyles.needsUpdate = true
      }

      // Lines, distance gates, floodlights, banner arches.
      placeMarks(marks, banners, from, laid)

      // Each band index k always lands on instance k % STRIPES, so its light/dark never
      // changes; its greens follow the stage it's in.
      for (let k = band; k < band + STRIPES; k += 1) {
        const m = k * STRIPE + STRIPE / 2
        stripes.setMatrixAt(k % STRIPES, slopeBoxMatrix(m, 0, TURF_TOP / 2, LANE_WIDTH, TURF_TOP, STRIPE, 0, _m))
        // The valley floor in its scene's ground; the strip beside it likewise.
        stripes.setColorAt(k % STRIPES, runwayAt(m, k))
        const turf = stageLookAt(m).turf[k % 2]
        for (let side = 0; side < 2; side += 1) {
          const s = side ? 1 : -1
          const i = STRIPES + (k % STRIPES) * 2 + side
          stripes.setMatrixAt(i, slopeBoxMatrix(m, (s * (LANE_WIDTH / 2 + SIDE_TURF_X)) / 2, TURF_TOP / 2, SIDE_TURF_X - LANE_WIDTH / 2, TURF_TOP, STRIPE, 0, _m))
          stripes.setColorAt(i, turf)
        }
      }
      stripes.instanceMatrix.needsUpdate = true
      stripes.instanceColor.needsUpdate = true
    }

    // The painted distances, from just behind the focus to as far as the preset sees.
    const far = Math.min(getQuality().viewDistance, 420)
    const first = Math.max(1, Math.floor((focus - 20) / MARK_EVERY))
    if (first === laid.mark && far === laid.far) return
    laid.mark = first
    laid.far = far
    glyphs.material.uniforms.uFar.value = far
    const cells = glyphs.geometry.getAttribute('aGlyph')
    let n = 0
    for (let k = first; k * MARK_EVERY < focus + far && n < MAX_GLYPHS - 20; k += 1) {
      const metre = k * MARK_EVERY
      const count = spell(metre)
      label[count] = UNIT_M
      const total = count + 1
      let width = ADVANCE.space
      for (let i = 0; i < total; i += 1) width += label[i] === COMMA ? ADVANCE.comma : ADVANCE.digit
      let x = -width / 2
      for (let i = 0; i < total; i += 1) {
        const cell = label[i]
        const advance = cell === COMMA ? ADVANCE.comma : ADVANCE.digit
        if (i === count) x += ADVANCE.space
        // Just short of its line (towards the launch pad), reading from behind you.
        trackPoint(metre - 1.9, x + advance / 2, 0.08, _p)
        glyphs.setMatrixAt(n, _m.compose(_p, FLAT, _s.set(GLYPH_W, GLYPH_H, 1)))
        cells.setX(n, cell)
        n += 1
        x += advance
      }
    }
    glyphs.count = n
    glyphs.instanceMatrix.needsUpdate = true
    cells.needsUpdate = true
  })

  return (
    <>
      <primitive ref={fieldRef} object={assets.field} />
      <primitive ref={stripesRef} object={assets.stripes} />
      <primitive ref={cityRef} object={assets.city} />
      <primitive ref={glyphsRef} object={assets.glyphs} />
      <primitive ref={marksRef} object={assets.marks} />
      <primitive ref={bannersRef} object={assets.banners} />
    </>
  )
}
