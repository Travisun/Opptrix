import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime'

const require = createRequire(import.meta.url)

const ARCH_DIR: Record<string, string> = {
  x64: 'x64',
  arm64: 'arm64',
}

function archDir(): string {
  return ARCH_DIR[process.arch] ?? process.arch
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function runtimeStageRoot(): string | null {
  const raw = process.env.OPPTRIX_RUNTIME_STAGE?.trim()
  if (raw) return path.resolve(raw)
  return null
}

function resolveSandboxRuntimePackageRoot(): string | null {
  const stage = runtimeStageRoot()
  if (stage) {
    for (const depsDir of ['node_modules', 'deps']) {
      const candidate = path.join(stage, depsDir, '@anthropic-ai/sandbox-runtime')
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    }
  }
  try {
    const selfDir = path.dirname(fileURLToPath(import.meta.url))
    const fromWorkspace = path.resolve(selfDir, '../../../node_modules/@anthropic-ai/sandbox-runtime')
    if (fs.existsSync(path.join(fromWorkspace, 'package.json'))) return fromWorkspace
  } catch {
    /* ignore */
  }
  try {
    const pkgJson = path.dirname(
      require.resolve('@anthropic-ai/sandbox-runtime/package.json'),
    )
    return pkgJson
  } catch {
    return null
  }
}

function bundledLinuxBin(name: string): string | undefined {
  const stage = runtimeStageRoot()
  if (!stage) return undefined
  const candidate = path.join(stage, 'sandbox-bins', archDir(), name)
  return isExecutable(candidate) ? candidate : undefined
}

export function resolveVendoredSrtWinExe(): string | undefined {
  const pkgRoot = resolveSandboxRuntimePackageRoot()
  if (!pkgRoot) return undefined
  const candidate = path.join(pkgRoot, 'vendor', 'srt-win', archDir(), 'srt-win.exe')
  return fs.existsSync(candidate) ? candidate : undefined
}

/** Packaged desktop / AppImage: inject bundled isolation tool paths into SRT config. */
export function resolveBundledSandboxBinConfig(): Pick<
  SandboxRuntimeConfig,
  'bwrapPath' | 'socatPath' | 'ripgrep' | 'windows'
> {
  const out: Pick<SandboxRuntimeConfig, 'bwrapPath' | 'socatPath' | 'ripgrep' | 'windows'> = {}

  const bwrap = bundledLinuxBin('bwrap')
  if (bwrap) out.bwrapPath = bwrap

  const socat = bundledLinuxBin('socat')
  if (socat) out.socatPath = socat

  const rg = bundledLinuxBin('rg')
  if (rg) out.ripgrep = { command: rg }

  const srtWinExe = resolveVendoredSrtWinExe()
  if (srtWinExe) {
    out.windows = { srtWin: { path: srtWinExe } }
  }

  return out
}
