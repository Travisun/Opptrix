import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'

/** OpptrixQuant 默认基地址 — https://quant.opptrix.net */
export const STOCKINDEX_DEFAULT_BASE_URL = 'https://quant.opptrix.net'

/** 旧默认域名 — 用户库内若仍保存则自动映射到新地址 */
const LEGACY_STOCKINDEX_BASE_URLS = new Set([
  'https://open-stock.lirdb.com',
  'http://open-stock.lirdb.com',
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
  title: 'OpptrixQuant',
  marketGroup: 'GLOBAL',
  keywords: ['opptrixquant', 'stockindex', '标的搜索', '跨市场', '基金净值', '公募基金', 'api key'],
  enableAffectsPriority: true,
  supportsTest: false,
  fields: [
    { key: 'enabled', type: 'boolean', label: '启用', default: false },
    {
      key: 'apiKey',
      type: 'secret',
      label: 'API Key',
      required: true,
      masked: true,
      placeholder: '粘贴 OpptrixQuant API Key',
    },
    {
      key: 'baseUrl',
      type: 'string',
      label: '服务地址',
      description: 'OpptrixQuant API 根地址（需 API Key）',
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

/** OpptrixQuant API Key — 优先设置页 extra.apiKey，其次环境变量 */
export function stockIndexApiKey(): string {
  const row = runtimeRow()
  const fromSettings = String(row?.extra?.apiKey ?? '').trim()
  const fromEnv = process.env.OPPTRIX_STOCKINDEX_API_KEY?.trim()
  return fromSettings || fromEnv || ''
}

export function stockIndexBaseUrl(): string {
  const row = runtimeRow()
  const fromSettings = String(row?.extra?.baseUrl ?? '').trim()
  const fromEnv = process.env.OPPTRIX_STOCKINDEX_BASE_URL?.trim()
  const raw = fromSettings || fromEnv || STOCKINDEX_DEFAULT_BASE_URL
  return normalizeStockIndexBaseUrl(raw)
}
