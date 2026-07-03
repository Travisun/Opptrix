import { secretKeySettings } from '../common/settings.js'

export const TICKFLOW_SETTINGS = secretKeySettings(
  'tickflow',
  'TickFlow',
  'GLOBAL',
  {
    keywords: ['tickflow', 'tick flow', 'api key'],
    placeholder: '粘贴 TickFlow API Key',
  },
)
