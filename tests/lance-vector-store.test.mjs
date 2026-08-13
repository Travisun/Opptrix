/**
 * LanceVectorStore 防护：向量校验、串行写队列、病理目录检测。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  EMBEDDING_DIM,
  isValidEmbeddingVector,
  filterValidUpsertRows,
  detectLanceDatasetPathology,
  lanceTableDatasetDir,
  LANCE_VERSIONS_PATHOLOGY_THRESHOLD,
  MemoryVectorStore,
  LanceVectorStore,
} from '../packages/doc-library/dist/index.js'

function validVector(seed = 0.01) {
  return Array.from({ length: EMBEDDING_DIM }, (_, i) => seed + i * 1e-6)
}

describe('lance vector validation', () => {
  it('rejects wrong length / non-finite vectors', () => {
    assert.equal(isValidEmbeddingVector([1, 2, 3]), false)
    assert.equal(isValidEmbeddingVector(validVector()), true)
    const bad = validVector()
    bad[0] = Number.NaN
    assert.equal(isValidEmbeddingVector(bad), false)
    const inf = validVector()
    inf[1] = Number.POSITIVE_INFINITY
    assert.equal(isValidEmbeddingVector(inf), false)
  })

  it('filterValidUpsertRows drops invalid rows without using text body', () => {
    const { valid, rejected } = filterValidUpsertRows([
      { chunk_id: 'a', document_id: 'd1', text: 'secret-body-should-not-matter', vector: validVector() },
      { chunk_id: 'b', document_id: 'd1', text: 'bad', vector: [1, 2] },
      { chunk_id: '', document_id: 'd1', text: 'x', vector: validVector() },
    ])
    assert.equal(rejected, 2)
    assert.equal(valid.length, 1)
    assert.equal(valid[0].chunk_id, 'a')
  })

  it('MemoryVectorStore ignores invalid vectors on upsert', async () => {
    const store = new MemoryVectorStore()
    await store.upsert([
      { chunk_id: 'ok', document_id: 'd', text: 't', vector: validVector(0.2) },
      { chunk_id: 'bad', document_id: 'd', text: 't', vector: [0] },
    ])
    const hits = await store.search(validVector(0.2), { limit: 10 })
    assert.equal(hits.some(h => h.chunk_id === 'ok'), true)
    assert.equal(hits.some(h => h.chunk_id === 'bad'), false)
  })
})

describe('lance serial async queue (upsert chain)', () => {
  it('serializes overlapping async work without interleaving', async () => {
    // Mirrors LanceVectorStore.schedule — proves concurrent upserts cannot cross.
    let chain = Promise.resolve()
    /** @type {(fn: () => Promise<unknown>) => Promise<unknown>} */
    const schedule = (fn) => {
      const run = chain.then(fn)
      chain = run.then(() => undefined, () => undefined)
      return run
    }

    const log = []
    const jobs = [1, 2, 3].map((id) => schedule(async () => {
      log.push(`start-${id}`)
      await new Promise((r) => setTimeout(r, 15 - id * 3))
      log.push(`end-${id}`)
      return id
    }))

    const results = await Promise.all(jobs)
    assert.deepEqual(results, [1, 2, 3])
    assert.deepEqual(log, [
      'start-1', 'end-1',
      'start-2', 'end-2',
      'start-3', 'end-3',
    ])
  })
})

describe('lance pathology detection', () => {
  it('flags excessive _versions count', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-path-'))
    const ds = lanceTableDatasetDir(root)
    const versions = path.join(ds, '_versions')
    fs.mkdirSync(versions, { recursive: true })
    const n = LANCE_VERSIONS_PATHOLOGY_THRESHOLD + 3
    for (let i = 0; i < n; i++) {
      fs.writeFileSync(path.join(versions, `${i}.manifest`), 'x')
    }
    const result = detectLanceDatasetPathology(ds)
    assert.equal(result.pathological, true)
    assert.equal(result.reason, 'versions_count_exceeded')
    assert.ok(result.versionsCount > LANCE_VERSIONS_PATHOLOGY_THRESHOLD)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('flags suspect u64-wrap manifest names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-path-'))
    const ds = lanceTableDatasetDir(root)
    const versions = path.join(ds, '_versions')
    fs.mkdirSync(versions, { recursive: true })
    fs.writeFileSync(path.join(versions, '18446744073709551611.manifest'), 'x')
    const result = detectLanceDatasetPathology(ds)
    assert.equal(result.pathological, true)
    assert.equal(result.reason, 'suspect_manifest_version')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('healthy small dataset is not pathological', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-path-'))
    const ds = lanceTableDatasetDir(root)
    const versions = path.join(ds, '_versions')
    fs.mkdirSync(versions, { recursive: true })
    fs.writeFileSync(path.join(versions, '1.manifest'), 'x')
    fs.writeFileSync(path.join(versions, '2.manifest'), 'x')
    const result = detectLanceDatasetPathology(ds)
    assert.equal(result.pathological, false)
    assert.equal(result.versionsCount, 2)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('LanceVectorStore clears pathological dataset dir on ensure (rebuild attempt)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-store-'))
    const ds = lanceTableDatasetDir(root)
    const versions = path.join(ds, '_versions')
    fs.mkdirSync(versions, { recursive: true })
    fs.writeFileSync(path.join(versions, '18446744073709551611.manifest'), 'x')
    // Also plant a marker file so we can assert rm happened
    fs.writeFileSync(path.join(ds, 'CORRUPT_MARKER'), '1')

    const store = new LanceVectorStore(root)
    // isAvailable → ensure → pathology → rebuild (may succeed or fail if native missing)
    await store.isAvailable().catch(() => false)
    await store.close?.()

    assert.equal(fs.existsSync(path.join(ds, 'CORRUPT_MARKER')), false,
      'pathological dataset directory must be removed before recreate')
    fs.rmSync(root, { recursive: true, force: true })
  })
})
