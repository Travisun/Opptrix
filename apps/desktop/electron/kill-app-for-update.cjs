/**
 * 应用内升级前强杀残留进程（对齐 Windows NSIS 语义）。
 * 绝不可误杀当前主进程 process.pid，否则 quitAndInstall 尚未调用就已死掉。
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const DEFAULT_BUDGET_MS = 3_500
const TERM_WAIT_MS = 400
const SETTLE_WAIT_MS = 400

/**
 * @param {number[]} pids
 * @param {number} selfPid
 * @returns {number[]}
 */
function excludeSelfFromPids(pids, selfPid) {
  const self = Number(selfPid)
  return [...new Set(pids)]
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p) && p > 0 && p !== self)
}

/**
 * macOS：从 Electron execPath 解析 .app bundle 根。
 * @param {string} execPath
 * @returns {string | null}
 */
function resolveDarwinBundleRoot(execPath) {
  if (!execPath || typeof execPath !== 'string') return null
  const normalized = path.normalize(execPath)
  const lower = normalized.toLowerCase()
  const marker = '.app'
  const idx = lower.lastIndexOf(marker)
  if (idx < 0) return null
  const end = idx + marker.length
  // 要求 .app 后是路径分隔或字符串结束（避免误匹配 Foo.application）
  if (end < normalized.length && normalized[end] !== path.sep && normalized[end] !== '/') {
    return null
  }
  return normalized.slice(0, end)
}

/**
 * Windows：安装目录 = Opptrix.exe 所在目录（始终用 win32 路径语义）。
 * @param {string} execPath
 * @returns {string | null}
 */
function resolveWinInstallDir(execPath) {
  if (!execPath || typeof execPath !== 'string') return null
  return path.win32.normalize(path.win32.dirname(execPath))
}

/**
 * Linux：优先 AppImage 挂载目录 / 镜像路径，否则 execPath 目录（deb 等）。
 * @param {string} execPath
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
function resolveLinuxAppRoot(execPath, env = process.env) {
  if (env.APPDIR && typeof env.APPDIR === 'string' && env.APPDIR.trim()) {
    return path.posix.normalize(env.APPDIR.trim())
  }
  if (env.APPIMAGE && typeof env.APPIMAGE === 'string' && env.APPIMAGE.trim()) {
    return path.posix.normalize(env.APPIMAGE.trim())
  }
  if (!execPath || typeof execPath !== 'string') return null
  return path.posix.normalize(path.posix.dirname(execPath))
}

/**
 * Linux 扫杀根：APPDIR（squashfs 挂载）、APPIMAGE 文件、exec 所在目录（deb）。
 * @param {string} execPath
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function collectLinuxAppRoots(execPath, env = process.env) {
  /** @type {string[]} */
  const roots = []
  const push = (value) => {
    if (!value || typeof value !== 'string') return
    const n = path.posix.normalize(value.trim())
    if (!n || n === '.' || n === '/') return
    if (!roots.includes(n)) roots.push(n)
  }
  push(env.APPDIR)
  push(env.APPIMAGE)
  if (execPath && typeof execPath === 'string') {
    push(path.posix.dirname(execPath))
    // 部分 AppImage 运行时 execPath 已在挂载点内
    const parts = path.posix.normalize(execPath).split('/')
    const mountIdx = parts.findIndex((p) => p.startsWith('.mount_'))
    if (mountIdx > 0) {
      push(parts.slice(0, mountIdx + 1).join('/') || null)
    }
  }
  const primary = resolveLinuxAppRoot(execPath, env)
  if (primary) push(primary)
  return roots
}

/**
 * @param {string} candidate exe 或 cmdline 片段
 * @param {string} root
 * @returns {boolean}
 */
function pathMatchesLinuxRoot(candidate, root) {
  if (!candidate || !root) return false
  const c = path.posix.normalize(candidate)
  const r = path.posix.normalize(root)
  if (c === r) return true
  if (c.startsWith(`${r}/`)) return true
  // cmdline 里常只有 AppImage 文件名
  const base = path.posix.basename(r)
  if (base.endsWith('.AppImage') && (c === base || c.includes(`/${base}`) || c.includes(`${base} `))) {
    return true
  }
  return false
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 从 `ps -axo pid=,command=` 输出中筛出 cmdline 含 rootPath 的 PID。
 * @param {string} psOutput
 * @param {string} rootPath
 * @param {number} selfPid
 * @returns {number[]}
 */
function parsePsPidsMatchingRoot(psOutput, rootPath, selfPid) {
  if (!psOutput || !rootPath) return []
  const needle = rootPath
  const pids = []
  for (const line of psOutput.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^(\d+)\s+(.*)$/)
    if (!match) continue
    const pid = Number(match[1])
    const cmd = match[2] ?? ''
    if (!cmd.includes(needle)) continue
    pids.push(pid)
  }
  return excludeSelfFromPids(pids, selfPid)
}

/**
 * @param {string} rootPath
 * @param {number} selfPid
 * @param {number} timeoutMs
 * @returns {number[]}
 */
function listUnixPidsUnderRoot(rootPath, selfPid, timeoutMs) {
  try {
    // Linux 优先 args=（command= 在部分发行版不可用）
    const psArgsVariants = [
      ['-axo', 'pid=,args='],
      ['-eo', 'pid=,args='],
      ['-axo', 'pid=,command='],
    ]
    const timeout = Math.max(500, Math.min(timeoutMs, 2_000))
    for (const psArgs of psArgsVariants) {
      const result = spawnSync('ps', psArgs, {
        encoding: 'utf8',
        timeout,
        windowsHide: true,
      })
      if (result.error || result.status !== 0) continue
      return parsePsPidsMatchingRoot(result.stdout ?? '', rootPath, selfPid)
    }
    console.warn('[updater] list residual pids via ps failed on all flag variants')
    return []
  } catch (err) {
    console.warn('[updater] list residual pids failed:', err)
    return []
  }
}

/**
 * Linux：经 /proc 匹配 exe/cmdline（比 ps 更准，覆盖 AppImage 挂载点内 Chromium/srt 等）。
 * @param {string[]} roots
 * @param {number} selfPid
 * @returns {number[]}
 */
function listLinuxPidsUnderRootsViaProc(roots, selfPid) {
  if (!roots.length) return []
  /** @type {number[]} */
  const found = []
  let entries
  try {
    entries = fs.readdirSync('/proc')
  } catch (err) {
    console.warn('[updater] linux /proc readdir failed:', err)
    return []
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue
    const pid = Number(name)
    if (!Number.isFinite(pid) || pid <= 0 || pid === Number(selfPid)) continue
    let matched = false
    try {
      const exe = fs.readlinkSync(path.join('/proc', name, 'exe'))
      matched = roots.some((r) => pathMatchesLinuxRoot(exe, r))
    } catch {
      /* 权限不足或进程已退 */
    }
    if (!matched) {
      try {
        const raw = fs.readFileSync(path.join('/proc', name, 'cmdline'), 'utf8')
        const cmdline = raw.replace(/\0/g, ' ').trim()
        matched = roots.some((r) => pathMatchesLinuxRoot(cmdline, r) || cmdline.includes(r))
      } catch {
        /* ignore */
      }
    }
    if (matched) found.push(pid)
  }
  return excludeSelfFromPids(found, selfPid)
}

/**
 * @param {string[]} roots
 * @param {number} selfPid
 * @param {number} timeoutMs
 * @returns {number[]}
 */
function listLinuxResidualPids(roots, selfPid, timeoutMs) {
  const viaProc = listLinuxPidsUnderRootsViaProc(roots, selfPid)
  /** @type {number[]} */
  let viaPs = []
  for (const r of roots) {
    viaPs = viaPs.concat(listUnixPidsUnderRoot(r, selfPid, timeoutMs))
  }
  return excludeSelfFromPids([...viaProc, ...viaPs], selfPid)
}

/**
 * @param {number} pid
 * @param {NodeJS.Signals} signal
 */
function signalPid(pid, signal) {
  try {
    process.kill(pid, signal)
    return true
  } catch (err) {
    // ESRCH = already gone
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ESRCH') return false
    return false
  }
}

/**
 * @param {number[]} pids
 * @param {number} budgetMs
 * @returns {Promise<number>} unique PIDs we signaled (TERM and/or KILL)
 */
async function termThenKillUnix(pids, budgetMs) {
  const started = Date.now()
  const signaled = new Set()
  const remaining = new Set(pids)

  for (const pid of remaining) {
    if (Date.now() - started > budgetMs) break
    if (signalPid(pid, 'SIGTERM')) signaled.add(pid)
  }

  const waitMs = Math.min(TERM_WAIT_MS, Math.max(0, budgetMs - (Date.now() - started)))
  if (waitMs > 0 && remaining.size > 0) await sleep(waitMs)

  for (const pid of [...remaining]) {
    if (Date.now() - started > budgetMs) break
    try {
      process.kill(pid, 0)
    } catch {
      remaining.delete(pid)
      continue
    }
    if (signalPid(pid, 'SIGKILL')) signaled.add(pid)
    remaining.delete(pid)
  }

  return signaled.size
}

/**
 * @param {string} installDir
 * @param {number} selfPid
 * @param {number} timeoutMs
 * @returns {number} killed count from PowerShell
 */
function killWin32ByInstallDir(installDir, selfPid, timeoutMs) {
  const dir = installDir.replace(/'/g, "''")
  const script = [
    `$root = '${dir}'`,
    `$self = ${Number(selfPid)}`,
    '$n = 0',
    'Get-CimInstance Win32_Process | Where-Object {',
    '  $_.Path -and',
    '  $_.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and',
    '  $_.ProcessId -ne $self',
    '} | ForEach-Object {',
    '  try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; $n++ } catch {}',
    '}',
    'Write-Output $n',
  ].join('; ')

  try {
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf8',
        timeout: Math.max(800, Math.min(timeoutMs, 3_000)),
        windowsHide: true,
      },
    )
    if (result.error) {
      console.warn('[updater] win32 residual kill failed:', result.error)
      return 0
    }
    const out = String(result.stdout ?? '').trim()
    const n = Number(out.split(/\r?\n/).filter(Boolean).pop())
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch (err) {
    console.warn('[updater] win32 residual kill exception:', err)
    return 0
  }
}

/**
 * 更新安装前清理同 bundle / 安装目录下的残留进程（排除 self）。
 *
 * @param {{
 *   platform?: NodeJS.Platform
 *   selfPid?: number
 *   execPath?: string
 *   env?: NodeJS.ProcessEnv
 *   budgetMs?: number
 *   settleMs?: number
 * }} [opts]
 * @returns {Promise<{ killed: number }>}
 */
async function killResidualAppProcessesForUpdate(opts = {}) {
  const platform = opts.platform ?? process.platform
  const selfPid = opts.selfPid ?? process.pid
  const execPath = opts.execPath ?? process.execPath
  const env = opts.env ?? process.env
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const settleMs = opts.settleMs ?? SETTLE_WAIT_MS
  const started = Date.now()

  try {
    let killed = 0

    if (platform === 'darwin') {
      const bundleRoot = resolveDarwinBundleRoot(execPath)
      if (!bundleRoot) {
        console.warn('[updater] darwin bundle root unresolved; skip residual kill')
        return { killed: 0 }
      }
      const remainingBudget = () => Math.max(0, budgetMs - (Date.now() - started))
      let pids = listUnixPidsUnderRoot(bundleRoot, selfPid, remainingBudget())
      if (pids.length > 0) {
        killed += await termThenKillUnix(pids, remainingBudget())
      }
      const settle = Math.min(settleMs, remainingBudget())
      if (settle > 0) await sleep(settle)
      // 再扫一次：Helper / 孙进程可能晚退
      pids = listUnixPidsUnderRoot(bundleRoot, selfPid, remainingBudget())
      if (pids.length > 0 && remainingBudget() > 200) {
        killed += await termThenKillUnix(pids, remainingBudget())
      }
    } else if (platform === 'win32') {
      const installDir = resolveWinInstallDir(execPath)
      if (!installDir) {
        console.warn('[updater] win32 install dir unresolved; skip residual kill')
        return { killed: 0 }
      }
      // 不在 Electron 侧无差别 taskkill /IM Opptrix.exe（会误杀 self）；
      // 仅按安装目录路径杀其它 PID；NSIS 安装器侧仍会做全量强杀。
      killed += killWin32ByInstallDir(installDir, selfPid, budgetMs)
      const settle = Math.min(settleMs, Math.max(0, budgetMs - (Date.now() - started)))
      if (settle > 0) await sleep(settle)
      if (Date.now() - started < budgetMs) {
        killed += killWin32ByInstallDir(
          installDir,
          selfPid,
          Math.max(0, budgetMs - (Date.now() - started)),
        )
      }
    } else if (platform === 'linux') {
      const roots = collectLinuxAppRoots(execPath, env)
      if (!roots.length) {
        console.warn('[updater] linux app roots unresolved; skip residual kill')
        return { killed: 0 }
      }
      const remainingBudget = () => Math.max(0, budgetMs - (Date.now() - started))
      // /proc exe+cmdline + ps 双通道；settle 后再扫一轮（对齐 darwin / win32）
      let allPids = listLinuxResidualPids(roots, selfPid, remainingBudget())
      if (allPids.length > 0) {
        killed += await termThenKillUnix(allPids, remainingBudget())
      }
      const settle = Math.min(settleMs, remainingBudget())
      if (settle > 0) await sleep(settle)
      allPids = listLinuxResidualPids(roots, selfPid, remainingBudget())
      if (allPids.length > 0 && remainingBudget() > 200) {
        killed += await termThenKillUnix(allPids, remainingBudget())
      }
    } else {
      console.warn('[updater] residual kill unsupported platform:', platform)
      return { killed: 0 }
    }

    if (killed > 0) {
      console.info(`[updater] killed ${killed} residual process(es) before update install`)
    }
    return { killed }
  } catch (err) {
    console.warn('[updater] killResidualAppProcessesForUpdate failed (non-fatal):', err)
    return { killed: 0 }
  }
}

module.exports = {
  killResidualAppProcessesForUpdate,
  excludeSelfFromPids,
  resolveDarwinBundleRoot,
  resolveWinInstallDir,
  resolveLinuxAppRoot,
  collectLinuxAppRoots,
  pathMatchesLinuxRoot,
  parsePsPidsMatchingRoot,
}
