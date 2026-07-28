const { darwinAdapter } = require('./darwin.cjs')
const { win32Adapter } = require('./win32.cjs')
const { linuxAdapter } = require('./linux.cjs')
const { stubAdapter } = require('./stub.cjs')

/** @returns {import('./types.cjs').OsScheduleAdapter} */
function createOsScheduleAdapter() {
  switch (process.platform) {
    case 'darwin':
      return darwinAdapter
    case 'win32':
      return win32Adapter
    case 'linux':
      return linuxAdapter
    default:
      return stubAdapter
  }
}

/** @type {import('./types.cjs').OsScheduleAdapter | null} */
let cached = null

/** @returns {import('./types.cjs').OsScheduleAdapter} */
function getOsScheduleAdapter() {
  if (!cached) cached = createOsScheduleAdapter()
  return cached
}

module.exports = {
  createOsScheduleAdapter,
  getOsScheduleAdapter,
}
