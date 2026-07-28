const { app } = require('electron')
const { getOsScheduleAdapter } = require('./os-schedule/index.cjs')
const { DEFAULT_TICK_INTERVAL_SEC } = require('./os-schedule/types.cjs')

/** @type {string} */
let apiHost = '127.0.0.1'
/** @type {string} */
let apiPort = '8711'

/**
 * @param {{ host?: string; port?: string | number }} opts
 */
function configureScheduleBridge(opts = {}) {
  if (opts.host) apiHost = opts.host
  if (opts.port != null) apiPort = String(opts.port)
}

function apiBase() {
  return `http://${apiHost}:${apiPort}/api/schedule`
}

async function fetchJson(path, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const resp = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(text || `HTTP ${resp.status}`)
    }
    return resp.json()
  } finally {
    clearTimeout(timer)
  }
}

async function postScheduleTick() {
  return fetchJson('/tick', {
    method: 'POST',
    body: JSON.stringify({ trigger: 'os' }),
  })
}

async function fetchScheduleStatus() {
  return fetchJson('/status', { method: 'GET' })
}

async function fetchScheduleSettings() {
  return fetchJson('/settings', { method: 'GET' })
}

async function patchScheduleSettings(patch) {
  return fetchJson('/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

async function fetchOsReconcileHint() {
  return fetchJson('/os/reconcile', { method: 'GET' })
}

function ensureAutostart(enabled) {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return { ok: true, enabled: false, platform: process.platform }
  }
  /** @type {import('electron').Settings} */
  const settings = {
    openAtLogin: Boolean(enabled),
  }
  if (enabled) {
    settings.args = ['--background']
  }
  app.setLoginItemSettings(settings)
  const current = app.getLoginItemSettings()
  return {
    ok: current.openAtLogin === Boolean(enabled),
    enabled: current.openAtLogin,
    platform: process.platform,
  }
}

function probeAutostart() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return { enabled: false, platform: process.platform }
  }
  const current = app.getLoginItemSettings()
  return { enabled: current.openAtLogin, platform: process.platform }
}

async function reconcileOsSchedule(opts = {}) {
  const isDesktop = process.type === 'browser'
  if (!isDesktop) {
    return { ok: true, skipped: true, reason: 'not-desktop' }
  }

  let hint
  try {
    hint = opts.hint ?? await fetchOsReconcileHint()
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const adapter = getOsScheduleAdapter()
  const shouldRegister = Boolean(hint.register_tick)
  let tickResult

  if (shouldRegister) {
    tickResult = await adapter.ensureTickRegistration({
      intervalSec: hint.interval_sec ?? DEFAULT_TICK_INTERVAL_SEC,
    })
  } else {
    tickResult = await adapter.removeTickRegistration()
  }

  let autostartResult = null
  if (typeof hint.autostart === 'boolean') {
    autostartResult = ensureAutostart(hint.autostart)
  }

  const nextStatus = tickResult.status ?? (tickResult.ok ? 'synced' : 'error')
  try {
    await patchScheduleSettings({
      os_tick_status: nextStatus,
      os_tick_error: tickResult.error ?? null,
    })
  } catch {
    /* sidecar may be unavailable during shutdown */
  }

  return {
    ok: tickResult.ok && (autostartResult == null || autostartResult.ok !== false),
    register_tick: shouldRegister,
    tick: tickResult,
    autostart: autostartResult,
    probe: await adapter.probeTickRegistration().catch(() => null),
  }
}

/**
 * 更新安装前暂停 OS 级 tick，避免 launchd/schtasks/systemd 在替换 .app 期间
 * 再拉起第二实例，导致 ShipIt「App Still Running」或空壳进程。
 * 不改动登录项；安装成功或恢复 UI 后由 reconcileOsSchedule 重新注册。
 */
async function pauseOsScheduleForUpdateInstall() {
  const adapter = getOsScheduleAdapter()
  try {
    const tickResult = await adapter.removeTickRegistration()
    return { ok: tickResult.ok !== false, tick: tickResult }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

module.exports = {
  configureScheduleBridge,
  postScheduleTick,
  fetchScheduleStatus,
  fetchScheduleSettings,
  fetchOsReconcileHint,
  patchScheduleSettings,
  ensureAutostart,
  probeAutostart,
  reconcileOsSchedule,
  pauseOsScheduleForUpdateInstall,
}
