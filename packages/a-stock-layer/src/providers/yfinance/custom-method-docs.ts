import type { CustomMethodApiDoc } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'

const usage = (method: string, args: string) =>
  `engine.invokeCustomMethod("yfinance", "${method}", ${args})`

export const YFINANCE_METHOD_DOCS: Record<string, CustomMethodApiDoc> = {
  yfScreener: {
    method: 'yfScreener',
    description: 'Yahoo Finance 选股器 — 涨幅榜 / 跌幅榜 / 活跃股',
    sourceUrl: 'https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved',
    params: [
      { name: 'scrId', type: 'string', description: 'day_gainers | day_losers | most_actives', default: 'day_gainers' },
      { name: 'count', type: 'number', description: '返回条数，默认 10，最大 25', default: 10 },
      { name: 'region', type: 'string', description: '区域代码，如 US / JP', default: 'US' },
    ],
    returns: 'Array<{ code, name, price, change_pct, change_amt, market, chart_symbol }>',
    usage: usage('yfScreener', '["day_gainers", 12, "US"]'),
    notes: '经 yahoo-finance2 screener；受 Yahoo 非官方 API 限流约束。',
  },
  yfTrendingSymbols: {
    method: 'yfTrendingSymbols',
    description: 'Yahoo Finance 区域热门标的（搜索/讨论热度）',
    sourceUrl: 'https://query2.finance.yahoo.com/v1/finance/trending/US',
    params: [
      { name: 'region', type: 'string', description: '区域代码 US / JP / GB 等', default: 'US' },
      { name: 'count', type: 'number', description: '返回条数，默认 10，最大 25', default: 10 },
    ],
    returns: 'Array<{ code, name, price, change_pct, rank, market, chart_symbol }>',
    usage: usage('yfTrendingSymbols', '["US", 10]'),
    notes: '先 trendingSymbols 再批量 quote；适合市场动态热门榜。',
  },
}

export const YFINANCE_CUSTOM = Object.values(YFINANCE_METHOD_DOCS).map(toCustomMethodDef)
