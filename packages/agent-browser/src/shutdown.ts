import type { BrowserSessionManager } from './types.js'

const registeredManagers = new Set<BrowserSessionManager>()
let hooksRegistered = false

export function registerBrowserShutdownHooks(manager: BrowserSessionManager): void {
  registeredManagers.add(manager)
  if (hooksRegistered) return
  hooksRegistered = true

  const closeAll = () => {
    for (const m of registeredManagers) {
      void m.closeAll().catch(() => {})
    }
  }

  process.once('SIGTERM', closeAll)
  process.once('SIGINT', closeAll)
  process.once('beforeExit', closeAll)
}

export async function closeAllRegisteredBrowserSessions(): Promise<void> {
  await Promise.all([...registeredManagers].map(m => m.closeAll().catch(() => {})))
}
