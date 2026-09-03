/**
 * Host port availability for Docker publish (cross-platform via node:net).
 *
 * Bind strategy: probe `0.0.0.0` first so we detect conflicts with Docker host
 * port publishes (which typically bind all interfaces). Fall back to checking
 * `127.0.0.1` only when the dual-stack / IPv6-only edge case rejects 0.0.0.0.
 */
import fs from 'node:fs'
import net from 'node:net'
import { readComposeEnvMap, writeComposeEnvPatch } from './compose-env.mjs'
import {
  isContainerRunning,
  readComposeContainerName,
} from './docker-runtime.mjs'
import {
  composeEnvPath,
  ensureComposeEnv,
  readHostConfig,
  writeHostConfig,
} from './paths.mjs'

export const DEFAULT_HTTP_PORT = 0
export const DEFAULT_HTTPS_PORT = 8712
/** Primary scan window after the preferred HTTPS port. */
export const HTTPS_PORT_SCAN_END = 8799
/** Expanded upper bound if 8712–8799 are exhausted. */
export const HTTPS_PORT_SCAN_HARD_END = 8999

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
function tryListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
    const done = (ok) => {
      server.removeAllListeners()
      try {
        server.close()
      } catch {
        /* ignore */
      }
      resolve(ok)
    }
    server.once('error', () => done(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    try {
      server.listen(port, host)
    } catch {
      done(false)
    }
  })
}

/**
 * True when nothing on the host currently binds this TCP port (safe to publish).
 * Prefer connect-probe first: on darwin, SO_REUSEADDR can let a second
 * `listen()` succeed in-process even when the port is already taken.
 * @param {number} port
 * @param {{ host?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export async function isHostPortFree(port, opts = {}) {
  const n = Number(port)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return false
  if (await isHostPortListening(n, '127.0.0.1')) return false
  const preferredHost = opts.host ?? '0.0.0.0'
  if (await tryListen(n, preferredHost)) return true
  if (preferredHost !== '127.0.0.1') {
    return tryListen(n, '127.0.0.1')
  }
  return false
}

/**
 * True when something accepts TCP on host:port (doctor / status).
 * @param {number} port
 * @param {string} [host]
 * @returns {Promise<boolean>}
 */
export function isHostPortListening(port, host = '127.0.0.1') {
  const n = Number(port)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return Promise.resolve(false)
  return new Promise((resolve) => {
    const socket = net.connect({ port: n, host })
    const finish = (value) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(1200, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

/**
 * Scan for a free host port. Tries `start` first, then start+1 … end, then expands.
 * @param {{
 *   start?: number,
 *   end?: number,
 *   hardEnd?: number,
 *   exclude?: Iterable<number>,
 * }} [opts]
 * @returns {Promise<number>}
 */
export async function findFreeHostPort(opts = {}) {
  const start = opts.start ?? DEFAULT_HTTPS_PORT
  const end = opts.end ?? HTTPS_PORT_SCAN_END
  const hardEnd = opts.hardEnd ?? HTTPS_PORT_SCAN_HARD_END
  const exclude = new Set(opts.exclude ?? [])

  const tryRange = async (from, to) => {
    for (let p = from; p <= to; p += 1) {
      if (exclude.has(p)) continue
      if (await isHostPortFree(p)) return p
    }
    return null
  }

  const first = await tryRange(start, end)
  if (first != null) return first
  if (hardEnd > end) {
    const expanded = await tryRange(end + 1, hardEnd)
    if (expanded != null) return expanded
  }
  throw new Error(`在 ${start}–${hardEnd} 范围内未找到可用宿主机端口`)
}

/**
 * @param {string} root
 * @returns {{ httpsPort: number, httpPort: number, enableHttp: boolean }}
 */
export function readConfiguredHostPorts(root) {
  let httpsPort = DEFAULT_HTTPS_PORT
  let httpPort = DEFAULT_HTTP_PORT
  let enableHttp = false
  try {
    const cfg = readHostConfig(root)
    if (typeof cfg.httpsPort === 'number' && cfg.httpsPort > 0) {
      httpsPort = cfg.httpsPort
    }
    if (typeof cfg.httpPort === 'number' && cfg.httpPort >= 0) {
      httpPort = cfg.httpPort
    }
    const envFile = composeEnvPath(root)
    if (fs.existsSync(envFile)) {
      const map = readComposeEnvMap(fs.readFileSync(envFile, 'utf8'))
      const envHttps = Number(map.get('OPPTRIX_HOST_HTTPS_PORT') || '')
      if (Number.isInteger(envHttps) && envHttps > 0) httpsPort = envHttps
      const envHttp = Number(map.get('OPPTRIX_HOST_HTTP_PORT') || '')
      if (Number.isInteger(envHttp) && envHttp > 0) httpPort = envHttp
      const enable = String(map.get('OPPTRIX_ENABLE_HTTP') || '').trim()
      enableHttp = enable === '1' || enable.toLowerCase() === 'true'
      if (!enableHttp && httpPort > 0 && map.has('OPPTRIX_HOST_HTTP_PORT')) {
        enableHttp = true
      }
    }
  } catch {
    // defaults
  }
  if (!enableHttp) httpPort = 0
  return { httpsPort, httpPort, enableHttp: httpPort > 0 }
}

/**
 * Persist HTTPS/HTTP host publish ports to compose.env + .opptrix.json.
 * @param {string} root
 * @param {{ httpsPort: number, httpPort?: number }} ports
 */
export function writeHostPorts(root, ports) {
  ensureComposeEnv(root)
  const httpsPort = ports.httpsPort
  const httpPort = typeof ports.httpPort === 'number' && ports.httpPort > 0 ? ports.httpPort : 0
  /** @type {Record<string, string>} */
  const set = {
    OPPTRIX_HOST_HTTPS_PORT: String(httpsPort),
    OPPTRIX_ENABLE_HTTP: httpPort > 0 ? '1' : '0',
  }
  if (httpPort > 0) {
    set.OPPTRIX_HOST_HTTP_PORT = String(httpPort)
  }
  writeComposeEnvPatch(composeEnvPath(root), { set })
  writeHostConfig(root, {
    httpsPort,
    httpPort,
  })
}

/**
 * Ensure configured (or flagged) host ports are free before compose up.
 * If HTTPS is occupied by a non-Opptrix process, auto-pick the next free port
 * and write env + host config. When our own container already holds the port,
 * keep it (Docker publish binds the port while running).
 *
 * @param {string} root
 * @param {{
 *   httpsPort?: number,
 *   httpPort?: number,
 *   autoSelect?: boolean,
 *   log?: (msg: string) => void,
 * }} [opts]
 * @returns {Promise<{
 *   httpsPort: number,
 *   httpPort: number,
 *   httpsChanged: boolean,
 *   httpChanged: boolean,
 *   previousHttpsPort: number,
 *   previousHttpPort: number,
 * }>}
 */
export async function ensureDeployHostPorts(root, opts = {}) {
  const log = opts.log ?? ((msg) => console.log(msg))
  const autoSelect = opts.autoSelect !== false
  const configured = readConfiguredHostPorts(root)
  const previousHttpsPort = configured.httpsPort
  const previousHttpPort = configured.httpPort

  const desiredHttps =
    typeof opts.httpsPort === 'number' && opts.httpsPort > 0
      ? opts.httpsPort
      : previousHttpsPort
  const desiredHttp =
    typeof opts.httpPort === 'number'
      ? (opts.httpPort > 0 ? opts.httpPort : 0)
      : previousHttpPort

  const containerName = readComposeContainerName(root)
  const ourContainerHoldsPorts = isContainerRunning(containerName)

  let httpsPort = desiredHttps
  let httpsChanged = false
  const httpsFree = await isHostPortFree(desiredHttps)
  if (!httpsFree && !ourContainerHoldsPorts) {
    if (!autoSelect) {
      throw new Error(`宿主机 HTTPS 端口 ${desiredHttps} 已被占用`)
    }
    httpsPort = await findFreeHostPort({
      start: desiredHttps + 1,
      end: Math.max(HTTPS_PORT_SCAN_END, desiredHttps + 80),
      exclude: desiredHttp > 0 ? [desiredHttp] : [],
    })
    httpsChanged = true
    log(`[opptrix] HTTPS 端口 ${desiredHttps} 已被占用，已自动改用 ${httpsPort}`)
  }

  let httpPort = desiredHttp
  let httpChanged = false
  if (desiredHttp > 0) {
    const httpFree = await isHostPortFree(desiredHttp)
    if (!httpFree && !ourContainerHoldsPorts) {
      if (!autoSelect) {
        throw new Error(`宿主机 HTTP 端口 ${desiredHttp} 已被占用`)
      }
      httpPort = await findFreeHostPort({
        start: desiredHttp + 1,
        end: Math.max(HTTPS_PORT_SCAN_END, desiredHttp + 80),
        exclude: [httpsPort],
      })
      httpChanged = true
      log(`[opptrix] HTTP 端口 ${desiredHttp} 已被占用，已自动改用 ${httpPort}`)
    }
  }

  const explicitHttps =
    typeof opts.httpsPort === 'number' && opts.httpsPort > 0 && opts.httpsPort !== previousHttpsPort
  const explicitHttp =
    typeof opts.httpPort === 'number' && opts.httpPort !== previousHttpPort

  const needWrite =
    httpsChanged
    || httpChanged
    || explicitHttps
    || explicitHttp
    || previousHttpsPort !== httpsPort
    || previousHttpPort !== httpPort

  if (needWrite) {
    writeHostPorts(root, { httpsPort, httpPort })
  }

  return {
    httpsPort,
    httpPort,
    httpsChanged,
    httpChanged,
    previousHttpsPort,
    previousHttpPort,
  }
}
