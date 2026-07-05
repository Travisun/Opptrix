/**
 * Yahoo Finance 搜索工具 — 通过 Yahoo Finance API 搜索美股、ETF 等标的。
 *
 * 用途：美股代码自动补全、标的名称模糊搜索。
 * 数据源：Yahoo Finance Search API https://query2.finance.yahoo.com/v1/finance/search
 */

/**
 * Yahoo Finance 搜索结果条目 — 单个匹配标的的基本信息。
 *
 * 字段说明：
 *   - symbol:    交易代码（如 "AAPL"、"005930.KS"）
 *   - shortname: 简称（如 "Apple Inc"）
 *   - longname:  全称（如 "Apple Inc."）
 *   - exchange:  交易所（如 "NMS" 纳斯达克、"KRX" 韩国交易所）
 *   - quoteType: 标的类型（如 "EQUITY" 股票、"ETF"、"INDEX" 指数）
 */
export interface YahooSearchQuote {
  /** 交易代码（如 "AAPL"、"MSFT"、"005930.KS"） */
  symbol: string
  /** 简称（如 "Apple Inc"） */
  shortname?: string
  /** 全称（如 "Apple Inc."） */
  longname?: string
  /** 交易所标识（如 "NMS"、"NYQ"、"KRX"） */
  exchange?: string
  /** 标的类型（如 "EQUITY"、"ETF"、"INDEX"、"CRYPTOCURRENCY"） */
  quoteType?: string
}

/**
 * 解析 Yahoo Finance 搜索 API 的 JSON 响应，提取标准化的搜索结果。
 *
 * @param json Yahoo Finance API 返回的原始 JSON 对象
 * @returns 过滤后的搜索结果数组（跳过无效条目）
 */
export function parseYahooSearchQuotes(json: Record<string, unknown>): YahooSearchQuote[] {
  const quotes = (json.quotes as unknown[]) ?? []
  const out: YahooSearchQuote[] = []
  for (const row of quotes) {
    if (!row || typeof row !== 'object') continue
    const q = row as Record<string, unknown>
    const symbol = String(q.symbol ?? '').trim()
    if (!symbol) continue
    out.push({
      symbol,
      shortname: q.shortname != null ? String(q.shortname) : undefined,
      longname: q.longname != null ? String(q.longname) : undefined,
      exchange: q.exchange != null ? String(q.exchange) : undefined,
      quoteType: q.quoteType != null ? String(q.quoteType) : undefined,
    })
  }
  return out
}
