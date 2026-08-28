/**
 * Desktop boot / shutdown hook runner.
 * Pure Node — no electron at module load.
 *
 * - Critical boot hooks: sequential, block UI until done (per-hook timeout).
 * - Deferred boot hooks: fire-and-forget after shell ready; never block quit.
 * - Shutdown hooks: sequential LIFO registration order, global deadline anti-deadlock.
 */
'use strict'

/** Default per critical boot hook budget (sidecar cold start on Windows). */
const BOOT_CRITICAL_DEFAULT_MS = 90_000

/** Per deferred hook is not awaited; this is only for logging. */
const BOOT_DEFERRED_LABEL = 'deferred'

/** Must exceed SIDECAR_GRACEFUL_MS + SIDECAR_HARD_EXTRA_MS (~16.5s). */
const SHUTDOWN_GLOBAL_MS = 20_000

/** Single shutdown hook soft budget before skip. */
const SHUTDOWN_HOOK_DEFAULT_MS = 16_000

/**
 * @param {Promise<unknown>} promise
 * @param {number} ms
 * @param {string} label
 */
function withTimeout(promise, ms, label) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve(promise)
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Hook timeout: ${label} (${ms}ms)`))
    }, ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/**
 * @returns {{
 *   registerBootCritical: (name: string, run: (ctx: object) => Promise<void> | void, opts?: { timeoutMs?: number, required?: boolean }) => void
 *   registerBootDeferred: (name: string, run: (ctx: object) => Promise<void> | void) => void
 *   registerShutdown: (name: string, run: (ctx: object) => Promise<void> | void, opts?: { timeoutMs?: number }) => void
 *   runBootCritical: (ctx?: object) => Promise<void>
 *   runBootDeferred: (ctx?: object) => void
 *   runShutdown: (ctx?: object) => Promise<void>
 *   clear: () => void
 * }}
 */
function createBootloader() {
  /** @type {Array<{ name: string, run: Function, timeoutMs: number, required: boolean }>} */
  const bootCritical = []
  /** @type {Array<{ name: string, run: Function }>} */
  const bootDeferred = []
  /** @type {Array<{ name: string, run: Function, timeoutMs: number }>} */
  const shutdownHooks = []

  return {
    registerBootCritical(name, run, opts = {}) {
      bootCritical.push({
        name,
        run,
        timeoutMs: opts.timeoutMs ?? BOOT_CRITICAL_DEFAULT_MS,
        required: opts.required !== false,
      })
    },

    registerBootDeferred(name, run) {
      bootDeferred.push({ name, run })
    },

    registerShutdown(name, run, opts = {}) {
      shutdownHooks.push({
        name,
        run,
        timeoutMs: opts.timeoutMs ?? SHUTDOWN_HOOK_DEFAULT_MS,
      })
    },

    async runBootCritical(ctx = {}) {
      for (const hook of bootCritical) {
        const started = Date.now()
        console.log(`[boot] critical → ${hook.name}`)
        try {
          await withTimeout(Promise.resolve().then(() => hook.run(ctx)), hook.timeoutMs, hook.name)
          console.log(`[boot] critical ✓ ${hook.name} (${Date.now() - started}ms)`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[boot] critical ✗ ${hook.name}: ${msg}`)
          if (hook.required) {
            throw err instanceof Error ? err : new Error(msg)
          }
        }
      }
    },

    runBootDeferred(ctx = {}) {
      for (const hook of bootDeferred) {
        void Promise.resolve()
          .then(() => hook.run(ctx))
          .then(() => {
            console.log(`[boot] ${BOOT_DEFERRED_LABEL} ✓ ${hook.name}`)
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            console.warn(`[boot] ${BOOT_DEFERRED_LABEL} ✗ ${hook.name}: ${msg}`)
          })
      }
    },

    async runShutdown(ctx = {}) {
      const deadline = Date.now() + SHUTDOWN_GLOBAL_MS
      console.log('[shutdown] begin')
      // LIFO — last registered runs first (UI-adjacent before infrastructure).
      const chain = [...shutdownHooks].reverse()
      for (const hook of chain) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) {
          console.warn(`[shutdown] global deadline (${SHUTDOWN_GLOBAL_MS}ms); skip ${hook.name}`)
          break
        }
        const budget = Math.min(hook.timeoutMs, remaining)
        const started = Date.now()
        console.log(`[shutdown] → ${hook.name}`)
        try {
          await withTimeout(Promise.resolve().then(() => hook.run(ctx)), budget, hook.name)
          console.log(`[shutdown] ✓ ${hook.name} (${Date.now() - started}ms)`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[shutdown] ✗ ${hook.name}: ${msg}`)
        }
      }
      console.log('[shutdown] end')
    },

    clear() {
      bootCritical.length = 0
      bootDeferred.length = 0
      shutdownHooks.length = 0
    },
  }
}

module.exports = {
  createBootloader,
  withTimeout,
  BOOT_CRITICAL_DEFAULT_MS,
  SHUTDOWN_GLOBAL_MS,
  SHUTDOWN_HOOK_DEFAULT_MS,
}
