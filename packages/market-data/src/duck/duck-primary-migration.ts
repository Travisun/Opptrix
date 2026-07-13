import type Database from 'better-sqlite3'

export const DUCK_PRIMARY_MIGRATION_JOB = 'duck_primary_migration'

export type DuckPrimaryMigrationStatus = 'pending' | 'complete'

export function readDuckPrimaryMigrationStatus(db: Database.Database): DuckPrimaryMigrationStatus | null {
  const row = db.prepare(
    `SELECT meta_json FROM sync_cursor WHERE job_name = ?`,
  ).get(DUCK_PRIMARY_MIGRATION_JOB) as { meta_json: string | null } | undefined
  if (!row?.meta_json) return null
  try {
    const meta = JSON.parse(row.meta_json) as { status?: string }
    if (meta.status === 'complete') return 'complete'
    if (meta.status === 'pending') return 'pending'
    return null
  } catch {
    return null
  }
}

export function isDuckPrimaryMigrationComplete(db: Database.Database): boolean {
  return readDuckPrimaryMigrationStatus(db) === 'complete'
}

export function isDuckPrimaryMigrationMarked(db: Database.Database): boolean {
  return readDuckPrimaryMigrationStatus(db) != null
}

export function markDuckPrimaryMigrationComplete(db: Database.Database): void {
  const ts = new Date().toISOString()
  db.prepare(`
    INSERT OR REPLACE INTO sync_cursor (job_name, last_success_at, meta_json)
    VALUES (?, ?, ?)
  `).run(
    DUCK_PRIMARY_MIGRATION_JOB,
    ts,
    JSON.stringify({ status: 'complete', version: 1, completed_at: ts }),
  )
}

/** 重置门控为 pending — copy 进 SQLite 后须再跑主存储迁移 */
export function resetDuckPrimaryMigrationPending(db: Database.Database): void {
  db.prepare(`
    INSERT OR REPLACE INTO sync_cursor (job_name, last_success_at, meta_json)
    VALUES (?, NULL, ?)
  `).run(
    DUCK_PRIMARY_MIGRATION_JOB,
    JSON.stringify({ status: 'pending', version: 1 }),
  )
}
