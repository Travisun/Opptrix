import type { MarketGroup, ProviderSettingsDefinition } from '@opptrix/shared'

export const SINA_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'sina',
  title: '新浪财经',
  marketGroup: 'CN' as MarketGroup,
  keywords: ['sina', '新浪', '新浪财经', 'sinajs', 'finance.sina.com.cn'],
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
