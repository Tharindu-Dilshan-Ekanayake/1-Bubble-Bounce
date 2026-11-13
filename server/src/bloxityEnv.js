/**
 * Where Boxity lives, for this process. Every Boxity URL the server calls or allows is
 * built from here, never hard-coded, so one image runs against production or staging
 * just by what the platform injects:
 *
 * - BLOXITY_ENV             'prod', 'stage', ... (only a label here)
 * - BLOXITY_API_URL         the platform API (auth, leaderboards, ads)
 * - BLOXITY_MATCHMAKER_URL  the play host; game frontends live on <game>.<its host>
 * - BLOXITY_PORTAL_URL      the website
 * - BLOXITY_STATIC_URL      static files
 *
 * The production defaults below apply only to a variable that is missing; an injected
 * value always wins.
 */

const DEFAULTS = {
  env: 'prod',
  apiUrl: 'https://api.bloxity.io',
  matchmakerUrl: 'https://play.bloxity.io',
  portalUrl: 'https://bloxity.io',
  staticUrl: 'https://static.bloxity.io',
}

const GAME_FALLBACK = '1-arm-length'

/** 'https://x.io/' -> 'https://x.io', so paths can be appended with a single '/'. */
const trimUrl = (url) => String(url).replace(/\/+$/, '')

const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * Reads the Boxity settings from `env` (process.env by default; tests pass their own).
 *
 * `hosted` says whether this process runs on Boxity hosting: BLOXITY_ENV is injected
 * there, and a production build is treated the same. Off it (a laptop) the server
 * trusts the ids clients claim, so development works without a Boxity account.
 */
export function readBloxityEnv(env = process.env) {
  const pick = (name, fallback) => (env[name] ? trimUrl(env[name]) : fallback)
  const matchmakerUrl = pick('BLOXITY_MATCHMAKER_URL', DEFAULTS.matchmakerUrl)
  return {
    env: env.BLOXITY_ENV || DEFAULTS.env,
    apiUrl: pick('BLOXITY_API_URL', DEFAULTS.apiUrl),
    matchmakerUrl,
    portalUrl: pick('BLOXITY_PORTAL_URL', DEFAULTS.portalUrl),
    staticUrl: pick('BLOXITY_STATIC_URL', DEFAULTS.staticUrl),
    /** Host the game's frontends are served under: <game>.play.bloxity.io and so on. */
    playHost: hostOf(matchmakerUrl),
    /** The slug the Boxity SDK and APIs know the game by. */
    gameSlug: env.BLOXITY_GAME_SLUG || env.BLOXITY_GAME_ID || GAME_FALLBACK,
    /** The hosted game's id (leaderboards, Legion). */
    gameId: env.BLOXITY_GAME_ID || GAME_FALLBACK,
    hosted: Boolean(env.BLOXITY_ENV) || env.NODE_ENV === 'production',
  }
}

/** This process's settings. */
export const bloxity = readBloxityEnv()

/** `bloxity.apiUrl` + `path` ('/v1/...'). */
export const apiUrl = (path, settings = bloxity) => `${settings.apiUrl}${path}`
