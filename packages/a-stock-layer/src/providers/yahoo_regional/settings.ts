import { enabledOnlySettings } from '../common/settings.js'

export function yahooRegionalSettings(market: 'JP' | 'KR' | 'HK') {
  return enabledOnlySettings(
    `yahoo_${market.toLowerCase()}`,
    'Yahoo Finance',
    market,
    { keywords: ['yahoo', market, 'regional'] },
  )
}
