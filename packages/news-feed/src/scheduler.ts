let schedulerTimer: ReturnType<typeof setInterval> | null = null
let schedulerRunning = false

export function startNewsFeedScheduler(tickMs = 60_000): void {
  if (schedulerTimer) return
  const tick = async () => {
    if (schedulerRunning) return
    schedulerRunning = true
    try {
      const { shouldAutoRefresh, refreshAllSubscriptions } = await import('./aggregator.js')
      if (shouldAutoRefresh()) {
        await refreshAllSubscriptions()
      }
    } catch {
      /* background refresh should not crash server */
    } finally {
      schedulerRunning = false
    }
  }
  void tick()
  schedulerTimer = setInterval(() => { void tick() }, tickMs)
}

export function stopNewsFeedScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }
}
