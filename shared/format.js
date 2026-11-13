/**
 * Number and time formatting, matching the game's HUD: 950, 1.2K, 7.3K, 14K, 2.5M.
 * One decimal below 10 of a unit, whole numbers above, trailing ".0" dropped.
 */

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']

export function formatNumber(value) {
  if (!Number.isFinite(value)) return '∞'
  const negative = value < 0
  let n = Math.abs(value)
  if (n < 1000) {
    const whole = Math.floor(n)
    return `${negative ? '-' : ''}${whole}`
  }
  let unit = 0
  while (n >= 1000 && unit < UNITS.length - 1) {
    n /= 1000
    unit += 1
  }
  // Truncate rather than round so "9.99K" never displays as "10K" before it is.
  const text = n < 10 ? (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(n))
  return `${negative ? '-' : ''}${text}${UNITS[unit]}`
}

/** A gain as the popups show it: "+1.8" for small ones, then like formatNumber. */
export function formatGain(value) {
  if (value < 10) return String(Math.round(value * 10) / 10)
  return formatNumber(value)
}

/** Metres flown: "1,050 m" in full up to a million, then like formatNumber. */
export function formatDistance(meters) {
  const m = Math.max(0, Math.floor(meters))
  if (m >= 1e6) return `${formatNumber(m)} m`
  let s = String(m)
  for (let i = s.length - 3; i > 0; i -= 3) s = `${s.slice(0, i)},${s.slice(i)}`
  return `${s} m`
}

/** Multiplier display: x1, x1.65, x2.5, x12, x1.2K. */
export function formatMultiplier(value) {
  if (value < 10) return `x${Math.round(value * 100) / 100}`
  return `x${formatNumber(Math.round(value))}`
}

/** 23:59:26 for countdowns of an hour or more, 4:05 below that. */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (v) => String(v).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Short duration: 5m, 1h 30m, 45s. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}s`
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
