import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const shutdownModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/sidecar-shutdown.js'),
).href

describe('sidecar-shutdown order + idempotent close hooks', () => {
  it('runs hooks in required order and settles before exit', async () => {
    const { runSidecarShutdown, SIDECAR_FORCE_EXIT_DEFAULT_MS, resolveSidecarForceExitMs } =
      await import(shutdownModUrl)

    assert.equal(SIDECAR_FORCE_EXIT_DEFAULT_MS, 12_000)
    assert.equal(resolveSidecarForceExitMs({}), 12_000)
    assert.equal(resolveSidecarForceExitMs({ OPPTRIX_SIDECAR_FORCE_EXIT_MS: '15000' }), 15_000)

    /** @type {string[]} */
    const steps = []
    let exitCode = -1
    /** @type {ReturnType<typeof setTimeout> | null} */
    let forceTimer = null

    await runSidecarShutdown({
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      forceExitMs: 60_000,
      settleMs: 5,
      exitCode: 0,
      stopSchedulers: () => {
        steps.push('stopSchedulers')
      },
      closeBrowsers: async () => {
        steps.push('closeBrowsers')
      },
      closeHttpApp: async () => {
        steps.push('closeHttpApp')
      },
      unloadLlama: async () => {
        steps.push('unloadLlama')
      },
      closeDocLibrary: async () => {
        steps.push('closeDocLibrary')
      },
      closeMarketDuck: async () => {
        steps.push('closeMarketDuck')
      },
      closeMarketStore: () => {
        steps.push('closeMarketStore')
      },
      closeUserStore: () => {
        steps.push('closeUserStore')
      },
      sleep: async (ms) => {
        steps.push(`settle:${ms}`)
      },
      scheduleForceExit: (fn, ms) => {
        forceTimer = setTimeout(fn, ms)
        return forceTimer
      },
      clearForceExit: (t) => {
        clearTimeout(t)
        forceTimer = null
      },
      exitProcess: (code) => {
        exitCode = code
        steps.push(`exit:${code}`)
      },
    })

    assert.deepEqual(steps, [
      'stopSchedulers',
      'closeBrowsers',
      'closeHttpApp',
      'unloadLlama',
      'closeDocLibrary',
      'closeMarketDuck',
      'closeMarketStore',
      'closeUserStore',
      'settle:5',
      'exit:0',
    ])
    assert.equal(exitCode, 0)
    assert.equal(forceTimer, null)
  })

  it('swallows per-step failures and still exits', async () => {
    const { runSidecarShutdown } = await import(shutdownModUrl)
    /** @type {string[]} */
    const steps = []
    await runSidecarShutdown({
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      forceExitMs: 60_000,
      settleMs: 0,
      stopSchedulers: () => {
        steps.push('stopSchedulers')
        throw new Error('boom-sched')
      },
      closeBrowsers: async () => {
        steps.push('closeBrowsers')
      },
      closeHttpApp: async () => {
        steps.push('closeHttpApp')
        throw new Error('boom-app')
      },
      unloadLlama: async () => {
        steps.push('unloadLlama')
      },
      closeDocLibrary: async () => {
        steps.push('closeDocLibrary')
      },
      closeMarketDuck: async () => {
        steps.push('closeMarketDuck')
      },
      closeMarketStore: () => {
        steps.push('closeMarketStore')
      },
      closeUserStore: () => {
        steps.push('closeUserStore')
      },
      scheduleForceExit: (fn, ms) => setTimeout(fn, ms),
      clearForceExit: (t) => clearTimeout(t),
      exitProcess: (code) => {
        steps.push(`exit:${code}`)
      },
    })

    assert.ok(steps.includes('stopSchedulers'))
    assert.ok(steps.includes('closeBrowsers'))
    assert.ok(steps.includes('unloadLlama'))
    assert.ok(steps.includes('closeUserStore'))
    assert.equal(steps.at(-1), 'exit:0')
  })
})
