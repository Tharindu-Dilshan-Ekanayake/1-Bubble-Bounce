import { useSyncExternalStore } from 'react'
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderTarget } from 'three'

import { PETS } from '@shared/balance'

import { asToyInstance } from '../blocks'
import { sharedMaterials } from '../materials'
import { petGeometry } from './petModels'

/**
 * Pet portraits for the UI, rendered from the same voxel models the world uses, so a
 * pet looks identical in the inventory and following you around. No image assets to
 * download, and nothing is rendered twice.
 *
 * Every portrait is queued once the game is on screen (queueAllPetIcons, from
 * GameScene) and made one a frame, its pixels read back asynchronously: a synchronous
 * read-back makes the main thread wait for the GPU. They are kept as ImageBitmaps that
 * PetIcon draws straight onto a small canvas - no PNG to encode or decode. A portrait the
 * UI asks for before its turn (or after a lost WebGL context) joins the same queue.
 */

const SIZE = 128
/** Pet id -> ImageBitmap. */
const bitmaps = new Map()
const queue = []
const listeners = new Set()
let renderer = null
let rig = null
let notifyScheduled = false
/** A queued portrait is being read back: the next waits for it. */
let busy = false
const _previousClear = new Color()

/** linear -> sRGB byte lookup: render targets come back in linear light. */
const TO_SRGB = new Uint8Array(256)
for (let i = 0; i < 256; i += 1) {
  const c = i / 255
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  TO_SRGB[i] = Math.round(Math.min(1, Math.max(0, s)) * 255)
}

function buildRig() {
  const scene = new Scene()
  scene.add(new HemisphereLight('#ffffff', '#b9cba6', 2.3))
  const sun = new DirectionalLight('#fff6e8', 1.6)
  sun.position.set(2, 4, 3)
  scene.add(sun)
  const camera = new PerspectiveCamera(26, 1, 0.1, 50)
  camera.position.set(1.55, 1.45, 3.3)
  camera.lookAt(0, 0.66, 0)
  const target = new WebGLRenderTarget(SIZE, SIZE, { samples: 4 })
  const mesh = asToyInstance(petGeometry('cat'), sharedMaterials().toy)
  scene.add(mesh)
  return { scene, camera, target, mesh, pixels: new Uint8Array(SIZE * SIZE * 4) }
}

/** Draws `id` into the offscreen target. */
function draw(id) {
  rig.mesh.geometry = petGeometry(id)
  const previousTarget = renderer.getRenderTarget()
  const previousClear = renderer.getClearColor(_previousClear)
  const previousAlpha = renderer.getClearAlpha()
  renderer.setRenderTarget(rig.target)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(rig.scene, rig.camera)
  renderer.setRenderTarget(previousTarget)
  renderer.setClearColor(previousClear, previousAlpha)
}

/** The read-back pixels as an upright, sRGB, straight-alpha bitmap for `id`. */
async function store(id) {
  const image = new ImageData(SIZE, SIZE)
  const src = rig.pixels
  // GL rows run bottom-up; MSAA edges come back premultiplied.
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const from = ((SIZE - 1 - y) * SIZE + x) * 4
      const to = (y * SIZE + x) * 4
      const a = src[from + 3]
      const k = a > 0 ? 255 / a : 0
      image.data[to] = TO_SRGB[Math.min(255, Math.round(src[from] * k))]
      image.data[to + 1] = TO_SRGB[Math.min(255, Math.round(src[from + 1] * k))]
      image.data[to + 2] = TO_SRGB[Math.min(255, Math.round(src[from + 2] * k))]
      image.data[to + 3] = a
    }
  }
  bitmaps.set(id, await createImageBitmap(image))
}

/** Called once the renderer exists (from inside the Canvas). */
export function attachIconRenderer(gl) {
  renderer = gl
  // Built here, at set-up, so the frame loop that renders portraits never allocates.
  if (!rig) {
    rig = buildRig()
    // Its shader compiled in the background now, so the first portrait can't stall a
    // frame on it (with shadows on, the world's lit program isn't the same one).
    if (!import.meta.env.DEV) gl.compileAsync?.(rig.scene, rig.camera).catch(() => null)
  }
}

/**
 * Queues every pet's portrait (GameScene calls it once the game is on screen): the frame
 * loop then makes them one a frame, each read back asynchronously, so none of it waits
 * for the GPU. Done straight away and synchronously behind the loading screen, these
 * read-backs were ~0.75 s of a slow phone's start-up.
 */
export function queueAllPetIcons() {
  for (const id of Object.keys(PETS)) request(id)
}

/** Re-renders the portraits' React components after the frame, not inside it. */
function notify() {
  if (notifyScheduled) return
  notifyScheduled = true
  setTimeout(() => {
    notifyScheduled = false
    for (const fn of listeners) fn()
  }, 0)
}

/**
 * Starts the next queued portrait, if none is under way. Runs in the frame loop; with
 * everything rendered at start-up the queue is normally empty. The draw is tiny, and the
 * read-back finishes later, off the frame.
 */
export function processIconQueue() {
  if (busy || !renderer || !rig || queue.length === 0) return
  busy = true
  const id = queue.shift()
  draw(id)
  renderer
    .readRenderTargetPixelsAsync(rig.target, 0, 0, SIZE, SIZE, rig.pixels)
    .then(() => store(id))
    .catch((err) => console.warn('[petIcons] portrait failed', id, err))
    .finally(() => {
      busy = false
      notify()
    })
}

function request(id) {
  if (!id || bitmaps.has(id) || queue.includes(id)) return
  queue.push(id)
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Portrait bitmap for a pet species; null until it has been rendered. */
export function usePetIcon(id) {
  request(id)
  return useSyncExternalStore(subscribe, () => bitmaps.get(id) ?? null)
}

/** The portraits' size in pixels (they're drawn onto canvases this big). */
export const PET_ICON_SIZE = SIZE
