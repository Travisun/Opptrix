import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PreflightCheck, PreflightDiagnostic } from './types.js'
import { parseBiomeOutput, parseRuffOutput, pushDiagnostic } from './diagnostics.js'

const execFileAsync = promisify(execFile)

const L1_TIMEOUT_MS = 20_000

export interface L1Availability {
  ruff: boolean
  biome: boolean
  ruffPath: string | null
  biomePath: string | null
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function whichOnPath(names: readonly string[]): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  for (const name of names) {
    try {
      const { stdout } = await execFileAsync(cmd, [name], {
        timeout: 3000,
        windowsHide: true,
      })
      const first = stdout.trim().split(/\r?\n/)[0]?.trim()
      if (first) return first
    } catch {
      /* next */
    }
  }
  return null
}

function binName(base: string): string {
  return process.platform === 'win32' ? `${base}.exe` : base
}

/**
 * 仅认 PATH 或工作区 / .opptrix-packages 内本地 bin；不跑 npx（过重）。
 */
export async function detectL1Tools(grantRootAbs: string): Promise<L1Availability> {
  const localCandidates = (tool: string): string[] => {
    const name = binName(tool)
    return [
      path.join(grantRootAbs, 'node_modules', '.bin', name),
      path.join(grantRootAbs, '.opptrix-packages', 'bin', name),
      path.join(grantRootAbs, '.opptrix-packages', 'Scripts', `${tool}.exe`),
      path.join(grantRootAbs, '.venv', 'bin', name),
      path.join(grantRootAbs, '.venv', 'Scripts', `${tool}.exe`),
    ]
  }

  let ruffPath: string | null = null
  for (const c of localCandidates('ruff')) {
    if (await fileExists(c)) {
      ruffPath = c
      break
    }
  }
  if (!ruffPath) ruffPath = await whichOnPath(['ruff'])

  let biomePath: string | null = null
  for (const c of localCandidates('biome')) {
    if (await fileExists(c)) {
      biomePath = c
      break
    }
  }
  if (!biomePath) biomePath = await whichOnPath(['biome'])

  return {
    ruff: ruffPath != null,
    biome: biomePath != null,
    ruffPath,
    biomePath,
  }
}

async function runTool(
  exe: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{ exitCode: number; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(exe, args, {
      timeout: L1_TIMEOUT_MS,
      maxBuffer: 512 * 1024,
      signal,
      windowsHide: true,
    })
    return { exitCode: 0, output: `${stdout}${stderr}` }
  } catch (err: unknown) {
    const e = err as {
      code?: number | string
      stdout?: string | Buffer
      stderr?: string | Buffer
      message?: string
    }
    const exitCode = typeof e.code === 'number' ? e.code : 1
    return {
      exitCode,
      output: String(e.stdout ?? '') + String(e.stderr ?? e.message ?? ''),
    }
  }
}

export async function runL1Checks(
  absPath: string,
  language: 'python' | 'javascript' | 'typescript' | null,
  avail: L1Availability,
  checks: PreflightCheck[],
  fixHints: string[],
  signal?: AbortSignal,
  diagnostics: PreflightDiagnostic[] = [],
): Promise<void> {
  const wantRuff = language === 'python'
  const wantBiome = language === 'javascript' || language === 'typescript'

  if (wantRuff) {
    if (!avail.ruff || !avail.ruffPath) {
      checks.push({
        id: 'l1_ruff',
        level: 'l1',
        status: 'skip',
        message: '未检测到 ruff，已跳过 L1',
      })
      fixHints.push('可用 opptrix_run(command="pip install ruff") 安装 ruff 后再开 levels 含 l1')
    } else {
      const result = await runTool(avail.ruffPath, ['check', absPath], signal)
      if (result.exitCode === 0) {
        checks.push({ id: 'l1_ruff', level: 'l1', status: 'pass', message: 'ruff check 通过' })
      } else {
        const parsed = parseRuffOutput(result.output || '发现问题')
        const status = result.exitCode === 1 ? 'fail' : 'warn'
        const severity = status === 'fail' ? 'error' as const : 'warning' as const
        for (const d of parsed) pushDiagnostic(diagnostics, { ...d, severity })
        checks.push({
          id: 'l1_ruff',
          level: 'l1',
          status,
          message: `ruff check：发现 ${parsed.length} 个问题`,
        })
        fixHints.push('请根据 ruff 提示修正后再次 code_preflight')
      }
    }
  }

  if (wantBiome) {
    if (!avail.biome || !avail.biomePath) {
      checks.push({
        id: 'l1_biome',
        level: 'l1',
        status: 'skip',
        message: '未检测到 biome，已跳过 L1',
      })
      fixHints.push('可用 opptrix_run(command="npm install @biomejs/biome") 安装 biome 后再开 levels 含 l1')
    } else {
      const result = await runTool(avail.biomePath, ['check', absPath], signal)
      if (result.exitCode === 0) {
        checks.push({ id: 'l1_biome', level: 'l1', status: 'pass', message: 'biome check 通过' })
      } else {
        const parsed = parseBiomeOutput(result.output || '发现问题')
        const status = result.exitCode === 1 ? 'fail' : 'warn'
        const severity = status === 'fail' ? 'error' as const : 'warning' as const
        for (const d of parsed) pushDiagnostic(diagnostics, { ...d, severity })
        checks.push({
          id: 'l1_biome',
          level: 'l1',
          status,
          message: `biome check：发现 ${parsed.length} 个问题`,
        })
        fixHints.push('请根据 biome 提示修正后再次 code_preflight')
      }
    }
  }

  if (!wantRuff && !wantBiome) {
    checks.push({
      id: 'l1_skipped_lang',
      level: 'l1',
      status: 'skip',
      message: '当前语言无对应 L1 检查器，已跳过',
    })
  }
}
