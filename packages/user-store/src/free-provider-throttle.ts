import type Database from 'better-sqlite3'
import type {
  FreeProviderThrottleLogEntry,
  FreeProviderThrottleState,
} from '@opptrix/shared'

const LOG_RETENTION = 3000

export function initFreeProviderThrottleSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS free_provider_throttle (
      provider_id       TEXT PRIMARY KEY,
      escalation_level  INTEGER NOT NULL DEFAULT 0,
      cooldown_until    INTEGER NOT NULL DEFAULT 0,
      last_error        TEXT NOT NULL DEFAULT '',
      last_triggered_at INTEGER NOT NULL DEFAULT 0,
      updated_at        INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS free_provider_throttle_log (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id       TEXT NOT NULL,
      event             TEXT NOT NULL,
      detail            TEXT NOT NULL DEFAULT '',
      escalation_level  INTEGER NOT NULL DEFAULT 0,
      cooldown_until    INTEGER NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_free_provider_throttle_log_provider
      ON free_provider_throttle_log(provider_id, created_at DESC);
  `)
}

export class FreeProviderThrottleRepository {
  constructor(private db: Database.Database) {}

  get(providerId: string): FreeProviderThrottleState | null {
    const row = this.db.prepare(`
      SELECT provider_id, escalation_level, cooldown_until, last_error,
             last_triggered_at, updated_at
      FROM free_provider_throttle WHERE provider_id = ?
    `).get(providerId) as {
      provider_id: string
      escalation_level: number
      cooldown_until: number
      last_error: string
      last_triggered_at: number
      updated_at: number
    } | undefined

    if (!row) return null
    return {
      providerId: row.provider_id,
      escalationLevel: row.escalation_level,
      cooldownUntil: row.cooldown_until,
      lastError: row.last_error,
      lastTriggeredAt: row.last_triggered_at,
      updatedAt: row.updated_at,
    }
  }

  listAll(): FreeProviderThrottleState[] {
    const rows = this.db.prepare(`
      SELECT provider_id, escalation_level, cooldown_until, last_error,
             last_triggered_at, updated_at
      FROM free_provider_throttle
      ORDER BY cooldown_until DESC
    `).all() as Array<{
      provider_id: string
      escalation_level: number
      cooldown_until: number
      last_error: string
      last_triggered_at: number
      updated_at: number
    }>
    return rows.map(row => ({
      providerId: row.provider_id,
      escalationLevel: row.escalation_level,
      cooldownUntil: row.cooldown_until,
      lastError: row.last_error,
      lastTriggeredAt: row.last_triggered_at,
      updatedAt: row.updated_at,
    }))
  }

  upsert(state: FreeProviderThrottleState): void {
    this.db.prepare(`
      INSERT INTO free_provider_throttle
        (provider_id, escalation_level, cooldown_until, last_error, last_triggered_at, updated_at)
      VALUES
        (@providerId, @escalationLevel, @cooldownUntil, @lastError, @lastTriggeredAt, @updatedAt)
      ON CONFLICT(provider_id) DO UPDATE SET
        escalation_level = @escalationLevel,
        cooldown_until = @cooldownUntil,
        last_error = @lastError,
        last_triggered_at = @lastTriggeredAt,
        updated_at = @updatedAt
    `).run(state)
  }

  delete(providerId: string): void {
    this.db.prepare('DELETE FROM free_provider_throttle WHERE provider_id = ?').run(providerId)
  }

  clearAll(): void {
    this.db.exec('DELETE FROM free_provider_throttle')
  }

  appendLog(entry: Omit<FreeProviderThrottleLogEntry, 'id'>): void {
    this.db.prepare(`
      INSERT INTO free_provider_throttle_log
        (provider_id, event, detail, escalation_level, cooldown_until, created_at)
      VALUES
        (@providerId, @event, @detail, @escalationLevel, @cooldownUntil, @createdAt)
    `).run(entry)

    const count = this.db.prepare(
      'SELECT COUNT(*) AS c FROM free_provider_throttle_log',
    ).get() as { c: number }
    if (count.c > LOG_RETENTION) {
      const excess = count.c - LOG_RETENTION
      this.db.prepare(`
        DELETE FROM free_provider_throttle_log
        WHERE id IN (
          SELECT id FROM free_provider_throttle_log
          ORDER BY created_at ASC
          LIMIT ?
        )
      `).run(excess)
    }
  }

  listLogs(providerId?: string, limit = 100): FreeProviderThrottleLogEntry[] {
    const rows = providerId
      ? this.db.prepare(`
          SELECT id, provider_id, event, detail, escalation_level, cooldown_until, created_at
          FROM free_provider_throttle_log
          WHERE provider_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(providerId, limit)
      : this.db.prepare(`
          SELECT id, provider_id, event, detail, escalation_level, cooldown_until, created_at
          FROM free_provider_throttle_log
          ORDER BY created_at DESC
          LIMIT ?
        `).all(limit)

    return (rows as Array<{
      id: number
      provider_id: string
      event: string
      detail: string
      escalation_level: number
      cooldown_until: number
      created_at: number
    }>).map(row => ({
      id: row.id,
      providerId: row.provider_id,
      event: row.event as FreeProviderThrottleLogEntry['event'],
      detail: row.detail,
      escalationLevel: row.escalation_level,
      cooldownUntil: row.cooldown_until,
      createdAt: row.created_at,
    }))
  }
}
