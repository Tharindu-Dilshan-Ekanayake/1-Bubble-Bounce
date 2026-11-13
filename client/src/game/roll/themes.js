/**
 * Each stage theme's colours (each stage names one in its `theme`): the sky the ball flies
 * under (Lane.jsx blends the sky and fog to it as you reach the stage), the HUD's name
 * gradient, and the floor/gate tints the landing spray and the stage-start line borrow.
 *
 * Every sky is a game-day sky of its own - golden hour in the Backyard, a blue afternoon at
 * High School, hot orange haze in the desert, a pink beach sunset, an icy dusk, purple
 * twilight at College, a red-black volcano glow, black starry space with the Earth's glow
 * on the Moon, a floodlit night for the Championship... `sky` is { top, horizon, sun,
 * glow, clouds, stars } (see Sky.jsx).
 */
/**
 * The sunny day sky most stages fly under (a few late ones keep a sky of their own:
 * volcano glow, neon night, the Moon, the aurora, space); `horizon` tints it per stage.
 */
const DAY_SKY = { top: '#2f80ea', horizon: '#c6e6ff', sun: '#ffffff', glow: 0.35, clouds: 0.85 }
const DAY_TINTS = {
  grassy: '#c6e6ff',
  autumn: '#d8ecff',
  desert: '#ffe9c4',
  beach: '#d6f2ff',
  jungle: '#cff0e0',
  frozen: '#e8f2ff',
  cherry: '#ffe2f0',
  candy: '#ffe4f6',
  mushroom: '#eadcff',
  swamp: '#d8f0d0',
  crystal: '#e0e4ff',
  ocean: '#c8f0ff',
  sky: '#dff2ff',
  rainbow: '#f4e8ff',
}

export const ZONE_THEMES = {
  grassy: {
    floor: '#3ad456',
    gate: '#ffc21a',
    sky: { top: '#1d4fb6', horizon: '#ffb98c', sun: '#fff0c4', glow: 0.9, clouds: 0.55 },
    name: ['#e6ffb0', '#8dff4f', '#2fd12f'],
  },
  autumn: {
    floor: '#5cc544',
    gate: '#ff7a1e',
    sky: { top: '#2a7fe8', horizon: '#d4ecff', sun: '#ffffff', glow: 0.35, clouds: 0.75 },
    name: ['#ffe2b0', '#ffa646', '#e8620c'],
  },
  desert: {
    floor: '#e8c46e',
    gate: '#ffb12a',
    sky: { top: '#3a63c4', horizon: '#ffae58', sun: '#ffe2a0', glow: 1.0, clouds: 0.1 },
    name: ['#fffaa8', '#ffd52a', '#ff9c00'],
  },
  beach: {
    floor: '#f6e3a6',
    gate: '#2fc6ff',
    sky: { top: '#5547c4', horizon: '#ff98b6', sun: '#ffd4a8', glow: 0.95, clouds: 0.6 },
    name: ['#e0fbff', '#5fe0ff', '#1a9cf0'],
  },
  frozen: {
    floor: '#e6f4ff',
    gate: '#5cc8ff',
    sky: { top: '#43609e', horizon: '#e4ebff', sun: '#ffe6ef', glow: 0.55, clouds: 0.45 },
    name: ['#ffffff', '#c9f1ff', '#5cc8ff'],
  },
  jungle: {
    floor: '#3fae4a',
    gate: '#3fd16a',
    sky: { top: '#1c6f80', horizon: '#c6eeb8', sun: '#fff6c0', glow: 0.5, clouds: 0.7 },
    name: ['#e6ffd0', '#7dff7a', '#1fa83a'],
  },
  cherry: {
    floor: '#5fe068',
    gate: '#ff7ab8',
    sky: { top: '#33247e', horizon: '#ff9db0', sun: '#ffc6d4', glow: 0.75, clouds: 0.5 },
    name: ['#fff0f8', '#ffa8d4', '#ff4f9a'],
  },
  candy: {
    floor: '#ffc2e2',
    gate: '#ff5fb8',
    sky: { top: '#5f50dc', horizon: '#ffd2ee', sun: '#ffffff', glow: 0.6, clouds: 0.7 },
    name: ['#ffe6f6', '#ff9cd6', '#ff3fa8'],
  },
  mushroom: {
    floor: '#4cca6e',
    gate: '#c46bff',
    sky: { top: '#2a2470', horizon: '#d6a2ff', sun: '#ffe0ff', glow: 0.6, clouds: 0.4 },
    name: ['#f4e6ff', '#d29bff', '#9a3be8'],
  },
  volcano: {
    floor: '#4a2a24',
    gate: '#ff4a1c',
    sky: { top: '#16080c', horizon: '#ff5a2a', sun: '#ff7a3a', glow: 1.0, clouds: 0.35 },
    name: ['#ffd0b0', '#ff7a3c', '#e2240c'],
  },
  swamp: {
    floor: '#58ae46',
    gate: '#8ae04a',
    sky: { top: '#1c3838', horizon: '#b6d690', sun: '#f0ffb0', glow: 0.5, clouds: 0.6 },
    name: ['#f0ffd8', '#b8f05a', '#5ab82a'],
  },
  crystal: {
    floor: '#5cd89a',
    gate: '#c08bff',
    sky: { top: '#120a36', horizon: '#9a7aff', sun: '#e2d2ff', glow: 0.6, clouds: 0.2, stars: 0.4 },
    name: ['#f2e6ff', '#c69bff', '#8a3ee8'],
  },
  ocean: {
    floor: '#4cd8b0',
    gate: '#ff7a8a',
    sky: { top: '#0e3c8c', horizon: '#80deff', sun: '#fff4d0', glow: 0.6, clouds: 0.5 },
    name: ['#e0fbff', '#7fe8ff', '#1a9cd8'],
  },
  neon: {
    floor: '#27b068',
    gate: '#ff3bd8',
    sky: { top: '#05051a', horizon: '#6a2480', sun: '#ff5fd2', glow: 0.6, clouds: 0, stars: 0.5 },
    name: ['#e6fff0', '#39ff88', '#1ab85a'],
  },
  sky: {
    floor: '#62e27c',
    gate: '#ffd84a',
    sky: { top: '#1f6ae0', horizon: '#ffe4b6', sun: '#ffffff', glow: 0.5, clouds: 0.85 },
    name: ['#ffffff', '#ffe98a', '#ffb21e'],
  },
  rainbow: {
    floor: '#52e49c',
    gate: '#ffd84a',
    sky: { top: '#5878ff', horizon: '#ffe0a0', sun: '#ffffff', glow: 0.7, clouds: 0.6 },
    name: ['#ffffff', '#ffb8f0', '#ff5fd2'],
  },
  moon: {
    floor: '#9aa0b0',
    gate: '#5fc8ff',
    sky: { top: '#000006', horizon: '#18284a', sun: '#7fb8ff', glow: 0.8, clouds: 0, stars: 1 },
    name: ['#ffffff', '#cfd8ea', '#7f8aa8'],
  },
  aurora: {
    floor: '#72e6b2',
    gate: '#5fffc8',
    sky: { top: '#061a2a', horizon: '#2fc6a0', sun: '#a2ffe0', glow: 0.5, clouds: 0.3, stars: 0.6 },
    name: ['#e0fff4', '#7fffd0', '#2fc89a'],
  },
  space: {
    floor: '#349c8a',
    gate: '#8a63ff',
    sky: { top: '#03040f', horizon: '#24305a', sun: '#ffffff', glow: 0.25, clouds: 0, stars: 0.9 },
    name: ['#e6e0ff', '#a98bff', '#6a4cff'],
  },
  cosmic: {
    floor: '#8a46ae',
    gate: '#ff5bd8',
    sky: { top: '#0a0018', horizon: '#5a1a6a', sun: '#ff9cf0', glow: 0.6, clouds: 0, stars: 0.9 },
    name: ['#ffe6fb', '#ff9cf0', '#d43bc8'],
  },
}

/**
 * How each stage theme dresses the kick field: `field` is the ground out past the stands
 * (car park asphalt, sand, snow, lava rock... in `style`), `turf` the two mown greens of
 * the pitch and the turf beside it, and `colors` the city skyline standing beyond the
 * stands (Lane.jsx's buildings), hazy in the stage's light. Every stage looks like its
 * own place through its colours; the pitch is always a football field.
 */
// Most stages: the sunny day sky, tinted at the horizon.
for (const [id, horizon] of Object.entries(DAY_TINTS)) {
  if (ZONE_THEMES[id]) ZONE_THEMES[id].sky = { ...DAY_SKY, horizon }
}

export const STAGE_LOOKS = {
  grassy: { field: '#555b68', style: 'ROAD', turf: ['#2fbf47', '#3ad456'], colors: ['#5a6787', '#776c8c', '#ffd27a'] },
  autumn: { field: '#5d5f66', style: 'ROAD', turf: ['#4fae3a', '#5cc544'], colors: ['#6f7f9f', '#8a8fa8', '#ffe8b0'] },
  desert: { field: '#d8b06a', style: 'ROAD', turf: ['#7fb83a', '#8fca46'], colors: ['#c08a5a', '#a8784e', '#ffe0a0'] },
  beach: { field: '#e8d29a', style: 'ROAD', turf: ['#3fc65a', '#4cda68'], colors: ['#8a6aa8', '#c47a9a', '#ffd0e0'] },
  jungle: { field: '#3f6a3a', style: 'ROAD', turf: ['#1f9a3a', '#27ae46'], colors: ['#3f6a6f', '#557a6a', '#e6ffb0'] },
  frozen: { field: '#dfeaf6', style: 'ROAD', turf: ['#9fdcb4', '#b4ecc6'], colors: ['#8a9ac0', '#a8b4d0', '#fff0f6'] },
  cherry: { field: '#4a4466', style: 'ROAD', turf: ['#4fcf5a', '#5fe068'], colors: ['#5a4a8a', '#7a5a9a', '#ffc0d8'] },
  candy: { field: '#e6b8d8', style: 'ROAD', turf: ['#52d66a', '#66e87c'], colors: ['#a07ac8', '#d08ab8', '#ffffff'] },
  mushroom: { field: '#3c3466', style: 'ROAD', turf: ['#3fb860', '#4cca6e'], colors: ['#4a3a8a', '#6a4a9a', '#ffd0ff'] },
  volcano: { field: '#4a2a24', style: 'LAVA', turf: ['#3a8a3a', '#46a046'], colors: ['#2a1a1e', '#3a2026', '#ff7a3a'] },
  swamp: { field: '#3a4a36', style: 'ROAD', turf: ['#4a9a3a', '#58ae46'], colors: ['#3a5048', '#4a5f4f', '#f0ffb0'] },
  crystal: { field: '#2a2450', style: 'ROAD', turf: ['#4fc68a', '#5cd89a'], colors: ['#2a2460', '#3a2c78', '#c8b0ff'] },
  ocean: { field: '#2fa0c8', style: 'WATER', turf: ['#3fc6a0', '#4cd8b0'], colors: ['#2a5a8a', '#3a6f9a', '#e0fbff'] },
  neon: { field: '#1d2246', style: 'ROAD', turf: ['#1f9a5a', '#27b068'], colors: ['#14163a', '#1f1a4a', '#ff3bd8'] },
  sky: { field: '#5d6170', style: 'ROAD', turf: ['#4fd06a', '#62e27c'], colors: ['#7a8ab0', '#9aa4c0', '#ffffff'] },
  rainbow: { field: '#6a6080', style: 'ROAD', turf: ['#3fd08a', '#52e49c'], colors: ['#7a7ac8', '#a08ac8', '#fff2a0'] },
  moon: { field: '#8a8f9c', style: 'ROAD', turf: ['#8a90a0', '#9aa0b0'], colors: ['#3a3f50', '#4a4f60', '#7fb8ff'] },
  aurora: { field: '#20384a', style: 'ROAD', turf: ['#5fd4a0', '#72e6b2'], colors: ['#163040', '#1f4050', '#7fffd0'] },
  space: { field: '#141a40', style: 'GALAXY', turf: ['#2a8a7a', '#349c8a'], colors: ['#10142e', '#181c3e', '#ffffff'] },
  cosmic: { field: '#2a1450', style: 'GALAXY', turf: ['#7a3a9a', '#8a46ae'], colors: ['#1a0a30', '#26103e', '#ff9cf0'] },
}

/**
 * The turf's stripes, LANE_STRIPE yards each, alternating light and dark (Lane.jsx; Impact.jsx
 * borrows these two greens for the chunks a landing throws up).
 */
export const LANE_STRIPE = 5
export const LANE_RAINBOW = ['#2fbf47', '#3ad456']
