import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-market-dynamics-cache-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test('market dynamics disk cache serves instantly before refresh', async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  const {
    readMarketDynamicsCache,
    writeMarketDynamicsCache,
    resetMarketDynamicsCacheForTests,
  } = await import('../packages/research-hub/dist/market-dynamics-cache.js')
  const { ok } = await import('../packages/shared/dist/result.js')

  resetMarketDynamicsCacheForTests()

  writeMarketDynamicsCache('cn', ok({
    market: 'cn',
    refreshed_at: '2026-01-01T09:30:00.000Z',
    sections: [{ id: 'cn_major', title: 'A 股主要指数', items: [] }],
  }, 'cached'))

  const hit = readMarketDynamicsCache('cn')
  assert.ok(hit)
  assert.equal(hit.data.market, 'cn')
  assert.match(hit.message, /cached/)
})

test('ResearchHub market_dynamics returns disk cache when memory TTL expired', async () => {
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const {
    writeMarketDynamicsCache,
    resetMarketDynamicsCacheForTests,
  } = await import('../packages/research-hub/dist/market-dynamics-cache.js')
  const { ok } = await import('../packages/shared/dist/result.js')

  resetMarketDynamicsCacheForTests()
  writeMarketDynamicsCache('cn', ok({
    market: 'cn',
    refreshed_at: '2026-01-01T09:30:00.000Z',
    sections: [{
      id: 'cn_major',
      title: 'A 股主要指数',
      items: [{ code: '000001', name: '上证指数', price: 3000, change_pct: 0.5 }],
    }],
  }, 'A股市场动态'))

  const hub = new ResearchHub()
  const result = await hub.dispatch('market_dynamics', { market: 'cn' })
  assert.equal(result.success, true)
  assert.equal(result.data?.from_cache, true)
  assert.equal(result.data?.sections?.[0]?.items?.[0]?.code, '000001')
})
