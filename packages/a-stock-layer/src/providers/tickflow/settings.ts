import type { ProviderSettingsDefinition } from '@opptrix/shared'

export const TICKFLOW_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'tickflow',
  title: 'TickFlow',
  subtitle: '免费日K与标的无需注册；配置 Key 可升级实时与分钟线',
  marketGroup: 'GLOBAL',
  keywords: ['tickflow', 'tick flow', 'api key', '套餐', '权限', '免费'],
  enableAffectsPriority: true,
  supportsTest: true,
  fields: [
    { key: 'enabled', type: 'boolean', label: '启用', default: true },
    {
      key: 'apiKey',
      type: 'secret',
      label: 'API Key（可选）',
      required: false,
      masked: true,
      placeholder: '不填即用免费服务；填写可升级实时与分钟线',
    },
    {
      key: 'permissionMode',
      type: 'select',
      label: '权限适配',
      description: '仅在配置了 API Key 时生效。自动：遇权限不足自动登记并屏蔽；手动：按免费/付费预设裁剪',
      default: 'auto',
      options: [
        { value: 'auto', label: '自动适配（推荐）' },
        { value: 'manual', label: '手动选择免费/付费' },
      ],
    },
    {
      key: 'plan',
      type: 'select',
      label: '接口档位',
      description: '仅在「手动选择」且已配置 API Key 时生效。公开免费档（无 Key）不含实时与分钟线',
      default: 'free',
      options: [
        { value: 'free', label: 'Key 免费套餐（实时 + 日K + 标的 + 标的池）' },
        { value: 'paid', label: '付费套餐（全量接口，需付费 Key）' },
      ],
    },
  ],
}
