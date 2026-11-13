/**
 * Background music, made live with WebAudio like the sound effects: a bouncy game-day
 * loop for the stadium - a stomping kick drum and handclaps, ticking hats, a bass that
 * jumps octaves, punchy brass stabs and a chant-like hook over C - Am - F - G - kept
 * quiet under the game and the crowd.
 *
 * Notes are scheduled a little ahead on the audio clock by a timer (the usual
 * look-ahead scheduler), never from the render loop.
 */

const BPM = 112
const EIGHTH = 60 / BPM / 2
const LOOKAHEAD_S = 0.35
const TICK_MS = 100

/** One chord per bar, as MIDI notes: bass root, then the stabs' three voices. */
const BARS = [
  { root: 36, chord: [60, 64, 67] }, // C
  { root: 33, chord: [60, 64, 69] }, // Am
  { root: 41, chord: [60, 65, 69] }, // F
  { root: 43, chord: [59, 62, 67] }, // G
]
/** Where in each bar (eighths) the brass stabs hit: on the one, then pushed off the beat. */
const STABS = [0, 3, 6]
/** The hook, a 4-bar chant: [eighth within the 32, MIDI note, eighths long]. */
const HOOK = [
  [0, 72, 2],
  [2, 72, 1],
  [3, 74, 1],
  [4, 76, 3],
  [8, 76, 2],
  [10, 74, 1],
  [11, 72, 1],
  [12, 69, 3],
  [16, 69, 2],
  [18, 72, 1],
  [19, 74, 1],
  [20, 77, 3],
  [24, 76, 2],
  [26, 74, 2],
  [28, 71, 2],
  [30, 74, 2],
]

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12)

export function createMusic(ctx, destination, noiseBuffer) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(destination)
  // A low-pass over everything keeps it warm and out of the effects' way.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 3400
  tone.connect(out)

  let step = 0
  let nextAt = 0
  let timer = null
  const level = { base: 0.5, ducked: 1, volume: 1 }

  function note(midi, t, { type = 'sine', length = 0.3, volume = 0.05, attack = 0.01, cutoff = 0 } = {}) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq(midi)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    if (cutoff) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = cutoff
      osc.connect(filter).connect(gain).connect(tone)
    } else {
      osc.connect(gain).connect(tone)
    }
    osc.start(t)
    osc.stop(t + length + 0.05)
  }

  /** Filtered noise: claps and hats. */
  function hiss(t, { type = 'bandpass', frequency = 1500, q = 0.9, volume = 0.04, length = 0.06 } = {}) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    src.connect(filter).connect(gain).connect(tone)
    src.start(t, Math.random() * 0.5)
    src.stop(t + length + 0.01)
  }

  /** A stomping kick drum: a sine dropping fast. */
  function drum(t, volume = 0.16) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    osc.connect(gain).connect(tone)
    osc.start(t)
    osc.stop(t + 0.22)
  }

  /** A handclap: a few bursts a hair apart, like a crowd of hands. */
  function clap(t) {
    for (let i = 0; i < 3; i += 1) hiss(t + i * 0.011, { frequency: 1300 + i * 250, volume: 0.035, length: 0.05 + i * 0.02 })
  }

  /** Everything that sounds on eighth `step` (of a 4-bar, 32-eighth loop) at time t. */
  function play(t) {
    const inBar = step % 8
    const barIndex = Math.floor(step / 8) % BARS.length
    const bar = BARS[barIndex]
    // Drums: kick on 1 and 3 (and a double at the end of the loop), claps on 2 and 4,
    // hats on every off-beat.
    if (inBar === 0 || inBar === 4 || (barIndex === 3 && inBar === 7)) drum(t)
    if (inBar === 2 || inBar === 6) clap(t)
    if (inBar % 2 === 1) hiss(t, { type: 'bandpass', frequency: 5200, q: 1.2, volume: 0.006, length: 0.018 })
    // Bass: the root, jumping an octave every other eighth.
    note(bar.root + (inBar % 2 ? 12 : 0), t, { type: 'triangle', length: EIGHTH * 0.9, volume: 0.07 })
    // Brass: short, bright stabs of the chord.
    if (STABS.includes(inBar)) {
      for (const n of bar.chord) note(n, t, { type: 'sawtooth', length: 0.17, volume: 0.011, attack: 0.012, cutoff: 1900 })
    }
    // The hook, on a soft square lead (every other time round, so it doesn't nag).
    if (Math.floor(step / 32) % 2 === 0) {
      for (const [at, midi, length] of HOOK) {
        if (at === step % 32) note(midi, t, { type: 'square', length: EIGHTH * length * 0.9, volume: 0.014, attack: 0.02, cutoff: 2200 })
      }
    }
  }

  function schedule() {
    // After the page was hidden (the context suspended), pick up from now.
    nextAt = Math.max(nextAt, ctx.currentTime + 0.05)
    while (nextAt < ctx.currentTime + LOOKAHEAD_S) {
      play(nextAt)
      nextAt += EIGHTH
      step = (step + 1) % 64
    }
  }

  const applyLevel = (seconds) =>
    out.gain.setTargetAtTime(level.base * level.ducked * level.volume, ctx.currentTime, seconds)

  return {
    start() {
      if (timer) return
      nextAt = ctx.currentTime + 0.1
      timer = setInterval(schedule, TICK_MS)
      schedule()
      // Fade in.
      applyLevel(1.2)
    },
    /** Quieter while something else should be heard (the rush of a flying ball). */
    duck(on) {
      level.ducked = on ? 0.45 : 1
      applyLevel(0.4)
    },
    /** The player's music volume, 0..1 (Boxity's music_volume setting). */
    setVolume(volume) {
      level.volume = Math.min(1, Math.max(0, Number(volume) || 0))
      // Before start() the fade-in will pick it up.
      if (timer) applyLevel(0.15)
    },
  }
}
