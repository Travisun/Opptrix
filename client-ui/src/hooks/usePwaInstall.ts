import { useCallback, useEffect, useMemo, useState } from 'react'
import { isElectron } from '../platform/detect'
import {
  classifyPwaClient,
  resolvePwaInstallMode,
  type PwaInstallMode,
} from '../pwa/pwaInstallDetect'
import {
  bootstrapPwaInstallCapture,
  clearCapturedInstallPrompt,
  getCapturedInstallPrompt,
  subscribeInstallPrompt,
  waitForInstallPrompt,
  type BeforeInstallPromptEvent,
} from '../pwa/pwaInstallCapture'

export type { BeforeInstallPromptEvent, PwaInstallMode }
export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'failed' | 'manual_seen'

/** Bump when prompt UX changes so prior dismissals don't hide a fixed banner forever. */
const STORAGE_KEY = 'opptrix-pwa-install-interaction-v3'

type StoredInteraction = {
  outcome: PwaInstallOutcome
  at: number
}

type RelatedApp = {
  platform: string
  id?: string
  url?: string
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function readInteraction(): StoredInteraction | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredInteraction
    if (!parsed || typeof parsed.at !== 'number' || !parsed.outcome) return null
    return parsed
  } catch {
    return null
  }
}

function writeInteraction(outcome: PwaInstallOutcome): void {
  try {
    const payload: StoredInteraction = { outcome, at: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* private mode / quota */
  }
}

async function queryRelatedWebAppInstalled(): Promise<boolean> {
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<RelatedApp[]>
  }
  if (typeof nav.getInstalledRelatedApps !== 'function') return false
  try {
    const apps = await nav.getInstalledRelatedApps()
    return apps.some((app) => app.platform === 'webapp')
  } catch {
    return false
  }
}

function readClientFlags() {
  if (typeof navigator === 'undefined') {
    return classifyPwaClient('')
  }
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return classifyPwaClient(navigator.userAgent, {
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    uaPlatform: nav.userAgentData?.platform,
  })
}

/**
 * Chrome / Edge：优先用系统安装窗（beforeinstallprompt）。
 * 已安装或探测后仍无安装事件 → 静默。
 * Safari / Firefox / 等：分浏览器步骤引导。
 */
export function usePwaInstall() {
  const flags = useMemo(() => readClientFlags(), [])
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => (
    isElectron() ? null : getCapturedInstallPrompt()
  ))
  const [installed, setInstalled] = useState(() => isStandaloneDisplay())
  const [interacted, setInteracted] = useState(() => readInteraction() != null)
  const [probeReady, setProbeReady] = useState(() => Boolean(getCapturedInstallPrompt()))

  useEffect(() => {
    if (isElectron()) {
      setProbeReady(true)
      return
    }

    bootstrapPwaInstallCapture()

    const unsub = subscribeInstallPrompt((event) => {
      setDeferred(event)
      if (event) setProbeReady(true)
    })

    const timer = window.setTimeout(() => setProbeReady(true), 2000)

    void queryRelatedWebAppInstalled().then((relatedInstalled) => {
      if (!relatedInstalled) return
      setInstalled(true)
      writeInteraction('accepted')
      setInteracted(true)
    })

    return () => {
      unsub()
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (isElectron()) return
    const onInstalled = () => {
      clearCapturedInstallPrompt()
      setDeferred(null)
      setInstalled(true)
      writeInteraction('accepted')
      setInteracted(true)
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  const markInteracted = useCallback((outcome: PwaInstallOutcome) => {
    writeInteraction(outcome)
    setInteracted(true)
  }, [])

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    let event = deferred ?? getCapturedInstallPrompt()
    if (!event && flags.isChromium) {
      event = await waitForInstallPrompt(2800)
      if (event) setDeferred(event)
    }
    if (!event) return 'unavailable'

    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      clearCapturedInstallPrompt()
      setDeferred(null)
      if (outcome === 'accepted') {
        setInstalled(true)
        markInteracted('accepted')
        return 'accepted'
      }
      markInteracted('dismissed')
      return 'dismissed'
    } catch {
      clearCapturedInstallPrompt()
      setDeferred(null)
      markInteracted('failed')
      return 'unavailable'
    }
  }, [deferred, flags.isChromium, markInteracted])

  const dismissPrompt = useCallback(() => {
    markInteracted('dismissed')
  }, [markInteracted])

  const acknowledgeManual = useCallback(() => {
    markInteracted('manual_seen')
  }, [markInteracted])

  const likelyInstalled = flags.isChromium && probeReady && deferred == null && !installed

  const mode: PwaInstallMode = useMemo(() => resolvePwaInstallMode({
    isElectron: isElectron(),
    installed,
    interacted,
    likelyInstalled,
    probeReady,
    hasDeferred: deferred != null,
    isSafari: flags.isSafari,
    isIos: flags.isIos,
    isAndroid: flags.isAndroid,
    isFirefox: flags.isFirefox,
  }), [
    deferred,
    flags.isAndroid,
    flags.isFirefox,
    flags.isIos,
    flags.isSafari,
    installed,
    interacted,
    likelyInstalled,
    probeReady,
  ])

  const canPrompt = deferred != null && !installed && !interacted && !likelyInstalled
  const showBanner = mode === 'native' || mode === 'manual'
  const isInstalledEffective = installed || (likelyInstalled && !interacted)

  return {
    canPrompt,
    isInstalled: isInstalledEffective,
    hasInteracted: interacted,
    mode,
    showBanner,
    isIos: flags.isIos,
    isAndroid: flags.isAndroid,
    isFirefox: flags.isFirefox,
    isChromium: flags.isChromium,
    isEdge: flags.isEdge,
    isSafari: flags.isSafari,
    isWindows: flags.isWindows,
    promptInstall,
    dismissPrompt,
    acknowledgeManual,
  }
}
