import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolvePythonRuntimeRoot } from '@opptrix/shared'
import { WorkspaceError } from '../errors.js'
import { getPythonSettings } from '../python-settings-store.js'
import { basenameOfArgv0 } from '../shell/package-policy.js'

const execFileAsync = promisify(execFile)

const PYTHON_BINARIES = new Set(['python', 'python3'])
const PIP_BINARIES = new Set(['pip', 'pip3'])

export type PythonActiveSource = 'system' | 'opptrix' | 'none'

export interface PythonRuntimeStatus {
  system_path: string | null
  system_version: string | null
  opptrix_path: string | null
  opptrix_version: string | null
  active_source: PythonActiveSource
  active_path: string | null
  active_version: string | null
  ready: boolean
  recommend_install: boolean
  message: string
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function probeExecutable(exePath: string): Promise<{ path: string; version: string } | null> {
  try {
    const { stdout } = await execFileAsync(exePath, ['--version'], { timeout: 5000 })
    const version = stdout.trim().split('\n')[0]?.trim() ?? stdout.trim()
    if (!version) return null
    return { path: exePath, version }
  } catch {
    return null
  }
}

async function whichOnPath(names: readonly string[]): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  for (const name of names) {
    try {
      const { stdout } = await execFileAsync(cmd, [name], { timeout: 3000 })
      const first = stdout.trim().split(/\r?\n/)[0]?.trim()
      if (first) return first
    } catch {
      /* try next name */
    }
  }
  return null
}

async function probeSystemPython(): Promise<{ path: string; version: string } | null> {
  const fromPath = await whichOnPath(['python3', 'python'])
  if (fromPath) {
    const probed = await probeExecutable(fromPath)
    if (probed) return probed
  }

  const fallbacks = process.platform === 'win32'
    ? [
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python', 'Python311', 'python.exe'),
    ]
    : [
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3',
    ]

  for (const candidate of fallbacks) {
    if (!candidate) continue
    if (await fileExists(candidate)) {
      const probed = await probeExecutable(candidate)
      if (probed) return probed
    }
  }
  return null
}

function opptrixCandidatePaths(): string[] {
  const root = resolvePythonRuntimeRoot()
  if (process.platform === 'win32') {
    return [
      path.join(root, 'current', 'python.exe'),
      path.join(root, 'current', 'Scripts', 'python.exe'),
      path.join(root, 'python.exe'),
    ]
  }
  return [
    path.join(root, 'current', 'bin', 'python3'),
    path.join(root, 'current', 'bin', 'python'),
    path.join(root, 'bin', 'python3'),
  ]
}

async function probeOpptrixPython(): Promise<{ path: string; version: string } | null> {
  for (const candidate of opptrixCandidatePaths()) {
    if (await fileExists(candidate)) {
      const probed = await probeExecutable(candidate)
      if (probed) return probed
    }
  }
  return null
}

function buildStatusMessage(
  ready: boolean,
  activeSource: PythonActiveSource,
): string {
  if (!ready) {
    return '尚未检测到可用的 Python。可在设置中安装托管版本，或先在系统中安装 Python。'
  }
  if (activeSource === 'opptrix') {
    return '已使用 Opptrix 托管 Python，可直接运行脚本与安装依赖。'
  }
  return '已检测到系统 Python，可直接运行脚本与安装依赖。'
}

/** 探测系统与 Opptrix 托管 Python，按设置选择 active 源 */
export async function resolvePythonRuntime(): Promise<PythonRuntimeStatus> {
  const settings = getPythonSettings()
  const [system, opptrix] = await Promise.all([
    probeSystemPython(),
    probeOpptrixPython(),
  ])

  let active_source: PythonActiveSource = 'none'
  let active_path: string | null = null
  let active_version: string | null = null

  if (settings.prefer_opptrix_python && opptrix) {
    active_source = 'opptrix'
    active_path = opptrix.path
    active_version = opptrix.version
  } else if (system) {
    active_source = 'system'
    active_path = system.path
    active_version = system.version
  } else if (opptrix) {
    active_source = 'opptrix'
    active_path = opptrix.path
    active_version = opptrix.version
  }

  const ready = active_path != null
  const recommend_install = !ready

  return {
    system_path: system?.path ?? null,
    system_version: system?.version ?? null,
    opptrix_path: opptrix?.path ?? null,
    opptrix_version: opptrix?.version ?? null,
    active_source,
    active_path,
    active_version,
    ready,
    recommend_install,
    message: buildStatusMessage(ready, active_source),
  }
}

/** 将 argv 中的 python/pip 重写为当前 active 解释器绝对路径 */
export async function resolveShellArgv(argv: readonly string[]): Promise<string[]> {
  if (!argv.length) return [...argv]

  const bin = basenameOfArgv0([...argv])
  if (!PYTHON_BINARIES.has(bin) && !PIP_BINARIES.has(bin)) {
    return [...argv]
  }

  const runtime = await resolvePythonRuntime()
  if (!runtime.ready || !runtime.active_path) {
    throw new WorkspaceError(runtime.message || 'Python 环境尚未就绪')
  }

  const out = [...argv]
  if (PYTHON_BINARIES.has(bin)) {
    out[0] = runtime.active_path
    return out
  }

  out[0] = runtime.active_path
  return [out[0], '-m', 'pip', ...out.slice(1)]
}
