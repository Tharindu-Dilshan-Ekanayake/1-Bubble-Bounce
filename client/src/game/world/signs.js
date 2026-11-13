import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Euler,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three'

import { LAUNCH_STAND, MAX_PULL, ROLL_ZONE, SHOP_SIGN, SHOP_SIGN_FACING } from '@shared/world'

import { venueOf } from '../sceneStyle'
import { DECAL_Y, DIGIT, DIRECTIONS, END_ZONE_TEXT, LOGO, yardNumbers } from './pitch'
import { ARCH_SIGN } from './rollZone'

const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'

const GOLD = ['#fffbd0', '#ffd21f', '#ff8a00']
const NAVY = ['#5a6cb0', '#1a2a66', '#0a1232']
const WHITE = ['#ffffff', '#ffffff', '#e6ecf5']

/**
 * Big chunky lettering painted into one rectangle `[rx, ry, rw, rh]` of the shared atlas,
 * slanted by shear (the font has no italic face): a solid extruded edge in `edge` under a
 * thick dark outline, the face filled with a top-to-bottom gradient of `fill` stops, and a
 * glossy band across the top of each letter. Clipped to its own rectangle, so signs
 * can't spill into each other.
 */
function paintText(ctx, rect, text, { fill, edge, slant = 0.22, outline = '#10142a' }) {
  const [rx, ry, rw, rh] = rect
  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()
  // As tall as the rectangle allows, shrunk if needed so the outline and slant still fit.
  ctx.font = `100px ${FONT}`
  const size = Math.min(rh * 0.7, (100 * rw * 0.95) / (ctx.measureText(text).width * (1 + slant * 0.5)))
  const x = rw / 2
  const y = rh * 0.46
  const depth = size * 0.1
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.setTransform(1, 0, -slant, 1, rx + rh * slant * 0.55, ry)

  // The extruded edge: the outlined letters stacked downwards, darkest at the back.
  ctx.lineWidth = size * 0.22
  ctx.strokeStyle = outline
  ctx.fillStyle = edge
  for (let i = depth; i > 0; i -= Math.max(1, depth / 8)) {
    ctx.strokeText(text, x, y + i)
    ctx.fillText(text, x, y + i)
  }
  // Outline and face.
  ctx.strokeText(text, x, y)
  const gradient = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45)
  fill.forEach((stop, i) => gradient.addColorStop(i / (fill.length - 1), stop))
  ctx.fillStyle = gradient
  ctx.fillText(text, x, y)
  // Gloss on the upper part of the letters only (drawn onto what's already there).
  ctx.globalCompositeOperation = 'source-atop'
  const gloss = ctx.createLinearGradient(0, y - size * 0.45, 0, y)
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  ctx.fillRect(-rw, y - size * 0.45, rw * 3, size * 0.4)
  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()
}

/** White stencil lettering on the turf with an arrow either side pointing `arrow` (in the image). */
function paintStencil(ctx, rect, text, arrow) {
  const [rx, ry, rw, rh] = rect
  const pad = rh * 0.95
  paintText(ctx, [rx + pad, ry, rw - pad * 2, rh], text, { fill: WHITE, edge: '#9fb0c8', slant: 0, outline: '#0d2a14' })
  const turn = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[arrow]
  for (const cx of [rx + pad / 2, rx + rw - pad / 2]) {
    ctx.save()
    ctx.translate(cx, ry + rh / 2)
    ctx.rotate(turn)
    const a = rh * 0.32
    ctx.beginPath()
    ctx.moveTo(0, -a)
    ctx.lineTo(a * 0.95, a * 0.7)
    ctx.lineTo(-a * 0.95, a * 0.7)
    ctx.closePath()
    ctx.lineJoin = 'round'
    ctx.lineWidth = rh * 0.08
    ctx.strokeStyle = '#0d2a14'
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.restore()
  }
}

/** Letters `text` round an arc of radius `r` about (cx, cy): over the top (`top`) or under the bottom. */
function arcText(ctx, text, cx, cy, r, size, top) {
  ctx.font = `${size}px ${FONT}`
  const widths = [...text].map((ch) => ctx.measureText(ch).width + size * 0.06)
  const total = widths.reduce((a, b) => a + b, 0) / r
  let angle = top ? -Math.PI / 2 - total / 2 : Math.PI / 2 + total / 2
  ;[...text].forEach((ch, i) => {
    const step = widths[i] / r
    const mid = angle + (top ? step / 2 : -step / 2)
    ctx.save()
    ctx.translate(cx + Math.cos(mid) * r, cy + Math.sin(mid) * r)
    ctx.rotate(top ? mid + Math.PI / 2 : mid - Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = size * 0.2
    ctx.strokeStyle = '#05091c'
    ctx.strokeText(ch, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(ch, 0, 0)
    ctx.restore()
    angle += top ? step : -step
  })
}

/**
 * The circular midfield logo: a gold rim, a navy ring with BACKYARD over the top and
 * STADIUM under the bottom between two gold stars, and in the middle a royal blue disc
 * with a big football on it - in the venue's colours and words (`logo`: Palm Beach's is
 * sand, teal and coral, PALM BEACH STADIUM).
 */
function paintLogo(ctx, [rx, ry, size], logo) {
  const c = size / 2
  const cx = rx + c
  const cy = ry + c
  const R = c * 0.98
  const circle = (r, color) => {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
  circle(R, logo.rim)
  circle(R * 0.94, logo.ring)
  circle(R * 0.63, '#ffffff')
  circle(R * 0.6, logo.inner)
  arcText(ctx, logo.top, cx, cy, R * 0.78, size * 0.105, true)
  arcText(ctx, logo.bottom, cx, cy, R * 0.78, size * 0.105, false)
  // Two gold stars on the ring, left and right.
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(cx + side * R * 0.78, cy)
    ctx.beginPath()
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 ? size * 0.022 : size * 0.05
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fillStyle = logo.rim
    ctx.fill()
    ctx.restore()
  }
  // The emblem: a rubber arm at full stretch snaking up to a big golden fist (the same
  // art as the game's icon, ui/icons.js), ringed like a rubber band.
  ctx.save()
  const k = (size * 0.5) / 100
  ctx.translate(cx - 50 * k, cy - 52 * k)
  ctx.scale(k, k)
  const arm = new Path2D('M16 88C20 62 50 72 48 50S60 32 66 31')
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#1b1b1f'
  ctx.lineWidth = 25
  ctx.stroke(arm)
  ctx.strokeStyle = '#ff6ab8'
  ctx.lineWidth = 15
  ctx.stroke(arm)
  ctx.setLineDash([4, 10])
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.stroke(arm)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(73, 27, 17, 0, Math.PI * 2)
  ctx.fillStyle = '#ffcf2e'
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = '#1b1b1f'
  ctx.stroke()
  ctx.lineWidth = 3.5
  ctx.beginPath()
  // The gaps between the curled fingers, along the top of the fist.
  for (const [x0, y0, x1, y1] of [[66, 12, 69, 20], [74, 10, 74, 20], [82, 12, 79, 20]]) {
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
  }
  ctx.stroke()
  ctx.restore()
}

const _q = new Quaternion()
const _qFlat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0))
const _e = new Euler()
const _v = new Vector3()
const _at = new Vector3()
/** Sides of a round decal's polygon. */
const ROUND_SIDES = 32

/**
 * The atlas's cells for venue `v`, as fractions of its size: [x, y, w, h], and how each is
 * painted. The logo takes the top-left quarter; the upright signs and the six digits fill
 * the top-right; the end zones' lettering and the four direction stencils run below.
 */
const cellsFor = (v) => ({
  logo: { rect: [0, 0, 0.5, 0.5], paint: (ctx, r) => paintLogo(ctx, r, v.logo) },
  arch: { rect: [0.5, 0, 0.5, 0.15], paint: (ctx, r) => paintText(ctx, r, 'STRETCH & FLY', { fill: GOLD, edge: '#c2410c', slant: 0.14 }) },
  shop: { rect: [0.5, 0.15, 0.5, 0.13], paint: (ctx, r) => paintText(ctx, r, 'ARM SHOP', { fill: GOLD, edge: '#c2410c', slant: 0.14 }) },
  zone: { rect: [0.5, 0.28, 0.5, 0.12], paint: (ctx, r) => paintText(ctx, r, 'LAUNCH PAD', { fill: NAVY, edge: '#a08a10' }) },
  ...Object.fromEntries(
    Array.from({ length: 6 }, (_, d) => [
      `digit${d}`,
      { rect: [0.5 + (d * 0.5) / 6, 0.4, 0.5 / 6, 0.1], paint: (ctx, r) => paintText(ctx, r, String(d), { fill: WHITE, edge: '#9fb0c8', slant: 0, outline: '#0d2a14' }) },
    ]),
  ),
  endSouth: { rect: [0, 0.5, 1, 0.14], paint: (ctx, r) => paintText(ctx, r, END_ZONE_TEXT[0].text, { fill: GOLD, edge: '#b45309', slant: 0.1 }) },
  endNorth: { rect: [0, 0.64, 1, 0.12], paint: (ctx, r) => paintText(ctx, r, v.endNorth, { fill: WHITE, edge: '#9fb0c8', slant: 0.1 }) },
  ...Object.fromEntries(
    DIRECTIONS.map((d, i) => [
      `dir${i}`,
      { rect: [(i % 2) * 0.5, 0.76 + Math.floor(i / 2) * 0.11, 0.5, 0.11], paint: (ctx, r) => paintStencil(ctx, r, d.text, d.arrow) },
    ]),
  ),
})

/**
 * The stretch lane's metre marks (5, 10 ... 40), painted beside its ticks on the west
 * side - over the pad's yellow where they're on it (its top is 0.10), on the path beyond.
 * Every number is made of the digits 0-5, all the atlas has.
 */
function laneNumbers() {
  const out = []
  const w = 1.25
  for (let m = 5; m <= MAX_PULL; m += 5) {
    const z = LAUNCH_STAND.z + m
    const y = z <= ROLL_ZONE.maxZ + 0.8 ? 0.14 : DECAL_Y
    const digits = String(m).split('').map(Number)
    digits.forEach((d, i) => {
      const x = LAUNCH_STAND.x - 4 - (digits.length - 1 - i) * (w + 0.05)
      out.push({ cell: `digit${d}`, width: w, at: [x, y, z], yaw: 0, flat: true })
    })
  }
  return out
}

/**
 * Every quad: which cell it shows, its width in the world (its height follows the cell's
 * shape), its centre, its turn about the vertical, and whether it lies flat on the ground
 * (north up on screen at yaw 0, so it reads from the south). Flat ones lie at DECAL_Y or
 * higher - at least 3 cm over whatever they're on.
 */
function quadList() {
  const zoneWidth = 7.5
  const quads = [
    { cell: 'arch', width: ARCH_SIGN.width - 0.3, at: [0, ARCH_SIGN.y, ARCH_SIGN.faceZ + 0.04], yaw: 0, flat: false },
    {
      cell: 'shop',
      width: SHOP_SIGN.maxZ - SHOP_SIGN.minZ - 3,
      // On the sign's face (0.4 plaza-side of its centre line), turned to the plaza.
      at: [SHOP_SIGN.x + 0.44 * SHOP_SIGN_FACING, SHOP_SIGN.top - 4.1, (SHOP_SIGN.minZ + SHOP_SIGN.maxZ) / 2],
      yaw: (SHOP_SIGN_FACING * Math.PI) / 2,
      flat: false,
    },
    // Over the kick zone's yellow strip (top 0.10) and its navy chevrons (top 0.14).
    // Either side of the stretch lane down its middle.
    { cell: 'zone', width: zoneWidth, at: [-8.6, 0.18, (ROLL_ZONE.minZ + ROLL_ZONE.maxZ) / 2 + 0.3], yaw: 0, flat: true },
    { cell: 'zone', width: zoneWidth, at: [8.6, 0.18, (ROLL_ZONE.minZ + ROLL_ZONE.maxZ) / 2 + 0.3], yaw: 0, flat: true },
    ...laneNumbers(),
    // The logo is drawn as a round disc, not a square, so the yard lines cut back round it
    // never run under its (clear) corners.
    { cell: 'logo', width: LOGO.radius * 2, at: [LOGO.x, DECAL_Y, LOGO.z], yaw: 0, flat: true, round: true },
    ...DIRECTIONS.map((d, i) => ({ cell: `dir${i}`, width: d.width, at: [d.x, DECAL_Y, d.z], yaw: d.yaw, flat: true })),
    ...yardNumbers().map((n) => ({ cell: `digit${n.digit}`, width: DIGIT.width, at: [n.x, DECAL_Y, n.z], yaw: 0, flat: true })),
  ]
  return quads
}

/**
 * The painted signs, drawn once the font has loaded: "KICK IT" on the start arch, "BALL
 * SHOP" on the ball shop's sign, "KICK ZONE" across the strip at the field's mouth, and
 * the lobby field's markings - the BACKYARD STADIUM logo at midfield, the yard numbers,
 * the end zones' lettering and the direction stencils. All of them share ONE square atlas
 * texture (at most the preset's texture size) and are merged into ONE mesh: a single draw
 * call. Flat ones lie 3 cm or more over what's under them, and the material is pulled
 * towards the camera in depth (polygon offset, factor and units both, so it holds even
 * looking straight down) - no z-fighting.
 *
 * @param {number} maxTexture texture size cap for the preset
 * @param {number} [world] the world whose venue it's lettered for (its logo and end zone)
 * @returns {Promise<Array<{ geometry, material, texture, position: number[], rotation: number[] }>>}
 */
export async function createPaintedSigns(maxTexture, world = 0) {
  const CELLS = cellsFor(venueOf(world))
  await document.fonts?.load(`64px ${FONT}`).catch(() => null)

  const size = Math.min(1024, maxTexture)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const px = (rect) => rect.map((f) => Math.round(f * size))
  for (const cell of Object.values(CELLS)) cell.paint(ctx, px(cell.rect))

  const quads = quadList()
  const positions = []
  const uvs = []
  const indices = []
  // A quad's local corner (cx, cy in -0.5..0.5) in the world, and in its atlas cell.
  const vertex = (quad, rect, height, cx, cy) => {
    const [rx, ry, rw, rh] = rect
    _v.set(cx * quad.width, cy * height, 0).applyQuaternion(_q).add(_at)
    positions.push(_v.x, _v.y, _v.z)
    uvs.push((rx + (cx + 0.5) * rw) / size, 1 - (ry + (0.5 - cy) * rh) / size)
    return positions.length / 3 - 1
  }
  for (const quad of quads) {
    const rect = px(CELLS[quad.cell].rect)
    const height = quad.width * (rect[3] / rect[2])
    // Flat ones lie on the ground, then turn about the vertical; upright ones just turn.
    _q.setFromEuler(_e.set(0, quad.yaw, 0))
    if (quad.flat) _q.multiply(_qFlat)
    _at.fromArray(quad.at)
    if (quad.round) {
      const centre = vertex(quad, rect, height, 0, 0)
      const first = positions.length / 3
      for (let i = 0; i < ROUND_SIDES; i += 1) {
        const a = (i / ROUND_SIDES) * Math.PI * 2
        vertex(quad, rect, height, Math.cos(a) * 0.5, Math.sin(a) * 0.5)
      }
      for (let i = 0; i < ROUND_SIDES; i += 1) indices.push(centre, first + i, first + ((i + 1) % ROUND_SIDES))
    } else {
      // Corners: bottom-left, bottom-right, top-right, top-left.
      const o = vertex(quad, rect, height, -0.5, -0.5)
      vertex(quad, rect, height, 0.5, -0.5)
      vertex(quad, rect, height, 0.5, 0.5)
      vertex(quad, rect, height, -0.5, 0.5)
      indices.push(o, o + 1, o + 2, o, o + 2, o + 3)
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = size > 512 ? 4 : 1
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()

  return [{ geometry, material, texture, position: [0, 0, 0], rotation: [0, 0, 0] }]
}
