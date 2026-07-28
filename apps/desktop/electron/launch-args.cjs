/** @typedef {{ background: boolean; scheduleTick: boolean }} LaunchArgs */

/**
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
