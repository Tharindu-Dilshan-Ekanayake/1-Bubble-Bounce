import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'

import { iconUrl } from '../../ui/icons'

/**
 * Floating world text ("FREE x1 Power", "World 2 - Needs 2.5M Power", prices...).
 *
 * Every label is drawn once into a shared canvas atlas and shown as a camera-facing
 * quad; all quads of one atlas page are a single mesh. So the whole lobby's labels cost
 * one draw call and one texture, instead of a mesh + texture (or a DOM element
 * re-projected every frame) per label.
 *
 * A label spec is `{ lines: [{ text, size, fill?, gradient?, rainbow?, icon? }],
 * pxPerUnit? }`: sizes are canvas pixels at full quality, `pxPerUnit` is how many of
 * those pixels make one world unit.
 */

const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'
const LABELS_PER_SLICE = 4
const yieldToFrame = () => new Promise((resolve) => setTimeout(resolve, 0))
const PAD = 10
const LINE_GAP = 0.04

const vertexShader = /* glsl */ `
  attribute vec2 aCorner;
  attribute float aFade;
  uniform float uMaxDistance;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = -mv.z;
    // Shrink when the camera gets close, so a sign never fills the screen, and fade
    // right out at arm's length.
    mv.xy += aCorner * clamp(d / 18.0, 0.4, 1.0);
    gl_Position = projectionMatrix * mv;
    float far = min(aFade, uMaxDistance);
    vAlpha = (1.0 - smoothstep(far * 0.75, far, d)) * smoothstep(2.5, 6.0, d);
    vUv = uv;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    vec4 texel = texture2D(map, vUv);
    float a = texel.a * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(texel.rgb, a);
    #include <colorspace_fragment>
  }
`

/** name -> decode promise, and name -> decoded image for synchronous canvas drawing. */
const iconLoads = new Map()
const decodedIcons = new Map()
function loadIcon(name) {
  if (!iconLoads.has(name)) {
    const img = new Image()
    img.src = iconUrl(name)
    iconLoads.set(
      name,
      img.decode().then(
        () => decodedIcons.set(name, img),
        () => null,
      ),
    )
  }
  return iconLoads.get(name)
}

/** Waits for the font and every icon a set of specs uses; canvas text can't wait itself. */
async function preload(specs) {
  const icons = new Set()
  for (const spec of specs) for (const line of spec.lines) if (line.icon) icons.add(line.icon)
  await Promise.all([
    document.fonts?.load(`64px ${FONT}`).catch(() => null),
    ...[...icons].map(loadIcon),
  ])
}

function lineFont(size) {
  return `${size}px ${FONT}`
}

/** Measures a spec at `scale`; returns per-line metrics and the padded box. */
function measure(ctx, spec, scale) {
  let width = 0
  let height = 0
  const lines = spec.lines.map((line) => {
    const size = line.size * scale
    ctx.font = lineFont(size)
    const textWidth = ctx.measureText(line.text).width
    const iconSize = line.icon ? size * 1.15 : 0
    const w = textWidth + (iconSize ? iconSize + size * 0.15 : 0) + size * 0.3
    width = Math.max(width, w)
    const h = size * (1.12 + LINE_GAP)
    height += h
    return { line, size, textWidth, iconSize, h }
  })
  return { lines, width: Math.ceil(width + PAD * 2 * scale), height: Math.ceil(height + PAD * 2 * scale) }
}

function fillFor(ctx, line, x, top, size, textWidth) {
  if (line.rainbow) {
    const g = ctx.createLinearGradient(x, 0, x + textWidth, 0)
    ;['#ff3b5c', '#ff9a1f', '#ffe53b', '#4ef05a', '#2fc6ff', '#7a5cff', '#ff4fd8'].forEach((c, i, a) =>
      g.addColorStop(i / (a.length - 1), c),
    )
    return g
  }
  if (line.gradient) {
    const g = ctx.createLinearGradient(0, top, 0, top + size)
    line.gradient.forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c))
    return g
  }
  return line.fill || '#ffffff'
}

/** Draws a measured spec centred in the box at (bx, by, bw, bh). */
function draw(ctx, layout, bx, by, bw, bh, scale) {
  let y = by + (bh - (layout.height - PAD * 2 * scale)) / 2
  ctx.lineJoin = 'round'
  ctx.textBaseline = 'alphabetic'
  for (const m of layout.lines) {
    const { line, size, textWidth, iconSize } = m
    const total = textWidth + (iconSize ? iconSize + size * 0.15 : 0)
    let x = bx + (bw - total) / 2
    const baseline = y + size * 0.92
    if (iconSize) {
      const img = decodedIcons.get(line.icon)
      if (img) ctx.drawImage(img, x, baseline - iconSize * 0.86, iconSize, iconSize)
      x += iconSize + size * 0.15
    }
    ctx.font = lineFont(size)
    const stroke = size * 0.24
    ctx.lineWidth = stroke
    ctx.strokeStyle = '#111'
    // Drop under the outline, as in the reference's chunky text.
    ctx.strokeText(line.text, x, baseline + size * 0.07)
    ctx.strokeText(line.text, x, baseline)
    ctx.fillStyle = fillFor(ctx, line, x, baseline - size * 0.8, size, textWidth)
    ctx.fillText(line.text, x, baseline)
    y += m.h
  }
}

export class LabelBatch {
  /**
   * @param {{ pageSize: number }} options pageSize is the atlas texture size (512 on
   *   low-end, 1024 otherwise); labels are drawn proportionally smaller on small pages.
   */
  constructor({ pageSize = 1024 } = {}) {
    this.pageSize = pageSize
    this.scale = pageSize / 1024
    this.labels = new Map()
    this.pages = []
    this.meshes = []
  }

  /**
   * @param {string} id
   * @param {[number, number, number]} position world-space centre
   * @param {object} spec see file comment
   * @param {{ fade?: number, reserve?: object }} [options] `reserve` is a spec at least
   *   as large as anything `update` will later draw here.
   */
  add(id, position, spec, { fade = 140, reserve } = {}) {
    this.labels.set(id, { id, position, spec, fade, reserve })
    return this
  }

  async build() {
    const all = [...this.labels.values()]
    await preload(all.flatMap((l) => [l.spec, l.reserve].filter(Boolean)))

    const scratch = document.createElement('canvas').getContext('2d')
    const size = this.pageSize
    let page = null
    let cursorX = 0
    let cursorY = 0
    let rowH = 0

    const newPage = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      page = { canvas, ctx: canvas.getContext('2d'), labels: [] }
      this.pages.push(page)
      cursorX = 0
      cursorY = 0
      rowH = 0
    }
    newPage()

    // Tallest first packs shelves tighter.
    const measured = all
      .map((l) => {
        const a = measure(scratch, l.spec, this.scale)
        const b = l.reserve ? measure(scratch, l.reserve, this.scale) : a
        return { l, w: Math.min(size, Math.max(a.width, b.width)), h: Math.min(size, Math.max(a.height, b.height)) }
      })
      .sort((p, q) => q.h - p.h)

    for (const m of measured) {
      if (cursorX + m.w > size) {
        cursorX = 0
        cursorY += rowH
        rowH = 0
      }
      if (cursorY + m.h > size) newPage()
      Object.assign(m.l, { page, x: cursorX, y: cursorY, w: m.w, h: m.h })
      page.labels.push(m.l)
      cursorX += m.w
      rowH = Math.max(rowH, m.h)
    }

    // A few labels per slice, yielding in between, so drawing the atlas never turns
    // into one long frame.
    let drawn = 0
    for (const p of this.pages) {
      for (const l of p.labels) {
        this.drawLabel(l, l.spec)
        drawn += 1
        if (drawn % LABELS_PER_SLICE === 0) await yieldToFrame()
      }
    }
    for (const p of this.pages) {
      p.texture = new CanvasTexture(p.canvas)
      p.texture.colorSpace = SRGBColorSpace
      p.texture.minFilter = LinearMipmapLinearFilter
      p.texture.magFilter = LinearFilter
      p.material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { map: { value: p.texture }, uMaxDistance: { value: 1e5 } },
        transparent: true,
        depthWrite: false,
      })
      const mesh = new Mesh(this.buildGeometry(p), p.material)
      mesh.renderOrder = 10
      mesh.frustumCulled = false
      this.meshes.push(mesh)
    }
    return this.meshes
  }

  drawLabel(l, spec) {
    const ctx = l.page.ctx
    ctx.clearRect(l.x, l.y, l.w, l.h)
    const layout = measure(ctx, spec, this.scale)
    // Squeeze rather than overflow if an update outgrew the reserved box.
    const fit = Math.min(1, l.w / layout.width, l.h / layout.height)
    ctx.save()
    if (fit < 1) {
      ctx.translate(l.x + l.w / 2, l.y + l.h / 2)
      ctx.scale(fit, fit)
      ctx.translate(-(l.x + l.w / 2), -(l.y + l.h / 2))
    }
    draw(ctx, layout, l.x, l.y, l.w, l.h, this.scale)
    ctx.restore()
  }

  buildGeometry(page) {
    const n = page.labels.length
    const positions = new Float32Array(n * 12)
    const corners = new Float32Array(n * 8)
    const uvs = new Float32Array(n * 8)
    const fades = new Float32Array(n * 4)
    const index = new Uint16Array(n * 6)
    const size = this.pageSize

    page.labels.forEach((l, i) => {
      const unit = (l.spec.pxPerUnit || 60) * this.scale
      const hw = l.w / unit / 2
      const hh = l.h / unit / 2
      const u0 = l.x / size
      const u1 = (l.x + l.w) / size
      const v0 = 1 - (l.y + l.h) / size
      const v1 = 1 - l.y / size
      const quad = [
        [-hw, -hh, u0, v0],
        [hw, -hh, u1, v0],
        [hw, hh, u1, v1],
        [-hw, hh, u0, v1],
      ]
      quad.forEach(([cx, cy, u, v], k) => {
        const vi = i * 4 + k
        positions.set(l.position, vi * 3)
        corners.set([cx, cy], vi * 2)
        uvs.set([u, v], vi * 2)
        fades[vi] = l.fade
      })
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
    })

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aCorner', new BufferAttribute(corners, 2))
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
    geometry.setAttribute('aFade', new BufferAttribute(fades, 1))
    geometry.setIndex(new BufferAttribute(index, 1))
    return geometry
  }

  /** Redraws one label in place (e.g. a pad going from "28 Wins" to "OWNED"). */
  async update(id, spec) {
    const l = this.labels.get(id)
    if (!l?.page) return
    // Unchanged: nothing to draw (redrawing re-uploads the whole page to the GPU).
    const key = JSON.stringify(spec)
    if (key === l.drawnKey) return
    l.drawnKey = key
    await preload([spec])
    l.spec = { ...spec, pxPerUnit: l.spec.pxPerUnit }
    this.drawLabel(l, l.spec)
    l.page.texture.needsUpdate = true
  }

  setMaxDistance(distance) {
    for (const p of this.pages) if (p.material) p.material.uniforms.uMaxDistance.value = distance
  }

  dispose() {
    for (const mesh of this.meshes) mesh.geometry.dispose()
    for (const p of this.pages) {
      p.texture?.dispose()
      p.material?.dispose()
    }
    this.meshes = []
    this.pages = []
  }
}
