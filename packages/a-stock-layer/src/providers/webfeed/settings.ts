import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { enabledOnlySettings } from '../common/settings.js'

/** @deprecated 请使用 {@link SINAFINANCE_SETTINGS} */
export const WEBFEED_SETTINGS: ProviderSettingsDefinition = {
  ...enabledOnlySettings(
    'webfeed',
    '网络补充',
    'CN',
    {
      keywords: ['webfeed', '网络补充', '新浪', 'sinafinance', '免费'],
      defaultEnabled: true,
    },
  ),
  supportsTest: true,
}
