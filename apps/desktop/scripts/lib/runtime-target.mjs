/**
 * Resolve sidecar runtime platform/arch for desktop packaging.
 * CI sets OPPTRIX_RUNTIME_ARCH on macOS cross-builds (arm64 runner → x64 package).
 */
import { spawnSync } from 'node:child_process'

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
  return npmEnv(target, {
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_build_from_source: 'true',
  })
}

export function hostMatchesTarget(target) {
  const hostArch = normalizeArch(process.arch)
  return target.platform === process.platform && target.arch === hostArch
}

function spawn(cmd, args, { cwd, env }) {
  return spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env,
  })
}

/** @param {string[]} args */
export function runNpm(args, { cwd, target, extraEnv = {} }) {
  const env = npmEnv(target, extraEnv)
  if (target.useRosettaX64) {
    return spawn('arch', ['-x86_64', 'npm', ...args], { cwd, env })
  }
  return spawn('npm', args, { cwd, env })
}

/** @param {string} scriptPath */
export function runNodeScript(scriptPath, { cwd, target, extraEnv = {} }) {
  const env = npmEnv(target, extraEnv)
  if (target.useRosettaX64) {
    return spawn('arch', ['-x86_64', process.execPath, scriptPath], { cwd, env })
  }
  return spawn(process.execPath, [scriptPath], { cwd, env })
}
