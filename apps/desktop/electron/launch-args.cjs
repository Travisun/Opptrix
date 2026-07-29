/** @typedef {{ background: boolean; scheduleTick: boolean }} LaunchArgs */

/**
 * Parse desktop process argv.
 *
 * - `--background` alone: login-item / quiet start — tray stays, no main window.
 * - `--background --schedule-tick` (OS schtasks/launchd/systemd): ephemeral tick
 *   worker — cold-start main instance runs tick then exits; no tray, no reconcile poll.
 * - `--schedule-tick` without `--background` on a second instance: forward tick to the
 *   resident process (and may focus unless argv also has `--background`).
 *
 * @param {string[] | undefined} [argv]
 * @returns {LaunchArgs}
 */
function parseLaunchArgs(argv = process.argv) {
  const args = Array.isArray(argv) ? argv : []
  return {
    background: args.includes('--background'),
    scheduleTick: args.includes('--schedule-tick'),
  }
}

/**
 * @param {string[] | undefined} [argv]
 */
function hasScheduleTickArg(argv) {
  return parseLaunchArgs(argv).scheduleTick
}

/**
 * @param {string[] | undefined} [argv]
 */
function hasBackgroundArg(argv) {
  return parseLaunchArgs(argv).background
}

module.exports = {
  parseLaunchArgs,
  hasScheduleTickArg,
  hasBackgroundArg,
}
