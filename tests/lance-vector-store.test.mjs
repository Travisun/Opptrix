/**
 * LanceVectorStore 防护：向量校验、读优先写队列、病理目录检测、重建回填。
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
  LanceOpScheduler,
  setLanceRebuildBackfillHook,
  shouldEmbedToVector,
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

describe('lance op scheduler (read priority)', () => {
  it('serializes overlapping writes without interleaving', async () => {
    const sched = new LanceOpScheduler()
    const log = []
    const jobs = [1, 2, 3].map((id) => sched.schedule('write', async () => {
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

  it('lets read jump ahead of queued writes while writes stay serial', async () => {
    const sched = new LanceOpScheduler()
    const log = []
    /** @type {() => void} */
    let releaseW1
    const gate = new Promise((resolve) => {
      releaseW1 = resolve
    })

    const w1 = sched.schedule('write', async () => {
      log.push('w1-start')
      await gate
      log.push('w1-end')
    })

    // 等 w1 进入 running，再排队 w2 与 read
    await new Promise((r) => setTimeout(r, 10))
    const w2 = sched.schedule('write', async () => {
      log.push('w2')
    })
    const rd = sched.schedule('read', async () => {
      log.push('read')
    })

    assert.deepEqual(sched.pendingKinds(), ['read', 'write'])

    releaseW1()
    await Promise.all([w1, w2, rd])
    assert.deepEqual(log, ['w1-start', 'w1-end', 'read', 'w2'])
  })

  it('drops oldest pending write when maxPending exceeded', async () => {
    const sched = new LanceOpScheduler({ maxPending: 1 })
    /** @type {() => void} */
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const running = sched.schedule('write', async () => {
      await gate
      return 1
    })
    await new Promise((r) => setTimeout(r, 5))
    const oldPending = sched.schedule('write', async () => 2)
    const newer = sched.schedule('write', async () => 3)
    await assert.rejects(
      () => oldPending,
      (err) => err instanceof Error && /dropped oldest write/i.test(err.message),
    )
    release()
    assert.equal(await running, 1)
    assert.equal(await newer, 3)
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

  it('successful rebuild schedules injectable embedPending backfill hook', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-backfill-'))
    const ds = lanceTableDatasetDir(root)
    const versions = path.join(ds, '_versions')
    fs.mkdirSync(versions, { recursive: true })
    fs.writeFileSync(path.join(versions, '18446744073709551611.manifest'), 'x')

    let hookCalls = 0
    /** @type {Promise<void>} */
    let hookDone
    hookDone = new Promise((resolve) => {
      setLanceRebuildBackfillHook(() => {
        hookCalls += 1
        resolve()
      })
    })

    const store = new LanceVectorStore(root)
    const available = await store.isAvailable().catch(() => false)
    // 原生 Lance 可用时重建成功才会触发 hook；不可用则跳过断言
    if (available) {
      await Promise.race([
        hookDone,
        new Promise((_, reject) => setTimeout(() => reject(new Error('backfill hook timeout')), 5_000)),
      ])
      assert.equal(hookCalls, 1)
    } else {
      // 无原生时仍应清掉病理目录；hook 可能未触发（rebuild createTable 失败）
      assert.equal(fs.existsSync(path.join(versions, '18446744073709551611.manifest')), false)
    }

    await store.close?.()
    setLanceRebuildBackfillHook(null)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('notifyRebuildBackfill invokes injectable hook and swallows errors', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-hook-'))
    let hookCalls = 0
    setLanceRebuildBackfillHook(() => {
      hookCalls += 1
      throw new Error('backfill boom')
    })
    const store = new LanceVectorStore(root)
    // private 方法：编译后仍可调用；不依赖原生 Lance
    store.notifyRebuildBackfill()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(hookCalls, 1)
    // 冷却期内第二次不重复调度
    store.notifyRebuildBackfill()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(hookCalls, 1)
    setLanceRebuildBackfillHook(null)
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe('LanceVectorStore upsert mergeInsert vs delete+add', () => {
  /** @param {{ mergeInsert?: Function }} extras */
  function installMockTable(store, extras = {}) {
    /** @type {string[]} */
    const calls = []
    const table = {
      async delete(predicate) {
        calls.push(`delete:${predicate}`)
      },
      async add(data) {
        calls.push(`add:${data.length}`)
        return data
      },
      async optimize() {
        calls.push('optimize')
      },
      ...extras,
    }
    if (typeof extras.mergeInsert === 'function') {
      const userMerge = extras.mergeInsert
      table.mergeInsert = (on) => {
        calls.push(`mergeInsert:${on}`)
        return userMerge(on, calls)
      }
    }
    // private fields — runtime inject for unit tests without native Lance
    store.table = table
    store.initFailed = false
    return { table, calls }
  }

  it('prefers mergeInsert(on: chunk_id) when available', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-merge-'))
    const store = new LanceVectorStore(root)
    let executed = null
    const { calls } = installMockTable(store, {
      mergeInsert(_on, callLog) {
        return {
          whenMatchedUpdateAll() {
            callLog.push('whenMatchedUpdateAll')
            return {
              whenNotMatchedInsertAll() {
                callLog.push('whenNotMatchedInsertAll')
                return {
                  async execute(data) {
                    callLog.push(`execute:${data.length}`)
                    executed = data
                  },
                }
              },
            }
          },
        }
      },
    })

    await store.upsert([
      { chunk_id: 'c1', document_id: 'd1', text: 'hello', vector: validVector(0.1) },
    ])
    await store.close?.()

    assert.equal(calls[0], 'mergeInsert:chunk_id')
    assert.ok(calls.includes('whenMatchedUpdateAll'))
    assert.ok(calls.includes('whenNotMatchedInsertAll'))
    assert.ok(calls.includes('execute:1'))
    assert.equal(calls.some(c => c.startsWith('delete:')), false)
    assert.equal(calls.some(c => c.startsWith('add:')), false)
    assert.equal(executed?.[0]?.chunk_id, 'c1')
    assert.equal(executed?.[0]?.text, 'hello')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('falls back to delete+add when mergeInsert is absent', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-fallback-'))
    const store = new LanceVectorStore(root)
    const { calls } = installMockTable(store)

    await store.upsert([
      { chunk_id: 'c1', document_id: 'd1', text: 'a', vector: validVector(0.2) },
      { chunk_id: "c'2", document_id: 'd1', text: 'b', vector: validVector(0.3) },
    ])
    await store.close?.()

    assert.equal(calls.some(c => c.startsWith('mergeInsert:')), false)
    assert.ok(calls.some(c => c.startsWith('delete:') && c.includes('c1') && c.includes("c''2")))
    assert.ok(calls.includes('add:2'))
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('falls back to delete+add when mergeInsert.execute throws', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-merge-fail-'))
    const store = new LanceVectorStore(root)
    const { calls } = installMockTable(store, {
      mergeInsert(_on, callLog) {
        return {
          whenMatchedUpdateAll() {
            return {
              whenNotMatchedInsertAll() {
                return {
                  async execute() {
                    callLog.push('execute:throw')
                    throw new Error('merge unavailable')
                  },
                }
              },
            }
          },
        }
      },
    })

    await store.upsert([
      { chunk_id: 'c9', document_id: 'd9', text: 'x', vector: validVector(0.4) },
    ])
    await store.close?.()

    assert.ok(calls.includes('mergeInsert:chunk_id'))
    assert.ok(calls.includes('execute:throw'))
    assert.ok(calls.some(c => c.startsWith('delete:') && c.includes('c9')))
    assert.ok(calls.includes('add:1'))
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('upsert overwrites same chunk_id via MemoryVectorStore (search hits updated text)', async () => {
    const store = new MemoryVectorStore()
    const v = validVector(0.5)
    await store.upsert([
      { chunk_id: 'same', document_id: 'd', text: 'old-text', vector: v },
    ])
    await store.upsert([
      { chunk_id: 'same', document_id: 'd', text: 'new-text', vector: v },
    ])
    const hits = await store.search(v, { limit: 5 })
    const hit = hits.find(h => h.chunk_id === 'same')
    assert.ok(hit)
    assert.equal(hit.text, 'new-text')
  })

  it('mergeInsert upsert re-executes updated row for same chunk_id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-lance-overwrite-'))
    const store = new LanceVectorStore(root)
    /** @type {Array<Record<string, unknown>[]>} */
    const payloads = []
    installMockTable(store, {
      mergeInsert(_on, callLog) {
        return {
          whenMatchedUpdateAll() {
            return {
              whenNotMatchedInsertAll() {
                return {
                  async execute(data) {
                    callLog.push(`execute:${data.length}`)
                    payloads.push(data)
                  },
                }
              },
            }
          },
        }
      },
    })

    const v1 = validVector(0.6)
    const v2 = validVector(0.7)
    await store.upsert([
      { chunk_id: 'same', document_id: 'd', text: 'old', vector: v1 },
    ])
    await store.upsert([
      { chunk_id: 'same', document_id: 'd', text: 'new', vector: v2 },
    ])
    await store.close?.()

    assert.equal(payloads.length, 2)
    assert.equal(payloads[0][0].text, 'old')
    assert.equal(payloads[1][0].text, 'new')
    assert.deepEqual(payloads[1][0].vector, v2)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('shouldEmbedToVector keeps news out of Lance policy', () => {
    assert.equal(shouldEmbedToVector('news'), false)
    assert.equal(shouldEmbedToVector('report'), true)
    assert.equal(shouldEmbedToVector(null), true)
  })
})
