import { Vector3 } from 'three'

import { setText } from '../roll/hudLink'

/**
 * Floating "+12 POWER" text: a fixed pool of DOM elements (max 10 alive), positioned
 * by projecting a world point each frame. When the pool is full the oldest popup is
 * recycled, so a fast pad can never pile up elements.
 *
 * While your tire rolls they're pinned to the screen instead (see spawnScattered),
 * scattered about it rather than chasing the tire round.
 */

export const POPUP_POOL_SIZE = 10
const LIFE_MS = 1150
const RISE = 1.4
const DEFAULT_GRADIENT = 'linear-gradient(180deg, #fffaa8 0%, #ffd52a 45%, #ff9c00 100%)'

/** @type {Array<{ el: HTMLElement, texts: HTMLElement[], icon: HTMLImageElement, active: boolean, born: number, life: number, pos: Vector3, scale: number }>} */
const pool = []
const _v = new Vector3()

/** Called by PopupLayer once its elements exist. */
export function registerPopupElements(elements) {
  pool.length = 0
  for (const el of elements) {
    if (!el) continue
    pool.push({
      el,
      texts: [...el.querySelectorAll('[data-popup-text]')],
      icon: el.querySelector('img'),
      // What the DOM currently shows, so spawning only writes what changed: setting an
      // img src (even to the same data URL) or a gradient restyles and re-decodes.
      shown: { text: null, gradient: null, iconUrl: undefined },
      active: false,
      born: 0,
      life: LIFE_MS,
      pos: new Vector3(),
      /** Set for popups that ride along with something moving; `pos` is then relative to it. */
      follow: null,
      scale: 1,
      /** Pinned to the screen, not to a world point (see spawnScattered). */
      screen: false,
      /** Where on screen: -1..1 across the scatter area, 0..1 down it. */
      u: 0,
      v: 0,
      /** Tilt in degrees as it lands; it settles most of the way upright. */
      rot: 0,
    })
  }
}

/**
 * @param {string} text
 * @param {{ x: number, y: number, z: number }} position world point to rise from
 * @param {{ iconUrl?: string, scale?: number, gradient?: string, life?: number,
 *   follow?: Vector3, screen?: boolean, u?: number, v?: number, rot?: number }} [style]
 *   no `iconUrl` = text only; `follow` keeps the popup where it started relative to that
 *   (moving) point, e.g. a rider going down the hill. `screen` pins it to the screen at
 *   `u`/`v` instead (`position` is then ignored); `rot` tilts it as it lands.
 */
export function spawnPopup(text, position, style = {}) {
  if (pool.length === 0) return
  let slot = pool.find((p) => !p.active)
  if (!slot) slot = pool.reduce((oldest, p) => (p.born < oldest.born ? p : oldest), pool[0])
  slot.active = true
  slot.born = performance.now()
  slot.life = style.life || LIFE_MS
  slot.scale = style.scale || 1
  slot.pos.set(position.x, position.y, position.z)
  slot.follow = style.follow || null
  if (slot.follow) slot.pos.sub(slot.follow)
  slot.screen = Boolean(style.screen)
  slot.u = style.u || 0
  slot.v = style.v || 0
  slot.rot = style.rot || 0
  const shown = slot.shown
  if (shown.text !== text) {
    shown.text = text
    for (const t of slot.texts) setText(t, text)
  }
  const gradient = style.gradient || DEFAULT_GRADIENT
  if (slot.texts[1] && shown.gradient !== gradient) {
    shown.gradient = gradient
    slot.texts[1].style.backgroundImage = gradient
  }
  const iconUrl = style.iconUrl || null
  if (slot.icon && shown.iconUrl !== iconUrl) {
    shown.iconUrl = iconUrl
    slot.icon.style.display = iconUrl ? '' : 'none'
    if (iconUrl) slot.icon.src = iconUrl
  }
  // Hidden until the next frame places it, so it never shows at the corner first.
  slot.el.style.opacity = '0'
  slot.el.style.display = 'flex'
}

// --- Scattered over the screen while your tire rolls --------------------------------------

/**
 * The scatter area (reference px, the 1920x1080 layout): this far either side of the
 * middle, from this far down from the top to this far up from the bottom - below the
 * distance counter, above the Health bar.
 */
const SCATTER_HALF_WIDTH = 620
const SCATTER_TOP = 350
const SCATTER_BOTTOM = 340
/** Kept at least this far in from the sides on narrow screens (reference px). */
const SCATTER_EDGE = 130
/** The rider, in scatter coordinates: the middle (|u| below this), from this far down. */
const RIDER_U = 0.28
const RIDER_V = 0.3
/** How far a popup floats up over its life (reference px). */
const SCATTER_RISE = 40
const SCATTER_LAND_MS = 200
const SCATTER_LIFE_MS = 1100
/** The R2 sequence's steps: each spot lands well away from the last few. */
const R2_U = 0.7548776662466927
const R2_V = 0.5698402909980532
let scatterIndex = 0
/** Reused style for spawnScattered: it's called a few times a second, never per frame. */
const scatterStyle = { iconUrl: null, scale: 1, gradient: null, life: 0, screen: true, u: 0, v: 0, rot: 0 }

/**
 * A popup somewhere on screen, wherever the rider goes, at the next spot of a sequence
 * that spreads them evenly over the scatter area (skipping the rider): it lands with a
 * bounce, floats up a little and fades.
 *
 * @param {string} text
 * @param {{ iconUrl?: string, scale?: number, gradient?: string, life?: number }} [style]
 */
export function spawnScattered(text, style = {}) {
  let u = 0
  let v = 0
  for (let tries = 0; tries < 6; tries += 1) {
    scatterIndex += 1
    u = ((0.5 + scatterIndex * R2_U) % 1) * 2 - 1
    v = (0.5 + scatterIndex * R2_V) % 1
    if (Math.abs(u) >= RIDER_U || v < RIDER_V) break
  }
  scatterStyle.iconUrl = style.iconUrl || null
  // A little bigger or smaller each time, and tilted as it lands, so they don't look stamped out.
  scatterStyle.scale = (style.scale || 1) * (0.9 + ((scatterIndex * 0.381966) % 1) * 0.25)
  scatterStyle.gradient = style.gradient || null
  scatterStyle.life = style.life || SCATTER_LIFE_MS
  scatterStyle.u = u
  scatterStyle.v = v
  scatterStyle.rot = u * -10 + (scatterIndex % 2 ? 5 : -5)
  spawnPopup(text, _v.set(0, 0, 0), scatterStyle)
}

/** Positions every live popup. Runs inside the frame loop; touches only DOM styles. */
export function updatePopups(camera, width, height) {
  const now = performance.now()
  // One reference pixel on this screen, as the HUD's --px works it out.
  const px = Math.min(1.4, Math.max(0.42, Math.min(width / 1920, height / 1080)))
  // The scatter area on this screen.
  const halfWidth = Math.max(0, Math.min(SCATTER_HALF_WIDTH * px, width / 2 - SCATTER_EDGE * px))
  const top = SCATTER_TOP * px
  const span = Math.max(0, height - SCATTER_BOTTOM * px - top)
  for (const p of pool) {
    if (!p.active) continue
    const t = (now - p.born) / p.life
    if (t >= 1) {
      p.active = false
      p.el.style.display = 'none'
      continue
    }
    // Pop in, hold, fade out.
    const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : t < 0.22 ? 1.15 - ((t - 0.12) / 0.1) * 0.15 : 1
    const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1

    if (p.screen) {
      const land = Math.min(1, (now - p.born) / SCATTER_LAND_MS)
      const eased = 1 - (1 - land) * (1 - land) * (1 - land)
      // Floats up, quickly at first, then hangs there as it fades.
      const rise = (1 - (1 - t) * (1 - t)) * SCATTER_RISE * px
      const x = width / 2 + p.u * halfWidth
      const y = top + p.v * span - rise
      p.el.style.opacity = String(fade)
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${p.rot * (1 - 0.6 * eased)}deg) scale(${pop * p.scale})`
      continue
    }

    _v.copy(p.pos)
    if (p.follow) _v.add(p.follow)
    _v.y += t * RISE
    _v.project(camera)
    if (_v.z > 1) {
      p.el.style.opacity = '0'
      continue
    }
    const x = (_v.x * 0.5 + 0.5) * width
    const y = (-_v.y * 0.5 + 0.5) * height
    p.el.style.opacity = String(fade)
    p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${p.rot}deg) scale(${pop * p.scale})`
  }
}
