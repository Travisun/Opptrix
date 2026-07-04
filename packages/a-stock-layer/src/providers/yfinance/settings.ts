import type { MarketGroup, ProviderSettingsDefinition } from '@opptrix/shared'

export const YFINANCE_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'yfinance',
  title: 'Yahoo 财经',
  marketGroup: 'GLOBAL' as MarketGroup,
  keywords: ['yfinance', 'yahoo', 'Yahoo', '雅虎', 'Yahoo Finance', 'finance.yahoo.com'],
  enableAffectsPriority: true,
  supportsTest: true,
  fields: [
    {
      key: 'enabled',
      type: 'boolean',
      label: '启用',
      default: true,
    },
  ],
}
