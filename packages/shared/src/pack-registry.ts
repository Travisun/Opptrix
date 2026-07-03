export type MarketDataPackId = 'cn' | 'us' | 'crypto' | 'hk' | 'jp' | 'kr'

export interface MarketDataPackEntry {
  enabled: boolean
  prepared_at?: string | null
}

export interface PackDefinition {
  id: MarketDataPackId
  label: string
  description: string
  /** CN 不可关闭 */
  locked: boolean
  defaultEnabled: boolean
  syncJobs: readonly string[]
  phase: 'live' | 'partial' | 'planned'
}

export const PACK_REGISTRY: PackDefinition[] = [
  {
    id: 'cn',
    label: 'A 股',
    description: '默认开启：股票池、行情、因子与 ETF 等本地挖掘数据',
    locked: true,
    defaultEnabled: true,
    syncJobs: [], // filled by market-data PACK_JOBS merge
    phase: 'live',
  },
  {
    id: 'us',
    label: '美股',
    description: '开启后同步美股列表与本地行情截面',
    locked: false,
    defaultEnabled: false,
    syncJobs: ['us_list', 'us_quotes'],
    phase: 'live',
  },
  {
    id: 'crypto',
    label: 'Crypto',
    description: '开启后同步 Crypto 交易对列表',
    locked: false,
    defaultEnabled: false,
    syncJobs: ['crypto_list', 'crypto_quotes'],
    phase: 'live',
  },
  {
    id: 'hk',
    label: '港股',
    description: '港股列表与行情（Provider 筹备中，可先同步 instruments）',
    locked: false,
    defaultEnabled: false,
    syncJobs: ['hk_list'],
    phase: 'partial',
  },
  {
    id: 'jp',
    label: '日本股市',
    description: '日股列表与行情（MVP：本地 instruments 筛选 + Agent 挖掘）',
    locked: false,
    defaultEnabled: false,
    syncJobs: ['jp_list'],
    phase: 'planned',
  },
  {
    id: 'kr',
    label: '韩国股市',
    description: '韩股列表与行情（MVP：本地 instruments 筛选 + Agent 挖掘）',
    locked: false,
    defaultEnabled: false,
    syncJobs: ['kr_list'],
    phase: 'planned',
  },
]

export function getPackDefinition(pack: MarketDataPackId): PackDefinition | undefined {
  return PACK_REGISTRY.find(p => p.id === pack)
}

export function allPackIds(): MarketDataPackId[] {
  return PACK_REGISTRY.map(p => p.id)
}

export function buildDefaultMarketPackConfig(): Record<MarketDataPackId, MarketDataPackEntry> {
  const out = {} as Record<MarketDataPackId, MarketDataPackEntry>
  for (const pack of PACK_REGISTRY) {
    out[pack.id] = { enabled: pack.defaultEnabled || pack.locked }
  }
  out.cn.enabled = true
  return out
}

/** 合并用户存储的配置（向后兼容缺省 pack） */
export function normalizeMarketDataPackConfig(raw: unknown): Record<MarketDataPackId, MarketDataPackEntry> {
  const defaults = buildDefaultMarketPackConfig()
  const r = (raw && typeof raw === 'object') ? raw as Partial<Record<MarketDataPackId, Partial<MarketDataPackEntry>>> : {}
  const out = { ...defaults }
  for (const pack of PACK_REGISTRY) {
    const entry = r[pack.id]
    out[pack.id] = {
      enabled: pack.locked ? true : (entry?.enabled ?? defaults[pack.id].enabled),
      prepared_at: entry?.prepared_at ?? defaults[pack.id].prepared_at ?? null,
    }
  }
  return out
}

export type MarketDataPackConfig = Record<MarketDataPackId, MarketDataPackEntry>
