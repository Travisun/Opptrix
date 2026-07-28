const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { app } = require('electron')
const { DEFAULT_TICK_INTERVAL_SEC } = require('./types.cjs')

const LABEL = 'org.opptrix.schedule-tick'

function plistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
}

function resolveProgramArguments() {
  if (app.isPackaged) {
    return [process.execPath, '--background', '--schedule-tick']
  }
  return [process.execPath, path.join(__dirname, '..', 'main.cjs'), '--background', '--schedule-tick']
}

function buildPlist(intervalSec) {
  const args = resolveProgramArguments()
  const argXml = args.map((item) => `\n      <string>${escapeXml(item)}</string>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>${argXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${Math.max(30, Math.floor(intervalSec || DEFAULT_TICK_INTERVAL_SEC))}</integer>
  <key>StandardOutPath</key>
  <string>/dev/null</string>
  <key>StandardErrorPath</key>
  <string>/dev/null</string>
</dict>
</plist>
`
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function launchctl(args) {
  const result = spawnSync('launchctl', args, { encoding: 'utf8' })
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  }
}

function unloadIfLoaded() {
  const target = plistPath()
  if (!fs.existsSync(target)) return
  launchctl(['bootout', `gui/${process.getuid()}`, target])
  launchctl(['unload', target])
}

/** @type {import('./types.cjs').OsScheduleAdapter} */
const darwinAdapter = {
  async ensureTickRegistration(spec = {}) {
    if (process.platform !== 'darwin') {
      return { ok: true, status: 'n/a', error: null }
    }
    try {
      const target = plistPath()
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, buildPlist(spec.intervalSec ?? DEFAULT_TICK_INTERVAL_SEC), 'utf8')
      unloadIfLoaded()
      const loaded = launchctl(['bootstrap', `gui/${process.getuid()}`, target])
      if (!loaded.ok) {
        const fallback = launchctl(['load', '-w', target])
        if (!fallback.ok) {
          return {
            ok: false,
            status: 'error',
            error: (loaded.stderr || fallback.stderr || 'launchctl load failed').trim(),
          }
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
    if (process.platform !== 'darwin') {
      return { ok: true, status: 'n/a', error: null }
    }
    try {
      unloadIfLoaded()
      const target = plistPath()
      if (fs.existsSync(target)) fs.unlinkSync(target)
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
    if (process.platform !== 'darwin') {
      return { registered: false, status: 'n/a', error: null }
    }
    const target = plistPath()
    if (!fs.existsSync(target)) {
      return { registered: false, status: 'pending', error: null }
    }
    const listed = launchctl(['list', LABEL])
    const registered = listed.ok && listed.stdout.includes(LABEL)
    return {
      registered,
      status: registered ? 'synced' : 'pending',
      error: listed.ok ? null : listed.stderr.trim() || null,
    }
  },
}

module.exports = { darwinAdapter, LABEL }
