/** Background check cadence for long-running self-hosted servers. */

/** Default: once per 24 hours (servers stay up; startup-only checks are insufficient). */
export const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

const MIN_INTERVAL_MS = 60_000

export function resolveUpdateCheckIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const explicitMs = env.OPPTRIX_UPDATE_CHECK_INTERVAL_MS?.trim()
  if (explicitMs) {
    const ms = Number.parseInt(explicitMs, 10)
    if (Number.isFinite(ms) && ms >= MIN_INTERVAL_MS) return ms
  }

  const hoursRaw = env.OPPTRIX_UPDATE_CHECK_INTERVAL_HOURS?.trim()
  if (hoursRaw) {
    const hours = Number.parseFloat(hoursRaw)
    if (Number.isFinite(hours) && hours > 0) {
      return Math.max(MIN_INTERVAL_MS, Math.round(hours * 60 * 60 * 1000))
    }
  }

  return DEFAULT_UPDATE_CHECK_INTERVAL_MS
}
