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

/** Global FIFO cap (same semantics as the former monolithic store.json). */
export const SNAPSHOT_STORE_GLOBAL_CAP = 5000

/** Soft per-code history cap to keep individual shard files bounded. */
export const SNAPSHOT_STORE_PER_CODE_CAP = 200

function sanitizeCode(code: string): string {
  const trimmed = code.trim()
  const safe = trimmed.replace(/[^A-Za-z0-9._-]/g, '_')
  return safe || '_'
}

function codePrefix(code: string): string {
  const safe = sanitizeCode(code)
  return safe.slice(0, 2) || '_'
}

/**
 * File-based snapshot store (mirrors Python SnapshotStore).
 * Layout: `<root>/store/<code-prefix>/<code>.json`
 * Legacy monolithic `<root>/store.json` is lazy-migrated on first access.
 */
export class SnapshotStore {
  private readonly root: string
  private readonly legacyPath: string
  private readonly shardsDir: string
  private readonly globalCap: number
  private readonly perCodeCap: number
  private migrated = false

  constructor(
    dbPath = path.join(os.homedir(), '.stock_eval', 'store.json'),
    opts?: { globalCap?: number; perCodeCap?: number },
  ) {
    if (dbPath.endsWith('.json')) {
      this.legacyPath = dbPath
      this.root = path.dirname(dbPath)
    } else {
      this.root = dbPath
      this.legacyPath = path.join(dbPath, 'store.json')
    }
    this.shardsDir = path.join(this.root, 'store')
    this.globalCap = opts?.globalCap ?? SNAPSHOT_STORE_GLOBAL_CAP
    this.perCodeCap = opts?.perCodeCap ?? SNAPSHOT_STORE_PER_CODE_CAP
    fs.mkdirSync(this.shardsDir, { recursive: true })
  }

  private shardPath(code: string): string {
    const safe = sanitizeCode(code)
    return path.join(this.shardsDir, codePrefix(safe), `${safe}.json`)
  }

  private readShardFile(filePath: string): StoreFile {
    try {
      if (!fs.existsSync(filePath)) return { records: [] }
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoreFile
      return { records: Array.isArray(parsed?.records) ? parsed.records : [] }
    } catch {
      return { records: [] }
    }
  }

  private writeShardFile(filePath: string, data: StoreFile) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  }

  private readLegacy(): StoreFile {
    try {
      if (!fs.existsSync(this.legacyPath)) return { records: [] }
      const parsed = JSON.parse(fs.readFileSync(this.legacyPath, 'utf8')) as StoreFile
      return { records: Array.isArray(parsed?.records) ? parsed.records : [] }
    } catch {
      return { records: [] }
    }
  }

  /** Idempotent: split legacy store.json into per-code shards once. */
  private ensureMigrated() {
    if (this.migrated) return
    this.migrated = true
    if (!fs.existsSync(this.legacyPath)) return

    const legacy = this.readLegacy()
    if (legacy.records.length === 0) {
      try {
        fs.unlinkSync(this.legacyPath)
      } catch {
        /* ignore */
      }
      return
    }

    const byCode = new Map<string, StoredSnapshot[]>()
    for (const rec of legacy.records) {
      const key = sanitizeCode(rec.code)
      const list = byCode.get(key) ?? []
      list.push(rec)
      byCode.set(key, list)
    }

    for (const [code, records] of byCode) {
      const filePath = this.shardPath(code)
      const existing = this.readShardFile(filePath).records
      const merged = [...existing, ...records]
      this.writeShardFile(filePath, { records: merged })
    }

    const bak = `${this.legacyPath}.migrated`
    try {
      fs.renameSync(this.legacyPath, bak)
    } catch {
      try {
        fs.unlinkSync(this.legacyPath)
      } catch {
        /* ignore */
      }
    }
  }

  private listShardFiles(): string[] {
    if (!fs.existsSync(this.shardsDir)) return []
    const out: string[] = []
    for (const prefix of fs.readdirSync(this.shardsDir)) {
      const prefixDir = path.join(this.shardsDir, prefix)
      let st: fs.Stats
      try {
        st = fs.statSync(prefixDir)
      } catch {
        continue
      }
      if (!st.isDirectory()) continue
      for (const name of fs.readdirSync(prefixDir)) {
        if (!name.endsWith('.json')) continue
        out.push(path.join(prefixDir, name))
      }
    }
    return out
  }

  private readCode(code: string): StoredSnapshot[] {
    this.ensureMigrated()
    return this.readShardFile(this.shardPath(code)).records
  }

  private writeCode(code: string, records: StoredSnapshot[]) {
    this.writeShardFile(this.shardPath(code), { records })
  }

  private readAll(): StoredSnapshot[] {
    this.ensureMigrated()
    const all: StoredSnapshot[] = []
    for (const file of this.listShardFiles()) {
      all.push(...this.readShardFile(file).records)
    }
    return all
  }

  /** Keep last globalCap records across all shards (drop oldest by timestamp). */
  private enforceGlobalCap() {
    const all = this.readAll()
    if (all.length <= this.globalCap) return

    const keep = [...all]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-this.globalCap)

    const byCode = new Map<string, StoredSnapshot[]>()
    for (const rec of keep) {
      const list = byCode.get(rec.code) ?? []
      list.push(rec)
      byCode.set(rec.code, list)
    }

    const usedFiles = new Set<string>()
    for (const [code, records] of byCode) {
      const file = this.shardPath(code)
      usedFiles.add(file)
      this.writeCode(code, records)
    }
    for (const file of this.listShardFiles()) {
      if (usedFiles.has(file)) continue
      try {
        fs.unlinkSync(file)
      } catch {
        /* ignore */
      }
    }
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
    this.ensureMigrated()
    let records = this.readCode(snapshot.code)
    records.push(record)
    if (records.length > this.perCodeCap) {
      records = records.slice(-this.perCodeCap)
    }
    this.writeCode(snapshot.code, records)
    this.enforceGlobalCap()
    return record
  }

  getLatest(code: string): StoredSnapshot | null {
    const rows = this.readCode(code)
    if (rows.length === 0) return null
    let best = rows[0]
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      // Later equal timestamps win (insertion order), matching append semantics.
      if (row.timestamp >= best.timestamp) best = row
    }
    return best
  }

  getHistory(code: string, days = 90, limit = 50): StoredSnapshot[] {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return this.readCode(code)
      .filter(r => r.timestamp >= since)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  getTop(scorecard = '', n = 20, sinceDays = 7): StoredSnapshot[] {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10)
    return this.readAll()
      .filter(r => r.timestamp >= since && (!scorecard || r.scorecardName === scorecard))
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
      .slice(0, n)
  }

  count() {
    return this.readAll().length
  }
}
