/**
 * Resolve sidecar runtime platform/arch for desktop packaging.
 * CI sets OPPTRIX_RUNTIME_ARCH on macOS cross-builds (arm64 runner → x64 package).
 */
import { spawnSync } from 'node:child_process'
import { NPM_CMD, NPM_SHELL } from './commands.mjs'

export function normalizeArch(arch) {
  if (!arch) return arch
  if (arch === 'aarch64') return 'arm64'
  if (arch === 'amd64') return 'x64'
  return arch
}

export function resolveRuntimeTarget() {
  const platform = process.env.OPPTRIX_RUNTIME_PLATFORM?.trim() || process.platform
  const runtimeArch = normalizeArch(process.env.OPPTRIX_RUNTIME_ARCH?.trim())
  let arch = runtimeArch || normalizeArch(process.arch)

  if (platform === 'win32' && !runtimeArch) {
    arch = normalizeArch(process.arch) === 'arm64' ? 'arm64' : 'x64'
  }
  if (platform === 'linux' && !runtimeArch) {
    arch = normalizeArch(process.arch) === 'arm64' ? 'arm64' : 'x64'
  }

  const useRosettaX64 = platform === 'darwin' && arch === 'x64' && process.arch === 'arm64'

  return { platform, arch, useRosettaX64 }
}

export function npmEnv(target, extra = {}) {
  return {
    ...process.env,
    npm_config_arch: target.arch,
    npm_config_platform: target.platform,
    ...extra,
  }
}

export function electronRebuildEnv(electronVersion, target) {
  // Headers for node-gyp must come from Electron's *headers* dist (node-*-headers.tar.gz
  // in SHASUMS256.txt). Do NOT reuse ELECTRON_MIRROR (full release CDN / npmmirror electrons)
  // — those SHASUMS omit headers and node-gyp fails with checksum mismatches.
  const disturl = (
    process.env.OPPTRIX_ELECTRON_HEADERS_URL?.trim()
    || process.env.npm_config_disturl?.trim()
    || 'https://artifacts.electronjs.org/headers/dist'
  ).replace(/\/$/, '')
  const env = {
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: disturl,
    // Clear inherited Electron binary mirrors so npm/node-gyp cannot pick them up.
    ELECTRON_MIRROR: '',
    electron_mirror: '',
  }
  if (process.env.OPPTRIX_FORCE_NATIVE_REBUILD === '1') {
    env.npm_config_build_from_source = 'true'
  }
  // Prefer VS2022 toolset when present (windows-latest may ship newer MSVC).
  if (target.platform === 'win32') {
    env.GYP_MSVS_VERSION = process.env.GYP_MSVS_VERSION?.trim() || '2022'
    env.npm_config_msvs_version = process.env.npm_config_msvs_version?.trim() || '2022'
  }
  return npmEnv(target, env)
}

/** Env for downloading official Node ABI binaries (N-API modules usable under ELECTRON_RUN_AS_NODE). */
export function nodeNativeEnv(target) {
  return npmEnv(target, {
    npm_config_runtime: 'node',
    npm_config_target: process.versions.node,
    npm_config_disturl: '',
    npm_config_build_from_source: '',
    ELECTRON_MIRROR: '',
    electron_mirror: '',
  })
}

export function hostMatchesTarget(target) {
  const hostArch = normalizeArch(process.arch)
  return target.platform === process.platform && target.arch === hostArch
}

function spawn(cmd, args, { cwd, env, shell = false }) {
  return spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell,
    env,
  })
}

/** @param {string[]} args */
export function runNpm(args, { cwd, target, extraEnv = {} }) {
  const env = npmEnv(target, extraEnv)
  if (target.useRosettaX64) {
    return spawn('arch', ['-x86_64', 'npm', ...args], { cwd, env })
  }
  return spawn(NPM_CMD, args, { cwd, env, shell: NPM_SHELL })
}

/** @param {string} scriptPath */
export function runNodeScript(scriptPath, { cwd, target, extraEnv = {} }) {
  // install.js 等脚本只需 npm_config_platform/arch，用宿主 Node 即可交叉下载，勿 arch -x86_64 node
  const env = npmEnv(target, extraEnv)
  return spawn(process.execPath, [scriptPath], { cwd, env })
}
