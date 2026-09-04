/**
 * Phase A late-bound capability tests — data.query / schedule.list / llm / shell.
 *
 * These verify the capability host routes late-bound tokens to real services
 * (hub.dispatch, ScheduleService) and returns thin structured responses for
 * Phase A "thin" tokens (llm.chat, shell.run).
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

let tmpRoot
let dataDir
let platform

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-lb-'))
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  process.env.OPPTRIX_DATA_DIR = dataDir
  platform = await import(`${platformModUrl}?t=${Date.now()}`)
  platform.resetPlatformContextForTests()
})
afterEach(() => {
  platform.resetPlatformContextForTests()
  delete process.env.OPPTRIX_DATA_DIR
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe('Phase A — late-bound capabilities', () => {
  it('data.query routes through the bound hub (real service)', async () => {
    // Bind a fake hub that records the dispatch call.
    const dispatched = []
    platform.bindLateBoundServices({
      hub: {
        dispatch: async (feature, params) => {
          dispatched.push({ feature, params })
          return { ok: true, quotes: [{ code: '600519', price: 1500 }] }
        },
      },
    })

    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'lb.data.1', permissions: ['data.query'] },
      { trusted: true },
    )
    await ctx.extensions.activate('lb.data.1')

    const result = await ctx.extensions.run('lb.data.1', async (api) =>
      api.callGate('data.query', {
        feature: 'instrument_quotes',
        params: { instruments: [{ code: '600519' }] },
      }),
    )
    assert.equal(result.data.ok, true)
    assert.equal(result.data.data.ok, true)
    assert.equal(dispatched.length, 1)
    assert.equal(dispatched[0].feature, 'instrument_quotes')
  })

  it('data.query denies non-allowlisted hub features (fail-closed)', async () => {
    platform.bindLateBoundServices({
      hub: { dispatch: async () => ({ ok: true }) },
    })
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'lb.data.2', permissions: ['data.query'] },
      { trusted: true },
    )
    await ctx.extensions.activate('lb.data.2')

    const result = await ctx.extensions.run('lb.data.2', async (api) =>
      api.callGate('data.query', { feature: 'provider_settings_save', params: {} }),
    )
    // The run succeeds (R0) but the observation carries the denial.
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'feature_denied')
  })

  it('data.query returns service_unavailable when hub is not bound', async () => {
    // Don't bind a hub (fresh process — but the singleton may carry over from
    // prior tests; reset to be sure).
    platform.bindLateBoundServices({ hub: undefined })
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'lb.data.3', permissions: ['data.query'] },
      { trusted: true },
    )
    await ctx.extensions.activate('lb.data.3')

    const result = await ctx.extensions.run('lb.data.3', async (api) =>
      api.callGate('data.query', { feature: 'instrument_quotes', params: {} }),
    )
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'service_unavailable')
  })

  it('schedule.list returns projected job list (real service)', async () => {
    platform.bindLateBoundServices({
      schedule: {
        listJobs: () => [
          { id: 'j1', kind: 'digest', title: 'Daily', enabled: true, secret: 'x' },
        ],
      },
    })
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'lb.sched.1', permissions: ['schedule'] },
      { trusted: true },
    )
    await ctx.extensions.activate('lb.sched.1')

    const result = await ctx.extensions.run('lb.sched.1', async (api) =>
      api.callGate('schedule.list', { op: 'list' }),
    )
    assert.equal(result.data.ok, true)
    const jobs = result.data.data.jobs
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].id, 'j1')
    // Internal fields are projected away.
    assert.equal(jobs[0].secret, undefined)
  })

  it('llm.chat returns phase_a_thin structured response', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'lb.llm.1', permissions: ['llm'] },
      { trusted: true },
    )
    await ctx.extensions.activate('lb.llm.1')

    const result = await ctx.extensions.run('lb.llm.1', async (api) =>
      api.callGate('llm.chat', { messages: [] }),
    )
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'phase_a_thin')
    assert.match(result.data.message, /Phase A/)
  })

  it('shell.run returns phase_a_thin structured response', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'lb.shell.1', permissions: ['shell'] },
      { trusted: true },
    )
    await ctx.extensions.activate('lb.shell.1')

    const result = await ctx.extensions.run('lb.shell.1', async (api) =>
      api.callGate('shell.run', { command: 'ls' }),
    )
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'phase_a_thin')
  })
})
