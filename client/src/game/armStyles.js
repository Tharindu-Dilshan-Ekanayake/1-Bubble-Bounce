import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { armGrowth } from '@shared/balance'

import { glowTime } from './glow'

/**
 * How every pair of arms in the shop looks (shared/balance.js TIRES - the ids are the
 * template's, the names are arms): a procedural pattern and three colours, drawn by one
 * GLSL function (ARM_GLSL). The same function paints the arms of your Bloxity avatar
 * (patchArmMaterial, on its merged body: one draw call, one program) and the floating
 * arms on the shop's stands (createArmDisplayMesh: every stand in one draw call). No
 * textures: everything is maths on the arm's rest-pose position, so stripes and spots
 * stretch with the arm when it stretches like rubber.
 *
 *   pattern  what ARM_GLSL draws (ARM_PATTERN)
 *   a, b, c  base, design and accent colours (what each is depends on the pattern)
 *   glow     how much it shines on its own (0-1)
 *   skin     the avatar keeps its own skin on these arms (the starter Noodle Arms)
 *   trail    the colour of your flight's trail, speed lines and stand trim
 */

export const ARM_PATTERN = {
  SOLID: 0,
  RINGS: 1,
  SPOTS: 2,
  CANDY: 3,
  JELLY: 4,
  STONE: 5,
  BAMBOO: 6,
  SUCKERS: 7,
  ROBOT: 8,
  ZEBRA: 9,
  CHROME: 10,
  FROST: 11,
  GILDED: 12,
  MAGMA: 13,
  THUNDER: 14,
  GEM: 15,
  SPECTRUM: 16,
  COTTON: 17,
  NEBULA: 18,
  SCALES: 19,
  COSMIC: 20,
  PRISM: 21,
}

const P = ARM_PATTERN

export const ARM_STYLES = {
  bicycle: { pattern: P.SOLID, a: '#ffd86b', b: '#f2b33d', c: '#fff2b0', skin: true, trail: '#ffd86b' },
  mountain: { pattern: P.RINGS, a: '#ff5050', b: '#ffd21f', c: '#ffffff', trail: '#ff7a5a' },
  wood: { pattern: P.SPOTS, a: '#7ee35a', b: '#ff6ad5', c: '#ffffff', trail: '#9dff6a' },
  stone: { pattern: P.CANDY, a: '#ff8fd0', b: '#ffffff', c: '#ff4fa8', trail: '#ff9cd6' },
  cookie: { pattern: P.JELLY, a: '#3fb8ff', b: '#9fe8ff', c: '#ffffff', glow: 0.12, trail: '#7fd8ff' },
  pizza: { pattern: P.STONE, a: '#8d939c', b: '#c3c8cf', c: '#34373e', trail: '#d6dce6' },
  donut: { pattern: P.BAMBOO, a: '#a6d65a', b: '#6fae3a', c: '#4a7a22', trail: '#b6ff6a' },
  watermelon: { pattern: P.SUCKERS, a: '#a64cff', b: '#ffb3e6', c: '#6a24c8', trail: '#c58cff' },
  monster: { pattern: P.ROBOT, a: '#c4ccd8', b: '#8a96a8', c: '#3fe0ff', glow: 0.05, trail: '#5fe8ff' },
  mint: { pattern: P.ZEBRA, a: '#151519', b: '#f4f4f4', c: '#ffffff', trail: '#ffffff' },
  silver: { pattern: P.CHROME, a: '#eef2f8', b: '#7d8aa0', c: '#ffffff', glow: 0.05, trail: '#e8f0ff' },
  ice: { pattern: P.FROST, a: '#c9f1ff', b: '#5fb6ee', c: '#ffffff', glow: 0.1, trail: '#bff4ff' },
  gold: { pattern: P.GILDED, a: '#ffc81a', b: '#fff1a8', c: '#c27a00', glow: 0.16, trail: '#ffd21f' },
  lava: { pattern: P.MAGMA, a: '#2a0f0b', b: '#ff5a14', c: '#ffd21f', trail: '#ff5a1c' },
  platinum: { pattern: P.THUNDER, a: '#1c2a5c', b: '#2f4fa8', c: '#9ff4ff', trail: '#7fe6ff' },
  emerald: { pattern: P.GEM, a: '#2bd17a', b: '#0a6b34', c: '#d6ffe6', glow: 0.12, trail: '#7dffb0' },
  ruby: { pattern: P.GEM, a: '#ff3b5c', b: '#7a0a22', c: '#ffd6de', glow: 0.12, trail: '#ff7a90' },
  diamond: { pattern: P.GEM, a: '#bff0ff', b: '#4fc0ff', c: '#ffffff', glow: 0.12, trail: '#bff4ff' },
  rainbow: { pattern: P.SPECTRUM, a: '#ffffff', b: '#ffffff', c: '#ffffff', glow: 0.22, trail: '#ff7ad9' },
  unicorn: { pattern: P.COTTON, a: '#ffb6e6', b: '#a8d8ff', c: '#ffffff', glow: 0.06, trail: '#ffb0f0' },
  galaxy: { pattern: P.NEBULA, a: '#120a2a', b: '#7a3cff', c: '#5fd6ff', trail: '#a46bff' },
  dragon: { pattern: P.SCALES, a: '#22a552', b: '#0d4f26', c: '#ffd21f', trail: '#4cff7a' },
  cosmic: { pattern: P.COSMIC, a: '#0b1738', b: '#ff3d8a', c: '#ffd24a', trail: '#ff9ed8' },
  infinity: { pattern: P.PRISM, a: '#ffffff', b: '#ffffff', c: '#ffffff', glow: 0.3, trail: '#ffffff' },
}

// Parsed once: frame code looks colours up without allocating.
const PARSED = Object.fromEntries(
  Object.entries(ARM_STYLES).map(([id, s]) => [
    id,
    { ...s, a: new Color(s.a), b: new Color(s.b), c: new Color(s.c), trail: new Color(s.trail), glow: s.glow ?? 0 },
  ]),
)
const styleOf = (id) => PARSED[id] || PARSED.bicycle

/** How grown your rubber arms are (0-1): shared/balance armGrowth, used by the server too. */
export { armGrowth }

/** The colour of arms `id`'s trail, speed lines and glows. */
export const armTrail = (id) => styleOf(id).trail
/** Arms `id`'s base colour (its stand's cap). */
export const armBase = (id) => styleOf(id).a

/**
 * The arm painter, in GLSL. `p` is the arm's rest-pose position in the Bloxity rig's
 * units (the avatar is ~6.4 tall, an arm ~2 long, hanging down along y); `t` is a clock
 * for the animated ones. Returns the colour and how much it glows (0-1).
 *
 * Kept cheap to compile as well as to run: the cell pattern (a 3x3 loop) and the two
 * noises are each evaluated once, at a scale picked by the pattern, and every pattern
 * shades from those. (Called from every branch instead, Windows' shader compiler unrolled
 * the loop eight times over and the avatar's program took ~1 s to build on a phone-speed
 * CPU, stalling the first frame it appeared in.)
 */
export const ARM_GLSL = /* glsl */ `
  float aHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float aNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), f.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // Nearest and second-nearest cell distances, and the nearest cell's id (0-1).
  vec3 aCells(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(aHash(i + g), aHash(i + g + 17.7));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = aHash(i + g + 3.3); }
        else if (d < d2) { d2 = d; }
      }
    }
    return vec3(sqrt(d1), sqrt(d2), id);
  }
  vec3 aHue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
  vec4 armLook(vec3 p, float pattern, vec3 a, vec3 b, vec3 c, float glow, float t) {
    float y = p.y;
    vec2 q = vec2(p.x + p.z, p.y);
    int k = int(pattern + 0.5);
    // Each pattern's cell and noise scales (and drift), then one evaluation of each.
    float cs = k == 2 ? 2.6 : k == 5 ? 2.0 : k == 7 ? 3.2 : k == 13 ? 2.2 : k == 15 ? 2.8 : 2.4;
    vec2 drift = k == 13 ? vec2(0.0, t * 0.15) : vec2(0.0);
    bool cellular = k == 2 || k == 5 || k == 7 || k == 11 || k == 13 || k == 15 || k == 21;
    vec3 cl = cellular ? aCells(q * cs + drift) : vec3(1.0, 1.0, 0.0);
    float edge = cl.y - cl.x;
    float ns = k == 4 ? 3.0 : k == 9 ? 2.0 : k == 14 ? 3.0 : k == 17 ? 1.6 : k == 13 ? 4.0 : 2.0;
    vec2 nd = k == 4 ? vec2(0.0, t * 0.6) : k == 17 ? vec2(t * 0.1, 0.0) : k == 13 ? vec2(t) : vec2(0.0, t * 0.08);
    float n1 = aNoise(q * ns + nd);
    float n2 = aNoise(q * 5.5);
    vec3 col = a;
    float emit = glow;
    if (k == 1) {
      col = mix(a, b, step(0.5, fract(y * 2.2)));
    } else if (k == 2) {
      col = mix(a, b, 1.0 - smoothstep(0.22, 0.32, cl.x));
    } else if (k == 3) {
      col = mix(a, b, step(0.5, fract((y + (p.x + p.z) * 0.8) * 1.6)));
    } else if (k == 4) {
      col = mix(a, b, smoothstep(0.55, 0.8, n1)) + c * smoothstep(0.8, 0.92, n1) * 0.6;
    } else if (k == 5) {
      col = mix(c, mix(a, b, n2 * 0.6), smoothstep(0.02, 0.07, edge));
    } else if (k == 6) {
      float f = fract(y * 1.3);
      float node = 1.0 - smoothstep(0.0, 0.08, min(f, 1.0 - f));
      col = mix(mix(a, b, n2 * 0.4), c, node);
    } else if (k == 7) {
      float cup = 1.0 - smoothstep(0.17, 0.21, cl.x);
      float rim = smoothstep(0.17, 0.21, cl.x) * (1.0 - smoothstep(0.27, 0.31, cl.x));
      col = mix(mix(a, b, cup), c, rim);
    } else if (k == 8) {
      vec2 cell = q * vec2(1.6, 1.4);
      vec2 g = fract(cell);
      float seam = 1.0 - smoothstep(0.0, 0.05, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
      col = mix(mix(a, b, step(0.5, aHash(floor(cell))) * 0.3), vec3(0.1, 0.12, 0.16), seam);
      float light = step(0.92, fract(y * 1.4)) * (0.6 + 0.4 * sin(t * 4.0 + y * 3.0));
      col = mix(col, c, light);
      emit = max(emit, light);
    } else if (k == 9) {
      float w = sin(y * 9.0 + sin((p.x + p.z) * 6.0) * 1.4 + n1 * 2.0);
      col = mix(a, b, smoothstep(-0.15, 0.15, w));
    } else if (k == 10) {
      float r = 0.5 + 0.5 * sin(y * 3.0 + (p.x - p.z) * 4.0);
      col = mix(mix(b, a, r), c, smoothstep(0.92, 1.0, r) * 0.7);
    } else if (k == 11) {
      col = mix(a, b, 1.0 - smoothstep(0.02, 0.06, edge));
      float sp = step(0.985, aHash(floor(q * 18.0) + floor(t * 3.0)));
      col = mix(col, c, sp);
      emit = max(emit, sp);
    } else if (k == 12) {
      float r = 0.5 + 0.5 * sin(y * 3.5 + (p.x + p.z) * 2.0);
      float band = 1.0 - smoothstep(0.0, 0.05, abs(abs(fract(y * 1.2) - 0.5) - 0.4));
      col = mix(mix(a, b, r * 0.6), c, band * 0.8);
    } else if (k == 13) {
      float crack = 1.0 - smoothstep(0.02, 0.09, edge);
      col = mix(a, mix(b, c, n1), crack);
      emit = max(emit, crack * (0.75 + 0.25 * sin(t * 3.0 + y * 2.0)));
    } else if (k == 14) {
      float z = abs(fract((p.x + p.z) * 1.2 + abs(fract(y * 2.0) - 0.5) * 0.9 + t * 0.4) - 0.5);
      float bolt = 1.0 - smoothstep(0.03, 0.07, z);
      float flick = step(0.35, fract(sin(floor(t * 8.0)) * 43758.5));
      col = mix(mix(a, b, n1 * 0.5), c, bolt);
      emit = max(emit, bolt * (0.5 + 0.5 * flick));
    } else if (k == 15) {
      col = mix(a, b, cl.z * 0.8);
      col = mix(col, c, smoothstep(0.85, 1.0, cl.z) * 0.8);
      col = mix(col, c, 1.0 - smoothstep(0.0, 0.04, edge));
      emit = max(emit, pow(max(0.0, sin(t * 2.0 + cl.z * 30.0)), 24.0) * 0.8);
    } else if (k == 16) {
      col = mix(aHue(fract(y * 0.5 - t * 0.25)), vec3(1.0), 0.18);
    } else if (k == 17) {
      float s = sin((y + n1 * 2.2) * 4.0);
      col = mix(mix(a, b, smoothstep(-0.6, 0.6, s)), c, smoothstep(0.6, 0.95, n1));
    } else if (k == 18 || k == 20) {
      float n = n1 * 0.65 + n2 * 0.35;
      col = mix(a, b, smoothstep(0.35, 0.75, n));
      col = mix(col, c, smoothstep(0.7, 0.95, n) * 0.8);
      vec2 cellS = floor(q * 22.0);
      float star = step(0.975, aHash(cellS)) * (0.5 + 0.5 * sin(t * 4.0 + aHash(cellS + 5.0) * 30.0));
      col = mix(col, vec3(1.0), star);
      emit = max(emit, star + smoothstep(0.7, 0.95, n) * 0.3);
    } else if (k == 19) {
      float row = floor(q.y * 3.2);
      vec2 sq = vec2(q.x * 3.2 + mod(row, 2.0) * 0.5, q.y * 3.2);
      float d = length((fract(sq) - vec2(0.5, 0.25)) * vec2(1.0, 1.3));
      col = mix(a, b, smoothstep(0.2, 0.48, d));
      col = mix(col, c, smoothstep(0.38, 0.44, d) * (1.0 - smoothstep(0.46, 0.5, d)));
    } else if (k == 21) {
      col = aHue(fract(cl.z + t * 0.2 + y * 0.15));
      col = mix(col, vec3(1.0), 0.25 + 0.3 * (1.0 - smoothstep(0.0, 0.05, edge)));
      emit = max(emit, 0.35);
    } else {
      col = mix(a, b, smoothstep(1.5, -1.5, y) * 0.35);
    }
    return vec4(col, emit);
  }
`

// --- Your avatar's arms ---------------------------------------------------------------

/**
 * Teaches a merged avatar body's material (avatarRig.mergeBody; its geometry carries an
 * `aArm` attribute, 1 on the arms) to paint the arms. Every avatar shares one program
 * (customProgramCacheKey); each has its own uniforms, set by setArmLook.
 */
export function patchArmMaterial(material) {
  const uniforms = {
    uArmA: { value: new Color() },
    uArmB: { value: new Color() },
    uArmC: { value: new Color() },
    // pattern, glow, mix (0 = the avatar's own skin), hidden (1: rubber arms drawn instead)
    uArmStyle: { value: [0, 0, 0, 0] },
    uArmTime: glowTime,
  }
  material.userData.arm = { uniforms, id: null }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aArm;\nuniform vec4 uArmStyle;\nvarying float vArm;\nvarying vec3 vArmP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArm = aArm;\nvArmP = position;\nif (aArm > 0.5 && uArmStyle.w > 0.5) transformed = vec3(0.0);')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uArmA;
        uniform vec3 uArmB;
        uniform vec3 uArmC;
        uniform vec4 uArmStyle;
        uniform float uArmTime;
        varying float vArm;
        varying vec3 vArmP;
        ${ARM_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec4 armPaint = vec4(0.0);
        if (vArm > 0.5 && uArmStyle.z > 0.0) {
          armPaint = armLook(vArmP, uArmStyle.x, uArmA, uArmB, uArmC, uArmStyle.y, uArmTime);
          diffuseColor.rgb = mix(diffuseColor.rgb, armPaint.rgb, uArmStyle.z);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += armPaint.rgb * armPaint.a * uArmStyle.z * 0.8;',
      )
  }
  material.customProgramCacheKey = () => 'arm-body-v1'
  material.needsUpdate = true
  return material
}

/**
 * Dresses a patched body material's arms as arms `id` - or, `hide`, folds them away (the
 * rubber arms are drawn in their place: createRubberArms). Cheap; a no-op when unchanged.
 */
export function setArmLook(material, id, hide = false) {
  const arm = material?.userData?.arm
  if (!arm || (arm.id === id && arm.hide === hide)) return
  arm.id = id
  arm.hide = hide
  const s = styleOf(id)
  const u = arm.uniforms
  u.uArmA.value.copy(s.a)
  u.uArmB.value.copy(s.b)
  u.uArmC.value.copy(s.c)
  u.uArmStyle.value = [s.pattern, s.glow, s.skin ? 0 : 1, hide ? 1 : 0]
}

// --- The shop's floating arms -----------------------------------------------------------

/**
 * A flexing arm, built straight out of a few rounded pieces: a cuff at the shoulder, the
 * upper arm lying sideways, the forearm standing up from the elbow, a bulging bicep and
 * a blocky fist with knuckles and a thumb on top. Low-poly (~450 triangles): they're seen
 * from across the plaza. Each piece carries `aArmP`, its position as if the arm were
 * hanging straight in the avatar rig's units, so the patterns run along it just as they
 * do on an avatar. About 2.6 units across; centred.
 */
function createFlexGeometry() {
  const pieces = []
  const m = new Matrix4()
  const add = (geometry, alongOffset, matrix) => {
    const g = geometry.toNonIndexed()
    geometry.dispose()
    const pos = g.getAttribute('position')
    const armP = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i += 1) {
      armP[i * 3] = pos.getX(i)
      armP[i * 3 + 1] = pos.getY(i) + alongOffset
      armP[i * 3 + 2] = pos.getZ(i)
    }
    g.setAttribute('aArmP', new BufferAttribute(armP, 3))
    g.applyMatrix4(matrix)
    pieces.push(g)
  }
  // A cuff where it would join the shoulder, then the upper arm out to the elbow, lying
  // along +X.
  add(new CylinderGeometry(0.46, 0.46, 0.22, 10, 1), 3.95, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(-0.95, -0.75, 0))
  add(new CylinderGeometry(0.34, 0.38, 1.3, 10, 1), 3.4, m.makeRotationZ(Math.PI / 2).setPosition(-0.25, -0.75, 0))
  // The bicep's bulge on top of it.
  add(new SphereGeometry(0.5, 10, 7), 3.5, new Matrix4().makeScale(1.3, 0.95, 0.95).setPosition(-0.3, -0.38, 0))
  // Elbow.
  add(new SphereGeometry(0.37, 8, 6), 2.8, new Matrix4().makeTranslation(0.45, -0.72, 0))
  // Forearm, standing up from the elbow.
  add(new CylinderGeometry(0.38, 0.31, 1.15, 10, 1), 2.2, new Matrix4().makeTranslation(0.5, -0.12, 0))
  // The fist: a chunky block, four knuckles along its top edge curled towards the
  // shoulder, and a thumb folded across them.
  add(new BoxGeometry(0.82, 0.74, 0.8, 1, 1, 1), 1.6, new Matrix4().makeTranslation(0.5, 0.74, 0))
  for (let i = 0; i < 4; i += 1) {
    add(new SphereGeometry(0.14, 6, 4), 1.2, new Matrix4().makeTranslation(0.1, 1.06, -0.3 + i * 0.2))
  }
  add(new BoxGeometry(0.24, 0.24, 0.62, 1, 1, 1), 1.3, new Matrix4().makeRotationY(0.2).setPosition(0.05, 0.72, 0.18))
  const merged = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  merged.computeBoundingSphere()
  return merged
}

let flexGeometry = null
let displayMaterial = null

function getDisplayMaterial() {
  if (displayMaterial) return displayMaterial
  const material = new MeshLambertMaterial({ color: 0xffffff })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uArmTime = glowTime
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aArmP;
        attribute vec3 aArmA;
        attribute vec3 aArmB;
        attribute vec3 aArmC;
        attribute vec2 aArmStyle;
        varying vec3 vArmP;
        varying vec3 vArmA;
        varying vec3 vArmB;
        varying vec3 vArmC;
        varying vec2 vArmStyle;`,
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvArmP = aArmP; vArmA = aArmA; vArmB = aArmB; vArmC = aArmC; vArmStyle = aArmStyle;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uArmTime;
        varying vec3 vArmP;
        varying vec3 vArmA;
        varying vec3 vArmB;
        varying vec3 vArmC;
        varying vec2 vArmStyle;
        ${ARM_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec4 armPaint = armLook(vArmP, vArmStyle.x, vArmA, vArmB, vArmC, vArmStyle.y, uArmTime);
        diffuseColor.rgb = armPaint.rgb;`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += armPaint.rgb * armPaint.a * 0.8;')
  }
  material.customProgramCacheKey = () => 'arm-display-v1'
  displayMaterial = material
  return material
}

/**
 * Up to `max` floating flexed arms in one draw call. `mesh.setArm(i, id)` dresses
 * instance i as arms `id` (cheap; call once when it changes). The geometry and material
 * are shared by every display mesh; disposeArmDisplayMesh frees only the instance data.
 */
export function createArmDisplayMesh(max) {
  flexGeometry ??= createFlexGeometry()
  const geometry = flexGeometry.clone()
  const attr = (name, size) => {
    const a = new InstancedBufferAttribute(new Float32Array(max * size), size)
    geometry.setAttribute(name, a)
    return a
  }
  const aA = attr('aArmA', 3)
  const aB = attr('aArmB', 3)
  const aC = attr('aArmC', 3)
  const aStyle = attr('aArmStyle', 2)
  const mesh = new InstancedMesh(geometry, getDisplayMaterial(), max)
  mesh.frustumCulled = false
  mesh.setArm = (i, id) => {
    const s = styleOf(id)
    aA.setXYZ(i, s.a.r, s.a.g, s.a.b)
    aB.setXYZ(i, s.b.r, s.b.g, s.b.b)
    aC.setXYZ(i, s.c.r, s.c.g, s.c.b)
    aStyle.setXY(i, s.pattern, s.glow)
    aA.needsUpdate = true
    aB.needsUpdate = true
    aC.needsUpdate = true
    aStyle.needsUpdate = true
  }
  return mesh
}

export function disposeArmDisplayMesh(mesh) {
  mesh.geometry.dispose()
  mesh.dispose()
}

// --- The avatars' rubber arms -----------------------------------------------------------

/**
 * Rubber arms for an avatar, both in one draw call: each a round, gently tapering rubber
 * tube from a ball at the shoulder down to a cuff at the wrist, ending in a big cartoon
 * hand - palm, four fingers with rounded tips and the thumb on the outside. They replace
 * the avatar's own blocky arms (setArmLook hides those) and are painted as the arms you've
 * equipped, the pattern repeating down the tube however far it stretches.
 *
 * The geometry is one arm in its own frame: the shoulder at the origin, the tube running
 * down to y = -1 and the hand hung below that, palm forward, fingers down. Per instance,
 * `aArmPose` (length in metres, wrist bend, side) is applied in the vertex shader: the
 * tube stretches to the length and thins as it goes, the hand rides on its end without
 * stretching, bent back at the wrist by `bend` (so dragged along the floor it lies flat,
 * palm down, fingers trailing), and only the thumb for that side (+1: +X) is kept.
 * Parts: 0 shoulder ball, 1 tube, 2 hand, 3 the +X thumb, 4 the -X thumb.
 */
function createRubberArmGeometry() {
  const pieces = []
  const add = (geometry, part, matrix) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    if (g !== geometry) geometry.dispose()
    g.applyMatrix4(matrix)
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    const pos = g.getAttribute('position')
    const armP = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i += 1) {
      armP[i * 3] = pos.getX(i) * 5
      armP[i * 3 + 1] = pos.getY(i) * 5 + 4
      armP[i * 3 + 2] = pos.getZ(i) * 5
    }
    g.setAttribute('aArmP', new BufferAttribute(armP, 3))
    g.setAttribute('aPart', new BufferAttribute(new Float32Array(pos.count).fill(part), 1))
    pieces.push(g)
  }
  const m = () => new Matrix4()
  // Shoulder ball and the tube.
  add(new SphereGeometry(0.17, 10, 7), 0, m())
  add(new CylinderGeometry(0.15, 0.12, 1, 12, 1, true), 1, m().makeTranslation(0, -0.5, 0))
  // The hand: a cuff, the palm, four fingers (the middle two longest) with round tips.
  add(new CylinderGeometry(0.14, 0.14, 0.07, 10, 1), 2, m().makeTranslation(0, -1.0, 0))
  add(new BoxGeometry(0.25, 0.22, 0.11), 2, m().makeTranslation(0, -1.13, 0))
  const lengths = [0.13, 0.16, 0.15, 0.12]
  for (let i = 0; i < 4; i += 1) {
    const x = -0.09 + i * 0.06
    const l = lengths[i]
    add(new BoxGeometry(0.052, l, 0.085), 2, m().makeTranslation(x, -1.24 - l / 2, 0))
    add(new SphereGeometry(0.036, 6, 4), 2, m().makeScale(1, 0.8, 1.15).setPosition(x, -1.24 - l, 0))
  }
  // The thumbs, one for each side, angled out and down from the palm's edge.
  for (const side of [1, -1]) {
    add(new BoxGeometry(0.065, 0.14, 0.08), side > 0 ? 3 : 4, m().makeRotationZ(-0.65 * side).setPosition(0.15 * side, -1.15, 0.01))
  }
  const merged = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  return merged
}

let rubberArmGeometry = null
let rubberArmMaterial = null

const RUBBER_VERTEX_HEAD = /* glsl */ `
  attribute vec3 aArmP;
  attribute float aPart;
  attribute vec3 aArmA;
  attribute vec3 aArmB;
  attribute vec3 aArmC;
  attribute vec2 aArmStyle;
  attribute vec3 aArmPose;
  varying vec3 vArmP;
  varying vec3 vArmA;
  varying vec3 vArmB;
  varying vec3 vArmC;
  varying vec2 vArmStyle;
`

const RUBBER_VERTEX_SHAPE = /* glsl */ `
  float armLen = max(aArmPose.x, 0.05);
  vec3 armPos = position;
  vec3 objectNormal = normal;
  vArmP = aArmP;
  if (aPart > 0.5 && aPart < 1.5) {
    // The tube: stretched to length, thinner the longer, the pattern repeating down it.
    armPos.xz *= clamp(sqrt(0.63 / armLen), 0.5, 1.15);
    armPos.y *= armLen;
    vArmP.y = (aArmP.y - 4.0) * max(1.0, armLen / 0.63) + 4.0;
  } else if (aPart > 1.5) {
    // The hand on the wrist: only this side's thumb, bent back at the wrist by aArmPose.y.
    if ((aPart > 2.5 && aPart < 3.5 && aArmPose.z < 0.0) || (aPart > 3.5 && aArmPose.z > 0.0)) armPos = vec3(0.0, -1.0, 0.0);
    vec3 h = armPos - vec3(0.0, -1.0, 0.0);
    float bc = cos(aArmPose.y);
    float bs = sin(aArmPose.y);
    h = vec3(h.x, h.y * bc - h.z * bs, h.z * bc + h.y * bs);
    objectNormal = vec3(objectNormal.x, objectNormal.y * bc - objectNormal.z * bs, objectNormal.z * bc + objectNormal.y * bs);
    armPos = vec3(0.0, -armLen, 0.0) + h;
  }
  vArmA = aArmA;
  vArmB = aArmB;
  vArmC = aArmC;
  vArmStyle = aArmStyle;
`

function getRubberArmMaterial() {
  if (rubberArmMaterial) return rubberArmMaterial
  const material = new MeshLambertMaterial({ color: 0xffffff })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uArmTime = glowTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RUBBER_VERTEX_HEAD}`)
      .replace('#include <beginnormal_vertex>', RUBBER_VERTEX_SHAPE)
      .replace('#include <begin_vertex>', 'vec3 transformed = armPos;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uArmTime;
        varying vec3 vArmP;
        varying vec3 vArmA;
        varying vec3 vArmB;
        varying vec3 vArmC;
        varying vec2 vArmStyle;
        ${ARM_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec4 armPaint = armLook(vArmP, vArmStyle.x, vArmA, vArmB, vArmC, vArmStyle.y, uArmTime);
        diffuseColor.rgb = armPaint.rgb;`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += armPaint.rgb * armPaint.a * 0.8;')
  }
  material.customProgramCacheKey = () => 'arm-rubber-v1'
  rubberArmMaterial = material
  return material
}

/**
 * One avatar's pair of rubber arms (instance 0 left, 1 right). `setArm(id)` paints both as
 * arms `id` (a no-op when unchanged); `setPose(i, length, bend, side)` shapes one (see
 * createRubberArmGeometry). Placed each frame by avatarRig.placeRubberArms. The arm's
 * shape and the material are shared by every avatar; disposeRubberArms frees the rest.
 */
export function createRubberArms() {
  rubberArmGeometry ??= createRubberArmGeometry()
  const geometry = rubberArmGeometry.clone()
  const attr = (name, size) => {
    const a = new InstancedBufferAttribute(new Float32Array(2 * size), size)
    geometry.setAttribute(name, a)
    return a
  }
  const aA = attr('aArmA', 3)
  const aB = attr('aArmB', 3)
  const aC = attr('aArmC', 3)
  const aStyle = attr('aArmStyle', 2)
  const aPose = attr('aArmPose', 3)
  const mesh = new InstancedMesh(geometry, getRubberArmMaterial(), 2)
  mesh.frustumCulled = false
  let painted = null
  mesh.setArm = (id) => {
    if (id === painted) return
    painted = id
    const s = styleOf(id)
    for (let i = 0; i < 2; i += 1) {
      aA.setXYZ(i, s.a.r, s.a.g, s.a.b)
      aB.setXYZ(i, s.b.r, s.b.g, s.b.b)
      aC.setXYZ(i, s.c.r, s.c.g, s.c.b)
      aStyle.setXY(i, s.pattern, s.glow)
    }
    aA.needsUpdate = true
    aB.needsUpdate = true
    aC.needsUpdate = true
    aStyle.needsUpdate = true
  }
  mesh.setPose = (i, length, bend, side) => {
    aPose.setXYZ(i, length, bend, side)
    aPose.needsUpdate = true
  }
  return mesh
}

export function disposeRubberArms(mesh) {
  mesh.geometry.dispose()
  mesh.dispose()
}
