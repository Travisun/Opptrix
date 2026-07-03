import type Database from 'better-sqlite3'
import type {
  ProviderPriorityMode,
  ProviderSettingsPatch,
  ProviderSettingsRow,
  ProviderBindingOverrideRow,
  ProviderBindingOverridePatch,
} from '@opptrix/shared'

const MIGRATION_KEY = 'provider_settings_v1'

export function initProviderSettingsSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_settings (
      provider_id     TEXT PRIMARY KEY,
      enabled         INTEGER NOT NULL DEFAULT 1,
      priority_mode   TEXT NOT NULL DEFAULT 'manifest',
      priority        INTEGER,
      sort_order      INTEGER,
      extra_json      TEXT NOT NULL DEFAULT '{}',
      updated_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_provider_settings_enabled
      ON provider_settings(enabled);

    CREATE TABLE IF NOT EXISTS provider_binding_overrides (
      provider_id     TEXT NOT NULL,
      market          TEXT NOT NULL,
      asset_class     TEXT NOT NULL,
      capability      TEXT NOT NULL,
      enabled         INTEGER,
      priority        INTEGER,
      updated_at      TEXT NOT NULL,
      PRIMARY KEY (provider_id, market, asset_class, capability),
      FOREIGN KEY (provider_id) REFERENCES provider_settings(provider_id) ON DELETE CASCADE
    );
  `)
}

function rowToModel(row: {
  provider_id: string
  enabled: number
  priority_mode: string
  priority: number | null
  sort_order: number | null
  extra_json: string
  updated_at: string
}): ProviderSettingsRow {
  let extra: Record<string, unknown> = {}
  try {
    extra = JSON.parse(row.extra_json) as Record<string, unknown>
  } catch { /* empty */ }
  return {
    providerId: row.provider_id,
    enabled: row.enabled !== 0,
    priorityMode: row.priority_mode === 'custom' ? 'custom' : 'manifest',
    priority: row.priority,
    sortOrder: row.sort_order,
    extra,
    updatedAt: row.updated_at,
  }
}

export class ProviderSettingsRepository {
  constructor(private db: Database.Database) {}

  migrateFromLegacy(hasMigration: (key: string) => boolean, markMigration: (key: string) => void, getDocument: <T>(ns: string, id: string) => T | null) {
    if (hasMigration(MIGRATION_KEY)) return
    const legacy = getDocument<{ enabled?: boolean; token?: string }>('tushare_config', 'default')
    if (legacy) {
      const token = String(legacy.token ?? '').trim()
      this.save('tushare', {
        enabled: legacy.enabled ?? false,
        priorityMode: 'manifest',
        extra: token ? { token } : {},
      })
    }
    markMigration(MIGRATION_KEY)
  }

  get(providerId: string): ProviderSettingsRow | null {
    const row = this.db.prepare(
      'SELECT * FROM provider_settings WHERE provider_id = ?',
    ).get(providerId) as {
      provider_id: string
      enabled: number
      priority_mode: string
      priority: number | null
      sort_order: number | null
      extra_json: string
      updated_at: string
    } | undefined
    return row ? rowToModel(row) : null
  }

  getOrDefaults(providerId: string): ProviderSettingsRow {
    return this.get(providerId) ?? {
      providerId,
      enabled: true,
      priorityMode: 'manifest',
      priority: null,
      sortOrder: null,
      extra: {},
      updatedAt: '',
    }
  }

  listAll(): ProviderSettingsRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM provider_settings ORDER BY sort_order ASC, provider_id ASC',
    ).all() as Array<{
      provider_id: string
      enabled: number
      priority_mode: string
      priority: number | null
      sort_order: number | null
      extra_json: string
      updated_at: string
    }>
    return rows.map(rowToModel)
  }

  save(providerId: string, patch: ProviderSettingsPatch): ProviderSettingsRow {
    const current = this.getOrDefaults(providerId)
    const extra = { ...current.extra }
    if (patch.extra) {
      for (const [key, value] of Object.entries(patch.extra)) {
        if (value === '' && typeof current.extra[key] === 'string' && current.extra[key]) {
          continue
        }
        if (value !== undefined) extra[key] = value
      }
    }
    const next: ProviderSettingsRow = {
      providerId,
      enabled: patch.enabled ?? current.enabled,
      priorityMode: patch.priorityMode ?? current.priorityMode,
      priority: patch.priority !== undefined ? patch.priority : current.priority,
      sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : current.sortOrder,
      extra,
      updatedAt: new Date().toISOString(),
    }
    this.db.prepare(`
      INSERT INTO provider_settings(
        provider_id, enabled, priority_mode, priority, sort_order, extra_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        enabled = excluded.enabled,
        priority_mode = excluded.priority_mode,
        priority = excluded.priority,
        sort_order = excluded.sort_order,
        extra_json = excluded.extra_json,
        updated_at = excluded.updated_at
    `).run(
      next.providerId,
      next.enabled ? 1 : 0,
      next.priorityMode,
      next.priority,
      next.sortOrder,
      JSON.stringify(next.extra),
      next.updatedAt,
    )
    return next
  }

  listBindingOverrides(providerId: string): ProviderBindingOverrideRow[] {
    const rows = this.db.prepare(`
      SELECT provider_id, market, asset_class, capability, enabled, priority, updated_at
      FROM provider_binding_overrides
      WHERE provider_id = ?
      ORDER BY market, asset_class, capability
    `).all(providerId) as Array<{
      provider_id: string
      market: string
      asset_class: string
      capability: string
      enabled: number | null
      priority: number | null
      updated_at: string
    }>
    return rows.map(r => ({
      providerId: r.provider_id,
      market: r.market as ProviderBindingOverrideRow['market'],
      assetClass: r.asset_class as ProviderBindingOverrideRow['assetClass'],
      capability: r.capability,
      enabled: r.enabled == null ? null : r.enabled !== 0,
      priority: r.priority,
      updatedAt: r.updated_at,
    }))
  }

  getBindingOverride(
    providerId: string,
    market: string,
    assetClass: string,
    capability: string,
  ): ProviderBindingOverrideRow | null {
    const row = this.db.prepare(`
      SELECT provider_id, market, asset_class, capability, enabled, priority, updated_at
      FROM provider_binding_overrides
      WHERE provider_id = ? AND market = ? AND asset_class = ? AND capability = ?
    `).get(providerId, market, assetClass, capability) as {
      provider_id: string
      market: string
      asset_class: string
      capability: string
      enabled: number | null
      priority: number | null
      updated_at: string
    } | undefined
    if (!row) return null
    return {
      providerId: row.provider_id,
      market: row.market as ProviderBindingOverrideRow['market'],
      assetClass: row.asset_class as ProviderBindingOverrideRow['assetClass'],
      capability: row.capability,
      enabled: row.enabled == null ? null : row.enabled !== 0,
      priority: row.priority,
      updatedAt: row.updated_at,
    }
  }

  saveBindingOverride(
    providerId: string,
    market: string,
    assetClass: string,
    capability: string,
    patch: ProviderBindingOverridePatch,
  ): ProviderBindingOverrideRow {
    const current = this.getBindingOverride(providerId, market, assetClass, capability)
    const next = {
      providerId,
      market: market as ProviderBindingOverrideRow['market'],
      assetClass: assetClass as ProviderBindingOverrideRow['assetClass'],
      capability,
      enabled: patch.enabled !== undefined ? patch.enabled : (current?.enabled ?? null),
      priority: patch.priority !== undefined ? patch.priority : (current?.priority ?? null),
      updatedAt: new Date().toISOString(),
    }
    this.db.prepare(`
      INSERT INTO provider_binding_overrides(
        provider_id, market, asset_class, capability, enabled, priority, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, market, asset_class, capability) DO UPDATE SET
        enabled = excluded.enabled,
        priority = excluded.priority,
        updated_at = excluded.updated_at
    `).run(
      providerId,
      market,
      assetClass,
      capability,
      next.enabled == null ? null : (next.enabled ? 1 : 0),
      next.priority,
      next.updatedAt,
    )
    return next
  }
}

export function computeEffectivePriority(
  providerId: string,
  manifestDefault: number,
  runtime: ProviderSettingsRow,
  secretsOk: boolean,
): number {
  if (!runtime.enabled) return 0
  if (!secretsOk) return 0
  if (runtime.priorityMode === 'custom' && runtime.priority != null) {
    return runtime.priority
  }
  return manifestDefault
}

export function tushareSecretsOk(extra: Record<string, unknown>, envToken = ''): boolean {
  return !!String(extra.token ?? envToken).trim()
}

export function polygonSecretsOk(extra: Record<string, unknown>, envKey = ''): boolean {
  return !!String(extra.apiKey ?? envKey).trim()
}

export function fmpSecretsOk(extra: Record<string, unknown>, envKey = ''): boolean {
  return !!String(extra.apiKey ?? envKey).trim()
}

export function tiingoSecretsOk(extra: Record<string, unknown>, envToken = ''): boolean {
  return !!String(extra.apiToken ?? envToken).trim()
}

export function tickflowSecretsOk(extra: Record<string, unknown>, envKey = ''): boolean {
  return !!String(extra.apiKey ?? envKey).trim()
}
