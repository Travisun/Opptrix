/**
 * Sidecar supervision helpers — pure Node (no electron).
 * Used by Electron main for auto-restart + graceful stop timing aligned with
 * server shutdown (native closeDocLibrary / closeMarketDuck ~8s).
 */

/** Soft-kill grace: must be ≥ server `shutdown` forceExit (8s). */
const SIDECAR_GRACEFUL_MS = 8500

/** Extra wait after SIGKILL before giving up on `exit`. */
const SIDECAR_HARD_EXTRA_MS = 2500

/** Packaged tray-resident health poll interval. */
const SIDECAR_HEALTH_POLL_MS = 20_000

/** First restart delay (ms); doubles each failure, capped. */
const SIDECAR_RESTART_BASE_MS = 1000

/** Max restart backoff. */
const SIDECAR_RESTART_CAP_MS = 30_000

/**
 * Exponential backoff: 1s → 2s → 4s → 8s … capped at 30s.
 * @param {number} failCount consecutive failures (0 = first restart attempt)
 * @returns {number}
 */
function restartDelayMs(failCount) {
  const n = Math.max(0, Math.floor(Number(failCount) || 0))
  const raw = SIDECAR_RESTART_BASE_MS * 2 ** n
  return Math.min(raw, SIDECAR_RESTART_CAP_MS)
}

/**
 * Whether main should auto-respawn the API sidecar.
 * Only packaged, owned (non-reuse) processes while not quitting/updating.
 *
 * @param {{
 *   intentionalStop?: boolean
 *   isQuitting?: boolean
 *   isUpdating?: boolean
 *   isDev?: boolean
 *   apiPortMode?: string
 * }} ctx
 * @returns {boolean}
 */
function shouldAutoRestart(ctx = {}) {
  if (ctx.intentionalStop) return false
  if (ctx.isQuitting) return false
  if (ctx.isUpdating) return false
  if (ctx.isDev) return false
  if (ctx.apiPortMode === 'reuse') return false
  return true
}

/**
 * Mutable backoff counter for crash / restart storms.
 * @returns {{ failCount: number }}
 */
function createBackoffState() {
  return { failCount: 0 }
}

/**
 * @param {{ failCount: number }} state
 */
function resetBackoff(state) {
  if (state) state.failCount = 0
}

/**
 * @param {{ failCount: number }} state
 * @returns {number} new failCount
 */
function recordBackoffFailure(state) {
  if (!state) return 1
  state.failCount = Math.max(0, Math.floor(Number(state.failCount) || 0)) + 1
  return state.failCount
}

module.exports = {
  SIDECAR_GRACEFUL_MS,
  SIDECAR_HARD_EXTRA_MS,
  SIDECAR_HEALTH_POLL_MS,
  SIDECAR_RESTART_BASE_MS,
  SIDECAR_RESTART_CAP_MS,
  restartDelayMs,
  shouldAutoRestart,
  createBackoffState,
  resetBackoff,
  recordBackoffFailure,
}
