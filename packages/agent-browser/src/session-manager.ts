import { launchPlaywrightSession } from './playwright-session.js'
import type { BrowserSession, BrowserSessionManager } from './types.js'

class AsyncMutex {
  private chain: Promise<void> = Promise.resolve()

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.chain.then(fn)
    this.chain = result.then(
      () => {},
      () => {},
    )
    return result
  }
}

class BrowserSessionManagerImpl implements BrowserSessionManager {
  private readonly mutex = new AsyncMutex()
  private session: Awaited<ReturnType<typeof launchPlaywrightSession>> | null = null

  withSession<T>(fn: (session: BrowserSession) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      if (!this.session) {
        this.session = await launchPlaywrightSession(true)
      }
      return fn(this.session)
    })
  }

  closeAll(): Promise<void> {
    return this.mutex.run(async () => {
      if (!this.session) return
      await this.session.close()
      this.session = null
    })
  }
}

let singleton: BrowserSessionManager | null = null

export function createBrowserSessionManager(): BrowserSessionManager {
  if (!singleton) {
    singleton = new BrowserSessionManagerImpl()
  }
  return singleton
}

/** @internal tests may reset the singleton */
export function resetBrowserSessionManagerForTests(): void {
  singleton = null
}
