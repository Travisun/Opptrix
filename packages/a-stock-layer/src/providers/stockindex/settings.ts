import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'

/**
 * Opptrix量化 API 基地址 — 固定不可配置。
 * 获取数据密钥：https://quant.opptrix.net/
 */
export const STOCKINDEX_DEFAULT_BASE_URL = 'https://quant.opptrix.net'

export const STOCKINDEX_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'stockindex',
  title: 'Opptrix量化',
  subtitle: 'Opptrix量化社区提供的标的检索接口',
  marketGroup: 'GLOBAL',
  keywords: ['opptrixquant', 'stockindex', '标的搜索', '跨市场', '基金净值', '公募基金', '数据密钥'],
  enableAffectsPriority: true,
  supportsTest: true,
  fields: [
    { key: 'enabled', type: 'boolean', label: '启用', default: false },
    {
      key: 'apiKey',
      type: 'secret',
      label: '数据密钥',
      required: true,
      masked: true,
      placeholder: '粘贴 Opptrix量化 数据密钥',
      description: '在 Opptrix 量化社区获取后填入即可使用',
      helpUrl: 'https://quant.opptrix.net/',
    },
  ],
}

function runtimeRow() {
  return getUserDataStore().providerSettings.get('stockindex')
}

/** 未配置或显式关闭时均为未启用（默认关闭） */
export function isStockIndexEnabled(): boolean {
  const row = runtimeRow()
  return row?.enabled === true
}

/** Opptrix量化 数据密钥 — 优先设置页 extra.apiKey，其次环境变量（不写日志） */
export function stockIndexApiKey(): string {
  const row = runtimeRow()
  const fromSettings = String(row?.extra?.apiKey ?? '').trim()
  const fromEnv = process.env.OPPTRIX_STOCKINDEX_API_KEY?.trim()
  return fromSettings || fromEnv || ''
}

/** 基地址恒为 https://quant.opptrix.net（忽略用户/环境覆盖） */
export function stockIndexBaseUrl(): string {
  return STOCKINDEX_DEFAULT_BASE_URL
}
