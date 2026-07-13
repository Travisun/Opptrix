import type {
  PublicProviderRuntime,
  ProviderCatalogGroup,
  ProviderCatalogResponse,
  ProviderSettingsField,
  TusharePublicConfigLegacy,
  PublicProviderBindingOverride,
  ProviderBindingOverridePatch,
  ProviderPriorityMode,
  MarketGroup,
} from '@opptrix/shared'
import {
  assignSortOrders,
  computeEffectiveRanks,
  isProviderPriorityEligible,
  providerRequiresApiKey,
  sortProvidersForCatalog,
} from '@opptrix/shared'
import type { DriverRegistry } from '../core/registry.js'
import { Capability } from '../core/capabilities.js'
import { ProviderConfigStore, getProviderConfigStore } from './config-store.js'
import { getProviderLoader } from './loader.js'
import {
  MARKET_GROUP_LABELS,
  MARKET_GROUP_ORDER,
  getProviderManifest,
  listProviderManifests,
} from './manifests.js'

const TUSHARE_ENV = process.env.TUSHARE_TOKEN ?? ''

/** 设置页 / 行情回退链：至少绑定一项标准能力；纯自定义方法源（如 akshare）不展示 */
function isMarketDataCatalogProvider(registry: DriverRegistry, providerId: string): boolean {
  const driver = registry.get(providerId)
  return !!driver && driver.bindings().length > 0
}

function maskSecretFields(
  extra: Record<string, unknown>,
  fields: ProviderSettingsField[],
): { values: Record<string, unknown>; secretsConfigured: Record<string, boolean>; secretPreviews: Record<string, string> } {
  const values: Record<string, unknown> = {}
  const secretsConfigured: Record<string, boolean> = {}
  const secretPreviews: Record<string, string> = {}
  for (const field of fields) {
    if (field.type === 'secret') {
      const raw = String(extra[field.key] ?? '').trim()
      secretsConfigured[field.key] = !!raw
      values[field.key] = raw
      if (raw) {
        secretPreviews[field.key] = raw.length >= 8
          ? `${raw.slice(0, 4)}…${raw.slice(-4)}`
          : '已配置'
      }
    } else if (field.key in extra) {
      values[field.key] = extra[field.key]
    } else if (field.default !== undefined) {
      values[field.key] = field.default
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (!(key in values)) values[key] = value
  }
  return { values, secretsConfigured, secretPreviews }
}

/** Keys stored in provider_settings.extra_json — not top-level columns like enabled. */
function normalizeProviderExtraPatch(
  fields: ProviderSettingsField[],
  raw?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!raw) return undefined
  const allowed = new Set(
    fields.filter(f => f.key !== 'enabled').map(f => f.key),
  )
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key) || value === undefined) continue
    extra[key] = value
  }
  return Object.keys(extra).length ? extra : undefined
}

export class ProviderCatalogService {
  constructor(
    private registry: DriverRegistry,
    private configStore: ProviderConfigStore = getProviderConfigStore(),
  ) {}

  listCatalog(): ProviderCatalogResponse {
    const driverInfo = this.registry.listDriverInfo()
    const driverMap = new Map(driverInfo.map(d => [d.name, d]))
    const manifests = listProviderManifests().filter(m =>
      isMarketDataCatalogProvider(this.registry, m.providerId),
    )

    const runtimes: PublicProviderRuntime[] = manifests.map(manifest => {
      const driver = driverMap.get(manifest.providerId)!
      const runtime = this.configStore.getRuntime(manifest.providerId)
      const fields = manifest.settings?.fields ?? []
      const secretsOk = this.configStore.secretsOk(manifest.providerId, runtime)
      const effective = this.configStore.effectivePriority(manifest.providerId, manifest.defaultPriority)
      const { values, secretsConfigured, secretPreviews } = maskSecretFields(runtime.extra, fields)
      for (const field of fields) {
        if (field.key === 'enabled' && field.type === 'boolean') {
          values.enabled = runtime.enabled
        }
      }
      const requiresApiKey = providerRequiresApiKey(fields)
      const priorityEligible = isProviderPriorityEligible(runtime.enabled, secretsOk)
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
        secretPreviews,
        canEnable: secretsOk || !this.configStore.requiresSecrets(manifest.providerId),
        values,
        settingsFields: fields,
        supportsTest: manifest.settings?.supportsTest ?? false,
        capabilities: driver.capabilities.map(String),
        updatedAt: runtime.updatedAt || undefined,
        sortOrder: runtime.sortOrder,
        requiresApiKey,
        priorityEligible,
        effectiveRank: null,
      }
    })

    const sorted = sortProvidersForCatalog(runtimes)
    const rankMap = computeEffectiveRanks(sorted)
    for (const provider of sorted) {
      provider.effectiveRank = rankMap.get(provider.providerId) ?? null
    }

    const groups: ProviderCatalogGroup[] = []
    for (const marketGroup of MARKET_GROUP_ORDER) {
      const providers = sorted.filter(r => r.marketGroup === marketGroup)
      if (!providers.length) continue
      groups.push({
        marketGroup,
        label: MARKET_GROUP_LABELS[marketGroup],
        providers,
      })
    }
    return { groups, providers: sorted }
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
      extra?: Record<string, unknown>
      priorityMode?: ProviderPriorityMode
      priority?: number | null
      sortOrder?: number | null
    },
  ): PublicProviderRuntime {
    const manifest = getProviderManifest(providerId)
    if (!manifest) throw new Error(`未知数据源: ${providerId}`)

    const fields = manifest.settings?.fields ?? []
    const current = this.configStore.getRuntime(providerId)
    const extra = normalizeProviderExtraPatch(fields, patch.extra)
    if (extra && providerId === 'tickflow') {
      delete extra.baseUrl
    }

    let enabled = patch.enabled ?? current.enabled
    if (extra && fields.some(
      field => field.type === 'secret' && String(extra[field.key] ?? '').trim(),
    )) {
      enabled = true
    }

    this.configStore.save(providerId, {
      enabled,
      extra,
      priorityMode: patch.priorityMode,
      priority: patch.priority,
      sortOrder: patch.sortOrder,
    })

    this.registry.refreshPriorities(this.configStore)
    const pub = this.getPublic(providerId)
    if (!pub) throw new Error(`保存后无法读取: ${providerId}`)
    return pub
  }

  saveProviderOrder(orderedProviderIds: string[]): ProviderCatalogResponse {
    const allowed = listProviderManifests()
      .filter(m => isMarketDataCatalogProvider(this.registry, m.providerId))
      .map(m => m.providerId)

    if (!orderedProviderIds.length) {
      throw new Error('排序列表不能为空')
    }
    if (new Set(orderedProviderIds).size !== orderedProviderIds.length) {
      throw new Error('排序列表包含重复项')
    }
    const allowedSet = new Set(allowed)
    for (const id of orderedProviderIds) {
      if (!allowedSet.has(id)) {
        throw new Error(`未知数据源: ${id}`)
      }
    }
    if (orderedProviderIds.length !== allowed.length) {
      throw new Error('排序列表须包含全部数据源')
    }

    for (const row of assignSortOrders(orderedProviderIds)) {
      this.configStore.save(row.providerId, { sortOrder: row.sortOrder })
    }

    this.registry.refreshPriorities(this.configStore)
    return this.listCatalog()
  }

  async testConnection(providerId: string, overrides?: Record<string, unknown>) {
    const loader = getProviderLoader()
    const hook = loader?.getTestConnectionHook(providerId)
    const runtime = this.configStore.getRuntime(providerId)

    if (hook) {
      return hook({
        providerId,
        overrides,
        extra: runtime.extra,
      })
    }

    const manifest = getProviderManifest(providerId)
    if (manifest?.settings?.supportsTest) {
      const secretsOk = this.configStore.secretsOk(providerId, runtime)
      if (!secretsOk) {
        return { ok: false, message: '请先填写必需的密钥后再测试连接' }
      }
      return { ok: true, message: '密钥已配置' }
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
