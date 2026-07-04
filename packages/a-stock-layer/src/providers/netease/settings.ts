import type { MarketGroup, ProviderSettingsDefinition } from '@opptrix/shared'

export const NETEASE_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'netease',
  title: '网易财经',
  marketGroup: 'CN' as MarketGroup,
  keywords: ['netease', '网易财经', '网易', 'money.163.com', '126.net'],
  enableAffectsPriority: true,
  supportsTest: true,
  fields: [
    {
      key: 'enabled',
      type: 'boolean',
      label: '启用',
      default: false,
    },
  ],
}
