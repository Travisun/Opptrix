/** Linux runtime arch keys used in check-update `packages` and platform-check. */
export type LinuxRuntimeArchKey = 'linux-x64' | 'linux-arm64'

export const RUNTIME_LINUX_ARCH_KEYS: readonly LinuxRuntimeArchKey[] = [
  'linux-x64',
  'linux-arm64',
]

/** Map `process.arch` to a linux runtime package key (self-host Docker is linux-only). */
export function resolveLinuxRuntimeArchKey(
  arch: string = process.arch,
): LinuxRuntimeArchKey {
  if (arch === 'arm64') return 'linux-arm64'
  return 'linux-x64'
}

export function runtimeArchBinBasename(version: string, archKey: LinuxRuntimeArchKey): string {
  const v = version.trim().replace(/^v/, '')
  return `opptrix-runtime-${archKey}-v${v}.bin`
}

export function runtimeArchSha256Basename(
  version: string,
  archKey: LinuxRuntimeArchKey,
): string {
  const v = version.trim().replace(/^v/, '')
  return `opptrix-runtime-${archKey}-v${v}.sha256`
}
