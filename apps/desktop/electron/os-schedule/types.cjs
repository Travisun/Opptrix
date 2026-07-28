/** @typedef {{ intervalSec?: number }} OsTickSpec */

/**
 * @typedef {Object} OsTickRegistrationResult
 * @property {boolean} ok
 * @property {'synced' | 'pending' | 'error' | 'n/a'} status
 * @property {string | null} [error]
 */

/**
 * @typedef {Object} OsTickProbeResult
 * @property {boolean} registered
 * @property {'synced' | 'pending' | 'error' | 'n/a'} status
 * @property {string | null} [error]
 */

/** @typedef {Object} OsScheduleAdapter */
/** @property {(spec?: OsTickSpec) => Promise<OsTickRegistrationResult>} ensureTickRegistration */
/** @property {() => Promise<OsTickRegistrationResult>} removeTickRegistration */
/** @property {() => Promise<OsTickProbeResult>} probeTickRegistration */

const DEFAULT_TICK_INTERVAL_SEC = 60

module.exports = {
  DEFAULT_TICK_INTERVAL_SEC,
}
