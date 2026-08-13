/**
 * Headless OS schedule tick — HTTP tick only (legacy OS runner compatibility).
 *
 * Invoked by leftover OS tick runners if any still exist after upgrade:
 *   ELECTRON_RUN_AS_NODE=1 "$EXEC" "$HEADLESS_TICK"
 *
 * Product model: tray + in-sidecar ScheduleService (20s) is the only main path.
 * Application not running ⇒ schedule must not run — do NOT spawn a sidecar here.
 * Fail with exit≠0 when POST /api/schedule/tick fails.
 *
 * Do not require('electron').app.
 */
const path = require('node:path')
const fs = require('node:fs')
const {
  endpointFilePath,
  readOsScheduleEndpoint,
  sanitizeEndpointHost,
} = require('./tick-runner.cjs')

/**
 * @param {string} msg
 */
function logErr(msg) {
  process.stderr.write(`[headless-tick] ${msg}\n`)
}

/**
 * @returns {string | null}
 */
function resolveEndpointFile() {
  const fromEnv = process.env.OPPTRIX_OS_SCHEDULE_ENDPOINT?.trim()
  if (fromEnv) return fromEnv
  // Dev / manual: allow OPPTRIX_USER_DATA_DIR
  const userData = process.env.OPPTRIX_USER_DATA_DIR?.trim()
  if (userData) return endpointFilePath(userData)
  return null
}

/**
 * @param {string} file
 */
function readEndpointRecord(file) {
  if (!fs.existsSync(file)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    const host = sanitizeEndpointHost(typeof raw.host === 'string' ? raw.host : undefined)
    const port = typeof raw.port === 'string' || typeof raw.port === 'number'
      ? String(raw.port)
      : '8711'
    return { host, port }
  } catch {
    return null
  }
}

/**
 * @param {string} host
 * @param {string} port
 * @param {number} [timeoutMs]
 */
async function postScheduleTick(host, port, timeoutMs = 3000) {
  const url = `http://${host}:${port}/api/schedule/tick`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'os' }),
      signal: controller.signal,
    })
    return resp.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function run() {
  const endpointFile = resolveEndpointFile()
  if (!endpointFile) {
    logErr('missing OPPTRIX_OS_SCHEDULE_ENDPOINT (and OPPTRIX_USER_DATA_DIR)')
    process.exitCode = 1
    return
  }

  const ep = readEndpointRecord(endpointFile) || readOsScheduleEndpoint(path.dirname(endpointFile))
  if (!ep) {
    logErr(`cannot read endpoint: ${endpointFile}`)
    process.exitCode = 1
    return
  }

  const host = sanitizeEndpointHost(ep.host)
  const port = String(ep.port || '8711')

  if (await postScheduleTick(host, port)) {
    process.exitCode = 0
    return
  }

  // Tray model: no app / no sidecar ⇒ do not cold-start API just to run jobs.
  logErr(`POST /api/schedule/tick failed (${host}:${port}); not spawning sidecar`)
  process.exitCode = 1
}

run().catch((err) => {
  logErr(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
