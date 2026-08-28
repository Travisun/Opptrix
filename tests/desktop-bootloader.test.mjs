/**
 * Desktop bootloader hook runner — unit contracts (no Electron).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBootloader, withTimeout, SHUTDOWN_GLOBAL_MS } from '../apps/desktop/electron/bootloader.cjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const mainCjs = fs.readFileSync(path.join(here, '../apps/desktop/electron/main.cjs'), 'utf8')
const registerCjs = fs.readFileSync(
  path.join(here, '../apps/desktop/electron/bootloader-register.cjs'),
  'utf8',
)

describe('bootloader withTimeout', () => {
  it('resolves when promise completes within budget', async () => {
    const value = await withTimeout(Promise.resolve(42), 500, 'fast')
    assert.equal(value, 42)
  })

  it('rejects when promise exceeds budget', async () => {
    await assert.rejects(
      () =>
        withTimeout(
          new Promise((resolve) => setTimeout(() => resolve('late'), 80)),
          20,
          'slow-hook',
        ),
      /Hook timeout: slow-hook/,
    )
  })
})

describe('bootloader runBootCritical', () => {
  it('continues optional hooks after failure', async () => {
    const boot = createBootloader()
    const log = []
    boot.registerBootCritical('required-ok', async () => {
      log.push('a')
    })
    boot.registerBootCritical(
      'optional-fail',
      async () => {
        throw new Error('boom')
      },
      { required: false },
    )
    boot.registerBootCritical('after-optional', async () => {
      log.push('b')
    })
    await boot.runBootCritical()
    assert.deepEqual(log, ['a', 'b'])
  })

  it('throws on required hook failure', async () => {
    const boot = createBootloader()
    boot.registerBootCritical(
      'must-fail',
      async () => {
        throw new Error('fatal')
      },
      { required: true },
    )
    await assert.rejects(() => boot.runBootCritical(), /fatal/)
  })

  it('passes ctx through critical chain', async () => {
    const boot = createBootloader()
    boot.registerBootCritical('set-flag', async (ctx) => {
      ctx.quittingForUpdate = true
    })
    const ctx = {}
    await boot.runBootCritical(ctx)
    assert.equal(ctx.quittingForUpdate, true)
  })
})

describe('bootloader runShutdown anti-deadlock', () => {
  it('runs hooks LIFO and skips remaining after global deadline', async () => {
    const boot = createBootloader()
    const order = []
    boot.registerShutdown('first-registered', async () => {
      order.push('first-registered')
    })
    boot.registerShutdown('second', async () => {
      order.push('second')
      await new Promise((r) => setTimeout(r, 30))
    })
    boot.registerShutdown('third', async () => {
      order.push('third')
      await new Promise((r) => setTimeout(r, SHUTDOWN_GLOBAL_MS + 200))
    })
    const t0 = Date.now()
    await boot.runShutdown()
    assert.ok(Date.now() - t0 < SHUTDOWN_GLOBAL_MS + 500, 'shutdown must not hang past global deadline')
    assert.deepEqual(order, ['third', 'second', 'first-registered'])
  })

  it('continues after a hook times out', async () => {
    const boot = createBootloader()
    const order = []
    boot.registerShutdown(
      'slow',
      async () => {
        order.push('slow-start')
        await new Promise((r) => setTimeout(r, 200))
        order.push('slow-end')
      },
      { timeoutMs: 30 },
    )
    boot.registerShutdown('fast', async () => {
      order.push('fast')
    })
    await boot.runShutdown()
    assert.deepEqual(order, ['fast', 'slow-start'])
  })
})

describe('main.cjs bootloader wiring', () => {
  it('whenReady runs critical boot before continueDesktopBootstrap', () => {
    const whenReady = mainCjs.slice(mainCjs.indexOf('app.whenReady().then'))
    assert.match(whenReady, /registerBootHooksIfNeeded\(\)/)
    assert.match(whenReady, /await boot\.runBootCritical\(bootCtx\)/)
    assert.match(whenReady, /bootCtx\.quittingForUpdate/)
    assert.match(whenReady, /await continueDesktopBootstrap/)
    const criticalAt = whenReady.indexOf('runBootCritical')
    const bootstrapAt = whenReady.indexOf('continueDesktopBootstrap')
    assert.ok(criticalAt < bootstrapAt)
  })

  it('continueDesktopBootstrap defers non-critical startup work', () => {
    const start = mainCjs.indexOf('async function continueDesktopBootstrap(opts')
    assert.ok(start >= 0, 'continueDesktopBootstrap missing')
    const end = mainCjs.indexOf('recoverDesktopAfterUpdateStall = async', start)
    assert.ok(end > start, 'continueDesktopBootstrap end marker missing')
    const fn = mainCjs.slice(start, end)
    assert.match(fn, /boot\.runBootDeferred/)
    assert.doesNotMatch(fn, /void requestNotificationPermission\(\)/)
    assert.doesNotMatch(fn, /void maybeBootstrapOfflineModelDownloads/)
    assert.doesNotMatch(fn, /startSidecarHealthWatchdog\(\)/)
  })

  it('quit paths use unified runShutdownChain', () => {
    assert.match(mainCjs, /async function runShutdownChain\(reason\)/)
    assert.match(mainCjs, /await runShutdownChain\('quit-app'\)/)
    assert.match(mainCjs, /runShutdownChain\('before-quit'\)/)
    assert.match(mainCjs, /runShutdownChain\('window-all-closed'\)/)
    assert.match(mainCjs, /runShutdownChain\('update-install'\)/)
  })
})

describe('bootloader-register hooks', () => {
  it('registers port resolve + quick update as critical', () => {
    assert.match(registerCjs, /registerBootCritical\(\s*'resolve-ports'/)
    assert.match(registerCjs, /registerBootCritical\(\s*'pending-update-quick'/)
    assert.match(registerCjs, /ctx\.quittingForUpdate = true/)
  })

  it('registers deferred startup tasks', () => {
    for (const name of [
      'sidecar-health-watchdog',
      'schedule-reconcile',
      'updater-init',
      'translation-bootstrap',
      'notification-permission',
      'pending-update-deferred',
    ]) {
      assert.match(registerCjs, new RegExp(`registerBootDeferred\\('${name}'`))
    }
  })

  it('shutdown hooks run LIFO (schedule before sidecar before tray)', () => {
    const trayAt = registerCjs.indexOf("registerShutdown('tray'")
    const sidecarAt = registerCjs.indexOf("registerShutdown('sidecar'")
    const scheduleAt = registerCjs.indexOf("registerShutdown('schedule-poll'")
    assert.ok(trayAt < sidecarAt && sidecarAt < scheduleAt, 'registration order defines LIFO shutdown')
  })
})
