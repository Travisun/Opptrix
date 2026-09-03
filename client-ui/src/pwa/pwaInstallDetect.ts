/**
 * Pure UA / platform classification for PWA install UX (testable without React).
 */

export type PwaClientFlags = {
  isIos: boolean
  isSafari: boolean
  isAndroid: boolean
  isFirefox: boolean
  isEdge: boolean
  isChromium: boolean
  isWindows: boolean
}

export type PwaInstallMode = 'native' | 'manual' | 'none'

export function classifyPwaClient(
  ua: string,
  opts: { platform?: string; maxTouchPoints?: number; uaPlatform?: string } = {},
): PwaClientFlags {
  const platform = opts.platform ?? ''
  const maxTouchPoints = opts.maxTouchPoints ?? 0
  const uaPlatform = opts.uaPlatform ?? ''

  const isIos = /iPad|iPhone|iPod/.test(ua)
    || (platform === 'MacIntel' && maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)
  const isFirefox = /Firefox\//i.test(ua) && !/Seamonkey/i.test(ua)
  const isEdge = /Edg\//i.test(ua)
  const isChromium = /Chrome\//i.test(ua) || /CriOS\//i.test(ua) || isEdge
  const isSafari = !(/Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|Firefox|FxiOS|Android/i.test(ua))
    && /Safari/i.test(ua)
  const isWindows = /Windows NT|Win64|Win32/i.test(ua) || /Windows/i.test(uaPlatform)

  return {
    isIos,
    isSafari: isSafari && !isIos,
    isAndroid,
    isFirefox,
    isEdge,
    isChromium,
    isWindows,
  }
}

/** Resolve banner/settings mode from probed install state + client flags. */
export function resolvePwaInstallMode(input: {
  isElectron: boolean
  installed: boolean
  interacted: boolean
  likelyInstalled: boolean
  probeReady: boolean
  hasDeferred: boolean
  isSafari: boolean
  isIos: boolean
  isAndroid: boolean
  isFirefox: boolean
}): PwaInstallMode {
  const {
    isElectron,
    installed,
    interacted,
    likelyInstalled,
    probeReady,
    hasDeferred,
    isSafari,
    isIos,
    isAndroid,
    isFirefox,
  } = input

  if (isElectron || installed || interacted || likelyInstalled) return 'none'
  if (!probeReady && !hasDeferred) return 'none'
  if (hasDeferred) return 'native'
  if (isSafari || isIos || isAndroid || isFirefox) return 'manual'
  return 'manual'
}
