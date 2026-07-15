import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { enabledOnlySettings } from '../common/settings.js'

export const EASTMONEY_SETTINGS: ProviderSettingsDefinition = {
  ...enabledOnlySettings(
    'eastmoney',
    '东方财富',
    'CN',
    {
      keywords: [
        'eastmoney',
        '东财',
        '东方财富',
        '资金流',
        'zjlx',
        'bkzj',
        '融资融券',
        'rzrq',
        'datacenter',
        'push2',
        '免费',
      ],
      defaultEnabled: true,
    },
  ),
  supportsTest: true,
}
