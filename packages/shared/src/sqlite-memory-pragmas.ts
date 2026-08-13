/**
 * SQLite 每连接内存档位（cache_size / mmap_size / temp_store）。
 *
 * 不改 journal_mode / busy_timeout — 由各开库处自行保留 WAL 等行为。
 * 无 better-sqlite3 依赖：仅要求 `pragma()` 鸭子类型。
 *
 * 强制档位：`OPPTRIX_SQLITE_MEM_PROFILE=low|medium|high`
 * 未设置时按 `os.totalmem()`：<6GB → low，<12GB → medium，否则 high。
 */
import os from 'node:os'

export type SqliteMemProfile = 'low' | 'medium' | 'high'
export type SqliteMemRole = 'write' | 'read'

/** better-sqlite3 Database 的最小表面 */
export interface SqlitePragmaCapable {
  pragma(source: string, options?: { simple?: boolean }): unknown
}

export interface SqliteMemoryPragmaValues {
  profile: SqliteMemProfile
  role: SqliteMemRole
  /** 负值 = KiB（SQLite cache_size 约定） */
  cacheSizeKb: number
  mmapSize: number
  tempStore: 'FILE' | 'MEMORY'
}

const PROFILE_ENV = 'OPPTRIX_SQLITE_MEM_PROFILE'

/**
 * 档位预算（约每连接；多库并存时总占用 ≈ 连接数 × 档位）：
 * - low:    cache ~8MB， mmap 关，  temp FILE（低配 / 与 Electron+ONNX 共机更稳）
 * - medium: cache ~32MB，mmap ~32MB，temp MEMORY（默认桌面）
 * - high:   cache ~64MB，mmap ~64MB，temp MEMORY
 * read：同档或更保守（cache/mmap 各降一档量级，low 仍关 mmap）
 */
const WRITE_BUDGET: Record<SqliteMemProfile, Omit<SqliteMemoryPragmaValues, 'profile' | 'role'>> = {
  low: { cacheSizeKb: -8_192, mmapSize: 0, tempStore: 'FILE' },
  medium: { cacheSizeKb: -32_768, mmapSize: 32 * 1024 * 1024, tempStore: 'MEMORY' },
  high: { cacheSizeKb: -65_536, mmapSize: 64 * 1024 * 1024, tempStore: 'MEMORY' },
}

const READ_BUDGET: Record<SqliteMemProfile, Omit<SqliteMemoryPragmaValues, 'profile' | 'role'>> = {
  low: { cacheSizeKb: -8_192, mmapSize: 0, tempStore: 'FILE' },
  medium: { cacheSizeKb: -16_384, mmapSize: 16 * 1024 * 1024, tempStore: 'MEMORY' },
  high: { cacheSizeKb: -32_768, mmapSize: 32 * 1024 * 1024, tempStore: 'MEMORY' },
}

export function resolveSqliteMemProfile(
  env: NodeJS.ProcessEnv = process.env,
  totalMemBytes: number = os.totalmem(),
): SqliteMemProfile {
  const raw = String(env[PROFILE_ENV] ?? '').trim().toLowerCase()
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw
  const gb = totalMemBytes / (1024 ** 3)
  if (gb < 6) return 'low'
  if (gb < 12) return 'medium'
  return 'high'
}

export function sqliteMemoryPragmaValues(
  profile: SqliteMemProfile,
  role: SqliteMemRole = 'write',
): SqliteMemoryPragmaValues {
  const budget = role === 'read' ? READ_BUDGET[profile] : WRITE_BUDGET[profile]
  return { profile, role, ...budget }
}

export function applySqliteMemoryPragmas(
  db: SqlitePragmaCapable,
  role: SqliteMemRole = 'write',
  opts?: {
    profile?: SqliteMemProfile
    env?: NodeJS.ProcessEnv
    totalMemBytes?: number
  },
): SqliteMemoryPragmaValues {
  const profile =
    opts?.profile
    ?? resolveSqliteMemProfile(opts?.env ?? process.env, opts?.totalMemBytes ?? os.totalmem())
  const values = sqliteMemoryPragmaValues(profile, role)
  db.pragma(`cache_size = ${values.cacheSizeKb}`)
  db.pragma(`mmap_size = ${values.mmapSize}`)
  db.pragma(`temp_store = ${values.tempStore}`)
  return values
}
