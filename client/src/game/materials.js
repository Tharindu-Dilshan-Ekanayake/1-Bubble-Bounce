import { Color, MeshLambertMaterial } from 'three'

/**
 * The toy-brick look, done in the shader instead of with textures.
 *
 * Every block in the world shares one Lambert material whose fragment shader draws the
 * stud tiles, grass caps, windows and so on from world position. That keeps texture
 * memory at zero for the whole world and lets thousands of differently sized boxes
 * share one InstancedMesh: world-space patterns tile identically whatever the scale.
 *
 * Which pattern a surface gets is per instance (or per vertex, for merged meshes) via
 * the `aStyle` attribute, using the ids below.
 */
export const STYLE = {
  /** Rounded stud tiles. */
  STUDS: 0,
  /** Hill block: tan studded sides with a grass cap and lip. */
  TERRAIN: 1,
  /** Building wall with a window grid on the sides. */
  WINDOWS: 2,
  /** Diagonal diamond plate. */
  PLATE: 3,
  /** Plain, no pattern. */
  SMOOTH: 4,
  /** Self-lit: neon, lava glow, signs. */
  GLOW: 5,
  /** Horizontal white bands, for gate pillars. */
  STRIPES: 6,
  /** Lava: dark crust with glowing cracks. */
  LAVA: 7,
  /** Hue cycles across the surface. */
  RAINBOW: 8,
  /** Deep blue with stars. */
  GALAXY: 9,
  /** Asphalt with no studs but a fine grain. */
  ROAD: 10,
  /** Falling water: bright streaks scrolling down. */
  WATER: 11,
  /** Treadmill belt: dark rubber with ribs sliding west (back under an east-facing runner). */
  BELT: 12,
  /** Big two-tone checker squares over stud tiles: the kick field's surroundings. */
  CHECKER: 13,
  /**
   * Blocky hill: a grass cap with a lip down the sides, and the instance colour (the dirt)
   * below in 4 m checker cubes of two shades - one tall box reads as a stack of blocks.
   */
  HILL: 14,
  /**
   * Candy mesa: the instance colour in wavy horizontal strata of lighter and darker
   * bands, under a cream frosting cap that drips a wavy way down the sides.
   */
  MESA: 15,
}

/** Shared clock for animated styles; WorldClock advances it once per frame. */
export const toyTime = { value: 0 }

/** Cap colour for STYLE.TERRAIN blocks; the instance colour is the dirt underneath. */
export const GRASS_COLOR = new Color('#4fd93a')

const vertexHead = /* glsl */ `
  attribute float aStyle;
  varying vec3 vToyPos;
  varying vec3 vToyNormal;
  varying float vToyStyle;
  varying float vToyTop;
`

const vertexBody = /* glsl */ `
  vec4 toyWorld = vec4(transformed, 1.0);
  vec3 toyN = objectNormal;
  vec4 toyTop = vec4(0.0, 0.5, 0.0, 1.0);
  #ifdef USE_INSTANCING
    toyWorld = instanceMatrix * toyWorld;
    toyN = mat3(instanceMatrix) * toyN;
    toyTop = instanceMatrix * toyTop;
  #endif
  toyWorld = modelMatrix * toyWorld;
  vToyPos = toyWorld.xyz;
  vToyNormal = normalize(mat3(modelMatrix) * toyN);
  vToyTop = (modelMatrix * toyTop).y;
  vToyStyle = aStyle;
`

const fragmentHead = /* glsl */ `
  uniform float uStudScale;
  uniform float uTime;
  uniform vec3 uGrass;
  varying vec3 vToyPos;
  varying vec3 vToyNormal;
  varying float vToyStyle;
  varying float vToyTop;

  float toyHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Rounded stud tile: dark seams, a lit upper-left bevel and shaded lower-right.
  // Fades to its average once tiles shrink below a couple of pixels, so distant
  // ground doesn't shimmer with moire.
  float toyTile(vec2 p) {
    vec2 w = fwidth(p);
    float aa = max(max(w.x, w.y), 1e-4);
    vec2 c = fract(p) - 0.5;
    vec2 q = abs(c) - vec2(0.34);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.1;
    float inside = 1.0 - smoothstep(-aa, aa, d);
    float bevel = clamp(-d * 9.0, 0.0, 1.0);
    float lit = (c.y - c.x) * (1.0 - bevel) * 0.22;
    float shade = mix(0.82, 1.0 + lit, inside);
    return mix(shade, 0.95, smoothstep(0.28, 0.6, aa));
  }

  // Diamond plate: a raised lozenge grid on the diagonals.
  float toyPlate(vec2 p) {
    vec2 r = vec2(p.x + p.y, p.x - p.y) * 0.7071 * 1.4;
    vec2 w = fwidth(r);
    float aa = max(max(w.x, w.y), 1e-4);
    vec2 f = abs(fract(r) - 0.5);
    float line = 1.0 - smoothstep(0.06 - aa, 0.06 + aa, min(f.x, f.y));
    float hl = 1.0 - smoothstep(0.1, 0.2, abs(f.x - f.y));
    float shade = 1.0 - line * 0.28 + hl * 0.06;
    return mix(shade, 0.92, smoothstep(0.2, 0.5, aa));
  }

  vec3 toyHue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
`

const fragmentBody = /* glsl */ `
  {
    vec3 n = normalize(vToyNormal);
    vec3 an = abs(n);
    bool isTop = n.y > 0.5;
    // Planar projection along the dominant axis keeps studs square on every face.
    vec2 suv = an.y > 0.5 ? vToyPos.xz : (an.x > 0.5 ? vToyPos.zy : vToyPos.xy);
    vec2 sp = suv * uStudScale;
    vec3 col = diffuseColor.rgb;
    float style = vToyStyle + 0.5;

    if (style < 1.0) {
      col *= toyTile(sp);
    } else if (style < 2.0) {
      // Grass cap plus a lip a little way down the sides; tan dirt below.
      bool lip = (vToyTop - vToyPos.y) < 0.45;
      if (isTop || lip) col = uGrass * (isTop ? 1.0 : 0.88);
      col *= toyTile(sp);
    } else if (style < 3.0) {
      if (!isTop) {
        vec2 cell = vec2(suv.x / 2.2, (vToyPos.y - 0.6) / 2.6);
        vec2 f = fract(cell);
        float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.86);
        float frame = step(0.12, f.x) * step(f.x, 0.88) * step(0.16, f.y) * step(f.y, 0.92);
        float lowest = step(0.0, vToyPos.y - 0.6);
        col = mix(col, vec3(0.97), frame * lowest);
        col = mix(col, vec3(0.42, 0.78, 1.0) * (0.9 + 0.2 * f.y), win * lowest);
      }
      col *= toyTile(sp * 0.5);
    } else if (style < 4.0) {
      col *= toyPlate(suv * 0.9);
    } else if (style < 5.0) {
      // Smooth: no pattern.
    } else if (style < 6.0) {
      totalEmissiveRadiance += col * 0.75;
    } else if (style < 7.0) {
      float band = step(0.5, fract(vToyPos.y * 0.5));
      col = mix(col, vec3(1.0), band);
      col *= toyTile(sp);
    } else if (style < 8.0) {
      vec2 cell = floor(suv * 0.8);
      vec2 f = fract(suv * 0.8) - 0.5;
      float crack = 1.0 - smoothstep(0.03, 0.09, min(abs(f.x), abs(f.y)) + toyHash(cell) * 0.04);
      // The instance colour is the glow; the crust is a dark, mottled version of it.
      vec3 crust = col * (0.16 + 0.12 * toyHash(cell));
      vec3 glow = min(col * 1.2, vec3(1.0));
      col = mix(crust, glow, crack);
      totalEmissiveRadiance += glow * crack * 0.9;
    } else if (style < 9.0) {
      vec3 rainbow = toyHue(fract((vToyPos.x + vToyPos.z + vToyPos.y) * 0.04));
      col = mix(rainbow, vec3(1.0), 0.25);
      col *= toyTile(sp);
      totalEmissiveRadiance += col * 0.35;
    } else if (style < 10.0) {
      vec2 cell = floor(suv * 1.5);
      float star = step(0.93, toyHash(cell));
      vec2 f = fract(suv * 1.5) - 0.5;
      star *= 1.0 - smoothstep(0.05, 0.15, length(f));
      col = mix(col, vec3(1.0), star);
      totalEmissiveRadiance += col * 0.35 + star * 0.6;
    } else if (style < 11.0) {
      col *= 0.94 + 0.06 * toyHash(floor(suv * 3.0));
    } else if (style < 12.0) {
      // Water: streaks falling down the sides, ripples on top.
      float lane = floor(suv.x * 2.0);
      float fall = fract(vToyPos.y * 0.35 + uTime * (1.2 + toyHash(vec2(lane, 1.0)) * 0.6) + toyHash(vec2(lane, 7.0)));
      float streak = isTop ? 0.5 + 0.5 * sin(vToyPos.x * 2.0 + vToyPos.z * 1.3 + uTime * 3.0) : smoothstep(0.7, 1.0, fall);
      col = mix(col, vec3(0.92, 0.98, 1.0), streak * 0.65);
      totalEmissiveRadiance += col * 0.25;
    } else if (style < 13.0) {
      if (isTop) {
        // Belt: ribs sliding back (west) under the runner's feet.
        vec2 bw = fwidth(vToyPos.xz);
        float rib = smoothstep(0.72, 0.86, fract(vToyPos.x * 1.6 + uTime * 2.4));
        col = mix(col, col * 2.4 + vec3(0.07), rib * 0.8 * (1.0 - smoothstep(0.15, 0.4, bw.x)));
      }
    } else if (style < 14.0) {
      // Checker: 3 m squares in two shades, studs on top, fading to flat far off.
      vec2 cw = fwidth(vToyPos.xz);
      float check = mod(floor(vToyPos.x / 3.0) + floor(vToyPos.z / 3.0), 2.0);
      col *= mix(1.0, mix(0.86, 1.04, check), 1.0 - smoothstep(0.4, 1.2, max(cw.x, cw.y)));
      col *= toyTile(sp);
    } else if (style < 15.0) {
      // Hill: grass on top and a lip down the sides, checkered dirt cubes below.
      bool lip = (vToyTop - vToyPos.y) < 0.6;
      if (isTop || lip) {
        col = uGrass * (isTop ? 1.0 : 0.86);
      } else {
        float cube = mod(floor(vToyPos.x / 4.0 + 0.001) + floor(vToyPos.y / 4.0 + 0.001) + floor(vToyPos.z / 4.0 + 0.001), 2.0);
        col *= mix(0.82, 1.05, cube);
      }
      col *= toyTile(sp);
    } else {
      // Mesa: frosting on top dripping down the sides in waves, candy strata below.
      float drip = 0.55 + 0.4 * sin(vToyPos.x * 1.9 + vToyPos.z * 1.3) + 0.3 * sin((vToyPos.x - vToyPos.z) * 0.7);
      if (isTop || (vToyTop - vToyPos.y) < drip) {
        col = mix(col, vec3(1.0, 0.97, 0.93), 0.78) * (isTop ? 1.0 : 0.94);
      } else {
        float band = floor((vToyPos.y + 0.7 * sin(vToyPos.x * 0.13 + vToyPos.z * 0.09)) / 1.7);
        col *= 0.8 + 0.3 * fract(sin(band * 12.9898) * 43758.5453);
      }
      col *= toyTile(sp);
    }

    diffuseColor.rgb = col;
  }
`

/**
 * One material per variant (instanced or vertex-coloured), shared by every mesh of that
 * kind. Program code is identical across all toy materials, so three compiles it once
 * per variant no matter how many there are.
 *
 * @param {{ instanced?: boolean, vertexColors?: boolean, map?: import('three').Texture,
 *           studScale?: number }} [options]
 *   `studScale` is studs per world unit. Non-instanced meshes default to vertex colours.
 */
export function createToyMaterial({
  instanced = true,
  vertexColors = !instanced,
  map = null,
  studScale = 2,
} = {}) {
  const material = new MeshLambertMaterial({ color: 0xffffff, vertexColors, map })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uStudScale = { value: studScale }
    shader.uniforms.uTime = toyTime
    shader.uniforms.uGrass = { value: GRASS_COLOR }
    material.userData.shader = shader

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexHead}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${vertexBody}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fragmentBody}`)
  }
  // The stud scale is a uniform, so materials differing only in it share a program.
  material.customProgramCacheKey = () => 'toy-v2'
  return material
}

/**
 * The one shared toy material: instanced, with vertex colours and instance colours.
 * Everything toy-styled - blocks, props, pets, arrows, trophies, other players,
 * confetti - is drawn as instances through it, so it compiles to a single shader
 * program however many systems use it. (Only the ground, which needs a texture map,
 * has its own variant.)
 *
 * Created lazily; `blocks` and `props` are the same material under the names the
 * systems know it by.
 */
let shared = null
export function sharedMaterials() {
  if (!shared) {
    const toy = createToyMaterial({ instanced: true, vertexColors: true, studScale: 2 })
    shared = { toy, blocks: toy, props: toy }
  }
  return shared
}
