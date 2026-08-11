/**
 * Headless OS schedule tick — no Electron GUI / no Dock flash.
 *
 * Invoked by the OS tick runner when HTTP tick fails:
 *   ELECTRON_RUN_AS_NODE=1 "$EXEC" "$HEADLESS_TICK"
 *
 * Flow: POST tick → if fail, spawn sidecar → health → POST tick → stop sidecar → exit.
 * Do not require('electron').app.
 */
const path = require('node:path')
const fs = require('node:fs')
const {
  endpointFilePath,
  readOsScheduleEndpoint,
  sanitizeEndpointHost,
} = require('./tick-runner.cjs')
const {
  resolveResourcesPathFromExec,
  resolvePackagedRuntimeStage,
  serverEntryPath,
  buildSidecarEnv,
  spawnSidecarProcess,
  waitForHealth,
  stopChildAndWait,
} = require('./sidecar-launch.cjs')

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
    const execPath = typeof raw.execPath === 'string' && raw.execPath.trim()
      ? raw.execPath.trim()
      : process.execPath
    const headlessTick = typeof raw.headlessTick === 'string' ? raw.headlessTick.trim() : ''
    const runtimeStage = typeof raw.runtimeStage === 'string' ? raw.runtimeStage.trim() : ''
    const resourcesPath = typeof raw.resourcesPath === 'string' ? raw.resourcesPath.trim() : ''
    return { host, port, execPath, headlessTick, runtimeStage, resourcesPath }
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

/**
 * Monorepo root when running unpackaged (headless-tick lives under electron/os-schedule).
 */
function resolveDevRepoRoot() {
  return path.resolve(__dirname, '../../../..')
}

/**
 * @param {{
 *   host: string
 *   port: string
 *   execPath: string
 *   runtimeStage?: string
 *   resourcesPath?: string
 * }} ep
 */
function resolveSidecarRoot(ep) {
  if (ep.runtimeStage && fs.existsSync(ep.runtimeStage)) {
    return { root: ep.runtimeStage, isDev: false, resourcesPath: ep.resourcesPath || resolveResourcesPathFromExec(ep.execPath) }
  }
  const packaged = resolvePackagedRuntimeStage(ep.execPath, ep.resourcesPath || undefined)
  if (packaged && fs.existsSync(packaged)) {
    return {
      root: packaged,
      isDev: false,
      resourcesPath: ep.resourcesPath || resolveResourcesPathFromExec(ep.execPath),
    }
  }
  const devRoot = resolveDevRepoRoot()
  if (fs.existsSync(serverEntryPath(devRoot))) {
    return { root: devRoot, isDev: true, resourcesPath: null }
  }
  return null
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

  const resolved = resolveSidecarRoot({
    host,
    port,
    execPath: ep.execPath || process.execPath,
    runtimeStage: ep.runtimeStage,
    resourcesPath: ep.resourcesPath,
  })
  if (!resolved) {
    logErr('cannot resolve runtime-stage / server entry for sidecar')
    process.exitCode = 1
    return
  }

  const entry = serverEntryPath(resolved.root)
  if (!fs.existsSync(entry)) {
    logErr(`server entry not found: ${entry}`)
    process.exitCode = 1
    return
  }

  const execPath = ep.execPath || process.execPath
  const env = buildSidecarEnv({
    root: resolved.root,
    host,
    port,
    resourcesPath: resolved.resourcesPath,
    isDev: resolved.isDev,
    version: process.env.OPPTRIX_APP_VERSION,
  })

  logErr(`spawning sidecar on ${host}:${port} (cwd=${resolved.root})`)
  const child = spawnSidecarProcess({
    execPath,
    entry,
    cwd: resolved.root,
    env,
  })

  child.stdout?.on('data', (chunk) => {
    process.stderr.write(`[sidecar] ${chunk}`)
  })
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[sidecar] ${chunk}`)
  })

  let ok = false
  try {
    await waitForHealth(host, port, 45_000)
    ok = await postScheduleTick(host, port, 10_000)
    if (!ok) {
      logErr('POST /api/schedule/tick failed after sidecar ready')
    }
  } catch (err) {
    logErr(err instanceof Error ? err.message : String(err))
  } finally {
    await stopChildAndWait(child, 4000)
  }

  process.exitCode = ok ? 0 : 1
}

run().catch((err) => {
  logErr(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
