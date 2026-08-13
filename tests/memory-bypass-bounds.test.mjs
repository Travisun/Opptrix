/**
 * 内存旁路有界化：enrichment jobs / expertPacksSeeded / stock-prep snapshots
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AgentEngine,
  resetExpertCatalogServiceForTests,
} from '../packages/agent/dist/index.js'
import { resetBuiltinExpertCacheForTests } from '../packages/agent/dist/experts/local-json-provider.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'
import {
  ENRICHMENT_JOB_EXPIRED_ERROR,
  ENRICHMENT_JOB_MAX,
  ENRICHMENT_JOB_TTL_MS,
  enrichmentJobsSizeForTests,
  injectEnrichmentJobForTests,
  lookupEnrichmentJobForTests,
  pruneEnrichmentJobs,
  resetEnrichmentJobsForTests,
} from '../apps/server/dist/enrichment-routes.js'
import {
  STOCK_PREP_MAX_SNAPSHOTS,
  STOCK_PREP_SNAPSHOT_TTL_MS,
  getStockPrep,
  injectStockPrepSnapshotForTests,
  pruneStockPrepSnapshots,
  resetStockPrepSnapshotsForTests,
  stockPrepSnapshotsSizeForTests,
} from '../apps/server/dist/stock-prep-jobs.js'

describe('enrichment jobs Map bound', () => {
  beforeEach(() => {
    resetEnrichmentJobsForTests()
  })

  afterEach(() => {
    resetEnrichmentJobsForTests()
  })

  it('prunes finished jobs past TTL; running survives', () => {
    const now = Date.now()
    injectEnrichmentJobForTests('done-old', {
      articleId: 'a1',
      status: 'completed',
      updatedAt: now - ENRICHMENT_JOB_TTL_MS - 1_000,
    })
    injectEnrichmentJobForTests('run-old', {
      articleId: 'a2',
      status: 'running',
      updatedAt: now - ENRICHMENT_JOB_TTL_MS * 3,
    })
    injectEnrichmentJobForTests('done-fresh', {
      articleId: 'a3',
      status: 'completed',
      updatedAt: now - 1_000,
    })

    pruneEnrichmentJobs(now)

    assert.equal(lookupEnrichmentJobForTests('done-old'), undefined)
    assert.ok(lookupEnrichmentJobForTests('run-old'))
    assert.ok(lookupEnrichmentJobForTests('done-fresh'))
    assert.equal(enrichmentJobsSizeForTests(), 2)
  })

  it('evicts oldest finished when over MAX; never drops running', () => {
    const now = Date.now()
    injectEnrichmentJobForTests('keep-running', {
      articleId: 'r',
      status: 'running',
      updatedAt: now - 60_000,
    })
    for (let i = 0; i < ENRICHMENT_JOB_MAX + 5; i += 1) {
      injectEnrichmentJobForTests(`fin-${i}`, {
        articleId: `a${i}`,
        status: 'completed',
        updatedAt: now - (ENRICHMENT_JOB_MAX + 5 - i) * 100,
      })
    }

    pruneEnrichmentJobs(now)

    assert.ok(lookupEnrichmentJobForTests('keep-running'))
    assert.ok(enrichmentJobsSizeForTests() <= ENRICHMENT_JOB_MAX)
    assert.equal(lookupEnrichmentJobForTests('fin-0'), undefined)
  })

  it('expired lookup message is product-friendly', () => {
    assert.match(ENRICHMENT_JOB_EXPIRED_ERROR, /过期|重新/)
  })
})

describe('stock-prep snapshots bound', () => {
  beforeEach(() => {
    resetStockPrepSnapshotsForTests()
  })

  afterEach(() => {
    resetStockPrepSnapshotsForTests()
  })

  it('TTL drops terminal snapshots; running protected', () => {
    const now = Date.now()
    const staleIso = new Date(now - STOCK_PREP_SNAPSHOT_TTL_MS - 5_000).toISOString()
    const freshIso = new Date(now - 1_000).toISOString()

    injectStockPrepSnapshotForTests({
      code: '600519',
      status: 'done',
      steps: [],
      percent: 100,
      message: null,
      started_at: staleIso,
      updated_at: staleIso,
      error: null,
    })
    injectStockPrepSnapshotForTests({
      code: '000001',
      status: 'running',
      steps: [],
      percent: 10,
      message: '…',
      started_at: staleIso,
      updated_at: staleIso,
      error: null,
    }, { running: true })
    injectStockPrepSnapshotForTests({
      code: '000002',
      status: 'done',
      steps: [],
      percent: 100,
      message: null,
      started_at: freshIso,
      updated_at: freshIso,
      error: null,
    })

    pruneStockPrepSnapshots(now)

    assert.equal(getStockPrep('600519').status, 'idle')
    assert.equal(getStockPrep('000001').status, 'running')
    assert.equal(getStockPrep('000002').status, 'done')
  })

  it('LRU-ish max codes keeps size ≤ MAX and skips running', () => {
    const now = Date.now()
    injectStockPrepSnapshotForTests({
      code: '999999',
      status: 'running',
      steps: [],
      percent: 1,
      message: null,
      started_at: new Date(now).toISOString(),
      updated_at: new Date(now - 86_400_000).toISOString(),
      error: null,
    }, { running: true })

    for (let i = 0; i < STOCK_PREP_MAX_SNAPSHOTS + 10; i += 1) {
      const code = String(100000 + i)
      injectStockPrepSnapshotForTests({
        code,
        status: 'done',
        steps: [],
        percent: 100,
        message: null,
        started_at: new Date(now - i * 1000).toISOString(),
        updated_at: new Date(now - (STOCK_PREP_MAX_SNAPSHOTS + 10 - i) * 1000).toISOString(),
        error: null,
      })
    }

    pruneStockPrepSnapshots(now)

    assert.ok(stockPrepSnapshotsSizeForTests() <= STOCK_PREP_MAX_SNAPSHOTS)
    assert.equal(getStockPrep('999999').status, 'running')
  })
})

describe('expertPacksSeeded session cleanup', () => {
  let tmp
  let prev

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-expert-seed-'))
    prev = process.env.OPPTRIX_DATA_DIR
    process.env.OPPTRIX_DATA_DIR = tmp
    getUserDataStore().close()
    resetBuiltinExpertCacheForTests()
    resetExpertCatalogServiceForTests()
  })

  afterEach(() => {
    getUserDataStore().close()
    resetExpertCatalogServiceForTests()
    resetBuiltinExpertCacheForTests()
    fs.rmSync(tmp, { recursive: true, force: true })
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
  })

  function makeEngine() {
    return new AgentEngine(new ResearchHub(), {
      defaultScorecard: 'balanced',
      defaultTopN: 10,
    })
  }

  it('deleteSession removes seeded keys by sessionId prefix only', async () => {
    const engine = makeEngine()
    const a = await engine.createSession({ title: 'A' })
    const b = await engine.createSession({ title: 'B' })
    engine.markExpertPackSeededForTests(a.id, 'exp1')
    engine.markExpertPackSeededForTests(a.id, 'exp2')
    engine.markExpertPackSeededForTests(b.id, 'exp1')
    assert.equal(engine.expertPacksSeededSizeForTests(), 3)

    engine.deleteSession(a.id)

    assert.equal(engine.hasExpertPackSeedForTests(a.id, 'exp1'), false)
    assert.equal(engine.hasExpertPackSeedForTests(a.id, 'exp2'), false)
    assert.equal(engine.hasExpertPackSeedForTests(b.id, 'exp1'), true)
    assert.equal(engine.expertPacksSeededSizeForTests(), 1)
  })

  it('archiveSession clears expert seed + pack/skill bypass like delete', async () => {
    const engine = makeEngine()
    const s = await engine.createSession({ title: 'Arch' })
    engine.markExpertPackSeededForTests(s.id, 'builtin-news')
    const folders = engine.listSessionArchiveFolders()
    const folderId = folders[0]?.id ?? 'other'

    const archived = engine.archiveSession(s.id, folderId)
    assert.ok(archived)
    assert.equal(engine.hasExpertPackSeedForTests(s.id, 'builtin-news'), false)
    assert.equal(engine.expertPacksSeededSizeForTests(), 0)
  })
})
