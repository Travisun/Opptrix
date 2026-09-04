/**
 * Sidecar graceful shutdown helpers — timing aligned with desktop
 * `SIDECAR_GRACEFUL_MS` (apps/desktop/electron/sidecar-supervisor.cjs).
 *
 * Soft grace on the Electron main process must be ≥ forceExit here, otherwise
 * SIGKILL can interrupt native teardown (`__cxa_finalize` / SIGABRT).
 */

/** Default force-exit budget; override with OPPTRIX_SIDECAR_FORCE_EXIT_MS. */
export const SIDECAR_FORCE_EXIT_DEFAULT_MS = 12_000

/** Brief pause after closing natives so destructors can settle before process.exit. */
export const SIDECAR_NATIVE_SETTLE_DEFAULT_MS = 100

export function resolveSidecarForceExitMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.OPPTRIX_SIDECAR_FORCE_EXIT_MS)
  if (Number.isFinite(raw) && raw >= 1_000) return Math.floor(raw)
  return SIDECAR_FORCE_EXIT_DEFAULT_MS
}

export function resolveSidecarNativeSettleMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.OPPTRIX_SIDECAR_NATIVE_SETTLE_MS)
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw)
  return SIDECAR_NATIVE_SETTLE_DEFAULT_MS
}

export type SidecarShutdownLog = {
  info: (msg: string) => void
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

export type SidecarShutdownHooks = {
  log: SidecarShutdownLog
  /** Stop schedule / retention / news / enrichment timers (sync). */
  stopSchedulers: () => void
  /**
   * R1: ordered extension shutdown — deactivate active extensions, flush registry,
   * stop host worker. Bounded best-effort (budget min(5s, forceExit×0.4)).
   * Runs AFTER stopSchedulers, BEFORE closeBrowsers.
   */
  shutdownExtensions?: () => Promise<void>
  closeBrowsers: () => Promise<void>
  closeHttpApp: () => Promise<void>
  unloadLlama: () => Promise<void>
  closeDocLibrary: () => Promise<void>
  closeMarketDuck: () => Promise<void>
  closeMarketStore: () => void
  closeUserStore: () => void
  /**
   * Optional: runs FIRST before stopSchedulers (e.g. emit app.shuttingDown).
   * Best-effort — failures are logged and ignored.
   */
  onShuttingDown?: () => void | Promise<void>
  /**
   * Optional: after stores closed, before native settle / process.exit
   * (e.g. emit app.shutdown). Best-effort.
   */
  onShutdown?: () => void | Promise<void>
  settleMs?: number
  forceExitMs?: number
  /** Final process exit code (default 0). */
  exitCode?: number
  /** Injected for tests; defaults to process.exit */
  exitProcess?: (code: number) => void
  /** Injected for tests; defaults to setTimeout */
  scheduleForceExit?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearForceExit?: (timer: ReturnType<typeof setTimeout>) => void
  sleep?: (ms: number) => Promise<void>
}

async function runStep(
  log: SidecarShutdownLog,
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  log.info(`shutdown: ${label}`)
  try {
    await fn()
  } catch (err) {
    log.warn({ err }, `shutdown step failed: ${label}`)
  }
}

/**
 * Ordered teardown for API sidecar. Callers still own SIGTERM/SIGINT wiring.
 * Always ends with process.exit(0) after best-effort close (+ optional settle).
 */
export async function runSidecarShutdown(hooks: SidecarShutdownHooks): Promise<void> {
  const forceExitMs = hooks.forceExitMs ?? resolveSidecarForceExitMs()
  const settleMs = hooks.settleMs ?? resolveSidecarNativeSettleMs()
  const exitCode = hooks.exitCode ?? 0
  const exitProcess = hooks.exitProcess ?? ((code: number) => process.exit(code))
  const scheduleForceExit = hooks.scheduleForceExit ?? setTimeout
  const clearForceExit = hooks.clearForceExit ?? clearTimeout
  const sleep =
    hooks.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  const forceExit = scheduleForceExit(() => {
    hooks.log.warn(
      {},
      `shutdown timeout (${forceExitMs}ms) — forcing exit (sync/import may have blocked the event loop)`,
    )
    exitProcess(exitCode)
  }, forceExitMs)

  try {
    if (hooks.onShuttingDown) {
      await runStep(hooks.log, 'onShuttingDown', () => hooks.onShuttingDown?.())
    }
    await runStep(hooks.log, 'stopSchedulers', () => {
      hooks.stopSchedulers()
    })
    if (hooks.shutdownExtensions) {
      await runStep(hooks.log, 'shutdownExtensions', () => hooks.shutdownExtensions?.())
    }
    await runStep(hooks.log, 'closeBrowsers', () => hooks.closeBrowsers())
    await runStep(hooks.log, 'closeHttpApp', () => hooks.closeHttpApp())
    await runStep(hooks.log, 'unloadLlama', () => hooks.unloadLlama())
    // closeDocLibraryService already closes Lance + embedding + OCR + doc sqlite
    await runStep(hooks.log, 'closeDocLibrary', () => hooks.closeDocLibrary())
    await runStep(hooks.log, 'closeMarketDuck', () => hooks.closeMarketDuck())
    await runStep(hooks.log, 'closeMarketStore', () => {
      hooks.closeMarketStore()
    })
    await runStep(hooks.log, 'closeUserStore', () => {
      hooks.closeUserStore()
    })
    if (hooks.onShutdown) {
      await runStep(hooks.log, 'onShutdown', () => hooks.onShutdown?.())
    }
    if (settleMs > 0) {
      hooks.log.info(`shutdown: nativeSettle ${settleMs}ms`)
      await sleep(settleMs)
    }
  } catch (err) {
    hooks.log.error({ err }, 'shutdown error')
  } finally {
    clearForceExit(forceExit)
    hooks.log.info('shutdown: process.exit')
    exitProcess(exitCode)
  }
}
