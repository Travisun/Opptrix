import type { ProviderSettingsDefinition } from '@opptrix/shared'
import { enabledOnlySettings } from '../common/settings.js'

export const BAOSTOCK_SETTINGS: ProviderSettingsDefinition = {
  ...enabledOnlySettings(
    'baostock',
    '证券宝 BaoStock',
    'CN',
    { keywords: ['baostock', '证券宝', 'BaoStock'], defaultEnabled: true },
  ),
  supportsTest: true,
}
