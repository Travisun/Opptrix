/**
 * Local port preflight: reuse Opptrix API, clean stale sidecars, or bump dev ports.
 * Used by Electron main (production) and dev launch scripts.
 */
const net = require('node:net')
const { execSync, spawnSync } = require('node:child_process')

const API_HOST = '127.0.0.1'
const DEFAULT_API_PORT = 8711
const DEFAULT_WEB_PORT = 5173
const API_BUMP_MAX = 20
const WEB_PORT_MAX = 5189

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isPortListening(port, host = API_HOST) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (value) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(1200, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

async function probeOpptrixHealth(port, host = API_HOST) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const resp = await fetch(`http://${host}:${port}/api/health`, { signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return null
    const data = await resp.json()
    if (data?.status === 'ok') return data
    return null
  } catch {
    return null
  }
}

async function probeWebDevServer(port, host = API_HOST) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const resp = await fetch(`http://${host}:${port}/`, { signal: controller.signal })
    clearTimeout(timer)
    return resp.ok || resp.status === 304
  } catch {
    return false
  }
}

function getListenPids(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
      const pids = new Set()
      const needle = `:${port}`
      for (const line of out.split('\n')) {
        if (!line.includes(needle) || !/LISTENING/i.test(line)) continue
        const parts = line.trim().split(/\s+/)
        const pid = Number(parts[parts.length - 1])
        if (pid > 0) pids.add(pid)
      }
      return [...pids]
    } catch {
      return []
    }
  }

  try {
    const out = execSync(`lsof -ti :${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((pid) => pid > 0)
  } catch {
    return []
  }
}

function getProcessCommand(pid) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
      )
      return out.trim()
    } catch {
      return ''
    }
  }

  try {
    return execSync(`ps -p ${pid} -o command=`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function isOpptrixServerCommand(command) {
  if (!command) return false
  return /apps[\\/]+server[\\/]+dist[\\/]+index\.js|runtime-stage[\\/].*index\.js|@opptrix[\\/]+server|stock-research|opptrix\.exe.*index\.js|ELECTRON_RUN_AS_NODE/i.test(
    command,
  )
}

function isOpptrixViteCommand(command) {
  if (!command) return false
  return /vite|opptrix-client|client-ui/i.test(command)
}

async function waitForPortFree(port, timeoutMs = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (!(await isPortListening(port))) return true
    await sleep(150)
  }
  return !(await isPortListening(port))
}

/**
 * Windows: taskkill /T kills child tree (sidecar under Opptrix.exe).
 * @param {number} pid
 * @param {boolean} [force]
 */
function killPidTree(pid, force = false) {
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return false
  if (process.platform === 'win32') {
    try {
      const args = force
        ? ['/F', '/T', '/PID', String(pid)]
        : ['/PID', String(pid), '/T']
      const result = spawnSync('taskkill', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: 4000,
      })
      return result.status === 0 || /not found|no running instance|找不到/i.test(String(result.stderr ?? ''))
    } catch {
      return false
    }
  }
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
    return true
  } catch {
    return false
  }
}

async function tryCleanupStaleListeners(port, { forWeb = false, aggressive = false } = {}) {
  const pids = getListenPids(port)
  let killed = false

  for (const pid of pids) {
    if (pid === process.pid) continue
    const command = getProcessCommand(pid)
    const matches = forWeb ? isOpptrixViteCommand(command) : isOpptrixServerCommand(command)
    if (!matches && !aggressive) continue
    if (killPidTree(pid, false)) killed = true
  }

  if (killed) {
    const freed = await waitForPortFree(port, 5000)
    if (!freed) {
      for (const pid of getListenPids(port)) {
        if (pid === process.pid) continue
        const command = getProcessCommand(pid)
        const matches = forWeb ? isOpptrixViteCommand(command) : isOpptrixServerCommand(command)
        if (!matches && !aggressive) continue
        if (killPidTree(pid, true)) killed = true
      }
      await waitForPortFree(port, 3000)
    }
  }
  return killed
}

/**
 * Aggressive multi-pass cleanup until port is free or health is Opptrix-ok.
 * @param {number} port
 * @param {{ maxPasses?: number, waitMs?: number }} [opts]
 */
async function forceReleaseApiPort(port, opts = {}) {
  const maxPasses = opts.maxPasses ?? 3
  const waitMs = opts.waitMs ?? 5000
  let cleaned = false
  for (let pass = 0; pass < maxPasses; pass++) {
    const health = await probeOpptrixHealth(port)
    if (health) return { released: false, reused: true, health, cleaned }
    if (!(await isPortListening(port))) {
      return { released: true, reused: false, cleaned }
    }
    cleaned = (await tryCleanupStaleListeners(port, { aggressive: true })) || cleaned
    if (await waitForPortFree(port, waitMs)) {
      return { released: true, reused: false, cleaned }
    }
    await sleep(200)
  }
  return { released: !(await isPortListening(port)), reused: false, cleaned }
}

/** Force-clean Opptrix API listeners on a port (SIGTERM → SIGKILL). */
async function cleanupStaleApiListeners(port, { aggressive = true } = {}) {
  return tryCleanupStaleListeners(port, { aggressive })
}

/**
 * @param {object} opts
 * @param {number} [opts.preferred]
 * @param {boolean} [opts.isDev]
 * @param {boolean} [opts.allowBump]
 * @param {boolean} [opts.allowReuse]
 * @param {boolean} [opts.allowCleanup]
 */
async function resolveApiPort(opts = {}) {
  const {
    preferred = Number(process.env.STOCK_RESEARCH_PORT ?? DEFAULT_API_PORT),
    isDev = false,
    allowBump = isDev,
    allowReuse = true,
    allowCleanup = true,
  } = opts

  const base = Number(preferred)
  if (!Number.isFinite(base) || base <= 0 || base > 65535) {
    throw new Error(`无效的 API 端口：${preferred}`)
  }

  const health = await probeOpptrixHealth(base)
  if (health && allowReuse) {
    return { port: base, mode: 'reuse', health }
  }

  if (!(await isPortListening(base))) {
    return { port: base, mode: 'use' }
  }

  // 端口占用但 health 不通 — 多为僵尸 sidecar；强制多轮清理（Win taskkill /T）
  const staleSidecar = !health
  if (allowCleanup) {
    if (staleSidecar) {
      await forceReleaseApiPort(base, { maxPasses: 3 })
    } else {
      await tryCleanupStaleListeners(base, { aggressive: false })
    }
    if (!(await isPortListening(base))) {
      return { port: base, mode: 'use', cleaned: true }
    }
    const healthAfterCleanup = await probeOpptrixHealth(base)
    if (healthAfterCleanup && allowReuse) {
      return { port: base, mode: 'reuse', health: healthAfterCleanup, cleaned: true }
    }
  }

  if (allowBump) {
    const limit = Math.min(base + API_BUMP_MAX, 65535)
    for (let port = base + 1; port <= limit; port++) {
      const reused = await probeOpptrixHealth(port)
      if (reused && allowReuse) {
        return { port, mode: 'reuse', health: reused, from: base }
      }
      if (!(await isPortListening(port))) {
        return { port, mode: 'bump', from: base }
      }
    }
  }

  throw new Error(
    `端口 ${base} 已被其他程序占用。请关闭占用该端口的应用，或在环境变量中设置 STOCK_RESEARCH_PORT 指定其他端口。`,
  )
}

/**
 * @param {object} opts
 * @param {number} [opts.preferred]
 * @param {boolean} [opts.allowBump]
 * @param {boolean} [opts.allowReuse]
 * @param {boolean} [opts.allowCleanup]
 */
async function resolveWebPort(opts = {}) {
  const {
    preferred = Number(process.env.WEB_PORT ?? DEFAULT_WEB_PORT),
    allowBump = true,
    allowReuse = true,
    allowCleanup = true,
  } = opts

  const base = Number(preferred)
  if (!Number.isFinite(base) || base <= 0 || base > 65535) {
    throw new Error(`无效的 Web 开发端口：${preferred}`)
  }

  if (!(await isPortListening(base))) {
    return { port: base, mode: 'use' }
  }

  if (allowReuse && (await probeWebDevServer(base))) {
    return { port: base, mode: 'reuse' }
  }

  if (allowCleanup) {
    await tryCleanupStaleListeners(base, { forWeb: true })
    if (!(await isPortListening(base))) {
      return { port: base, mode: 'use', cleaned: true }
    }
    if (allowReuse && (await probeWebDevServer(base))) {
      return { port: base, mode: 'reuse', cleaned: true }
    }
  }

  if (allowBump) {
    const limit = base < DEFAULT_WEB_PORT
      ? Math.min(base + 20, 65535)
      : WEB_PORT_MAX
    for (let port = base + 1; port <= limit; port++) {
      if (allowReuse && (await probeWebDevServer(port))) {
        return { port, mode: 'reuse', from: base }
      }
      if (!(await isPortListening(port))) {
        return { port, mode: 'bump', from: base }
      }
    }
  }

  throw new Error(
    `Web 开发端口 ${base} 已被占用。请关闭其他前端开发服务，或设置 WEB_PORT 指定 ${DEFAULT_WEB_PORT}–${WEB_PORT_MAX} 范围内的端口。`,
  )
}

function describePortPlan(label, plan) {
  if (!plan) return ''
  if (plan.mode === 'reuse') {
    return `${label} ${plan.port}（复用已在运行的服务）`
  }
  if (plan.mode === 'bump') {
    return `${label} ${plan.port}（${plan.from} 已被占用，已自动切换）`
  }
  if (plan.cleaned) {
    return `${label} ${plan.port}（已结束残留进程）`
  }
  return `${label} ${plan.port}`
}

function logPortPlan(apiPlan, webPlan) {
  const lines = ['[ports] 启动端口：', `  - ${describePortPlan('API', apiPlan)}`]
  if (webPlan) lines.push(`  - ${describePortPlan('Web', webPlan)}`)
  console.log(lines.join('\n'))
}

function applyPortEnv(apiPlan, webPlan) {
  const env = {
    STOCK_RESEARCH_PORT: String(apiPlan.port),
    OPPTRIX_API_PORT_MODE: apiPlan.mode,
    OPPTRIX_PORTS_RESOLVED: '1',
    API_PROXY_TARGET: `http://${API_HOST}:${apiPlan.port}`,
  }
  if (webPlan) {
    env.WEB_PORT = String(webPlan.port)
    env.OPPTRIX_WEB_PORT_MODE = webPlan.mode
  }
  return env
}

module.exports = {
  API_HOST,
  DEFAULT_API_PORT,
  DEFAULT_WEB_PORT,
  applyPortEnv,
  cleanupStaleApiListeners,
  describePortPlan,
  forceReleaseApiPort,
  isPortListening,
  logPortPlan,
  probeOpptrixHealth,
  resolveApiPort,
  resolveWebPort,
}
