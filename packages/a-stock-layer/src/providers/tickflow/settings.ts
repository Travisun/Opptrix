import { secretKeySettings } from '../common/settings.js'

const base = secretKeySettings(
  'tickflow',
  'TickFlow',
  'GLOBAL',
  {
    keywords: ['tickflow', 'tick flow', 'api key'],
    placeholder: '粘贴 TickFlow API Key',
  },
)

export const TICKFLOW_SETTINGS = {
  ...base,
  fields: [
    ...base.fields,
    {
      key: 'baseUrl',
      type: 'string' as const,
      label: 'API 地址',
      placeholder: 'https://api.tickflow.org',
      description: '可选，留空使用默认地址',
    },
  ],
}
