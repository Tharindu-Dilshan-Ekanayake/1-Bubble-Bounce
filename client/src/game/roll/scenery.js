import { STYLE } from '../materials'

/**
 * What you bounce past down the valley, by each stage's `scene` (shared/balance.js
 * ZONES): cottages in the village, barns on the farm, houses in town, skyscrapers in the
 * city, warehouses and lighthouses at the harbour, palms on the beach, igloos in the snow,
 * candy houses, giant mushrooms, cacti, lava rocks, stilt huts, crystals, corals, neon
 * towers, cloud castles, rainbow arches, moon domes and space towers.
 *
 * Every piece is at most PIECE_PARTS boxes of the shared toy material (Lane.jsx keeps a
 * ring of slots, one piece per slot, re-placed as you bounce along): no new geometry, no
 * new draw calls - whatever the scene, the valley's scenery is one InstancedMesh.
 *
 * A builder gets the piece's index `k`, which side of the valley it's on (`side` -1 west,
 * +1 east), a seeded random `r(salt)` (the same on every client) and `out`, and pushes
 * boxes as [x, y, z, sx, sy, sz, colour, style, rotX, rotY, rotZ]: x across the valley
 * (from its middle), y the box's centre height, z along it from the piece's metre.
 * `near(w)` is a spot just beyond the valley's edge for something `w` wide, with a little
 * random give.
 */

/** Boxes per piece. */
export const PIECE_PARTS = 6

/**
 * Each scene's ground: the valley floor you bounce along ([light, dark] squares), the
 * strip beside it, and the ground beyond.
 */
export const SCENE_LOOKS = {
  meadow: { runway: ['#62d64e', '#4fc23e'], turf: ['#45c43c', '#3db535'], ground: '#3aa834' },
  village: { runway: ['#e8d29a', '#d9c084'], turf: ['#58cc44', '#4cbc3a'], ground: '#46b23a' },
  farm: { runway: ['#c9a06a', '#b88f5a'], turf: ['#9ccf3e', '#8cbf34'], ground: '#7fb83a' },
  town: { runway: ['#6f7684', '#5f6674'], turf: ['#5fd04a', '#52c040'], ground: '#9aa3b2' },
  city: { runway: ['#4a505c', '#3f4550'], turf: ['#b8bfcc', '#a9b0bd'], ground: '#7d8596' },
  harbor: { runway: ['#b07a46', '#9a683a'], turf: ['#c9cfd8', '#b9bfc8'], ground: '#2f86c8' },
  beach: { runway: ['#f6e3a6', '#ecd690'], turf: ['#f0d9a0', '#e8cf92'], ground: '#ecd296' },
  jungle: { runway: ['#3fae4a', '#33993f'], turf: ['#2f9a3a', '#278a32'], ground: '#25823a' },
  snow: { runway: ['#f4f9ff', '#dfeaf8'], turf: ['#ffffff', '#eef4fc'], ground: '#e6eef8' },
  blossom: { runway: ['#ffc8e0', '#ffb2d4'], turf: ['#6fe07a', '#5fd06c'], ground: '#5cc868' },
  candy: { runway: ['#ffb8e8', '#ff9cd6'], turf: ['#b8ffd8', '#9ff0c4'], ground: '#ffd6f2' },
  mushroom: { runway: ['#a87cff', '#9266ef'], turf: ['#4cca6e', '#3fb85f'], ground: '#3aa858' },
  desert: { runway: ['#f0c27a', '#e2b06a'], turf: ['#e8c46e', '#dcb660'], ground: '#d8b06a' },
  volcano: { runway: ['#5a2e26', '#4a241e'], turf: ['#3a2622', '#30201c'], ground: '#2a1a16' },
  swamp: { runway: ['#6f8f4a', '#5f7f3e'], turf: ['#58ae46', '#4a9a3a'], ground: '#3f7a46' },
  crystal: { runway: ['#8a6aff', '#7454ef'], turf: ['#5cd89a', '#4cc88a'], ground: '#3a2a6a' },
  reef: { runway: ['#4cd8c0', '#38c4ae'], turf: ['#f2dca0', '#e6cf90'], ground: '#1a7ab8' },
  neon: { runway: ['#2a2440', '#221d36'], turf: ['#1f1a30', '#18142a'], ground: '#120e20' },
  sky: { runway: ['#ffffff', '#e8f4ff'], turf: ['#dff2ff', '#cfe8ff'], ground: '#bfe0ff' },
  rainbow: { runway: null, turf: ['#f4e8ff', '#e8dcff'], ground: '#d8c8ff' },
  moon: { runway: ['#b8bcc6', '#a4a8b4'], turf: ['#9a9ea8', '#8c909a'], ground: '#6f7380' },
  space: { runway: ['#2a2a6a', '#22225a'], turf: ['#1a1a40', '#141434'], ground: '#0c0c26' },
}

const S = STYLE
const pick = (list, t) => list[Math.floor(t * list.length) % list.length]
const ROOF = 0.55

/** A cottage or house: walls, a pitched roof (two slabs, ridge along the valley), a chimney. */
function house(out, x, w, h, d, wall, roof, wallStyle = S.SMOOTH, chimney = true) {
  out.push([x, h / 2, 0, w, h, d, wall, wallStyle])
  const slab = (w / 2) / Math.cos(ROOF) + 0.4
  const rise = (w / 4) * Math.tan(ROOF)
  out.push([x - w / 4, h + rise, 0, slab, 0.3, d + 0.6, roof, S.SMOOTH, 0, 0, ROOF])
  out.push([x + w / 4, h + rise, 0, slab, 0.3, d + 0.6, roof, S.SMOOTH, 0, 0, -ROOF])
  if (chimney) out.push([x + w * 0.22, h + rise * 2 + 0.2, d * 0.25, 0.7, 1.6, 0.7, '#8a5a44', S.STUDS])
}

/** A blocky tree: trunk and a leaf cube (two boxes). */
function tree(out, x, z, h, leaves, trunk = '#8a5a32', size = 3.4) {
  out.push([x, h / 2, z, 0.8, h, 0.8, trunk, S.SMOOTH])
  out.push([x, h + size * 0.4, z, size, size * 0.8, size, leaves, S.STUDS])
}

const BUILDERS = {
  meadow(out, { side, r, near }) {
    // Trees and bushes in the long grass, a flower patch now and then.
    const x = near(4) + side * r(1) * 18
    tree(out, x, 0, 2.6 + r(2) * 2.2, pick(['#3fcf4a', '#5fd84a', '#2fbf47'], r(3)))
    tree(out, x + side * 5, 4, 2 + r(4) * 1.5, pick(['#ff8fc8', '#5fd84a', '#ffd23f'], r(5)), '#8a5a32', 2.6)
    out.push([x - side * 3, 0.6, -3, 2.4, 1.2, 2.2, '#3fb83a', S.STUDS])
    out.push([x - side * 1.2, 0.25, 3.5, 1.6, 0.5, 1.6, pick(['#ff5fa8', '#ffd23f', '#ffffff'], r(6)), S.STUDS])
  },
  village(out, { side, r, near }) {
    // A cottage with a red, brown or blue roof, its door, and an apple tree.
    const w = 6 + Math.floor(r(1) * 3)
    const x = near(w) + side * r(2) * 6
    house(out, x, w, 3.2 + r(3), 5 + r(4) * 2, pick(['#fff4dc', '#ffe8c8', '#f4f0e8', '#ffe0e0'], r(5)), pick(['#d8463a', '#a85a32', '#3a6ad8', '#e8743a'], r(6)), S.SMOOTH, false)
    out.push([x - side * (w / 2 + 0.03), 1.05, 0, 0.1, 2.1, 1.2, '#7a4a2a', S.SMOOTH])
    tree(out, x + side * (w / 2 + 3), 2, 2.6, '#4fcf3a', '#8a5a32', 2.8)
  },
  farm(out, { side, r, near }) {
    // A red barn, a silo, a haystack - or a windmill.
    const x = near(8) + side * r(1) * 10
    if (r(2) < 0.3) {
      out.push([x, 4, 0, 2.6, 8, 2.6, '#f4f0e8', S.STUDS])
      out.push([x, 8.6, 0, 3.2, 1.2, 3.2, '#c84a3a', S.SMOOTH])
      out.push([x - side * 1.5, 7, 0, 0.3, 9, 1, '#ffffff', S.SMOOTH, 0.4, 0, 0])
      out.push([x - side * 1.5, 7, 0, 0.3, 1, 9, '#ffffff', S.SMOOTH, 0.4, 0, 0])
      out.push([x + side * 4, 0.9, 3, 2.4, 1.8, 2.4, '#ffd23f', S.STUDS])
      return
    }
    house(out, x, 8, 4.5, 7, '#d8382e', '#5a3a2a', S.STRIPES, false)
    out.push([x + side * 6.5, 5, 1, 3, 10, 3, '#c8ced8', S.STRIPES])
    out.push([x - side * 6, 1, -2, 2.2, 2, 2.2, '#ffd23f', S.STUDS])
  },
  town(out, { side, r, near }) {
    // Two-storey houses with windows, colourful roofs, a hedge - and a lamp post.
    const w = 7 + Math.floor(r(1) * 3)
    const x = near(w) + side * r(2) * 4
    house(out, x, w, 6 + r(3) * 2, 7, pick(['#fff4dc', '#ffd8b0', '#cfe8ff', '#ffe0f0', '#e0ffd8'], r(4)), pick(['#e84a3a', '#3a8ad8', '#2fae6a', '#ff9a2e', '#9a5ae8'], r(5)), S.WINDOWS)
    out.push([x - side * (w / 2 + 1.4), 0.6, 0, 1.2, 1.2, 7.6, '#3fae3a', S.STUDS])
    out.push([x - side * (w / 2 + 3), 2.4, 3.5, 0.3, 4.8, 0.3, '#3a3f4a', S.SMOOTH])
  },
  city(out, { side, r, near }) {
    // Skyscrapers: a tower with a setback, a cap and an aerial, and a lower block beside.
    const w = 8 + Math.floor(r(1) * 4) * 2
    const h = 16 + Math.floor(r(2) * 6) * 6
    const x = near(w) + side * r(3) * 8
    const c = pick(['#7fb8e8', '#9aa8c8', '#c8d0e0', '#6f8fb8', '#e8d8c0', '#a8c8d8'], r(4))
    out.push([x, h / 2, 0, w, h, w, c, S.WINDOWS])
    out.push([x, h + h * 0.15, 0, w * 0.65, h * 0.3, w * 0.65, c, S.WINDOWS])
    out.push([x, h * 1.3 + 0.4, 0, w * 0.7, 0.8, w * 0.7, '#3a3f4a', S.SMOOTH])
    out.push([x, h * 1.3 + 3, 0, 0.3, 5, 0.3, '#ff4a4a', S.GLOW])
    const w2 = w * 0.8
    out.push([x + side * (w / 2 + w2 / 2 + 1), h * 0.25, w * 0.3, w2, h * 0.5, w2, pick(['#d8c8b0', '#b8c8d8', '#c8b8d0'], r(5)), S.WINDOWS])
  },
  harbor(out, { side, r, near }) {
    // Warehouses and stacked crates on the quay - and a lighthouse now and then.
    const x = near(9) + side * r(1) * 6
    if (r(2) < 0.25) {
      out.push([x, 6, 0, 2.6, 12, 2.6, '#ffffff', S.STRIPES])
      out.push([x, 12.8, 0, 3, 1.6, 3, '#ffe27a', S.GLOW])
      out.push([x, 14.2, 0, 3.4, 1.2, 3.4, '#d8382e', S.SMOOTH])
      out.push([x, 0.4, 0, 5, 0.8, 5, '#9aa3b2', S.STUDS])
      return
    }
    house(out, x, 9, 5, 10, pick(['#3a7ad8', '#d8743a', '#3aae8a'], r(3)), '#5a6474', S.STRIPES, false)
    out.push([x - side * 6.5, 1, 2, 2, 2, 2, pick(['#ff6a3a', '#ffd23f', '#3a9ad8'], r(4)), S.PLATE])
    out.push([x - side * 6.5, 3, 2, 2, 2, 2, pick(['#3ad86a', '#ff5fa8', '#ffffff'], r(5)), S.PLATE])
  },
  beach(out, { side, r, near }) {
    // A palm and a beach umbrella with a deck chair.
    const x = near(3) + side * r(1) * 14
    const h = 7 + r(2) * 5
    const turn = r(3) * Math.PI
    out.push([x, h / 2, 0, 0.7, h, 0.7, '#9a6a3a', S.SMOOTH])
    out.push([x, h + 0.1, 0, 5, 0.18, 0.9, '#2fae4a', S.SMOOTH, 0, turn, 0])
    out.push([x, h + 0.15, 0, 5, 0.18, 0.9, '#4cd36a', S.SMOOTH, 0, turn + Math.PI / 2, 0])
    const ux = x + side * 5
    const canopy = pick(['#ff6f61', '#16b8c4', '#ffd27a', '#ff5fa8'], r(4))
    out.push([ux, 1.35, 3, 0.14, 2.7, 0.14, '#ffffff', S.SMOOTH])
    out.push([ux, 2.72, 3, 2.8, 0.12, 2.8, canopy, S.STRIPES, 0, turn, 0])
    out.push([ux + 1.6, 0.22, 3, 0.8, 0.44, 1.6, canopy, S.STRIPES, 0, turn, 0])
  },
  jungle(out, { side, r, near }) {
    // Giant jungle trees, layered canopies, bushes.
    const x = near(5) + side * r(1) * 14
    const h = 8 + r(2) * 6
    out.push([x, h / 2, 0, 1.4, h, 1.4, '#6a4424', S.SMOOTH])
    out.push([x, h, 0, 7, 2, 7, '#1f8a32', S.STUDS])
    out.push([x, h + 2, 0, 4.5, 2, 4.5, '#2fae3a', S.STUDS])
    out.push([x - side * 4, 1, 3, 3, 2, 3, '#3fbf3a', S.STUDS])
    out.push([x + side * 3, 0.8, -3, 2.4, 1.6, 2.4, '#27a03a', S.STUDS])
    out.push([x, h * 0.6, 0.75, 0.25, h * 0.6, 0.25, '#5fcf4a', S.SMOOTH])
  },
  snow(out, { side, r, near }) {
    // Snowy cottages (or an igloo) and snow-capped pines.
    const x = near(6) + side * r(1) * 8
    if (r(2) < 0.35) {
      out.push([x, 1.6, 0, 6, 3.2, 6, '#ffffff', S.STUDS])
      out.push([x, 3.6, 0, 4, 1.4, 4, '#f4f9ff', S.STUDS])
      out.push([x - side * 3.2, 1, 0, 1.4, 2, 2, '#dfeaf8', S.STUDS])
    } else {
      house(out, x, 6, 3.4, 6, pick(['#c8743a', '#a85a32', '#d8a06a'], r(3)), '#ffffff', S.SMOOTH, false)
    }
    const px = x + side * 6
    out.push([px, 2, 2, 3.2, 2.6, 3.2, '#2a8a4a', S.STUDS])
    out.push([px, 4.4, 2, 2, 2.2, 2, '#ffffff', S.STUDS])
  },
  blossom(out, { side, r, near }) {
    // Pagoda-roofed houses under cherry trees.
    const x = near(6) + side * r(1) * 8
    house(out, x, 6, 3.6, 6, '#fff4e8', pick(['#c83a5a', '#3a3a5a'], r(2)), S.SMOOTH, false)
    tree(out, x + side * 6, 1, 3, pick(['#ffb8d8', '#ff8fc8', '#ffd0e8'], r(3)), '#6a3a2a', 4)
    out.push([x - side * 4.5, 1.2, 3, 0.6, 2.4, 0.6, '#ff5a5a', S.GLOW])
  },
  candy(out, { side, r, near }) {
    // Candy houses with frosted roofs, lollipops and gumdrops.
    const x = near(6) + side * r(1) * 8
    out.push([x, 2, 0, 6, 4, 6, pick(['#ff9cd6', '#9fdcff', '#c8ffb8', '#fff1a8'], r(2)), S.STRIPES])
    out.push([x, 4.6, 0, 6.8, 1.4, 6.8, '#ffffff', S.MESA])
    out.push([x + side * 5, 2.5, 2, 0.3, 5, 0.3, '#ffffff', S.SMOOTH])
    out.push([x + side * 5, 5.4, 2, 2.4, 2.4, 0.5, pick(['#ff4a8a', '#3fd0ff', '#ffd23f', '#9a5aff'], r(3)), S.RAINBOW])
    out.push([x - side * 4.5, 0.8, -2, 1.6, 1.6, 1.6, pick(['#ff5a5a', '#5aff8a', '#ffd23f'], r(4)), S.GLOW])
  },
  mushroom(out, { side, r, near }) {
    // Giant mushrooms (red with white spots, or purple), and little ones.
    const x = near(6) + side * r(1) * 12
    const h = 4 + r(2) * 4
    out.push([x, h / 2, 0, 1.6, h, 1.6, '#fff4e8', S.SMOOTH])
    out.push([x, h + 0.8, 0, 6, 1.6, 6, pick(['#e8382e', '#9a4aff', '#ff8a2e'], r(3)), S.STUDS])
    out.push([x, h + 1.8, 0, 3.6, 0.8, 3.6, '#ffffff', S.STUDS])
    out.push([x - side * 4, 0.8, 2, 0.6, 1.6, 0.6, '#fff4e8', S.SMOOTH])
    out.push([x - side * 4, 1.9, 2, 2, 0.7, 2, '#ff5a9a', S.GLOW])
  },
  desert(out, { side, r, near }) {
    // Adobe houses with flat roofs, and saguaro cacti.
    const x = near(6) + side * r(1) * 10
    out.push([x, 2, 0, 6, 4, 6, pick(['#e8b878', '#d8a868', '#f0c890'], r(2)), S.STUDS])
    out.push([x, 4.2, 0, 6.6, 0.5, 6.6, '#c89858', S.SMOOTH])
    out.push([x - side * 3.03, 1.1, 0, 0.1, 2.2, 1.3, '#6a3a1a', S.SMOOTH])
    const cx = x + side * 6
    out.push([cx, 2.5, 3, 1, 5, 1, '#3f9a3a', S.STUDS])
    out.push([cx - 0.9, 3, 3, 0.9, 0.7, 0.7, '#3f9a3a', S.STUDS])
    out.push([cx - 1.2, 3.8, 3, 0.7, 1.6, 0.7, '#3f9a3a', S.STUDS])
  },
  volcano(out, { side, r, near }) {
    // Dark rocks with glowing lava between them.
    const x = near(7) + side * r(1) * 14
    const h = 3 + r(2) * 6
    out.push([x, h / 2, 0, 6, h, 6, '#3a2420', S.STUDS])
    out.push([x + side * 2, h + 1, 1, 3, 2, 3, '#4a2a24', S.STUDS])
    out.push([x - side * 4.5, 0.1, 0, 4, 0.2, 5, '#ff6a1c', S.LAVA])
    out.push([x - side * 2, 1.2, -3, 2, 2.4, 2, '#2a1a16', S.STUDS])
    out.push([x, h + 0.05, 0, 2, 0.1, 2, '#ff9a2e', S.GLOW])
  },
  swamp(out, { side, r, near }) {
    // Huts on stilts and bare, twisted trees.
    const x = near(5) + side * r(1) * 10
    for (const dx of [-1.6, 1.6]) out.push([x + dx, 1.2, 0, 0.4, 2.4, 0.4, '#5a4a2a', S.SMOOTH])
    out.push([x, 2.5, 0, 5, 0.3, 4, '#7a6a3a', S.SMOOTH])
    out.push([x, 3.9, 0, 3.6, 2.6, 3, '#8a7a4a', S.STUDS])
    out.push([x, 5.6, 0, 4.4, 0.8, 3.8, '#4a6a2a', S.SMOOTH])
    out.push([x + side * 5, 3, 3, 0.6, 6, 0.6, '#4a3a2a', S.SMOOTH, 0, 0, side * 0.2])
  },
  crystal(out, { side, r, near }) {
    // Glowing crystal spires on rock.
    const x = near(5) + side * r(1) * 14
    const c = pick(['#c08bff', '#7fe8ff', '#ff8fd8'], r(2))
    const h = 5 + r(3) * 6
    out.push([x, 0.8, 0, 6, 1.6, 6, '#3a2a5a', S.STUDS])
    out.push([x, 1.6 + h / 2, 0, 1.6, h, 1.6, c, S.GLOW, 0.15, 0.6, 0.12])
    out.push([x + 1.6, 1.6 + h * 0.3, 0.8, 1.1, h * 0.6, 1.1, c, S.GLOW, -0.3, 0.2, -0.25])
    out.push([x - 1.4, 1.6 + h * 0.25, -0.8, 1, h * 0.5, 1, '#ffffff', S.GLOW, 0.25, 1, 0.3])
  },
  reef(out, { side, r, near }) {
    // Coral towers and sea fans in bright colours.
    const x = near(4) + side * r(1) * 14
    out.push([x, 2, 0, 1.4, 4, 1.4, pick(['#ff6f61', '#ff8fd0', '#ffb84a'], r(2)), S.GLOW])
    out.push([x + 1, 3.4, 0, 0.9, 2.4, 0.9, pick(['#ff9a6a', '#ffd23f'], r(3)), S.GLOW, 0, 0, -0.5])
    out.push([x - 1, 3, 0, 0.9, 2, 0.9, pick(['#c86aff', '#ff5fa8'], r(4)), S.GLOW, 0, 0, 0.5])
    out.push([x - side * 4, 1.6, 2, 3, 3.2, 0.3, pick(['#9a5aff', '#3fd0ff'], r(5)), S.SMOOTH])
    out.push([x + side * 3, 0.5, -2, 2, 1, 2, '#f2dca0', S.STUDS])
  },
  neon(out, { side, r, near }) {
    // Dark towers with neon signs and glowing strips.
    const w = 8 + Math.floor(r(1) * 3) * 2
    const h = 18 + Math.floor(r(2) * 5) * 6
    const x = near(w) + side * r(3) * 8
    const glow = pick(['#ff3bd8', '#3bffd8', '#ffd23f', '#3b8aff', '#ff5a3b'], r(4))
    out.push([x, h / 2, 0, w, h, w, '#2a2a4a', S.WINDOWS])
    out.push([x - side * (w / 2 + 0.05), h * 0.6, 0, 0.2, 3, w * 0.7, glow, S.GLOW])
    out.push([x, h + 0.3, 0, w + 0.4, 0.4, w + 0.4, glow, S.GLOW])
    out.push([x, h * 0.3, -(w / 2 + 0.05), w * 0.8, 0.4, 0.2, pick(['#ff3bd8', '#3bffd8'], r(5)), S.GLOW])
    out.push([x + side * (w / 2 + 4), h * 0.3, w * 0.2, 6, h * 0.6, 6, '#3a2a5a', S.WINDOWS])
  },
  sky(out, { side, r, near }) {
    // Puffy cloud blocks and floating castle towers.
    const x = near(6) + side * r(1) * 16
    const y = 2 + r(2) * 8
    out.push([x, y, 0, 8, 2.4, 6, '#ffffff', S.SMOOTH])
    out.push([x + 2, y + 1.6, 0, 4, 2, 4, '#ffffff', S.SMOOTH])
    if (r(3) < 0.5) {
      out.push([x, y + 4.2, 0, 2.4, 5, 2.4, '#e8f0ff', S.STRIPES])
      out.push([x, y + 7.2, 0, 3, 1, 3, '#5a8aff', S.SMOOTH])
      out.push([x, y + 8.6, 0, 0.2, 2, 0.2, '#ffd23f', S.GLOW])
    }
  },
  rainbow(out, { side, r, near, k }) {
    // Rainbow arches standing on clouds.
    const x = near(10) + side * r(1) * 10
    const h = 8 + r(2) * 6
    out.push([x - 4, h / 2, 0, 1.2, h, 1.2, '#ffffff', S.RAINBOW])
    out.push([x + 4, h / 2, 0, 1.2, h, 1.2, '#ffffff', S.RAINBOW])
    out.push([x, h + 0.6, 0, 9.2, 1.2, 1.2, '#ffffff', S.RAINBOW])
    out.push([x - 4, 0.6, 0, 3.4, 1.4, 3, '#ffffff', S.SMOOTH])
    out.push([x + 4, 0.6, 0, 3.4, 1.4, 3, '#ffffff', S.SMOOTH])
    if (k % 3 === 0) out.push([x, h + 2.2, 0, 1.4, 1.4, 1.4, '#ffd23f', S.GLOW, 0.6, 0.6, 0])
  },
  moon(out, { side, r, near }) {
    // Moon base modules, domes and antennae among crater rims.
    const x = near(6) + side * r(1) * 14
    out.push([x, 1.5, 0, 6, 3, 4, '#e8ecf4', S.PLATE])
    out.push([x, 3.6, 0, 3.6, 1.4, 3.6, '#bfe8ff', S.GLOW])
    out.push([x + side * 4, 4, 0, 0.3, 8, 0.3, '#c8ccd6', S.SMOOTH])
    out.push([x + side * 4, 8.2, 0, 1.6, 0.4, 1.6, '#ff4a4a', S.GLOW])
    out.push([x + side * 5, 0.4, 3, 5, 0.8, 1, '#8c909a', S.STUDS])
    out.push([x + side * 5, 0.4, -3, 5, 0.8, 1, '#8c909a', S.STUDS])
  },
  space(out, { side, r, near }) {
    // Galaxy towers with glowing beacons, and drifting asteroids.
    const x = near(5) + side * r(1) * 16
    const h = 10 + r(2) * 14
    out.push([x, h / 2, 0, 3, h, 3, '#3a2a8a', S.GALAXY])
    out.push([x, h + 0.8, 0, 1.6, 1.6, 1.6, pick(['#ff5fd2', '#5fe8ff', '#ffd23f'], r(3)), S.GLOW])
    out.push([x, h * 0.6, 0, 6, 0.4, 6, '#7a5aff', S.GLOW, 0, r(4), 0])
    out.push([x + side * 7, 6 + r(5) * 8, 3, 2.4, 2, 2.2, '#6a6070', S.STUDS, r(6) * 3, r(7) * 3, 0])
    out.push([x + side * 4, 3 + r(8) * 6, -3, 1.4, 1.2, 1.4, '#7a7080', S.STUDS, r(9) * 3, 0, r(1) * 3])
  },
}

/** The boxes of piece `k` in scene `scene` (falls back to the meadow). Reuses `out`. */
export function sceneryPiece(scene, k, side, r, near, out) {
  out.length = 0
  ;(BUILDERS[scene] ?? BUILDERS.meadow)(out, { side, r, near, k })
  if (out.length > PIECE_PARTS) out.length = PIECE_PARTS
  return out
}
