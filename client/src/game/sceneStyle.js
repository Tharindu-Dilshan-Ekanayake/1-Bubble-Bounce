/**
 * The scene's whole look in one place: the Candy Canyon - a cotton-candy sky, periwinkle
 * overhead melting to a pink haze at the horizon, puffy cloud and a warm sun, a mint
 * plaza with a hot-pink path, and frosted candy mesas in pastel strata all round it
 * (hills.js), the launch runway running off between them.
 *
 * Colours are sRGB hex, exactly as you would pick them in an image editor.
 *
 * Light intensities are three.js physical units: a light of intensity PI (~3.14)
 * lights a surface facing it to its full texture colour. The cool sky fill plus the warm
 * low sun add up to just over that on the ground, which keeps the turf vivid; shadowed
 * ground only gets the cool fill, so shadows read blue and the lit side gold.
 */

/** Style id of the candy mesas (materials STYLE.MESA; a number here so this file stays import-free). */
const STYLE_MESA = 15

/** The home team's colours: everything built for the venue uses these. */
export const TEAM = {
  blue: '#1f4fd8',
  navy: '#14234f',
  white: '#f4f7fb',
  gold: '#ffc21a',
}

export const SKY = {
  /** Straight up: periwinkle. */
  top: '#5b6dff',
  /** At eye level: pink haze. Fog uses the same colour so distant ground melts into the sky. */
  horizon: '#ffd2ea',
  /** Lower = the deep colour reaches further down towards the horizon. */
  exponent: 0.6,
  /** The sun's glow round its direction, and how strong it is. */
  sun: '#fff0c8',
  glow: 0.6,
  /** High clouds (0 none, 1 plenty), and stars (night stages only). */
  clouds: 0.9,
  stars: 0,
}

export const FOG = {
  color: SKY.horizon,
}

/** Every surface colour in the lobby. */
export const PALETTE = {
  /** The ball shop's yard. */
  shopFloor: '#e8edf6',
  /** Rings painted round the portal on the sideline. */
  apron: '#16245a',
  apronEdge: TEAM.gold,
  /** The pavilions: pale concrete steps (a shade darker every third row), the team's seats. */
  concrete: ['#c9ced6', '#c9ced6', '#b7bdc8'],
  seats: [TEAM.blue, TEAM.white, TEAM.gold],
  standBase: '#8c93a1',
  rail: '#ffffff',
  /** Mown turf, light and dark: the plaza's field, the strip round it and the kick field. */
  turf: ['#2fbf47', '#3ad456'],
  /** The crowd's shirts: mostly the home team's, a few away fans. */
  crowd: [TEAM.blue, '#ffffff', TEAM.gold, '#2f66d6', TEAM.blue, '#ffe27a', '#e8eef8', '#ff5a4a'],
  /** Flags along the roofs. */
  flags: [TEAM.blue, TEAM.white, TEAM.gold],
  /** The city round the stadium: hazy blue-grey and dusky purple towers. */
  city: ['#5a6787', '#6b6f8f', '#4f5a7a', '#776c8c', '#5d7290'],
  /** Car park and service roads beyond the stands. */
  asphalt: '#555b68',
}

/**
 * Each world's venue: the colours everything built for it uses, and whether it's the beach.
 * World 1 is the Backyard Stadium (royal blue, white and gold, a city round it); World 2
 * is Palm Beach (turquoise, coral, sand and white, palms, umbrellas and the ocean round
 * it). The lobby (World.jsx) and the kick field (Lane.jsx) are built from the one for the
 * world you're in, and rebuilt when you step through the portal.
 */
export const VENUES = [
  {
    beach: false,
    primary: TEAM.blue,
    dark: TEAM.navy,
    light: TEAM.white,
    accent: TEAM.gold,
    concrete: PALETTE.concrete,
    wall: '#c4c9d2',
    vip: '#d5dae1',
    glass: '#1c2b46',
    crowd: PALETTE.crowd,
    flags: PALETTE.flags,
    pitch: { north: '#1f4fd8', south: '#14234f', border: '#ffffff', track: '#2a5bd0', apron: '#1b2a63' },
    /** Beyond the turf round the plaza (grass, under the hills), and the turf strip itself. */
    surround: '#3fb23f',
    strip: PALETTE.turf,
    shopFloor: PALETTE.shopFloor,
    logo: { rim: '#ffd21f', ring: '#7a2a8a', inner: '#ff5fa8', top: 'CANDY', bottom: 'CANYON' },
    /** The mesas round the lobby: candy rock by terrace (low to high), and what grows on them. */
    hills: { rock: ['#ffa27e', '#ff8aa8', '#f08ad8', '#c08cff', '#94a2ff'], cap: STYLE_MESA, trees: 'candy' },
    endNorth: 'FLY FAR!',
    /** The start arch and the ball shop's stages and sign. */
    arch: { pillar: '#ffd21f', base: TEAM.navy, glow: '#ffe27a', crest: '#ffb81f' },
    shop: { band: '#ffd21f', strip: '#ffe27a', post: '#ffd21f', panel: TEAM.navy },
  },
  {
    beach: true,
    primary: '#16b8c4',
    dark: '#0b6f86',
    light: '#ffffff',
    accent: '#ff6f61',
    concrete: ['#eadfc8', '#eadfc8', '#dccfb4'],
    wall: '#e2d5ba',
    vip: '#efe6d2',
    glass: '#13506a',
    crowd: ['#16b8c4', '#ffffff', '#ff6f61', '#ffd27a', '#3fd8ff', '#ff9ab0', '#7ae86a', '#ffffff'],
    flags: ['#16b8c4', '#ff6f61', '#ffffff', '#ffd27a'],
    pitch: { north: '#16b8c4', south: '#ff6f61', border: '#ffffff', track: '#e2bd7a', apron: '#f0d9a0' },
    surround: '#f2dca0',
    strip: ['#f2dca0', '#ead196'],
    shopFloor: '#fbeed0',
    logo: { rim: '#ffd27a', ring: '#0b6f86', inner: '#ff6f61', top: 'PALM BEACH', bottom: 'PARK' },
    hills: { rock: ['#f2d49a', '#ecc684', '#e2b672', '#d8a866', '#cf9c5e'], cap: STYLE_MESA, trees: 'palm' },
    endNorth: 'PALM BEACH',
    arch: { pillar: '#16b8c4', base: '#0b6f86', glow: '#bff6ff', crest: '#ff6f61' },
    shop: { band: '#ff6f61', strip: '#ffd27a', post: '#16b8c4', panel: '#0b6f86' },
  },
]
export const venueOf = (world) => VENUES[world] ?? VENUES[0]

export const LIGHTS = {
  /** Lilac fill from the sky, a warm pink bounce off the candy ground. */
  hemiSky: '#dcd8ff',
  hemiGround: '#e8b4c4',
  hemiIntensity: 2.0,

  /** A bright, high midday sun. */
  sunColor: '#fff0dc',
  sunIntensity: 1.9,
  /**
   * Direction *towards* the sun: high in the north-west, beyond the far end of the runway
   * (the sky's glow sits there too), so shadows fall short and back towards you.
   */
  sunDirection: [-0.4, 0.78, -0.48],
  /** 1 = shadows get no sunlight at all; lower = lighter shadows. */
  shadowIntensity: 0.6,
  /** Blur radius of shadow edges, in shadow-map texels. */
  shadowSoftness: 3,
}
