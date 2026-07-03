import { enabledOnlySettings } from '../common/settings.js'

const YAHOO_REGIONAL_TITLES: Record<'JP' | 'KR' | 'HK', string> = {
  JP: 'Yahoo 财经 · 日股',
  KR: 'Yahoo 财经 · 韩股',
  HK: 'Yahoo 财经 · 港股',
}

export function yahooRegionalSettings(market: 'JP' | 'KR' | 'HK') {
  return enabledOnlySettings(
    `yahoo_${market.toLowerCase()}`,
    YAHOO_REGIONAL_TITLES[market],
    market,
    { keywords: ['yahoo', market, 'regional', YAHOO_REGIONAL_TITLES[market]] },
  )
}
