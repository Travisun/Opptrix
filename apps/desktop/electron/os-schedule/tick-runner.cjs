/**
 * OS schedule tick: HTTP-first runner + loopback endpoint file.
 *
 * LaunchAgent / schtasks / systemd invoke a small script that POSTs
 * /api/schedule/tick when the sidecar is up — avoiding a full Opptrix GUI
 * spawn (Dock / taskbar flash). Falls back to ELECTRON_RUN_AS_NODE headless-tick
 * (spawn sidecar → tick → stop) only on failure — never `--background --schedule-tick`.
 */
const path = require('node:path')
const fs = require('node:fs')

const ENDPOINT_FILENAME = 'os-schedule-endpoint.json'
const RUNNER_SH = 'os-schedule-tick-runner.sh'
const RUNNER_CMD = 'os-schedule-tick-runner.cmd'

/**
 * Absolute path to headless-tick.cjs (works inside app.asar under ELECTRON_RUN_AS_NODE).
 */
function defaultHeadlessTickPath() {
  return path.join(__dirname, 'headless-tick.cjs')
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
 * @returns {{ scriptPath: string; endpointFile: string; coldStartArgv: string[] }}
 */
function ensureOsScheduleTickRunner(opts) {
  const platform = opts.platform ?? process.platform
  const userDataDir = opts.userDataDir
  fs.mkdirSync(userDataDir, { recursive: true })

  const headlessTickPath = opts.headlessTickPath || defaultHeadlessTickPath()
  const existing = readOsScheduleEndpoint(userDataDir)
  writeOsScheduleEndpoint(userDataDir, {
    host: existing?.host ?? '127.0.0.1',
    port: existing?.port ?? opts.defaultPort ?? '8711',
    execPath: opts.execPath,
    headlessTick: headlessTickPath,
    runtimeStage: opts.runtimeStage ?? existing?.runtimeStage,
    resourcesPath: opts.resourcesPath ?? existing?.resourcesPath,
  })

  const coldStartArgv = resolveHeadlessTickArgv({
    execPath: opts.execPath,
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

  return { scriptPath, endpointFile, coldStartArgv }
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
  defaultHeadlessTickPath,
  endpointFilePath,
  runnerScriptPath,
  sanitizeEndpointHost,
  writeOsScheduleEndpoint,
  readOsScheduleEndpoint,
  resolveHeadlessTickArgv,
  resolveColdStartArgv,
  shellSingleQuote,
  buildBashRunnerScript,
  buildCmdRunnerScript,
  ensureOsScheduleTickRunner,
  resolveOsTickInvocation,
}
