import { secretKeySettings } from '../common/settings.js'

export const FMP_SETTINGS = secretKeySettings(
  'fmp',
  'Financial Modeling Prep',
  'US',
  { keywords: ['fmp', 'financial modeling prep', 'api key'], placeholder: '粘贴 Financial Modeling Prep API Key' },
)
