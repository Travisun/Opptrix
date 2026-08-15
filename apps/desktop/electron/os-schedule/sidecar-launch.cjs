/**
 * Shared sidecar spawn helpers for Electron main and headless OS tick.
 * Pure Node — do not require('electron') at module load.
 */
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const {
  SIDECAR_GRACEFUL_MS,
  SIDECAR_HARD_EXTRA_MS,
} = require('../sidecar-supervisor.cjs')

/**
 * Derive Electron `resources` dir from the binary path when `process.resourcesPath`
 * is unavailable (ELECTRON_RUN_AS_NODE / headless).
 * @param {string} execPath
 * @returns {string | null}
 */
function resolveResourcesPathFromExec(execPath) {
  if (!execPath || typeof execPath !== 'string') return null
  const dir = path.dirname(execPath)
  // macOS: App.app/Contents/MacOS/Opptrix → Contents/Resources
  if (path.basename(dir) === 'MacOS') {
    return path.resolve(dir, '..', 'Resources')
  }
  // Windows / Linux unpacked: <install>/Opptrix.exe + resources/
  const sibling = path.join(dir, 'resources')
  if (fs.existsSync(sibling)) return sibling
  return null
}

/**
 * Packaged sidecar root: `<resources>/runtime-stage`.
 * @param {string} execPath
 * @param {string} [resourcesPath]
 * @returns {string | null}
 */
function resolvePackagedRuntimeStage(execPath, resourcesPath) {
  const resources = resourcesPath || resolveResourcesPathFromExec(execPath)
  if (!resources) return null
  return path.join(resources, 'runtime-stage')
}

/**
 * @param {string} root runtime-stage or monorepo root
 */
function serverEntryPath(root) {
  return path.join(root, 'apps/server/dist/index.js')
}

/**
 * @param {string} root
 */
function uiDistPath(root) {
  return path.join(root, 'client-ui/dist')
}

/**
 * @param {{
 *   root: string
 *   host?: string
 *   port?: string | number
 *   resourcesPath?: string | null
 *   version?: string
 *   isDev?: boolean
 *   httpUserAgent?: string
 *   baseEnv?: NodeJS.ProcessEnv
 * }} opts
 */
function buildSidecarEnv(opts) {
  // Force loopback — never bind/advertise non-local hosts for OS tick / desktop sidecar.
  const rawHost = typeof opts.host === 'string' ? opts.host.trim() : ''
  const host = rawHost === '127.0.0.1' || rawHost === 'localhost' ? '127.0.0.1' : '127.0.0.1'
  const port = String(opts.port != null && String(opts.port).trim() !== '' ? opts.port : '8711')
  const root = opts.root
  const isDev = Boolean(opts.isDev)
  const base = opts.baseEnv ?? process.env
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...base,
    SERVE_UI: '1',
    OPPTRIX_DESKTOP: '1',
    STOCK_RESEARCH_HOST: host,
    STOCK_RESEARCH_PORT: port,
    UI_DIST_PATH: uiDistPath(root),
  }

  if (opts.version) {
    env.OPPTRIX_APP_VERSION = opts.version
  }
  if (opts.httpUserAgent) {
    env.OPPTRIX_HTTP_USER_AGENT = opts.httpUserAgent
  }

  if (!isDev) {
    env.ELECTRON_RUN_AS_NODE = '1'
    env.OPPTRIX_RUNTIME_STAGE = root
    const resourcesPath = opts.resourcesPath || null
    if (resourcesPath) {
      env.OPPTRIX_RESOURCES_PATH = resourcesPath
      env.OPPTRIX_E5_BUNDLED_DIR = path.join(resourcesPath, 'llms', 'multilingual-e5-small')
      env.OPPTRIX_RAPIDOCR_BUNDLED_DIR = path.join(
        resourcesPath,
        'llms',
        'rapidocr-ppocrv4-mobile',
      )
      env.OPPTRIX_RAG_ENGINES_BUNDLED_DIR = path.join(resourcesPath, 'engines')
      env.OPPTRIX_PYTHON_BUNDLED_DIR = path.join(resourcesPath, 'python')
      env.OPPTRIX_SENSEVOICE_BUNDLED_DIR = path.join(resourcesPath, 'sensevoice')
      env.OPPTRIX_WEB_VENDOR_DIR = path.join(resourcesPath, 'web-vendor')
    }
    let RUNTIME_DEPS_DIR = 'deps'
    try {
      ;({ RUNTIME_DEPS_DIR } = require('../runtime-deps.cjs'))
    } catch {
      /* headless / tests may lack sibling */
    }
    const nmDir = path.join(root, 'node_modules')
    const depsDir = path.join(root, RUNTIME_DEPS_DIR)
    const moduleRoot = fs.existsSync(nmDir) ? nmDir : depsDir
    if (fs.existsSync(moduleRoot)) {
      env.NODE_PATH = moduleRoot
    }
    // 显式注入，避免 require('ffmpeg-static') 解析到无二进制路径时误报 ffmpegReady=false
    if (!env.FFMPEG_PATH) {
      const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
      const ffmpegCandidate = path.join(moduleRoot, 'ffmpeg-static', ffmpegName)
      if (fs.existsSync(ffmpegCandidate)) {
        env.FFMPEG_PATH = ffmpegCandidate
      }
    }
    const browsersPath = path.join(root, 'playwright-browsers')
    if (fs.existsSync(browsersPath)) {
      env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
    }
  } else {
    env.OPPTRIX_E5_BUNDLED_DIR = path.join(root, 'apps/desktop/resources/llms', 'multilingual-e5-small')
    env.OPPTRIX_RAPIDOCR_BUNDLED_DIR = path.join(
      root,
      'apps/desktop/resources/llms',
      'rapidocr-ppocrv4-mobile',
    )
    env.OPPTRIX_WEB_VENDOR_DIR = path.join(root, 'apps/desktop/resources/web-vendor')
  }

  return env
}

/**
 * @param {{
 *   execPath: string
 *   entry: string
 *   cwd: string
 *   env: NodeJS.ProcessEnv
 * }} opts
 * @returns {import('node:child_process').ChildProcess}
 */
function spawnSidecarProcess(opts) {
  // windowsHide: 避免 Win 上弹出控制台；Node/Electron-as-Node 均支持。
  return spawn(opts.execPath, [opts.entry], {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    windowsHide: true,
    shell: false,
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {string} host
 * @param {string | number} port
 * @param {number} [timeoutMs]
 */
async function waitForHealth(host, port, timeoutMs = 30_000) {
  const url = `http://${host}:${port}/api/health`
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(url)
      if (resp.ok) return
    } catch {
      /* retry */
    }
    // Fast poll first 3s (cold start / relaunch), then back off.
    await sleep(Date.now() - started < 3000 ? 80 : 250)
  }
  throw new Error(`API sidecar not ready: ${url}`)
}

/**
 * SIGTERM then SIGKILL — does not wait for exit.
 * Soft-kill grace defaults to SIDECAR_GRACEFUL_MS（≥ server forceExit 12s + 缓冲；见 sidecar-supervisor.cjs）。
 * @param {import('node:child_process').ChildProcess | null | undefined} proc
 * @param {{ killGraceMs?: number }} [opts]
 */
function stopChild(proc, opts = {}) {
  if (!proc || proc.killed || proc.exitCode != null) return
  const graceMs = opts.killGraceMs ?? SIDECAR_GRACEFUL_MS
  try {
    proc.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    if (proc.exitCode != null || proc.killed) return
    try {
      proc.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }, graceMs)
}

/**
 * Stop and wait for exit (or timeout).
 * Soft SIGKILL at min(SIDECAR_GRACEFUL_MS, timeoutMs); hard finish after soft + HARD_EXTRA.
 * @param {import('node:child_process').ChildProcess | null | undefined} proc
 * @param {number} [timeoutMs] default ≥ server shutdown window
 * @returns {Promise<void>}
 */
function stopChildAndWait(proc, timeoutMs = SIDECAR_GRACEFUL_MS) {
  return new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode != null) {
      resolve()
      return
    }
    const softMs = Math.min(SIDECAR_GRACEFUL_MS, timeoutMs)
    const hardMs = softMs + SIDECAR_HARD_EXTRA_MS
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(softTimer)
      clearTimeout(hardTimer)
      resolve()
    }
    proc.once('exit', finish)
    try {
      proc.kill('SIGTERM')
    } catch {
      finish()
      return
    }
    const softTimer = setTimeout(() => {
      try {
        if (proc.exitCode == null && !proc.killed) proc.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, softMs)
    const hardTimer = setTimeout(finish, hardMs)
  })
}

module.exports = {
  resolveResourcesPathFromExec,
  resolvePackagedRuntimeStage,
  serverEntryPath,
  uiDistPath,
  buildSidecarEnv,
  spawnSidecarProcess,
  waitForHealth,
  stopChild,
  stopChildAndWait,
  SIDECAR_GRACEFUL_MS,
  SIDECAR_HARD_EXTRA_MS,
}
