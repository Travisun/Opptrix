const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { app } = require('electron')
const { DEFAULT_TICK_INTERVAL_SEC } = require('./types.cjs')

const TASK_NAME = 'OpptrixScheduleTick'

function quoteCmd(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function resolveCommandLine() {
  if (app.isPackaged) {
    return `${quoteCmd(process.execPath)} --background --schedule-tick`
  }
  const mainPath = path.join(__dirname, '..', 'main.cjs')
  return `${quoteCmd(process.execPath)} ${quoteCmd(mainPath)} --background --schedule-tick`
}

function schtasks(args) {
  const result = spawnSync('schtasks', args, {
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  }
}

/** @type {import('./types.cjs').OsScheduleAdapter} */
const win32Adapter = {
  async ensureTickRegistration(spec = {}) {
    if (process.platform !== 'win32') {
      return { ok: true, status: 'n/a', error: null }
    }
    try {
      const interval = Math.max(1, Math.floor((spec.intervalSec ?? DEFAULT_TICK_INTERVAL_SEC) / 60))
      schtasks(['/Delete', '/TN', TASK_NAME, '/F'])
      const created = schtasks([
        '/Create',
        '/TN', TASK_NAME,
        '/TR', resolveCommandLine(),
        '/SC', 'MINUTE',
        '/MO', String(interval),
        '/F',
      ])
      if (!created.ok) {
        return {
          ok: false,
          status: 'error',
          error: (created.stderr || created.stdout || 'schtasks create failed').trim(),
        }
      }
      return { ok: true, status: 'synced', error: null }
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },

  async removeTickRegistration() {
    if (process.platform !== 'win32') {
      return { ok: true, status: 'n/a', error: null }
    }
    try {
      const removed = schtasks(['/Delete', '/TN', TASK_NAME, '/F'])
      if (!removed.ok && !/cannot find/i.test(`${removed.stderr}${removed.stdout}`)) {
        return {
          ok: false,
          status: 'error',
          error: (removed.stderr || removed.stdout || 'schtasks delete failed').trim(),
        }
      }
      return { ok: true, status: 'synced', error: null }
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
    }
    }
  },

  async probeTickRegistration() {
    if (process.platform !== 'win32') {
      return { registered: false, status: 'n/a', error: null }
    }
    const queried = schtasks(['/Query', '/TN', TASK_NAME, '/FO', 'LIST'])
    const registered = queried.ok
    return {
      registered,
      status: registered ? 'synced' : 'pending',
      error: queried.ok ? null : queried.stderr.trim() || null,
    }
  },
}

module.exports = { win32Adapter, TASK_NAME }
