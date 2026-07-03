import type {
  PublicProviderRuntime,
  ProviderCatalogGroup,
  ProviderCatalogResponse,
  ProviderSettingsField,
  TusharePublicConfigLegacy,
  PublicProviderBindingOverride,
  ProviderBindingOverridePatch,
} from '@opptrix/shared'
import type { DriverRegistry } from '../core/registry.js'
import { Capability } from '../core/capabilities.js'
import { testTushareConnection } from './tushare/api/client.js'
import { testPolygonConnection } from './polygon/api/client.js'
import { testTiingoConnection } from './tiingo/api/client.js'
import { testFmpConnection } from './fmp/api/client.js'
import { ProviderConfigStore, getProviderConfigStore } from './config-store.js'
import {
  MARKET_GROUP_LABELS,
  MARKET_GROUP_ORDER,
  getProviderManifest,
  listProviderManifests,
} from './manifests.js'

const TUSHARE_ENV = process.env.TUSHARE_TOKEN ?? ''

function maskSecretFields(
  extra: Record<string, unknown>,
  fields: ProviderSettingsField[],
): { values: Record<string, unknown>; secretsConfigured: Record<string, boolean> } {
  const values: Record<string, unknown> = {}
  const secretsConfigured: Record<string, boolean> = {}
  for (const field of fields) {
    if (field.type === 'secret') {
      const raw = extra[field.key]
      secretsConfigured[field.key] = !!String(raw ?? '').trim()
      values[field.key] = ''
    } else if (field.key in extra) {
      values[field.key] = extra[field.key]
    } else if (field.default !== undefined) {
      values[field.key] = field.default
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (!(key in values)) values[key] = value
  }
  return { values, secretsConfigured }
}

export class ProviderCatalogService {
  constructor(
    private registry: DriverRegistry,
    private configStore: ProviderConfigStore = getProviderConfigStore(),
  ) {}

  listCatalog(): ProviderCatalogResponse {
    const driverInfo = this.registry.listDriverInfo()
    const driverMap = new Map(driverInfo.map(d => [d.name, d]))
    const manifests = listProviderManifests().filter(m => driverMap.has(m.providerId))

    const runtimes: PublicProviderRuntime[] = manifests.map(manifest => {
      const driver = driverMap.get(manifest.providerId)!
      const runtime = this.configStore.getRuntime(manifest.providerId)
      const fields = manifest.settings?.fields ?? []
      const secretsOk = this.configStore.secretsOk(manifest.providerId, runtime)
      const effective = this.configStore.effectivePriority(manifest.providerId, manifest.defaultPriority)
      const { values, secretsConfigured } = maskSecretFields(runtime.extra, fields)
      for (const field of fields) {
        if (field.key === 'enabled' && field.type === 'boolean') {
          values.enabled = runtime.enabled
        }
      }
      return {
        providerId: manifest.providerId,
        title: manifest.title,
        subtitle: manifest.subtitle,
        marketGroup: manifest.marketGroup,
        enabled: runtime.enabled,
        priorityMode: runtime.priorityMode,
        priority: runtime.priority,
        effectivePriority: effective,
        manifestDefaultPriority: manifest.defaultPriority,
        secretsConfigured,
        canEnable: secretsOk || !this.configStore.requiresSecrets(manifest.providerId),
        values,
        settingsFields: fields,
        supportsTest: manifest.settings?.supportsTest ?? false,
        capabilities: driver.capabilities.map(String),
        updatedAt: runtime.updatedAt || undefined,
      }
    })

    const groups: ProviderCatalogGroup[] = []
    for (const marketGroup of MARKET_GROUP_ORDER) {
      const providers = runtimes
        .filter(r => r.marketGroup === marketGroup)
        .sort((a, b) => {
          const ao = this.configStore.getRuntime(a.providerId).sortOrder
          const bo = this.configStore.getRuntime(b.providerId).sortOrder
          if (ao != null && bo != null && ao !== bo) return ao - bo
          if (ao != null && bo == null) return -1
          if (ao == null && bo != null) return 1
          return b.effectivePriority - a.effectivePriority
        })
      if (!providers.length) continue
      groups.push({
        marketGroup,
        label: MARKET_GROUP_LABELS[marketGroup],
        providers,
      })
    }
    return { groups }
  }

  getPublic(providerId: string): PublicProviderRuntime | null {
    const catalog = this.listCatalog()
    for (const group of catalog.groups) {
      const found = group.providers.find(p => p.providerId === providerId)
      if (found) return found
    }
    return null
  }

  saveConfig(
    providerId: string,
    patch: {
      enabled?: boolean
      priorityMode?: 'manifest' | 'custom'
      priority?: number | null
      sortOrder?: number | null
      extra?: Record<string, unknown>
    },
  ): PublicProviderRuntime {
    const manifest = getProviderManifest(providerId)
    if (!manifest) throw new Error(`未知数据源: ${providerId}`)

    const current = this.configStore.getRuntime(providerId)
    this.configStore.save(providerId, {
      enabled: patch.enabled ?? current.enabled,
      priorityMode: patch.priorityMode ?? current.priorityMode,
      priority: patch.priority !== undefined ? patch.priority : current.priority,
      sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : current.sortOrder,
      extra: patch.extra,
    })

    this.registry.refreshPriorities(this.configStore)
    const pub = this.getPublic(providerId)
    if (!pub) throw new Error(`保存后无法读取: ${providerId}`)
    return pub
  }

  reorderMarketGroup(marketGroup: string, providerIds: string[]): ProviderCatalogResponse {
    const catalog = this.listCatalog()
    const group = catalog.groups.find(g => g.marketGroup === marketGroup)
    if (!group) throw new Error(`未知市场: ${marketGroup}`)

    const existingIds = new Set(group.providers.map(p => p.providerId))
    if (providerIds.length !== group.providers.length) {
      throw new Error('排序列表不完整')
    }
    for (const id of providerIds) {
      if (!existingIds.has(id)) {
        throw new Error(`数据源 ${id} 不属于 ${marketGroup}`)
      }
    }

    const n = providerIds.length
    for (let i = 0; i < n; i++) {
      const providerId = providerIds[i]!
      const current = this.configStore.getRuntime(providerId)
      this.configStore.save(providerId, {
        enabled: current.enabled,
        priorityMode: 'custom',
        priority: (n - i) * 10,
        sortOrder: i,
      })
    }

    this.registry.refreshPriorities(this.configStore)
    return this.listCatalog()
  }

  async testConnection(providerId: string, overrides?: Record<string, unknown>) {
    if (providerId === 'tushare') {
      const runtime = this.configStore.getRuntime(providerId)
      const token = String(overrides?.token ?? runtime.extra.token ?? TUSHARE_ENV).trim()
      return testTushareConnection(token)
    }
    if (providerId === 'polygon') {
      const runtime = this.configStore.getRuntime(providerId)
      const apiKey = String(overrides?.apiKey ?? runtime.extra.apiKey ?? process.env.POLYGON_API_KEY ?? '').trim()
      return testPolygonConnection(apiKey)
    }
    if (providerId === 'tiingo') {
      const runtime = this.configStore.getRuntime(providerId)
      const apiToken = String(
        overrides?.apiToken ?? runtime.extra.apiToken ?? process.env.TIINGO_API_TOKEN ?? '',
      ).trim()
      return testTiingoConnection(apiToken)
    }
    if (providerId === 'fmp') {
      const runtime = this.configStore.getRuntime(providerId)
      const apiKey = String(
        overrides?.apiKey ?? runtime.extra.apiKey ?? process.env.FMP_API_KEY ?? '',
      ).trim()
      return testFmpConnection(apiKey)
    }
    return { ok: true, message: '该数据源无需连接测试' }
  }

  listPublicBindingOverrides(providerId: string): PublicProviderBindingOverride[] {
    const driver = this.registry.get(providerId)
    if (!driver) return []
    const overrides = this.configStore.listBindingOverrides(providerId)
    const omap = new Map(
      overrides.map(o => [`${o.market}:${o.assetClass}:${o.capability}`, o]),
    )
    return driver.bindings().map(b => {
      const cap = b.capability as Capability
      const key = `${b.market}:${b.assetClass}:${b.capability}`
      const ov = omap.get(key)
      const effective = this.registry.getEffectivePriorityForBinding(
        providerId, b.market, b.assetClass, cap, b.defaultPriority,
      )
      return {
        market: b.market,
        assetClass: b.assetClass,
        capability: b.capability,
        label: `${b.market} · ${b.assetClass} · ${b.capability}`,
        manifestDefaultPriority: b.defaultPriority,
        overrideEnabled: ov?.enabled ?? null,
        overridePriority: ov?.priority ?? null,
        effectivePriority: effective,
      }
    }).sort((a, b) => b.effectivePriority - a.effectivePriority)
  }

  saveBindingOverride(
    providerId: string,
    market: string,
    assetClass: string,
    capability: string,
    patch: ProviderBindingOverridePatch,
  ): PublicProviderBindingOverride[] {
    const driver = this.registry.get(providerId)
    if (!driver) throw new Error(`未知数据源: ${providerId}`)
    if (!driver.bindings().some(
      b => b.market === market && b.assetClass === assetClass && b.capability === capability,
    )) {
      throw new Error('该数据源不支持此能力绑定')
    }
    this.configStore.saveBindingOverride(providerId, market, assetClass, capability, patch)
    this.registry.refreshPriorities(this.configStore)
    return this.listPublicBindingOverrides(providerId)
  }

  /** Legacy shape for /api/tushare/config */
  tusharePublicLegacy(): TusharePublicConfigLegacy {
    const runtime = this.configStore.getRuntime('tushare')
    const token = String(runtime.extra.token ?? TUSHARE_ENV).trim()
    return {
      enabled: runtime.enabled,
      token,
      token_configured: !!token,
      token_preview: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : '',
      config_path: this.configStore.configPath(),
    }
  }

  saveTushareLegacy(patch: { enabled?: boolean; token?: string }) {
    const current = this.configStore.getRuntime('tushare')
    const extra = { ...current.extra }
    if (patch.token !== undefined) {
      extra.token = String(patch.token).trim()
    }
    const saved = this.configStore.save('tushare', {
      enabled: patch.enabled ?? current.enabled,
      extra,
    })
    this.registry.refreshPriorities(this.configStore)
    void saved
    return this.tusharePublicLegacy()
  }
}

export function createProviderCatalog(registry: DriverRegistry): ProviderCatalogService {
  return new ProviderCatalogService(registry)
}
