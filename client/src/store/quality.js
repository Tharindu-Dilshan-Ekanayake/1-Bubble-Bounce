import { create } from 'zustand'

/**
 * Graphics quality presets. Every visual feature reads its settings from here rather
 * than deciding for itself, so dropping a preset reliably sheds load everywhere.
 *
 * LOW is the mobile / weak-PC baseline: no realtime shadows, no particles, no
 * post-processing, short view distance and textures capped at 512px.
 */
export const QUALITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH']

export const PRESETS = {
  LOW: {
    dpr: 1,
    antialias: false,
    /** 'blob' = fake contact shadows only; 'realtime' = shadow-mapped sun. */
    shadows: 'blob',
    shadowMapSize: 0,
    particles: false,
    speedLines: true,
    /** Motion blur down the sides at speed (post-processing): samples a pixel, 0 = off. */
    motionBlur: 0,
    viewDistance: 190,
    fogNear: 60,
    cloudCount: 8,
    /** Max side of any generated texture. */
    maxTexture: 512,
    /**
     * Other players are drawn this far away - the whole lobby - and the nearest
     * `remoteAvatars` of them within `remoteAvatarDistance` as their real Boxity avatar
     * (anyone else as the blocky figure). On every preset that's everyone in the room:
     * players want to see each other as themselves, across the whole lobby. A Boxity
     * avatar is ~100 triangles and one draw call plus one per worn item, so a full room
     * of 8 typically adds 20-40 draw calls; if a weak device can't keep up, the FPS
     * monitor lowers the resolution (RENDER_SCALES) rather than taking avatars away.
     */
    remoteDrawDistance: 150,
    remoteAvatars: 7,
    remoteAvatarDistance: 150,
    remoteNameDistance: 40,
    /** World labels fade out past this. */
    labelDistance: 70,
    /** How much of the canyon's scenery to spawn (0-1). */
    decorDensity: 0.45,
    /** Board and egg halo size multiplier. */
    boardGlow: 0.8,
  },
  MEDIUM: {
    dpr: 1.25,
    antialias: true,
    shadows: 'blob',
    shadowMapSize: 0,
    particles: true,
    speedLines: true,
    motionBlur: 8,
    viewDistance: 300,
    fogNear: 100,
    cloudCount: 14,
    maxTexture: 1024,
    remoteDrawDistance: 150,
    remoteAvatars: 7,
    remoteAvatarDistance: 150,
    remoteNameDistance: 55,
    labelDistance: 110,
    decorDensity: 0.75,
    boardGlow: 1,
  },
  HIGH: {
    dpr: 1.5,
    antialias: true,
    shadows: 'realtime',
    shadowMapSize: 1024,
    particles: true,
    speedLines: true,
    motionBlur: 12,
    viewDistance: 460,
    fogNear: 140,
    cloudCount: 18,
    maxTexture: 1024,
    remoteDrawDistance: 150,
    remoteAvatars: 7,
    remoteAvatarDistance: 150,
    remoteNameDistance: 70,
    labelDistance: 150,
    decorDensity: 1,
    boardGlow: 1,
  },
}

const STORAGE_KEY = 'pp.quality'

/**
 * Resolution steps, as a fraction of the preset's pixel ratio. Below LOW, a weak PC or
 * phone still under 45 FPS renders fewer pixels: the scene is the same, only softer.
 * Shading every pixel is what an integrated GPU runs out of first, so this is the
 * biggest single saving there is.
 */
export const RENDER_SCALES = [1, 0.85, 0.7, 0.6]

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true
  // iPadOS reports itself as a Mac; touch points give it away.
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)
}

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return QUALITY_LEVELS.includes(saved) ? saved : null
  } catch {
    return null
  }
}

/**
 * Phones and small CPUs (4 cores or fewer) start on LOW, the safe choice; anything bigger
 * starts on MEDIUM, and the performance monitor drops it to LOW by itself if FPS stays
 * under 45 (`degrade`, auto-picked levels only). A level picked in Settings is
 * remembered on this device and wins over both.
 */
export const DEFAULT_LEVEL = 'LOW'

function detectLevel() {
  if (typeof navigator === 'undefined') return DEFAULT_LEVEL
  const cores = navigator.hardwareConcurrency || 0
  return isMobileDevice() || cores <= 4 ? 'LOW' : 'MEDIUM'
}

const initialLevel = readSaved() || detectLevel()

export const useQuality = create((set, get) => ({
  level: initialLevel,
  /** True when the player picked the level by hand; auto-drop then stays out of it. */
  manual: readSaved() !== null,
  isMobile: isMobileDevice(),
  /** Antialiasing can't change without recreating the WebGL context (see `rebuild`). */
  antialias: PRESETS[initialLevel].antialias,
  settings: PRESETS[initialLevel],
  /**
   * Bumped when the player picks a new level by hand: the 3D view is rebuilt from
   * scratch, so things set when it's made (antialiasing, scenery density, tire detail)
   * take the new level at once.
   */
  rebuild: 0,
  /** Index into RENDER_SCALES: how far resolution has been dropped to keep FPS up. */
  renderStep: 0,

  setLevel: (level, manual = true) => {
    if (!QUALITY_LEVELS.includes(level)) return
    if (manual) {
      try {
        localStorage.setItem(STORAGE_KEY, level)
      } catch {
        // Private mode: the choice just won't persist.
      }
    }
    const changed = level !== get().level
    set((s) => ({
      level,
      manual,
      settings: PRESETS[level],
      ...(manual && changed ? { antialias: PRESETS[level].antialias, rebuild: s.rebuild + 1 } : {}),
    }))
  },

  /**
   * Called by the performance monitor when FPS stays under budget: drops a preset if it
   * can (not one the player picked by hand), and once on LOW (or a hand-picked level),
   * renders at a lower resolution instead, a step at a time.
   */
  degrade: () => {
    const { level, manual, renderStep } = get()
    const index = QUALITY_LEVELS.indexOf(level)
    if (!manual && index > 0) {
      const next = QUALITY_LEVELS[index - 1]
      console.info(`[quality] FPS under budget, dropping ${level} -> ${next}`)
      set({ level: next, settings: PRESETS[next] })
      return
    }
    if (renderStep + 1 < RENDER_SCALES.length) {
      console.info(`[quality] FPS under budget, rendering at ${RENDER_SCALES[renderStep + 1] * 100}%`)
      set({ renderStep: renderStep + 1 })
    }
  },

  /** Called when FPS has plenty of headroom again: resolution comes back a step. */
  recover: () => {
    const { renderStep } = get()
    if (renderStep > 0) set({ renderStep: renderStep - 1 })
  },
}))

/** Non-reactive read, safe inside useFrame. */
export const getQuality = () => useQuality.getState().settings
