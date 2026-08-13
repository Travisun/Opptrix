/**
 * SnapshotStore sharding: per-code JSON under store/<prefix>/<code>.json,
 * with lazy migration from legacy store.json.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SnapshotStore,
} from '../packages/stock-eval/dist/index.js'

function makeSnap(code, name, totalScore) {
  return {
    code,
    name,
    factors: {
      pe: { name: 'pe', value: 10, meta: { name: 'pe', category: 'valuation', description: '', higherIsBetter: false } },
    },
    scores: { pe_score: totalScore },
    totalScore,
  }
}

describe('SnapshotStore sharded', () => {
  let tmpDir
  let legacyPath

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-snap-store-'))
    legacyPath = path.join(tmpDir, 'store.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('save / getLatest / getHistory / getTop / count round-trip via shards', () => {
    const store = new SnapshotStore(legacyPath)
    const t1 = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').slice(0, 19)
    const t2 = new Date().toISOString().replace('T', ' ').slice(0, 19)
    store.save(makeSnap('600519', '贵州茅台', 88), 'G=B+M', t1)
    store.save(makeSnap('000001', '平安银行', 72), 'G=B+M', t2)
    store.save(makeSnap('600519', '贵州茅台', 90), 'G=B+M', t2)

    assert.equal(store.count(), 3)

    const latest = store.getLatest('600519')
    assert.ok(latest)
    assert.equal(latest.totalScore, 90)
    assert.equal(latest.name, '贵州茅台')

    const hist = store.getHistory('600519', 90, 10)
    assert.equal(hist.length, 2)
    assert.equal(hist[0].totalScore, 90)

    const top = store.getTop('G=B+M', 5, 7)
    assert.equal(top[0].code, '600519')
    assert.equal(top[0].totalScore, 90)

    const shardA = path.join(tmpDir, 'store', '60', '600519.json')
    const shardB = path.join(tmpDir, 'store', '00', '000001.json')
    assert.equal(fs.existsSync(shardA), true)
    assert.equal(fs.existsSync(shardB), true)
    assert.equal(fs.existsSync(legacyPath), false)
  })

  it('lazy-migrates legacy store.json into shards on first read', () => {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        records: [
          {
            code: '600519',
            name: '贵州茅台',
            timestamp: ts,
            totalScore: 80,
            scorecardName: 'G=B+M',
            factorValues: { pe: 10 },
            dimensionScores: { pe_score: 80 },
            industry: null,
          },
          {
            code: '000001',
            name: '平安银行',
            timestamp: ts,
            totalScore: 60,
            scorecardName: 'G=B+M',
            factorValues: { pe: 5 },
            dimensionScores: { pe_score: 60 },
            industry: null,
          },
        ],
      }),
    )

    const store = new SnapshotStore(legacyPath)
    assert.equal(store.count(), 2)
    assert.equal(store.getLatest('600519')?.totalScore, 80)
    assert.equal(store.getLatest('000001')?.name, '平安银行')

    assert.equal(fs.existsSync(path.join(tmpDir, 'store', '60', '600519.json')), true)
    assert.equal(fs.existsSync(path.join(tmpDir, 'store', '00', '000001.json')), true)
    assert.equal(fs.existsSync(legacyPath), false)
    assert.equal(fs.existsSync(`${legacyPath}.migrated`), true)

    // Second open: migrated marker present, shards still readable
    const store2 = new SnapshotStore(legacyPath)
    assert.equal(store2.count(), 2)
    assert.equal(store2.getTop('', 10, 7).length, 2)
  })

  it('enforces global cap across shards', () => {
    const store = new SnapshotStore(legacyPath, { globalCap: 3, perCodeCap: 10 })
    const base = Date.now()
    for (let i = 0; i < 5; i++) {
      const ts = new Date(base + i * 60_000).toISOString().replace('T', ' ').slice(0, 19)
      store.save(makeSnap(`c${i}`, `n${i}`, i), 'card', ts)
    }
    assert.equal(store.count(), 3)
    const top = store.getTop('card', 10, 30)
    assert.equal(top.length, 3)
    // Newest three by timestamp: c2,c3,c4 — highest scores among kept include c4
    assert.ok(top.some(r => r.code === 'c4'))
    assert.equal(store.getLatest('c0'), null)
  })
})
