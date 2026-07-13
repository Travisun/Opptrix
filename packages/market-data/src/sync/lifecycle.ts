/** Gates automatic market-data sync until UI is ready (or server fallback). */
export class MarketDataLifecycle {
  private bootTriggered = false

  /** UI shell signalled ready — trigger boot sync once. */
  notifyUiReady(onBoot: () => void): boolean {
    if (this.bootTriggered) return false
    this.bootTriggered = true
    onBoot()
    return true
  }

  /** Fallback when desktop UI never sends ui-ready (broken client / headless). */
  ensureBootSyncFallback(onBoot: () => void): boolean {
    if (this.bootTriggered) return false
    this.bootTriggered = true
    onBoot()
    return true
  }

  get hasBootTriggered(): boolean {
    return this.bootTriggered
  }
}
