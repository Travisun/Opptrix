import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolvePythonRuntimeRoot } from '@opptrix/shared'
import { getPythonSettings } from '../python-settings-store.js'
import {
  bundledPythonCandidatePaths,
  resolveBundledPythonRoot,
  seedBundledPythonIfNeeded,
} from './bundled-python.js'

const execFileAsync = promisify(execFile)

/** @deprecated 改用 looksLikePythonBin（支持 python3.x） */
export const PYTHON_BINARIES = new Set(['python', 'python3'])
/** @deprecated 改用 looksLikePipBin（支持 pip3.x） */
export const PIP_BINARIES = new Set(['pip', 'pip3'])

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
  /** 安装包内置 Python 是否可用（含尚未种子到用户目录） */
  bundled_available?: boolean
}

export type PythonProbe = { path: string; version: string }

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function probeExecutable(exePath: string): Promise<PythonProbe | null> {
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

/** 解析 `Python 3.12.8` → [3,12,8]；无法解析返回 null */
export function parsePythonVersionParts(versionLine: string): [number, number, number] | null {
  const m = versionLine.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
}

function comparePythonVersionParts(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** 多候选取版本最高且可用者；版本无法解析的排在可解析之后 */
export function pickHighestPythonProbe(candidates: readonly PythonProbe[]): PythonProbe | null {
  let best: PythonProbe | null = null
  let bestParts: [number, number, number] | null = null
  for (const c of candidates) {
    const parts = parsePythonVersionParts(c.version)
    if (!best) {
      best = c
      bestParts = parts
      continue
    }
    if (parts && bestParts) {
      if (comparePythonVersionParts(parts, bestParts) > 0) {
        best = c
        bestParts = parts
      }
    } else if (parts && !bestParts) {
      best = c
      bestParts = parts
    }
  }
  return best
}

/** Windows 官方安装目录名：Python311 / Python3 / Python314 等 */
export function isWindowsPythonInstallDirName(name: string): boolean {
  return /^Python\d+/i.test(name.trim())
}

/**
 * 根据目录列表拼出 python.exe 候选（纯函数，便于单测）。
 * 不探测可执行性；调用方再 probeExecutable。
 */
export function buildWindowsPythonExeCandidates(input: {
  localAppDataPythonDirs?: readonly string[]
  programFilesPythonDirs?: readonly string[]
  programFilesX86PythonDirs?: readonly string[]
  localAppData?: string
  programFiles?: string
  programFilesX86?: string
}): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (p: string): void => {
    const key = p.toLowerCase()
    if (!p || seen.has(key)) return
    seen.add(key)
    out.push(p)
  }

  const localRoot = input.localAppData
    ? path.join(input.localAppData, 'Programs', 'Python')
    : null
  for (const dirName of input.localAppDataPythonDirs ?? []) {
    if (!localRoot || !isWindowsPythonInstallDirName(dirName)) continue
    add(path.join(localRoot, dirName, 'python.exe'))
  }

  const pf = input.programFiles
  for (const dirName of input.programFilesPythonDirs ?? []) {
    if (!pf || !isWindowsPythonInstallDirName(dirName)) continue
    add(path.join(pf, dirName, 'python.exe'))
  }

  const pf86 = input.programFilesX86
  for (const dirName of input.programFilesX86PythonDirs ?? []) {
    if (!pf86 || !isWindowsPythonInstallDirName(dirName)) continue
    add(path.join(pf86, dirName, 'python.exe'))
  }

  return out
}

async function listDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
}

async function collectWindowsInstallExeCandidates(): Promise<string[]> {
  const localAppData = process.env.LOCALAPPDATA?.trim() || undefined
  const programFiles = process.env.ProgramFiles?.trim() || undefined
  const programFilesX86 = process.env['ProgramFiles(x86)']?.trim() || undefined

  const [localDirs, pfDirs, pf86Dirs] = await Promise.all([
    localAppData
      ? listDirNames(path.join(localAppData, 'Programs', 'Python'))
      : Promise.resolve([] as string[]),
    programFiles ? listDirNames(programFiles) : Promise.resolve([] as string[]),
    programFilesX86 ? listDirNames(programFilesX86) : Promise.resolve([] as string[]),
  ])

  return buildWindowsPythonExeCandidates({
    localAppData,
    programFiles,
    programFilesX86,
    localAppDataPythonDirs: localDirs,
    programFilesPythonDirs: pfDirs,
    programFilesX86PythonDirs: pf86Dirs,
  })
}

async function probeSystemPython(): Promise<PythonProbe | null> {
  const probed: PythonProbe[] = []
  const seenPaths = new Set<string>()

  const tryAdd = async (exePath: string | null | undefined): Promise<void> => {
    if (!exePath) return
    const key = exePath.toLowerCase()
    if (seenPaths.has(key)) return
    seenPaths.add(key)
    const result = await probeExecutable(exePath)
    if (result) probed.push(result)
  }

  const fromPath = await whichOnPath(['python3', 'python'])
  await tryAdd(fromPath)

  if (process.platform === 'win32') {
    const winCandidates = await collectWindowsInstallExeCandidates()
    for (const candidate of winCandidates) {
      if (await fileExists(candidate)) {
        await tryAdd(candidate)
      }
    }
  } else {
    const fallbacks = [
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3',
      '/opt/homebrew/opt/python@3/bin/python3',
      '/opt/homebrew/opt/python3/bin/python3',
      '/Library/Frameworks/Python.framework/Versions/Current/bin/python3',
      '/usr/local/Frameworks/Python.framework/Versions/Current/bin/python3',
    ]
    for (const candidate of fallbacks) {
      if (await fileExists(candidate)) {
        await tryAdd(candidate)
      }
    }
  }

  return pickHighestPythonProbe(probed)
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

async function probeOpptrixPython(): Promise<PythonProbe | null> {
  for (const candidate of opptrixCandidatePaths()) {
    if (await fileExists(candidate)) {
      const probed = await probeExecutable(candidate)
      if (probed) return probed
    }
  }
  return null
}

async function probeBundledPython(): Promise<PythonProbe | null> {
  const root = resolveBundledPythonRoot()
  if (!root) return null
  for (const candidate of bundledPythonCandidatePaths(root)) {
    if (await fileExists(candidate)) {
      const probed = await probeExecutable(candidate)
      if (probed) return probed
    }
  }
  return null
}

async function probeExplicitPython(): Promise<PythonProbe | null> {
  const fromEnv = process.env.OPPTRIX_PYTHON_PATH?.trim()
  if (!fromEnv) return null
  if (!(await fileExists(fromEnv))) return null
  return probeExecutable(fromEnv)
}

function classifyExplicitSource(exePath: string): PythonActiveSource {
  const runtimeRoot = resolvePythonRuntimeRoot()
  const bundleRoot = resolveBundledPythonRoot()
  const norm = path.resolve(exePath).toLowerCase()
  if (norm.startsWith(path.resolve(runtimeRoot).toLowerCase())) return 'opptrix'
  if (bundleRoot && norm.startsWith(path.resolve(bundleRoot).toLowerCase())) return 'opptrix'
  return 'system'
}

function buildStatusMessage(
  ready: boolean,
  activeSource: PythonActiveSource,
  bundledAvailable: boolean,
): string {
  if (!ready) {
    return bundledAvailable
      ? '正在准备随应用提供的 Python…若仍不可用，可在设置中重新安装托管版本。'
      : '尚未检测到可用的 Python。可在设置中安装托管版本，或先在系统中安装 Python。'
  }
  if (activeSource === 'opptrix') {
    return bundledAvailable
      ? '已使用 Opptrix 托管 Python（随应用提供），优先于本机 Python。'
      : '已使用 Opptrix 托管 Python，可直接运行脚本与安装依赖。'
  }
  return '已检测到系统 Python，可直接运行脚本与安装依赖。'
}

/**
 * 探测 Python。优先序：
 * `OPPTRIX_PYTHON_PATH` → 用户托管 current（可从 bundle 种子）→ 包内 Resources/python → 系统。
 * 托管 / 包内均标 `active_source=opptrix`。
 */
export async function resolvePythonRuntime(): Promise<PythonRuntimeStatus> {
  getPythonSettings()
  await seedBundledPythonIfNeeded()

  const [explicit, system, opptrix, bundled] = await Promise.all([
    probeExplicitPython(),
    probeSystemPython(),
    probeOpptrixPython(),
    probeBundledPython(),
  ])

  const bundled_available = bundled != null
  const opptrixEffective = opptrix ?? bundled

  let active_source: PythonActiveSource = 'none'
  let active_path: string | null = null
  let active_version: string | null = null

  if (explicit) {
    active_source = classifyExplicitSource(explicit.path)
    active_path = explicit.path
    active_version = explicit.version
  } else if (opptrix) {
    active_source = 'opptrix'
    active_path = opptrix.path
    active_version = opptrix.version
  } else if (bundled) {
    active_source = 'opptrix'
    active_path = bundled.path
    active_version = bundled.version
  } else if (system) {
    active_source = 'system'
    active_path = system.path
    active_version = system.version
  }

  const ready = active_path != null
  const recommend_install = !ready

  return {
    system_path: system?.path ?? null,
    system_version: system?.version ?? null,
    opptrix_path: opptrixEffective?.path ?? null,
    opptrix_version: opptrixEffective?.version ?? null,
    active_source,
    active_path,
    active_version,
    ready,
    recommend_install,
    bundled_available,
    message: buildStatusMessage(ready, active_source, bundled_available),
  }
}

export {
  resolveShellArgv,
  looksLikePythonBin,
  looksLikePipBin,
  type ResolveShellArgvResult,
} from '../shell/resolve-shell-argv.js'
