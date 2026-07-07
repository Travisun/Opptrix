import type { ProviderSettingsDefinition } from '@opptrix/shared'

export const TICKFLOW_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'tickflow',
  title: 'TickFlow',
  marketGroup: 'GLOBAL',
  keywords: ['tickflow', 'tick flow', 'api key', '套餐', '权限'],
  enableAffectsPriority: true,
  supportsTest: true,
  fields: [
    { key: 'enabled', type: 'boolean', label: '启用', default: false },
    {
      key: 'apiKey',
      type: 'secret',
      label: 'API Key',
      required: true,
      masked: true,
      placeholder: '粘贴 TickFlow API Key',
    },
    {
      key: 'permissionMode',
      type: 'select',
      label: '权限适配',
      description: '自动：运行时遇权限不足自动登记并屏蔽；手动：按免费/付费预设裁剪',
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
      description: '仅在「手动选择」时生效。免费版对应实测可访问的 10 个接口',
      default: 'free',
      options: [
        { value: 'free', label: '免费版（实时 + 日K + 标的 + 标的池）' },
        { value: 'paid', label: '付费版（全量接口，需付费 Key）' },
      ],
    },
  ],
}
