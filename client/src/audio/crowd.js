/**
 * The stadium crowd, made live with WebAudio like every other sound: no audio files.
 *
 * Voices, not noise: every cheer is a little chorus of buzzy oscillators (people's voices,
 * a few dozen semitones apart) sung through a shared bank of vowel filters - a round
 * "oooooh" while your ball is up in the air, an open "YEAAAH!" when it lands - plus a few
 * fans whooping and some applause. Filtered white noise reads as hiss on small speakers,
 * so the only noise left is in the claps, a few milliseconds each.
 *
 * In the lobby the stands are quiet but alive: now and then, far off, a section of the
 * crowd cheers.
 *
 * The vowel bank lives for the session; each voice is three short-lived nodes, stopped on
 * schedule, a dozen per cheer at most.
 */

/** Formants (Hz) of the vowels the crowd sings: [F1, F2, F3]. */
const VOWELS = {
  oo: [330, 870, 2250],
  ah: [760, 1220, 2600],
  eh: [560, 1720, 2550],
}
/** How loud each formant band is in the mix. */
const FORMANT_GAINS = [1, 0.6, 0.18]
/** Seconds between the distant cheers in the lobby: somewhere between these. */
const AMBIENT_MIN = 18
const AMBIENT_MAX = 40

export function createCrowd(ctx, destination, noiseBuffer) {
  const out = ctx.createGain()
  out.gain.value = 1
  out.connect(destination)

  // The vowel bank: every voice goes into `throat`, the bank shapes it into a vowel.
  const throat = ctx.createGain()
  throat.gain.value = 1
  const formants = FORMANT_GAINS.map((level, i) => {
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = VOWELS.ah[i]
    filter.Q.value = i === 0 ? 5 : 7
    const gain = ctx.createGain()
    gain.gain.value = level
    throat.connect(filter).connect(gain).connect(out)
    return filter
  })
  // Takes the buzz off the top: voices in a stadium, not a synth.
  const vowel = (name, at, glide = 0.25) => {
    const f = VOWELS[name]
    formants.forEach((filter, i) => filter.frequency.setTargetAtTime(f[i], at, glide))
  }

  /**
   * `count` voices singing from `at` for about `length` seconds, starting around
   * `pitch` Hz and sliding by `slide` (1.2 = up a fifth-ish), at `volume`.
   */
  function chorus({ count, at = 0, length, pitch, slide = 1, volume, attack = 0.15, spread = 0.25 }) {
    const t0 = ctx.currentTime + at
    for (let i = 0; i < count; i += 1) {
      const t = t0 + Math.random() * spread
      const len = length * (0.75 + Math.random() * 0.5)
      // Low and high voices: some an octave up.
      const f0 = pitch * (Math.random() < 0.4 ? 2 : 1) * (0.88 + Math.random() * 0.24)
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(f0, t)
      osc.frequency.exponentialRampToValueAtTime(f0 * slide * (0.95 + Math.random() * 0.1), t + len * 0.7)
      // A wobble in every voice, each its own speed.
      const vib = ctx.createOscillator()
      vib.frequency.value = 4.5 + Math.random() * 2.5
      const depth = ctx.createGain()
      depth.gain.value = f0 * 0.02
      vib.connect(depth).connect(osc.frequency)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(volume, t + attack)
      gain.gain.setTargetAtTime(0.0001, t + len * 0.55, len * 0.18)
      osc.connect(gain).connect(throat)
      osc.start(t)
      vib.start(t)
      osc.stop(t + len + 0.6)
      vib.stop(t + len + 0.6)
    }
  }

  /**
   * One handclap, `at` seconds from now: a few milliseconds of band-passed noise. Built
   * when it's due (a round of applause is a lot of claps: all at once, a slow phone stuck).
   */
  function clap(at, volume) {
    if (at > 0.06) {
      const due = ctx.currentTime + at
      setTimeout(() => clapAt(Math.max(ctx.currentTime, due), volume), (at - 0.06) * 1000)
      return
    }
    clapAt(ctx.currentTime + at, volume)
  }

  function clapAt(t, volume) {
    const s = ctx.createBufferSource()
    s.buffer = noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1100 + Math.random() * 900
    filter.Q.value = 1.4
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022)
    s.connect(filter).connect(gain).connect(out)
    s.start(t, Math.random() * 0.9)
    s.stop(t + 0.03)
  }

  let ambientTimer = null
  /** True while a kick has the crowd's attention (no ambient cheers over it). */
  let busy = false
  /** A section of the crowd somewhere in the stands cheering, quietly, every so often. */
  function scheduleAmbient() {
    ambientTimer = setTimeout(
      () => {
        if (ctx.state === 'running' && !busy) {
          vowel(Math.random() < 0.5 ? 'ah' : 'eh', ctx.currentTime, 0.05)
          chorus({ count: 5, length: 1.6, pitch: 190, slide: 1.12, volume: 0.006, attack: 0.4, spread: 0.6 })
        }
        scheduleAmbient()
      },
      (AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN)) * 1000,
    )
  }

  return {
    start() {
      if (ambientTimer) return
      scheduleAmbient()
    },

    /**
     * The crowd watching your ball fly: `on` starts a rising "oooooh" that holds while
     * it's up; off lets it die away (a landing's roar takes over).
     */
    anticipate(on) {
      busy = on
      if (!on) return
      vowel('oo', ctx.currentTime, 0.05)
      chorus({ count: 8, length: 2.6, pitch: 175, slide: 1.25, volume: 0.011, attack: 0.9, spread: 0.4 })
    },

    /** A roar from the stands, `power` 0-1: how big the moment was. */
    roar(power = 1) {
      const p = Math.min(1, Math.max(0.2, power))
      vowel('ah', ctx.currentTime, 0.04)
      chorus({ count: Math.round(8 + p * 6), length: 1.2 + p, pitch: 200, slide: 1.3, volume: 0.012 + 0.008 * p, attack: 0.07, spread: 0.18 })
      if (p > 0.5) this.whoo(Math.round(1 + p * 2), 0.2)
    },

    /** A few fans whooping, starting `at` seconds from now: tones, no noise. */
    whoo(count = 2, at = 0) {
      for (let i = 0; i < count; i += 1) {
        const t = ctx.currentTime + at + Math.random() * 0.6
        const f0 = 440 + Math.random() * 300
        const length = 0.45 + Math.random() * 0.35
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(f0, t)
        osc.frequency.exponentialRampToValueAtTime(f0 * (1.3 + Math.random() * 0.2), t + length * 0.6)
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.92, t + length)
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.018, t + 0.08)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
        osc.connect(gain).connect(out)
        osc.start(t)
        osc.stop(t + length + 0.05)
      }
    },

    /** Applause: `seconds` of claps from round the stands, thinning out at the end. */
    applause(seconds = 1.4, density = 16) {
      const claps = Math.round(seconds * density)
      for (let i = 0; i < claps; i += 1) {
        // More at the start, fewer as it dies down.
        const at = seconds * Math.pow(Math.random(), 1.6)
        clap(at, (0.06 + Math.random() * 0.1) * (1 - (at / seconds) * 0.6))
      }
    },
  }
}
