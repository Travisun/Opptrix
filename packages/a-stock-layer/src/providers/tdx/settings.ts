import type { MarketGroup, ProviderSettingsDefinition } from '@opptrix/shared'

export const TDX_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'tdx',
  title: '通达信 TCP',
  marketGroup: 'CN' as MarketGroup,
  keywords: ['tdx', '通达信', 'mootdx', 'pytdx', 'PyTDX'],
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
