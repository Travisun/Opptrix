/** @type {import('./types.cjs').OsScheduleAdapter} */
const stubAdapter = {
  async ensureTickRegistration() {
    return { ok: true, status: 'n/a', error: null }
  },
  async removeTickRegistration() {
    return { ok: true, status: 'n/a', error: null }
  },
  async probeTickRegistration() {
    return { registered: false, status: 'n/a', error: null }
  },
}

module.exports = { stubAdapter }
