import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'

export const STOCKINDEX_DEFAULT_BASE_URL = 'https://open-stock.lirdb.com'

/** 旧默认域名 — 用户库内若仍保存则自动映射到新地址 */
const LEGACY_STOCKINDEX_BASE_URLS = new Set([
  'https://stock-index.cuishushu.com',
  'http://stock-index.cuishushu.com',
])

function normalizeStockIndexBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/$/, '')
  if (LEGACY_STOCKINDEX_BASE_URLS.has(trimmed)) return STOCKINDEX_DEFAULT_BASE_URL
  return trimmed
}

export const STOCKINDEX_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'stockindex',
  title: 'StockIndex',
  marketGroup: 'GLOBAL',
  keywords: ['stockindex', 'stock index', '标的搜索', '跨市场', '板块', '申万'],
  enableAffectsPriority: true,
  supportsTest: false,
  fields: [
    { key: 'enabled', type: 'boolean', label: '启用', default: true },
    {
      key: 'baseUrl',
      type: 'string',
      label: '服务地址',
      description: 'StockIndex 公开 API 根地址（无需鉴权）',
      default: STOCKINDEX_DEFAULT_BASE_URL,
      placeholder: STOCKINDEX_DEFAULT_BASE_URL,
    },
  ],
}

function runtimeRow() {
  return getUserDataStore().providerSettings.get('stockindex')
}

export function isStockIndexEnabled(): boolean {
  const row = runtimeRow()
  return row?.enabled !== false
}

export function stockIndexBaseUrl(): string {
  const row = runtimeRow()
  const fromSettings = String(row?.extra?.baseUrl ?? '').trim()
  const fromEnv = process.env.OPPTRIX_STOCKINDEX_BASE_URL?.trim()
  const raw = fromSettings || fromEnv || STOCKINDEX_DEFAULT_BASE_URL
  return normalizeStockIndexBaseUrl(raw)
}
