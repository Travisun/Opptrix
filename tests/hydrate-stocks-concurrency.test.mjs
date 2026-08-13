import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const ENV_KEYS = ['OPPTRIX_HYDRATE_CONCURRENCY', 'OPPTRIX_SQLITE_MEM_PROFILE']

/** @type {Record<string, string | undefined>} */
const saved = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

function makeMockStore() {
  /** @type {Map<string, string | null>} */
  const holderSynced = new Map()
  /** @type {Map<string, string | null>} */
  const partnerSynced = new Map()
  /** @type {string[]} */
  const progress = []
  /** @type {string[]} */
  const replacedHolders = []
  /** @type {string[]} */
  const replacedPartners = []

  return {
    shareholderSyncedAt: (code) => holderSynced.get(code) ?? null,
    partnerSyncedAt: (code) => partnerSynced.get(code) ?? null,
    replaceShareholders: (code) => {
      replacedHolders.push(code)
      holderSynced.set(code, new Date().toISOString())
    },
    replacePartners: (code, kind) => {
      replacedPartners.push(`${code}:${kind}`)
    },
    markJobProgress: (job, code, _date, status) => {
      progress.push(`${job}:${code}:${status}`)
      if (job === 'partners') partnerSynced.set(code, new Date().toISOString())
    },
    _progress: progress,
    _replacedHolders: replacedHolders,
    _replacedPartners: replacedPartners,
  }
}

function makeMockDe({ holderDelayMs = 20, partnerDelayMs = 5 } = {}) {
  let inFlight = 0
  let maxInFlight = 0
  /** @type {string[]} */
  const callOrder = []

  return {
    maxInFlight: () => maxInFlight,
    callOrder: () => callOrder,
    shareholders: async (code) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      callOrder.push(`holders:${code}`)
      await new Promise((r) => setTimeout(r, holderDelayMs))
      inFlight--
      return {
        success: true,
        data: [{ holder_name: `H-${code}`, hold_amount: 1, hold_ratio: 1, end_date: '2024-12-31' }],
      }
    },
    topCustomerSupplier: async (code, kind) => {
      callOrder.push(`partner:${code}:${kind}`)
      await new Promise((r) => setTimeout(r, partnerDelayMs))
      return {
        success: true,
        data: [{ name: `${kind}-${code}` }],
      }
    },
  }
}

describe('hydrateStocks bounded concurrency', () => {
  it('resolveHydrateConcurrency: env override capped at 3; low profile → 1', async () => {
    const { resolveHydrateConcurrency } = await import(
      '../packages/market-data/dist/sync/hydrate.js'
    )

    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'high'
    assert.equal(resolveHydrateConcurrency(), 2)

    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'low'
    assert.equal(resolveHydrateConcurrency(), 1)

    process.env.OPPTRIX_HYDRATE_CONCURRENCY = '9'
    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'low'
    assert.equal(resolveHydrateConcurrency(), 3)

    process.env.OPPTRIX_HYDRATE_CONCURRENCY = '1'
    assert.equal(resolveHydrateConcurrency(), 1)
  })

  it('multi-code counts + persist; concurrency respects cap', async () => {
    process.env.OPPTRIX_HYDRATE_CONCURRENCY = '2'
    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'high'

    const { hydrateStocks } = await import('../packages/market-data/dist/sync/hydrate.js')
    const store = makeMockStore()
    const de = makeMockDe({ holderDelayMs: 40 })
    const codes = ['600519', '000001', '601318', '000002']

    const result = await hydrateStocks(store, /** @type {any} */ (de), codes, 'detail')

    assert.deepEqual(result, { shareholders: 4, partners: 4 })
    assert.equal(store._replacedHolders.length, 4)
    assert.equal(store._replacedPartners.length, 8)
    assert.ok(de.maxInFlight() <= 2, `maxInFlight=${de.maxInFlight()} expected ≤2`)

    // Same code: holders before partners (no same-code double-write race)
    for (const code of codes) {
      const hi = de.callOrder().indexOf(`holders:${code}`)
      const pc = de.callOrder().indexOf(`partner:${code}:customer`)
      assert.ok(hi >= 0 && pc >= 0 && hi < pc, `order for ${code}: holders before partners`)
    }
  })

  it('watchlist skips partners; TTL skip does not count', async () => {
    process.env.OPPTRIX_HYDRATE_CONCURRENCY = '2'
    const { hydrateStocks } = await import('../packages/market-data/dist/sync/hydrate.js')
    const store = makeMockStore()
    store.shareholderSyncedAt = (code) => (code === '600519' ? new Date().toISOString() : null)
    const de = makeMockDe({ holderDelayMs: 5 })

    const result = await hydrateStocks(
      store,
      /** @type {any} */ (de),
      ['600519', '000001'],
      'watchlist',
    )

    assert.deepEqual(result, { shareholders: 1, partners: 0 })
    assert.equal(store._replacedHolders.length, 1)
    assert.equal(store._replacedPartners.length, 0)
  })
})
