import type { ProviderSettingsDefinition } from '@opptrix/shared'

export const ZZSHARE_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'zzshare',
  title: '自在量化 Zzshare',
  subtitle: '自在量化行情；可不填密钥也能用',
  marketGroup: 'CN',
  keywords: ['zzshare', '自在量化', 'zizizaizai', 'quant'],
  enableAffectsPriority: true,
  supportsTest: true,
  fields: [
    { key: 'enabled', type: 'boolean', label: '启用', default: true },
    {
      key: 'apiKey',
      type: 'secret',
      label: '数据密钥（可选）',
      required: false,
      masked: true,
      placeholder: '可不填；填写后频率更高，并解锁实时行情',
      description: '不填也能用；填写后可提高频率并查看实时行情',
      helpUrl: 'https://quant.zizizaizai.com/',
    },
  ],
}
