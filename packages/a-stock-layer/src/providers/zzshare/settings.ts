import type { ProviderSettingsDefinition } from '@opptrix/shared'

export const ZZSHARE_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'zzshare',
  title: '自在量化 Zzshare',
  subtitle: '大部分接口可匿名访问；在 quant.zizizaizai.com 个人中心可免费获取 Token 以提高频率并解锁实时行情',
  marketGroup: 'CN',
  keywords: ['zzshare', '自在量化', 'zizizaizai', 'quant'],
  enableAffectsPriority: true,
  supportsTest: true,
  fields: [
    { key: 'enabled', type: 'boolean', label: '启用', default: true },
    {
      key: 'apiKey',
      type: 'secret',
      label: 'API Token',
      required: false,
      masked: true,
      placeholder: '粘贴自在量化 Token（留空则匿名访问）',
      description: '在 quant.zizizaizai.com 个人中心免费获取，用于提高调用频率并访问实时行情',
    },
  ],
}
