/**
 * Wave 54A: HandsPort browser package probe — import / factory check only.
 * Never launches Chromium, navigates, or opens CDP.
 */
import type { HandsBrowserDetectResult } from './types.js'

export type HandsBrowserDetect = () =>
  | HandsBrowserDetectResult
  | Promise<HandsBrowserDetectResult>

let cachedDefault: HandsBrowserDetectResult | null = null

/**
 * Detect whether `@opptrix/agent-browser` resolves and exposes
 * `createBrowserSessionManager` (callable factory). Does not call
 * `withSession` / navigate / screenshot.
 */
export async function defaultBrowserDetect(): Promise<HandsBrowserDetectResult> {
  if (cachedDefault) return cachedDefault

  try {
    const mod = await import('@opptrix/agent-browser')
    const factory = mod.createBrowserSessionManager
    if (typeof factory !== 'function') {
      cachedDefault = { available: false, engine: 'none', reason: 'not_wired' }
      return cachedDefault
    }
    // Callable check only — do not withSession (that launches Chromium).
    const manager = factory()
    if (
      manager == null
      || typeof manager.withSession !== 'function'
      || typeof manager.closeAll !== 'function'
    ) {
      cachedDefault = { available: false, engine: 'none', reason: 'not_wired' }
      return cachedDefault
    }
    cachedDefault = {
      available: true,
      engine: 'agent-browser',
      reason: 'package_present',
    }
    return cachedDefault
  } catch {
    cachedDefault = { available: false, engine: 'none', reason: 'package_missing' }
    return cachedDefault
  }
}

/** @internal tests may clear the default-detect cache */
export function resetBrowserDetectCacheForTests(): void {
  cachedDefault = null
}
