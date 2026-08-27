import { enabledOnlySettings } from '../common/settings.js'

export const YFINANCE_SETTINGS = enabledOnlySettings(
  'yfinance',
  'Yahoo Finance',
  'GLOBAL',
  {
    defaultEnabled: true,
    subtitle: '全球指数实时与历史走势，无需密钥',
    keywords: ['yahoo', 'yfinance', '全球指数', '道琼斯', '纳斯达克', '恒生', '日经'],
  },
)
