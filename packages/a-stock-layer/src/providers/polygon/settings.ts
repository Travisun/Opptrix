import { secretKeySettings } from '../common/settings.js'

export const POLYGON_SETTINGS = secretKeySettings(
  'polygon',
  'Polygon.io',
  'US',
  { keywords: ['polygon', 'polygon.io', 'api key'], placeholder: '粘贴 Polygon.io API Key' },
)
