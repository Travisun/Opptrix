import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { StockSnapshot } from '@opptrix/shared'

export interface StoredSnapshot {
  code: string
  name: string
  timestamp: string
  totalScore: number | null
  scorecardName: string
  factorValues: Record<string, number | null>
  dimensionScores: Record<string, number>
  industry?: string | null
}

interface StoreFile {
  records: StoredSnapshot[]
}

/** File-based snapshot store (mirrors Python SnapshotStore) */
export class SnapshotStore {
  private path: string

  constructor(dbPath = path.join(os.homedir(), '.stock_eval', 'store.json')) {
    this.path = dbPath
    const dir = path.dirname(this.path)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(this.path)) fs.writeFileSync(this.path, JSON.stringify({ records: [] }))
  }

  private read(): StoreFile {
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8')) as StoreFile
    } catch {
      return { records: [] }
    }
  }

  private write(data: StoreFile) {
    fs.writeFileSync(this.path, JSON.stringify(data, null, 2))
  }

  save(snapshot: StockSnapshot, scorecardName = '', timestamp?: string) {
    const ts = timestamp ?? new Date().toISOString().replace('T', ' ').slice(0, 19)
    const record: StoredSnapshot = {
      code: snapshot.code,
      name: snapshot.name,
      timestamp: ts,
      totalScore: snapshot.totalScore ?? null,
      scorecardName,
      factorValues: Object.fromEntries(
        Object.entries(snapshot.factors).map(([k, v]) => [k, v?.value ?? null]),
      ),
      dimensionScores: { ...snapshot.scores },
      industry: (snapshot as StockSnapshot & { industry?: string }).industry ?? null,
    }
    const data = this.read()
    data.records.push(record)
    if (data.records.length > 5000) data.records = data.records.slice(-5000)
    this.write(data)
    return record
  }

  getLatest(code: string): StoredSnapshot | null {
    const rows = this.read().records.filter(r => r.code === code)
    return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null
  }

  getHistory(code: string, days = 90, limit = 50): StoredSnapshot[] {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return this.read().records
      .filter(r => r.code === code && r.timestamp >= since)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  getTop(scorecard = '', n = 20, sinceDays = 7): StoredSnapshot[] {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10)
    return this.read().records
      .filter(r => r.timestamp >= since && (!scorecard || r.scorecardName === scorecard))
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
      .slice(0, n)
  }

  count() { return this.read().records.length }
}
