import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { enabledOnlySettings } from '../common/settings.js'

export const WEBFEED_SETTINGS: ProviderSettingsDefinition = {
  ...enabledOnlySettings(
    'webfeed',
    '网络补充',
    'CN',
    {
      keywords: ['webfeed', '网络补充', '新浪', '免费', '公开接口'],
      defaultEnabled: true,
    },
  ),
  supportsTest: true,
}
