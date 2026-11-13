/**
 * Each modal panel's code, loaded on its own: none of it is needed to start playing,
 * so it stays out of the start-up bundle and is fetched in the background once the
 * game is up (prefetchPanels), so opening a panel still never waits.
 */
export const PANEL_LOADERS = {
  pets: () => import('./PetsPanel'),
  rebirth: () => import('./RebirthPanel'),
  daily: () => import('./DailyRewardsPanel'),
  quests: () => import('./QuestsPanel'),
  items: () => import('./ItemsPanel'),
  offline: () => import('./WelcomeBackPanel'),
  store: () => import('./StorePanel'),
  leaderboards: () => import('./LeaderboardsPanel'),
  settings: () => import('./SettingsPanel'),
}

/** Fetches every panel in the background, when the browser is idle. */
export function prefetchPanels() {
  const fetchAll = () => {
    for (const load of Object.values(PANEL_LOADERS)) load().catch(() => null)
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fetchAll, { timeout: 4000 })
  else setTimeout(fetchAll, 1500)
}
