/**
 * Playwright installs browsers for the *host* platform unless
 * PLAYWRIGHT_HOST_PLATFORM_OVERRIDE is set (see playwright-core hostPlatform).
 *
 * Cross-packaging (e.g. macos-arm64 runner → darwin-x64) must override so the
 * staged playwright-browsers tree matches the packaging target, not the runner.
 *
 * shortPlatform mapping (Playwright):
 *   mac* ending in arm64 → mac-arm64; other mac* → mac-x64
 *   * ending in arm64 → linux-arm64; else → linux-x64
 *   win64 → win64
 *
 * @param {{ platform: string, arch: string }} target
 * @returns {string | null} override value, or null when host already matches
 */
import { hostMatchesTarget, normalizeArch } from './runtime-target.mjs'

export function playwrightHostPlatformOverride(target) {
  if (!target || hostMatchesTarget(target)) return null

  const platform = target.platform
  const arch = normalizeArch(target.arch)

  if (platform === 'darwin') {
    // Do not append -arm64 for Intel; Playwright shortPlatform uses endsWith('arm64').
    return arch === 'arm64' ? 'mac15-arm64' : 'mac15'
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'ubuntu24.04-arm64' : 'ubuntu24.04'
  }
  // win32: Playwright only publishes win64; cross-arch rare on CI.
  if (platform === 'win32') {
    return 'win64'
  }
  return null
}

/** Path fragment Playwright uses under PLAYWRIGHT_BROWSERS_PATH (chrome-mac-x64, …). */
export function playwrightChromiumDirMarker(target) {
  if (!target) return null
  const platform = target.platform
  const arch = normalizeArch(target.arch)
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64'
  }
  if (platform === 'linux') {
    // Playwright CFT: linux-x64 → chrome-linux64; linux-arm64 → chrome-linux
    return arch === 'arm64' ? 'chrome-linux' : 'chrome-linux64'
  }
  if (platform === 'win32') {
    return 'chrome-win64'
  }
  return null
}

/**
 * Env patch for Playwright install / executablePath when cross-building.
 * @param {{ platform: string, arch: string }} target
 * @returns {Record<string, string>}
 */
export function playwrightCrossEnv(target) {
  const override = playwrightHostPlatformOverride(target)
  if (!override) return {}
  return { PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: override }
}
