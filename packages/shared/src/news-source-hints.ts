import type { AssetClass, InstrumentRef, Market } from './market-data.js'

/** 资讯分组/来源标题推断出的市场或主题标签 */
export type NewsMarketHint = Market | 'MACRO' | 'GLOBAL' | 'SECTOR'

export interface NewsSourceHints {
  market_hints: NewsMarketHint[]
  asset_hints: Array<AssetClass | 'MACRO'>
  /** 0–1，越高表示标题与某市场关联越强 */
  relevance: number
  matched_keywords: string[]
}

const MARKET_KEYWORDS: Array<{ hints: NewsMarketHint[]; asset?: AssetClass | 'MACRO'; keywords: RegExp[] }> = [
  { hints: ['CN'], asset: 'EQUITY', keywords: [/a股/i, /沪深/i, /上证/i, /深证/i, /创业板/i, /科创板/i, /北交所/i, /cn\b/i, /china\s*stock/i, /中国股/i] },
  { hints: ['CN'], asset: 'ETF', keywords: [/etf/i, /基金/i, /指数/i] },
  { hints: ['US'], asset: 'EQUITY', keywords: [/美股/i, /华尔街/i, /nasdaq/i, /nyse/i, /us\s*stock/i, /\bus\b/i, /标普/i, /道琼斯/i, /fed\b/i, /美联储/i] },
  { hints: ['HK'], asset: 'EQUITY', keywords: [/港股/i, /恒生/i, /hkex/i, /hong\s*kong/i, /\bhk\b/i] },
  { hints: ['JP'], asset: 'EQUITY', keywords: [/日股/i, /日本/i, /东证/i, /日经/i, /nikkei/i, /topix/i, /\bjp\b/i, /日本株/i] },
  { hints: ['KR'], asset: 'EQUITY', keywords: [/韩股/i, /韩国/i, /kospi/i, /kosdaq/i, /\bkr\b/i, /韩国株/i] },
  { hints: ['CRYPTO'], asset: 'CRYPTO_SPOT', keywords: [/crypto/i, /比特币/i, /btc/i, /以太坊/i, /eth/i, /区块链/i, /web3/i, /数字货币/i, /币圈/i] },
  { hints: ['MACRO'], keywords: [/宏观/i, /央行/i, /利率/i, /通胀/i, /cpi/i, /pmi/i, /gdp/i, /地缘/i, /政策/i, /macro/i] },
  { hints: ['GLOBAL'], keywords: [/全球/i, /国际/i, /要闻/i, /综合/i, /global/i, /world/i] },
  { hints: ['SECTOR'], keywords: [/半导体/i, /新能源/i, /医药/i, /银行/i, /地产/i, /消费/i, /科技/i, /行业/i] },
]

function matchText(text: string): NewsSourceHints {
  const market_hints = new Set<NewsMarketHint>()
  const asset_hints = new Set<AssetClass | 'MACRO'>()
  const matched_keywords: string[] = []
  let hits = 0

  for (const row of MARKET_KEYWORDS) {
    for (const re of row.keywords) {
      const m = text.match(re)
      if (m) {
        hits++
        matched_keywords.push(m[0])
        for (const h of row.hints) market_hints.add(h)
        if (row.asset && row.asset !== 'MACRO') asset_hints.add(row.asset)
        if (row.hints.includes('MACRO')) asset_hints.add('MACRO')
      }
    }
  }

  const relevance = hits === 0 ? 0 : Math.min(1, 0.35 + hits * 0.2)
  return {
    market_hints: [...market_hints],
    asset_hints: [...asset_hints],
    relevance,
    matched_keywords: [...new Set(matched_keywords)],
  }
}

/** 从分组/订阅标题与 URL 推断市场主题标签 */
export function inferNewsSourceHints(title: string, url = ''): NewsSourceHints {
  const combined = `${title} ${url}`.trim()
  if (!combined) {
    return { market_hints: [], asset_hints: [], relevance: 0, matched_keywords: [] }
  }
  return matchText(combined)
}

const MARKET_PRIORITY: Record<Market, NewsMarketHint[]> = {
  CN: ['CN', 'MACRO', 'GLOBAL', 'SECTOR'],
  US: ['US', 'MACRO', 'GLOBAL', 'SECTOR'],
  HK: ['HK', 'CN', 'MACRO', 'GLOBAL', 'SECTOR'],
  JP: ['JP', 'MACRO', 'GLOBAL', 'SECTOR'],
  KR: ['KR', 'MACRO', 'GLOBAL', 'SECTOR'],
  CRYPTO: ['CRYPTO', 'MACRO', 'GLOBAL'],
}

/** 为标的计算资讯分组/来源的匹配分（越高越优先） */
export function scoreNewsItemForInstrument(
  ref: InstrumentRef,
  item: { title: string; url?: string; sort_order?: number; enabled?: boolean },
): number {
  if (item.enabled === false) return -1
  const hints = inferNewsSourceHints(item.title, item.url ?? '')
  const priorities = MARKET_PRIORITY[ref.market] ?? ['GLOBAL', 'MACRO']

  let score = hints.relevance
  for (let i = 0; i < priorities.length; i++) {
    if (hints.market_hints.includes(priorities[i]!)) {
      score += 1 - i * 0.12
    }
  }
  if (ref.assetClass === 'ETF' && hints.asset_hints.includes('ETF')) score += 0.25
  if (ref.assetClass === 'CRYPTO_SPOT' && hints.market_hints.includes('CRYPTO')) score += 0.3
  if (ref.market === 'CN' && ref.assetClass === 'EQUITY' && hints.market_hints.includes('CN')) score += 0.35
  if (typeof item.sort_order === 'number') {
    score += Math.max(0, 0.15 - item.sort_order * 0.01)
  }
  return score
}

/** 交叉调阅：主市场分组不足时建议补充的分组标签 */
export function crossMarketNewsHints(ref: InstrumentRef): NewsMarketHint[] {
  const base = MARKET_PRIORITY[ref.market] ?? ['GLOBAL']
  const cross: NewsMarketHint[] = ['MACRO', 'GLOBAL']
  if (ref.market === 'HK') cross.push('CN')
  if (ref.market === 'US' || ref.market === 'JP' || ref.market === 'KR') cross.push('GLOBAL')
  return [...new Set([...base, ...cross])]
}
