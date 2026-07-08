import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { enabledOnlySettings } from '../common/settings.js'

export const SINAFINANCE_SETTINGS: ProviderSettingsDefinition = {
  ...enabledOnlySettings(
    'sinafinance',
    '新浪财经',
    'CN',
    {
      keywords: ['sinafinance', 'sina', '新浪', 'finance.sina', 'F10', 'vip.stock', '免费', 'webfeed', '网络补充'],
      defaultEnabled: true,
    },
  ),
  supportsTest: true,
}
