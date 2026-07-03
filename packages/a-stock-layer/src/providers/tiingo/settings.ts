import { secretKeySettings } from '../common/settings.js'

export const TIINGO_SETTINGS = secretKeySettings(
  'tiingo',
  'Tiingo',
  'US',
  { secretKey: 'apiToken', secretLabel: 'API Token', keywords: ['tiingo', 'api token'], placeholder: '粘贴 Tiingo API Token' },
)
