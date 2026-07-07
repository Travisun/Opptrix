import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { enabledOnlySettings } from '../common/settings.js'

export const TENCENT_SETTINGS: ProviderSettingsDefinition = {
  ...enabledOnlySettings(
    'tencent',
    '腾讯行情',
    'CN',
    {
      keywords: ['tencent', '腾讯', '行情中心', 'stockapp', 'gu.qq.com', '免费'],
      defaultEnabled: true,
    },
  ),
  supportsTest: true,
}
