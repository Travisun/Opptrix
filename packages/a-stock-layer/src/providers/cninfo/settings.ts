import type { MarketGroup, ProviderSettingsDefinition } from '@opptrix/shared'

export const CNINFO_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'cninfo',
  title: '巨潮资讯',
  marketGroup: 'CN' as MarketGroup,
  keywords: ['cninfo', '巨潮资讯', '公告', '披露'],
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
