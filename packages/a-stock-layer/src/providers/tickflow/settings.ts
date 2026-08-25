import type { ProviderSettingsDefinition } from '@opptrix/shared'

export const TICKFLOW_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'tickflow',
  title: 'TickFlow',
  subtitle: '多市场行情；免费可用日线，填密钥可看实时',
  marketGroup: 'GLOBAL',
  keywords: ['tickflow', 'tick flow', '数据密钥', '套餐', '权限', '免费'],
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
      placeholder: '可不填；填写后可看实时与分钟线',
      description: '不填可用免费日线；填写后可看实时与分钟线',
      helpUrl: 'https://tickflow.org/',
    },
    {
      key: 'permissionMode',
      type: 'select',
      label: '能力适配',
      description: '有密钥时自动匹配可用能力；也可手动选择',
      default: 'auto',
      options: [
        { value: 'auto', label: '自动匹配（推荐）' },
        { value: 'manual', label: '手动选择' },
      ],
    },
    {
      key: 'plan',
      type: 'select',
      label: '能力档位',
      description: '仅在手动选择时生效；无密钥时仅日线等基础能力',
      default: 'free',
      options: [
        { value: 'free', label: '基础（实时 + 日线 + 标的）' },
        { value: 'paid', label: '完整（含更多能力）' },
      ],
    },
  ],
}
