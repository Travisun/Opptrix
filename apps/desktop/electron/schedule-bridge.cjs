const path = require('node:path')
const { app } = require('electron')
const { getOsScheduleAdapter } = require('./os-schedule/index.cjs')
const {
  writeOsScheduleEndpoint,
  purgeLegacyOsTickArtifacts,
} = require('./os-schedule/tick-runner.cjs')

/** @type {string} */
let apiHost = '127.0.0.1'
/** @type {string} */
let apiPort = '8711'

/**
 * Persist loopback host/port for UI `resolveApiPort(allowReuse:true)`.
 * No longer writes OpptrixSchedule / headless-tick cold-start paths (OS tick abolished).
 */
function persistOsScheduleEndpoint() {
  try {
    if (typeof app?.getPath !== 'function') return
    /** @type {{ host: string; port: string | number }} */
    const opts = {
      host: apiHost,
      port: apiPort,
    }
    writeOsScheduleEndpoint(app.getPath('userData'), opts)
  } catch {
    /* non-electron / tests */
  }
}

/**
 * @param {{ host?: string; port?: string | number }} opts
 */
function configureScheduleBridge(opts = {}) {
  if (opts.host) apiHost = opts.host
  if (opts.port != null) apiPort = String(opts.port)
  persistOsScheduleEndpoint()
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

/**
 * Reconcile desktop schedule side-effects:
 * - Always remove legacy OS tick (LaunchAgent / schtasks / systemd) — never ensure
 * - Purge userData runner scripts + cold-start endpoint fields
 * - Sync login-item autostart when hint.autostart is boolean
 */
async function reconcileOsSchedule(opts = {}) {
  const isDesktop = process.type === 'browser'
  if (!isDesktop) {
    return { ok: true, skipped: true, reason: 'not-desktop' }
  }

  let hint
  try {
    hint = opts.hint ?? await fetchOsReconcileHint()
  } catch (err) {
    // Sidecar may be down; still attempt OS tick purge for upgrade cleanup
    hint = { register_tick: false, autostart: undefined }
    console.warn(
      '[schedule-bridge] reconcile hint failed, still removing OS tick:',
      err instanceof Error ? err.message : String(err),
    )
  }

  const adapter = getOsScheduleAdapter()
  // Product decision: never register OS tick (ignore hint.register_tick)
  const tickResult = await adapter.removeTickRegistration()

  let purge = { removedRunners: [], endpointStripped: false }
  try {
    if (typeof app?.getPath === 'function') {
      purge = purgeLegacyOsTickArtifacts(app.getPath('userData'))
    }
  } catch {
    /* best-effort */
  }

  let autostartResult = null
  if (typeof hint.autostart === 'boolean') {
    autostartResult = ensureAutostart(hint.autostart)
  }

  const nextStatus = tickResult.status ?? (tickResult.ok ? 'n/a' : 'error')
  try {
    await patchScheduleSettings({
      run_when_closed: false,
      os_tick_status: nextStatus === 'synced' ? 'n/a' : nextStatus,
      os_tick_error: tickResult.error ?? null,
    })
  } catch {
    /* sidecar may be unavailable during shutdown */
  }

  return {
    ok: tickResult.ok && (autostartResult == null || autostartResult.ok !== false),
    register_tick: false,
    tick: tickResult,
    autostart: autostartResult,
    purge,
    probe: await adapter.probeTickRegistration().catch(() => null),
  }
}

/**
 * 更新安装前暂停遗留 OS 级 tick，避免 launchd/schtasks/systemd 在替换 .app 期间
 * 再拉起第二实例。不改动登录项；安装后仍只 remove，永不重新 ensure。
 */
async function pauseOsScheduleForUpdateInstall() {
  const adapter = getOsScheduleAdapter()
  try {
    const tickResult = await adapter.removeTickRegistration()
    try {
      if (typeof app?.getPath === 'function') {
        purgeLegacyOsTickArtifacts(app.getPath('userData'))
      }
    } catch {
      /* best-effort */
    }
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
