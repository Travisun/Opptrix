import type { MarketGroup, ProviderSettingsDefinition } from '@opptrix/shared'

export const EASTMONEY_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'eastmoney',
  title: '东方财富',
  marketGroup: 'CN' as MarketGroup,
  keywords: ['eastmoney', '东方财富', '东财'],
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
