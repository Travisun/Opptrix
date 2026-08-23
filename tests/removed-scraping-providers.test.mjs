import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { REMOVED_SCRAPING_PROVIDER_IDS } from '@opptrix/shared'
import {
  ProviderSettingsRepository,
  initProviderSettingsSchema,
  initFreeProviderThrottleSchema,
  initSpeedRankingSchema,
} from '../packages/user-store/dist/index.js'

describe('purge removed scraping providers', () => {
  it('deletes stale provider config, throttle and speed rows', () => {
    const db = new Database(':memory:')
    initProviderSettingsSchema(db)
    initFreeProviderThrottleSchema(db)
    initSpeedRankingSchema(db)

    const repo = new ProviderSettingsRepository(db)
    const migrations = new Set()
    const now = new Date().toISOString()

    for (const id of REMOVED_SCRAPING_PROVIDER_IDS) {
      repo.save(id, { enabled: false })
      db.prepare(
        'INSERT INTO free_provider_throttle (provider_id, escalation_level, updated_at) VALUES (?, 1, ?)',
      ).run(id, now)
      db.prepare(
        'INSERT INTO free_provider_throttle_log (provider_id, event, created_at) VALUES (?, ?, ?)',
      ).run(id, 'test', Date.now())
      db.prepare(
        'INSERT INTO provider_speed_ranking (provider_id, capability, updated_at) VALUES (?, ?, ?)',
      ).run(id, 'realtime', now)
    }
    db.prepare(
      'INSERT INTO provider_ranking_cache (binding_key, ranked_ids, cached_at) VALUES (?, ?, ?)',
    ).run('cn:equity:realtime', '["tencent"]', now)

    repo.purgeRemovedScrapingProviders(
      key => migrations.has(key),
      key => migrations.add(key),
    )

    for (const id of REMOVED_SCRAPING_PROVIDER_IDS) {
      assert.equal(repo.get(id), null)
      assert.equal(
        db.prepare('SELECT COUNT(*) AS n FROM free_provider_throttle WHERE provider_id = ?').get(id).n,
        0,
      )
      assert.equal(
        db.prepare('SELECT COUNT(*) AS n FROM free_provider_throttle_log WHERE provider_id = ?').get(id).n,
        0,
      )
      assert.equal(
        db.prepare('SELECT COUNT(*) AS n FROM provider_speed_ranking WHERE provider_id = ?').get(id).n,
        0,
      )
    }
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM provider_ranking_cache').get().n,
      0,
    )
    assert.ok(migrations.has('scraping_providers_removed_v2'))
    assert.ok(migrations.has('webfeed_removed_v1'))
  })

  it('is idempotent', () => {
    const db = new Database(':memory:')
    initProviderSettingsSchema(db)
    initFreeProviderThrottleSchema(db)
    initSpeedRankingSchema(db)

    const repo = new ProviderSettingsRepository(db)
    const migrations = new Set()

    repo.purgeRemovedScrapingProviders(
      key => migrations.has(key),
      key => migrations.add(key),
    )
    repo.purgeRemovedScrapingProviders(
      key => migrations.has(key),
      key => migrations.add(key),
    )

    assert.equal(migrations.size, 2)
  })
})
