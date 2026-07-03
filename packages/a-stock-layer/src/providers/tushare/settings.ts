import type { ProviderSettingsDefinition } from '@opptrix/shared'

export const TUSHARE_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'tushare',
  title: 'Tushare Pro',
  marketGroup: 'CN',
  keywords: ['tushare', 'token', '行情源'],
  enableAffectsPriority: true,
  supportsTest: true,
  fields: [
    { key: 'enabled', type: 'boolean', label: '启用', default: false },
    { key: 'token', type: 'secret', label: 'API Token', required: true, masked: true, placeholder: '粘贴 Token' },
  ],
}
