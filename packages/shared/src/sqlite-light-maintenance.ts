/**
 * 低频 SQLite 轻维护：优先 incremental_vacuum（若 auto_vacuum=INCREMENTAL），
 * 否则 wal_checkpoint(TRUNCATE)；全库 VACUUM 仅 opt-in（默认关）。
 *
 * 不改 journal_mode / busy_timeout；失败由调用方 swallow。
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from './paths.js'
import type { SqlitePragmaCapable } from './sqlite-memory-pragmas.js'

/** 默认最少间隔 7 天 */
export const DEFAULT_SQLITE_LIGHT_MAINTENANCE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

const STAMP_FILE = 'sqlite-light-maintenance.json'
const VACUUM_ENV = 'OPPTRIX_SQLITE_VACUUM'
const INTERVAL_ENV = 'OPPTRIX_SQLITE_MAINTENANCE_INTERVAL_MS'

export type SqliteAutoVacuumMode = 'none' | 'full' | 'incremental' | 'unknown'

export type SqliteLightMaintenanceResult = {
  autoVacuum: SqliteAutoVacuumMode
  /** 是否执行了 incremental_vacuum */
  incrementalVacuum: boolean
  /** 是否执行了 wal_checkpoint(TRUNCATE) */
  walCheckpoint: boolean
  /** 是否执行了全库 VACUUM */
  vacuum: boolean
}

export type SqliteLightMaintenanceOpts = {
  /**
   * 允许全库 VACUUM（昂贵）。默认读 env `OPPTRIX_SQLITE_VACUUM=1`。
   * 未开启时仅 checkpoint / incremental_vacuum。
   */
  allowVacuum?: boolean
  /** incremental_vacuum 页数上限（默认 2048） */
  incrementalPages?: number
}

type StampFile = {
  lastRunAtMs?: number
}

function asNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function resolveSqliteVacuumEnabled(
  env: NodeJS.ProcessEnv = process.env,
  override?: boolean,
): boolean {
  if (typeof override === 'boolean') return override
  const raw = String(env[VACUUM_ENV] ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

export function resolveSqliteLightMaintenanceIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = asNumber(env[INTERVAL_ENV])
  if (raw != null && raw >= 60_000) return Math.floor(raw)
  return DEFAULT_SQLITE_LIGHT_MAINTENANCE_INTERVAL_MS
}

export function sqliteLightMaintenanceStampPath(root = resolveUserDataRoot()): string {
  return path.join(root, STAMP_FILE)
}

export function readSqliteLightMaintenanceStamp(
  stampPath = sqliteLightMaintenanceStampPath(),
): StampFile {
  try {
    if (!fs.existsSync(stampPath)) return {}
    const parsed = JSON.parse(fs.readFileSync(stampPath, 'utf8')) as StampFile
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeSqliteLightMaintenanceStamp(
  atMs: number,
  stampPath = sqliteLightMaintenanceStampPath(),
): void {
  fs.mkdirSync(path.dirname(stampPath), { recursive: true })
  const next: StampFile = { lastRunAtMs: atMs }
  fs.writeFileSync(stampPath, JSON.stringify(next), 'utf8')
}

export function isSqliteLightMaintenanceDue(opts?: {
  nowMs?: number
  intervalMs?: number
  stampPath?: string
  env?: NodeJS.ProcessEnv
}): boolean {
  const now = opts?.nowMs ?? Date.now()
  const interval = opts?.intervalMs
    ?? resolveSqliteLightMaintenanceIntervalMs(opts?.env ?? process.env)
  const stamp = readSqliteLightMaintenanceStamp(opts?.stampPath)
  const last = stamp.lastRunAtMs
  if (last == null || !Number.isFinite(last)) return true
  return now - last >= interval
}

function readAutoVacuum(db: SqlitePragmaCapable): SqliteAutoVacuumMode {
  try {
    const raw = db.pragma('auto_vacuum', { simple: true })
    const n = asNumber(raw)
    if (n === 0) return 'none'
    if (n === 1) return 'full'
    if (n === 2) return 'incremental'
  } catch {
    /* ignore */
  }
  return 'unknown'
}

/**
 * 对已打开的写连接做轻量维护（无 due 判断；调用方负责低频）。
 */
export function runSqliteLightMaintenance(
  db: SqlitePragmaCapable,
  opts?: SqliteLightMaintenanceOpts,
): SqliteLightMaintenanceResult {
  const allowVacuum = resolveSqliteVacuumEnabled(process.env, opts?.allowVacuum)
  const pages = Math.max(1, Math.min(opts?.incrementalPages ?? 2048, 100_000))
  const autoVacuum = readAutoVacuum(db)

  let incrementalVacuum = false
  let walCheckpoint = false
  let vacuum = false

  if (autoVacuum === 'incremental') {
    try {
      db.pragma(`incremental_vacuum(${pages})`)
      incrementalVacuum = true
    } catch {
      /* swallow — 调用方可再试 checkpoint */
    }
  }

  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    walCheckpoint = true
  } catch {
    /* busy / 非 WAL：忽略 */
  }

  if (allowVacuum) {
    try {
      // better-sqlite3：exec VACUUM；无 exec 时退回 pragma 不可用，跳过
      const exec = (db as { exec?: (sql: string) => unknown }).exec
      if (typeof exec === 'function') {
        exec.call(db, 'VACUUM')
        vacuum = true
      }
    } catch {
      /* 锁竞争等：跳过全库 VACUUM */
    }
  }

  return { autoVacuum, incrementalVacuum, walCheckpoint, vacuum }
}
