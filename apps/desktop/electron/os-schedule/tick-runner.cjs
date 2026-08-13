/**
 * OS schedule tick: HTTP-first runner + loopback endpoint file.
 *
 * Legacy LaunchAgent / schtasks / systemd (if still present) invoke a small script
 * that POSTs /api/schedule/tick when the sidecar is up — avoiding a full Opptrix GUI
 * spawn (Dock / taskbar flash). Falls back to ELECTRON_RUN_AS_NODE headless-tick
 * which only retries HTTP tick (does NOT spawn sidecar) — tray model: app not running
 * ⇒ schedule does not run. Never `--background --schedule-tick` as the product path.
 *
 * Product main path: Electron tray + sidecar ScheduleService 20s timer only.
 * This module's ensure/write helpers remain for upgrade purge / removeTickRegistration.
 */
const path = require('node:path')
const fs = require('node:fs')

const ENDPOINT_FILENAME = 'os-schedule-endpoint.json'
const RUNNER_SH = 'os-schedule-tick-runner.sh'
const RUNNER_CMD = 'os-schedule-tick-runner.cmd'
/** Cold-start identity distinct from Opptrix productName (crash UI / process list). */
const HELPER_BASENAME_UNIX = 'OpptrixSchedule'
const HELPER_BASENAME_WIN = 'OpptrixSchedule.exe'

/**
 * Absolute path to headless-tick.cjs (works inside app.asar under ELECTRON_RUN_AS_NODE).
 */
function defaultHeadlessTickPath() {
  return path.join(__dirname, 'headless-tick.cjs')
}

/**
 * @param {NodeJS.Platform} [platform]
 */
function scheduleHelperFileName(platform = process.platform) {
  return platform === 'win32' ? HELPER_BASENAME_WIN : HELPER_BASENAME_UNIX
}

/**
 * Helper must sit beside the Electron binary so @executable_path / adjacent DLLs resolve.
 * @param {string} sourceExecPath Absolute path to Opptrix / Electron binary
 * @param {NodeJS.Platform} [platform]
 */
function resolveScheduleHelperPath(sourceExecPath, platform = process.platform) {
  return path.join(path.dirname(sourceExecPath), scheduleHelperFileName(platform))
}

/**
 * True when basename is OpptrixSchedule(.exe) — not the main product binary name.
 * @param {string} execPath
 * @param {NodeJS.Platform} [platform]
 */
function isScheduleHelperPath(execPath, platform = process.platform) {
  if (typeof execPath !== 'string' || !execPath.trim()) return false
  return path.basename(execPath.trim()) === scheduleHelperFileName(platform)
}

/**
 * Ensure a renamed Electron copy (OpptrixSchedule) exists next to sourceExecPath.
 * Prefer hardlink (same dir / frameworks); fallback copyFileSync. Never silently
 * rewrite cold-start EXEC to the main Opptrix product binary name.
 *
 * @param {{
 *   sourceExecPath: string
 *   platform?: NodeJS.Platform
 * }} opts
 * @returns {{ helperPath: string; created: boolean; refreshed: boolean }}
 */
function ensureOsScheduleHelperExec(opts) {
  const platform = opts.platform ?? process.platform
  const sourceExecPath = optionalAbsPath(opts.sourceExecPath)
  if (!sourceExecPath || !path.isAbsolute(sourceExecPath)) {
    throw new Error('schedule helper: sourceExecPath must be an absolute path')
  }
  if (!fs.existsSync(sourceExecPath)) {
    throw new Error(`schedule helper: source missing: ${sourceExecPath}`)
  }
  // Refuse to treat an already-named helper as the copy source (would clobber itself).
  if (isScheduleHelperPath(sourceExecPath, platform)) {
    return { helperPath: sourceExecPath, created: false, refreshed: false }
  }

  const helperPath = resolveScheduleHelperPath(sourceExecPath, platform)
  if (path.resolve(helperPath) === path.resolve(sourceExecPath)) {
    throw new Error('schedule helper: helper path collides with source')
  }

  let needWrite = !fs.existsSync(helperPath)
  if (!needWrite) {
    try {
      const src = fs.statSync(sourceExecPath)
      const dst = fs.statSync(helperPath)
      needWrite = src.size !== dst.size || src.mtimeMs > dst.mtimeMs + 1000
    } catch {
      needWrite = true
    }
  }

  let created = false
  let refreshed = false
  if (needWrite) {
    const existed = fs.existsSync(helperPath)
    try {
      try {
        if (existed) fs.unlinkSync(helperPath)
      } catch {
        /* Windows may lock running helper — try overwrite via temp */
      }
      let linked = false
      try {
        fs.linkSync(sourceExecPath, helperPath)
        linked = true
      } catch {
        /* hardlink unsupported (permissions / FS) — copy */
      }
      if (!linked) {
        const tmp = `${helperPath}.tmp-${process.pid}`
        try {
          fs.copyFileSync(sourceExecPath, tmp)
          fs.renameSync(tmp, helperPath)
        } catch (copyErr) {
          try {
            if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
          } catch {
            /* ignore */
          }
          throw copyErr
        }
      }
      if (platform !== 'win32') {
        try {
          fs.chmodSync(helperPath, 0o755)
        } catch {
          /* ignore */
        }
      }
      created = !existed
      refreshed = existed
    } catch (err) {
      if (fs.existsSync(helperPath) && isScheduleHelperPath(helperPath, platform)) {
        // Keep existing helper; surface refresh failure for diagnostics without
        // falling back to Opptrix productName.
        console.error(
          '[os-schedule] helper refresh failed, keeping existing OpptrixSchedule:',
          err instanceof Error ? err.message : String(err),
        )
      } else {
        throw new Error(
          `schedule helper: cannot create OpptrixSchedule beside ${sourceExecPath}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
  }

  if (!fs.existsSync(helperPath) || !isScheduleHelperPath(helperPath, platform)) {
    throw new Error(`schedule helper: OpptrixSchedule not available at ${helperPath}`)
  }

  return { helperPath, created, refreshed }
}

/**
 * @param {string} userDataDir
 */
function endpointFilePath(userDataDir) {
  return path.join(userDataDir, ENDPOINT_FILENAME)
}

/**
 * @param {string} userDataDir
 * @param {NodeJS.Platform} [platform]
 */
function runnerScriptPath(userDataDir, platform = process.platform) {
  return path.join(userDataDir, platform === 'win32' ? RUNNER_CMD : RUNNER_SH)
}

/**
 * Force loopback only — never write non-local hosts into the endpoint file.
 * @param {string | undefined} host
 */
function sanitizeEndpointHost(host) {
  const h = typeof host === 'string' ? host.trim() : ''
  if (h === '127.0.0.1' || h === 'localhost') return '127.0.0.1'
  return '127.0.0.1'
}

/**
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
function optionalAbsPath(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/**
 * @param {string} userDataDir
 * @param {{
 *   host?: string
 *   port?: string | number
 *   execPath?: string
 *   headlessTick?: string
 *   runtimeStage?: string
 *   resourcesPath?: string
 * }} opts
 * @returns {{
 *   host: string
 *   port: string
 *   execPath?: string
 *   headlessTick?: string
 *   runtimeStage?: string
 *   resourcesPath?: string
 * }}
 */
function writeOsScheduleEndpoint(userDataDir, opts = {}) {
  fs.mkdirSync(userDataDir, { recursive: true })
  /** @type {Record<string, string>} */
  const payload = {
    host: sanitizeEndpointHost(opts.host),
    port: String(opts.port != null && String(opts.port).trim() !== '' ? opts.port : '8711'),
  }
  const execPath = optionalAbsPath(opts.execPath)
  const headlessTick = optionalAbsPath(opts.headlessTick)
  const runtimeStage = optionalAbsPath(opts.runtimeStage)
  const resourcesPath = optionalAbsPath(opts.resourcesPath)
  if (execPath) payload.execPath = execPath
  if (headlessTick) payload.headlessTick = headlessTick
  if (runtimeStage) payload.runtimeStage = runtimeStage
  if (resourcesPath) payload.resourcesPath = resourcesPath
  fs.writeFileSync(endpointFilePath(userDataDir), `${JSON.stringify(payload)}\n`, 'utf8')
  return payload
}

/**
 * @param {string} userDataDir
 * @returns {{
 *   host: string
 *   port: string
 *   execPath?: string
 *   headlessTick?: string
 *   runtimeStage?: string
 *   resourcesPath?: string
 * } | null}
 */
function readOsScheduleEndpoint(userDataDir) {
  const file = endpointFilePath(userDataDir)
  if (!fs.existsSync(file)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    const host = sanitizeEndpointHost(typeof raw.host === 'string' ? raw.host : undefined)
    const port = typeof raw.port === 'string' || typeof raw.port === 'number'
      ? String(raw.port)
      : '8711'
    /** @type {{
     *   host: string
     *   port: string
     *   execPath?: string
     *   headlessTick?: string
     *   runtimeStage?: string
     *   resourcesPath?: string
     * }} */
    const out = { host, port }
    const execPath = optionalAbsPath(typeof raw.execPath === 'string' ? raw.execPath : undefined)
    const headlessTick = optionalAbsPath(typeof raw.headlessTick === 'string' ? raw.headlessTick : undefined)
    const runtimeStage = optionalAbsPath(typeof raw.runtimeStage === 'string' ? raw.runtimeStage : undefined)
    const resourcesPath = optionalAbsPath(typeof raw.resourcesPath === 'string' ? raw.resourcesPath : undefined)
    if (execPath) out.execPath = execPath
    if (headlessTick) out.headlessTick = headlessTick
    if (runtimeStage) out.runtimeStage = runtimeStage
    if (resourcesPath) out.resourcesPath = resourcesPath
    return out
  } catch {
    return null
  }
}

/**
 * Remove legacy OS tick runner scripts and strip cold-start fields from endpoint.
 * Idempotent; host/port retained for UI sidecar reuse.
 * @param {string} userDataDir
 * @returns {{ removedRunners: string[]; endpointStripped: boolean }}
 */
function purgeLegacyOsTickArtifacts(userDataDir) {
  /** @type {string[]} */
  const removedRunners = []
  for (const name of [RUNNER_SH, RUNNER_CMD]) {
    const p = path.join(userDataDir, name)
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p)
        removedRunners.push(name)
      }
    } catch {
      /* best-effort */
    }
  }

  let endpointStripped = false
  try {
    const existing = readOsScheduleEndpoint(userDataDir)
    if (
      existing
      && (existing.execPath || existing.headlessTick || existing.runtimeStage || existing.resourcesPath)
    ) {
      writeOsScheduleEndpoint(userDataDir, {
        host: existing.host,
        port: existing.port,
      })
      endpointStripped = true
    }
  } catch {
    /* best-effort */
  }

  return { removedRunners, endpointStripped }
}

/**
 * Headless cold-start argv: ELECTRON_RUN_AS_NODE=1 $execPath $headlessTick
 * (env is set by the runner script; argv is only the binary + script).
 *
 * @param {{ execPath: string; headlessTickPath?: string }} opts
 * @returns {string[]}
 */
function resolveHeadlessTickArgv(opts) {
  return [opts.execPath, opts.headlessTickPath || defaultHeadlessTickPath()]
}

/**
 * @deprecated Prefer resolveHeadlessTickArgv — kept for callers/tests naming.
 * @param {{
 *   isPackaged?: boolean
 *   execPath: string
 *   mainCjsPath?: string
 *   headlessTickPath?: string
 * }} opts
 * @returns {string[]}
 */
function resolveColdStartArgv(opts) {
  return resolveHeadlessTickArgv({
    execPath: opts.execPath,
    headlessTickPath: opts.headlessTickPath,
  })
}

/**
 * @param {string} value
 */
function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

/**
 * @param {string[]} argv
 */
function bashExecLine(argv) {
  return argv.map(shellSingleQuote).join(' ')
}

/**
 * @param {string} value
 */
function cmdQuote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

/**
 * @param {{ endpointFile: string; coldStartArgv: string[] }} opts
 * coldStartArgv = [execPath, headlessTickPath]
 */
function buildBashRunnerScript(opts) {
  const endpointQuoted = shellSingleQuote(opts.endpointFile)
  const execQuoted = shellSingleQuote(opts.coldStartArgv[0] || '')
  const headlessQuoted = shellSingleQuote(opts.coldStartArgv[1] || '')
  return `#!/bin/bash
# Opptrix OS schedule tick — HTTP-first; headless ELECTRON_RUN_AS_NODE sidecar if down.
ENDPOINT_FILE=${endpointQuoted}
HOST='127.0.0.1'
PORT='8711'
EXEC=${execQuoted}
HEADLESS_TICK=${headlessQuoted}
if [[ -f "$ENDPOINT_FILE" ]]; then
  _h=$(sed -n 's/.*"host"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$ENDPOINT_FILE" | head -n 1)
  _p=$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$ENDPOINT_FILE" | head -n 1)
  _e=$(sed -n 's/.*"execPath"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$ENDPOINT_FILE" | head -n 1)
  _t=$(sed -n 's/.*"headlessTick"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$ENDPOINT_FILE" | head -n 1)
  [[ -n "$_h" ]] && HOST="$_h"
  [[ -n "$_p" ]] && PORT="$_p"
  [[ -n "$_e" ]] && EXEC="$_e"
  [[ -n "$_t" ]] && HEADLESS_TICK="$_t"
fi
case "$HOST" in
  127.0.0.1|localhost) ;;
  *) HOST='127.0.0.1' ;;
esac
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --connect-timeout 1 --max-time 3 \\
    -X POST "http://\${HOST}:\${PORT}/api/schedule/tick" \\
    -H 'Content-Type: application/json' \\
    -d '{"trigger":"os"}' \\
    >/dev/null 2>&1; then
    exit 0
  fi
fi
export ELECTRON_RUN_AS_NODE=1
export OPPTRIX_OS_SCHEDULE_ENDPOINT="$ENDPOINT_FILE"
exec "$EXEC" "$HEADLESS_TICK"
`
}

/**
 * @param {{ endpointFile: string; coldStartArgv: string[] }} opts
 */
function buildCmdRunnerScript(opts) {
  const endpoint = opts.endpointFile.replace(/"/g, '')
  const execPath = String(opts.coldStartArgv[0] || '').replace(/"/g, '')
  const headlessTick = String(opts.coldStartArgv[1] || '').replace(/"/g, '')
  return `@echo off
setlocal EnableExtensions
set "ENDPOINT_FILE=${endpoint}"
set "HOST=127.0.0.1"
set "PORT=8711"
set "EXEC=${execPath}"
set "HEADLESS_TICK=${headlessTick}"
if exist "%ENDPOINT_FILE%" (
  for /f "usebackq delims=" %%A in (\`powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath $env:ENDPOINT_FILE | ConvertFrom-Json).host"\`) do set "HOST=%%A"
  for /f "usebackq delims=" %%A in (\`powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath $env:ENDPOINT_FILE | ConvertFrom-Json).port"\`) do set "PORT=%%A"
  for /f "usebackq delims=" %%A in (\`powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath $env:ENDPOINT_FILE | ConvertFrom-Json).execPath"\`) do if not "%%A"=="" set "EXEC=%%A"
  for /f "usebackq delims=" %%A in (\`powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath $env:ENDPOINT_FILE | ConvertFrom-Json).headlessTick"\`) do if not "%%A"=="" set "HEADLESS_TICK=%%A"
)
if /I not "%HOST%"=="127.0.0.1" if /I not "%HOST%"=="localhost" set "HOST=127.0.0.1"
curl.exe -fsS --connect-timeout 1 --max-time 3 -X POST "http://%HOST%:%PORT%/api/schedule/tick" -H "Content-Type: application/json" -d "{\\"trigger\\":\\"os\\"}" >nul 2>&1
if %ERRORLEVEL% EQU 0 exit /b 0
set ELECTRON_RUN_AS_NODE=1
set "OPPTRIX_OS_SCHEDULE_ENDPOINT=%ENDPOINT_FILE%"
"%EXEC%" "%HEADLESS_TICK%"
exit /b %ERRORLEVEL%
`
}

/**
 * Write (or refresh) the OS tick runner script under userData; chmod +x on Unix.
 * Cold-start EXEC is OpptrixSchedule helper (renamed Electron copy beside source),
 * not the Opptrix productName binary.
 *
 * @param {{
 *   userDataDir: string
 *   isPackaged?: boolean
 *   execPath: string
 *   mainCjsPath?: string
 *   headlessTickPath?: string
 *   runtimeStage?: string
 *   resourcesPath?: string
 *   platform?: NodeJS.Platform
 *   defaultPort?: string | number
 * }} opts
 * @returns {{
 *   scriptPath: string
 *   endpointFile: string
 *   coldStartArgv: string[]
 *   helperPath: string
 *   sourceExecPath: string
 * }}
 */
function ensureOsScheduleTickRunner(opts) {
  const platform = opts.platform ?? process.platform
  const userDataDir = opts.userDataDir
  fs.mkdirSync(userDataDir, { recursive: true })

  const sourceExecPath = optionalAbsPath(opts.execPath)
  if (!sourceExecPath) {
    throw new Error('ensureOsScheduleTickRunner: execPath (Electron source) is required')
  }

  const { helperPath } = ensureOsScheduleHelperExec({
    sourceExecPath,
    platform,
  })

  const headlessTickPath = opts.headlessTickPath || defaultHeadlessTickPath()
  const existing = readOsScheduleEndpoint(userDataDir)
  writeOsScheduleEndpoint(userDataDir, {
    host: existing?.host ?? '127.0.0.1',
    port: existing?.port ?? opts.defaultPort ?? '8711',
    execPath: helperPath,
    headlessTick: headlessTickPath,
    runtimeStage: opts.runtimeStage ?? existing?.runtimeStage,
    resourcesPath: opts.resourcesPath ?? existing?.resourcesPath,
  })

  const coldStartArgv = resolveHeadlessTickArgv({
    execPath: helperPath,
    headlessTickPath,
  })
  const endpointFile = endpointFilePath(userDataDir)
  const scriptPath = runnerScriptPath(userDataDir, platform)

  if (platform === 'win32') {
    fs.writeFileSync(
      scriptPath,
      buildCmdRunnerScript({ endpointFile, coldStartArgv }),
      'utf8',
    )
  } else {
    fs.writeFileSync(
      scriptPath,
      buildBashRunnerScript({ endpointFile, coldStartArgv }),
      { encoding: 'utf8', mode: 0o755 },
    )
    try {
      fs.chmodSync(scriptPath, 0o755)
    } catch {
      /* ignore */
    }
  }

  return { scriptPath, endpointFile, coldStartArgv, helperPath, sourceExecPath }
}

/**
 * ProgramArguments / ExecStart / schtasks /TR for the OS tick registration.
 * @param {{
 *   userDataDir: string
 *   isPackaged?: boolean
 *   execPath: string
 *   mainCjsPath?: string
 *   headlessTickPath?: string
 *   runtimeStage?: string
 *   resourcesPath?: string
 *   platform?: NodeJS.Platform
 * }} opts
 * @returns {{ programArguments: string[]; scriptPath: string; execStart: string; taskRun: string }}
 */
function resolveOsTickInvocation(opts) {
  const platform = opts.platform ?? process.platform
  const ensured = ensureOsScheduleTickRunner({ ...opts, platform })
  if (platform === 'win32') {
    return {
      programArguments: [ensured.scriptPath],
      scriptPath: ensured.scriptPath,
      execStart: cmdQuote(ensured.scriptPath),
      taskRun: cmdQuote(ensured.scriptPath),
    }
  }
  return {
    programArguments: ['/bin/bash', ensured.scriptPath],
    scriptPath: ensured.scriptPath,
    execStart: `/bin/bash ${shellSingleQuote(ensured.scriptPath)}`,
    taskRun: `/bin/bash ${shellSingleQuote(ensured.scriptPath)}`,
  }
}

module.exports = {
  ENDPOINT_FILENAME,
  RUNNER_SH,
  RUNNER_CMD,
  HELPER_BASENAME_UNIX,
  HELPER_BASENAME_WIN,
  defaultHeadlessTickPath,
  endpointFilePath,
  runnerScriptPath,
  scheduleHelperFileName,
  resolveScheduleHelperPath,
  isScheduleHelperPath,
  ensureOsScheduleHelperExec,
  sanitizeEndpointHost,
  writeOsScheduleEndpoint,
  readOsScheduleEndpoint,
  purgeLegacyOsTickArtifacts,
  resolveHeadlessTickArgv,
  resolveColdStartArgv,
  shellSingleQuote,
  buildBashRunnerScript,
  buildCmdRunnerScript,
  ensureOsScheduleTickRunner,
  resolveOsTickInvocation,
}
