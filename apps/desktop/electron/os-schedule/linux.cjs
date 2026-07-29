const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { app } = require('electron')
const { DEFAULT_TICK_INTERVAL_SEC } = require('./types.cjs')

const SERVICE_NAME = 'opptrix-schedule-tick'

function unitDir() {
  return path.join(os.homedir(), '.config', 'systemd', 'user')
}

function servicePath() {
  return path.join(unitDir(), `${SERVICE_NAME}.service`)
}

function timerPath() {
  return path.join(unitDir(), `${SERVICE_NAME}.timer`)
}

function resolveExecStart() {
  if (app.isPackaged) {
    return `${process.execPath} --background --schedule-tick`
  }
  const mainPath = path.join(__dirname, '..', 'main.cjs')
  return `${process.execPath} ${mainPath} --background --schedule-tick`
}

function buildServiceUnit() {
  return `[Unit]
Description=Opptrix schedule tick (oneshot)

[Service]
Type=oneshot
ExecStart=${resolveExecStart()}
`
}

function buildTimerUnit(intervalSec) {
  const sec = Math.max(30, Math.floor(intervalSec || DEFAULT_TICK_INTERVAL_SEC))
  return `[Unit]
Description=Opptrix schedule tick timer

[Timer]
OnBootSec=1min
OnUnitActiveSec=${sec}sec
Persistent=true

[Install]
WantedBy=timers.target
`
}

function systemctl(args) {
  const result = spawnSync('systemctl', args, { encoding: 'utf8' })
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  }
}

/** @type {import('./types.cjs').OsScheduleAdapter} */
const linuxAdapter = {
  async ensureTickRegistration(spec = {}) {
    if (process.platform !== 'linux') {
      return { ok: true, status: 'n/a', error: null }
    }
    try {
      fs.mkdirSync(unitDir(), { recursive: true })
      fs.writeFileSync(servicePath(), buildServiceUnit(), 'utf8')
      fs.writeFileSync(timerPath(), buildTimerUnit(spec.intervalSec), 'utf8')
      systemctl(['--user', 'daemon-reload'])
      const enabled = systemctl(['--user', 'enable', '--now', `${SERVICE_NAME}.timer`])
      if (!enabled.ok) {
        return {
          ok: false,
          status: 'error',
          error: (enabled.stderr || enabled.stdout || 'systemctl enable failed').trim(),
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
    if (process.platform !== 'linux') {
      return { ok: true, status: 'n/a', error: null }
    }
    try {
      // 停 timer + 可能仍在跑的 oneshot，避免更新窗口期再拉起 AppImage
      systemctl(['--user', 'stop', `${SERVICE_NAME}.service`])
      systemctl(['--user', 'disable', '--now', `${SERVICE_NAME}.timer`])
      if (fs.existsSync(timerPath())) fs.unlinkSync(timerPath())
      if (fs.existsSync(servicePath())) fs.unlinkSync(servicePath())
      systemctl(['--user', 'daemon-reload'])
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
    if (process.platform !== 'linux') {
      return { registered: false, status: 'n/a', error: null }
    }
    const listed = systemctl(['--user', 'is-active', `${SERVICE_NAME}.timer`])
    const registered = listed.stdout.trim() === 'active'
    return {
      registered,
      status: registered ? 'synced' : 'pending',
      error: listed.ok ? null : listed.stderr.trim() || null,
    }
  },
}

module.exports = { linuxAdapter, SERVICE_NAME }
