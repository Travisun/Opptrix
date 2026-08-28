/**
 * Register desktop boot / shutdown hooks (wired from main.cjs).
 * @param {ReturnType<import('./bootloader.cjs').createBootloader>} boot
 * @param {object} deps
 */
'use strict'

const { SIDECAR_GRACEFUL_MS } = require('./sidecar-supervisor.cjs')

/**
 * @param {ReturnType<import('./bootloader.cjs').createBootloader>} boot
 * @param {{
 *   initResolvedPorts: () => Promise<boolean>
 *   tryQuickPendingUpdate: () => Promise<boolean>
 *   tryDeferredPendingUpdate: () => Promise<void>
 *   startSidecarHealthWatchdog: () => void
 *   startScheduleReconcilePoll: () => void
 *   initUpdater: () => void
 *   maybeBootstrapOfflineModelDownloads: () => void
 *   requestNotificationPermission: () => void
 *   stopScheduleReconcilePoll: () => void
 *   stopSidecarAndWait: (ms?: number) => Promise<void>
 *   disposeTranslation: () => Promise<void> | void
 *   destroyTray: () => void
 *   intentionalSidecarStopRef: { current: boolean }
 *   stopSidecarSupervision: () => void
 * }} deps
 */
function registerDesktopBootloader(boot, deps) {
  boot.clear()

  boot.registerBootCritical(
    'resolve-ports',
    async () => {
      const ok = await deps.initResolvedPorts()
      if (!ok) {
        throw new Error('无法解析本地 API 端口')
      }
    },
    { timeoutMs: 20_000, required: true },
  )

  boot.registerBootCritical(
    'pending-update-quick',
    async (ctx) => {
      const installing = await deps.tryQuickPendingUpdate()
      if (installing) {
        ctx.quittingForUpdate = true
      }
    },
    { timeoutMs: 8_000, required: false },
  )

  boot.registerBootDeferred('sidecar-health-watchdog', async () => {
    deps.startSidecarHealthWatchdog()
  })

  boot.registerBootDeferred('schedule-reconcile', async () => {
    deps.startScheduleReconcilePoll()
  })

  boot.registerBootDeferred('updater-init', async () => {
    deps.initUpdater()
  })

  boot.registerBootDeferred('translation-bootstrap', async () => {
    deps.maybeBootstrapOfflineModelDownloads()
  })

  boot.registerBootDeferred('notification-permission', async () => {
    deps.requestNotificationPermission()
  })

  boot.registerBootDeferred('pending-update-deferred', async () => {
    await deps.tryDeferredPendingUpdate()
  })

  // Registration order = shutdown reverse (LIFO).
  boot.registerShutdown('tray', async () => {
    deps.destroyTray()
  }, { timeoutMs: 2_000 })

  boot.registerShutdown('translation', async () => {
    await deps.disposeTranslation()
  }, { timeoutMs: 4_000 })

  boot.registerShutdown('sidecar', async () => {
    deps.intentionalSidecarStopRef.current = true
    deps.stopSidecarSupervision()
    await deps.stopSidecarAndWait(SIDECAR_GRACEFUL_MS)
  }, { timeoutMs: SIDECAR_GRACEFUL_MS + 3_000 })

  boot.registerShutdown('schedule-poll', async () => {
    deps.stopScheduleReconcilePoll()
  }, { timeoutMs: 2_000 })
}

module.exports = {
  registerDesktopBootloader,
}
