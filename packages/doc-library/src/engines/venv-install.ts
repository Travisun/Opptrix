/**
 * Python 侧车 venv：优先用安装包内置 wheels 离线 pip，失败再回落在线。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  getBundledEngineDir,
  type RagEngineId,
  resolveEngineWorkerSource,
} from '../paths.js'
import { resolveSystemPython } from './python-bin.js'

export const VENV_TIMEOUT_MS = 600_000

export function runProcess(opts: {
  command: string
  args: string[]
  cwd?: string
  timeoutMs: number
  env?: NodeJS.ProcessEnv
}): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    let settled = false
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stderr })
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      finish(null)
    }, opts.timeoutMs)
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk)
    })
    child.on('error', () => finish(null))
    child.on('close', (code) => finish(code))
  })
}

export function venvPythonBin(installDir: string, envKeys: string[]): string {
  const venvUnix = path.join(installDir, 'venv', 'bin', 'python')
  const venvWin = path.join(installDir, 'venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvUnix)) return venvUnix
  if (fs.existsSync(venvWin)) return venvWin
  for (const key of envKeys) {
    const v = process.env[key]?.trim()
    if (v) return v
  }
  return process.env.OPPTRIX_PYTHON?.trim() || 'python3'
}

export function systemPython(envKeys: string[]): string {
  return resolveSystemPython(envKeys)
}

/** 内置 wheels 目录（至少一个 .whl） */
export function resolveBundledWheelsDir(engineId: RagEngineId): string | null {
  const bundled = getBundledEngineDir(engineId)
  if (!bundled) return null
  const wheels = path.join(bundled, 'wheels')
  if (!fs.existsSync(wheels)) return null
  try {
    const entries = fs.readdirSync(wheels)
    if (entries.some((e) => e.endsWith('.whl') || e.endsWith('.tar.gz'))) return wheels
  } catch {
    return null
  }
  return null
}

/**
 * 同步 worker.py / requirements.txt 到用户安装目录。
 * 优先安装包内置 engines，其次仓库 scripts/。
 */
export async function syncEngineWorkerFiles(
  engineId: RagEngineId,
  installDir: string,
): Promise<{ workerDest: string; fromBundled: boolean } | { error: string }> {
  await fs.promises.mkdir(installDir, { recursive: true })
  const source = resolveEngineWorkerSource(engineId)
  if (!source) {
    return { error: '暂时无法准备，请确认应用完整后再试' }
  }
  const workerDest = path.join(installDir, 'worker.py')
  await fs.promises.copyFile(source.workerScript, workerDest)
  if (fs.existsSync(source.requirements)) {
    await fs.promises.copyFile(source.requirements, path.join(installDir, 'requirements.txt'))
  }
  return { workerDest, fromBundled: source.fromBundled }
}

export type VenvInstallMessages = {
  noPython: string
  incomplete: string
  pipFailed: string
}

/**
 * 创建 venv（若无）并用 pip 安装 requirements。
 * 有 bundled wheels 时先 `--no-index --find-links`；失败再尝试在线 pip。
 */
export async function ensureVenvDeps(opts: {
  installDir: string
  engineId: RagEngineId
  envKeys: string[]
  messages: VenvInstallMessages
}): Promise<{ ok: boolean; error?: string; usedOfflineWheels: boolean }> {
  const { installDir, engineId, envKeys, messages } = opts
  let python = venvPythonBin(installDir, envKeys)
  const hasVenv = python.includes(`${path.sep}venv${path.sep}`)
  if (!hasVenv) {
    const created = await runProcess({
      command: systemPython(envKeys),
      args: ['-m', 'venv', path.join(installDir, 'venv')],
      cwd: installDir,
      timeoutMs: VENV_TIMEOUT_MS,
    })
    if (created.code !== 0) {
      return { ok: false, error: messages.noPython, usedOfflineWheels: false }
    }
    python = venvPythonBin(installDir, envKeys)
  }

  const req = path.join(installDir, 'requirements.txt')
  if (!fs.existsSync(req)) {
    return { ok: false, error: messages.incomplete, usedOfflineWheels: false }
  }

  const wheelsDir = resolveBundledWheelsDir(engineId)
  if (wheelsDir) {
    const offline = await runProcess({
      command: python,
      args: [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--no-index',
        '--find-links',
        wheelsDir,
        '-r',
        'requirements.txt',
      ],
      cwd: installDir,
      timeoutMs: VENV_TIMEOUT_MS,
    })
    if (offline.code === 0) {
      return { ok: true, usedOfflineWheels: true }
    }
  }

  const online = await runProcess({
    command: python,
    args: ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt'],
    cwd: installDir,
    timeoutMs: VENV_TIMEOUT_MS,
  })
  if (online.code !== 0) {
    return { ok: false, error: messages.pipFailed, usedOfflineWheels: false }
  }
  return { ok: true, usedOfflineWheels: false }
}
