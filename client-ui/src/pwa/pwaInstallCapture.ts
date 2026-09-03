/**
 * Capture `beforeinstallprompt` as early as possible.
 * Chromium often fires once before React mounts; missing it leaves the UI stuck on「查看步骤」.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Listener = (event: BeforeInstallPromptEvent | null) => void

const BOOT_FLAG = '__opptrixPwaInstallCaptureBooted'

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener(deferred)
}

export function getCapturedInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred
}

export function clearCapturedInstallPrompt(): void {
  deferred = null
  notify()
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener)
  listener(deferred)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Wait until Chromium hands us a deferred prompt, or timeout.
 */
export function waitForInstallPrompt(timeoutMs = 2500): Promise<BeforeInstallPromptEvent | null> {
  const existing = getCapturedInstallPrompt()
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    let settled = false
    const finish = (event: BeforeInstallPromptEvent | null) => {
      if (settled) return
      if (event == null && getCapturedInstallPrompt() == null) return
      settled = true
      window.clearTimeout(timer)
      unsub()
      resolve(getCapturedInstallPrompt())
    }
    const unsub = subscribeInstallPrompt((event) => {
      if (event) finish(event)
    })
    const timer = window.setTimeout(() => {
      settled = true
      unsub()
      resolve(getCapturedInstallPrompt())
    }, timeoutMs)
  })
}

export function bootstrapPwaInstallCapture(): void {
  if (typeof window === 'undefined') return
  const w = window as Window & { [BOOT_FLAG]?: boolean }
  if (w[BOOT_FLAG]) return
  w[BOOT_FLAG] = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })

  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .catch(() => {
        /* installability best-effort */
      })
  }
}
