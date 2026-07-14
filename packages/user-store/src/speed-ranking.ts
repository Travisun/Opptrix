/**
 * Provider 速度排序持久化层 — SQLite 存储运行时测速结果与缓存的排名。
 *
 * 流程：真实请求经 EMA 写入排名，TTL 到期后重建缓存。
 */

import type Database from 'better-sqlite3'

const MIGRATION_KEY = 'provider_speed_ranking_v1'

export interface SpeedRankingRow {
  provider_id: string
  capability: string
  avg_ms: number
  success_rate: number
  sample_count: number
  last_success_at: string | null
  last_failure_at: string | null
  blacklisted_until: string | null
  updated_at: string
}

export interface RankingCacheRow {
  binding_key: string
  ranked_ids: string
  cached_at: string
  ttl_ms: number
  is_empty: number
}

export function initSpeedRankingSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_speed_ranking (
      provider_id      TEXT NOT NULL,
      capability       TEXT NOT NULL,
      avg_ms           REAL NOT NULL DEFAULT 99999,
      success_rate     REAL NOT NULL DEFAULT 0,
      sample_count     INTEGER NOT NULL DEFAULT 0,
      last_success_at  TEXT,
      last_failure_at  TEXT,
      blacklisted_until TEXT,
      updated_at       TEXT NOT NULL,
      PRIMARY KEY (provider_id, capability)
    );

    CREATE TABLE IF NOT EXISTS provider_ranking_cache (
      binding_key  TEXT PRIMARY KEY,
      ranked_ids   TEXT NOT NULL,
      cached_at    TEXT NOT NULL,
      ttl_ms       INTEGER NOT NULL DEFAULT 1800000,
      is_empty     INTEGER NOT NULL DEFAULT 0
    );
  `)
}

// ── Speed Ranking CRUD ──

const UPSERT_RANKING = `
  INSERT INTO provider_speed_ranking
    (provider_id, capability, avg_ms, success_rate, sample_count,
     last_success_at, last_failure_at, blacklisted_until, updated_at)
  VALUES
    (@provider_id, @capability, @avg_ms, @success_rate, @sample_count,
     @last_success_at, @last_failure_at, @blacklisted_until, @updated_at)
  ON CONFLICT(provider_id, capability) DO UPDATE SET
    avg_ms = @avg_ms,
    success_rate = @success_rate,
    sample_count = @sample_count,
    last_success_at = @last_success_at,
    last_failure_at = @last_failure_at,
    blacklisted_until = @blacklisted_until,
    updated_at = @updated_at
`

const SELECT_RANKING = `
  SELECT * FROM provider_speed_ranking WHERE provider_id = ?
`

const SELECT_ALL_RANKINGS = `
  SELECT * FROM provider_speed_ranking WHERE capability = ?
`

const UPSERT_CACHE = `
  INSERT INTO provider_ranking_cache
    (binding_key, ranked_ids, cached_at, ttl_ms, is_empty)
  VALUES (@binding_key, @ranked_ids, @cached_at, @ttl_ms, @is_empty)
  ON CONFLICT(binding_key) DO UPDATE SET
    ranked_ids = @ranked_ids,
    cached_at = @cached_at,
    ttl_ms = @ttl_ms,
    is_empty = @is_empty
`

const SELECT_CACHE = `
  SELECT * FROM provider_ranking_cache WHERE binding_key = ?
`

export class SpeedRankingRepository {
  constructor(private db: Database.Database) {}

  saveRanking(row: SpeedRankingRow) {
    this.db.prepare(UPSERT_RANKING).run(row)
  }

  saveRankingBatch(rows: SpeedRankingRow[]) {
    const tx = this.db.transaction(() => {
      const stmt = this.db.prepare(UPSERT_RANKING)
      for (const row of rows) stmt.run(row)
    })
    tx()
  }

  getRanking(providerId: string): SpeedRankingRow[] {
    return this.db.prepare(SELECT_RANKING).all(providerId) as SpeedRankingRow[]
  }

  getRankingsForCapability(capability: string): SpeedRankingRow[] {
    return this.db.prepare(SELECT_ALL_RANKINGS).all(capability) as SpeedRankingRow[]
  }

  saveCache(row: RankingCacheRow) {
    this.db.prepare(UPSERT_CACHE).run(row)
  }

  getCache(bindingKey: string): RankingCacheRow | null {
    return this.db.prepare(SELECT_CACHE).get(bindingKey) as RankingCacheRow | null
  }

  clearAll() {
    this.db.exec('DELETE FROM provider_speed_ranking; DELETE FROM provider_ranking_cache;')
  }
}
