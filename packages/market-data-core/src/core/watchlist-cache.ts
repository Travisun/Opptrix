/**
 * 关注列表个股数据缓存 TTL — 仅对 watchlist 内标的启用（见 MarketDataEngine.queryScoped）。
 * 变化慢的维度 TTL 更长；盘中价短 TTL 降批拉压力；净值类按日更节奏。
 */

/** 秒 */
export const WATCHLIST_INSTRUMENT_TTL: Record<string, number> = {
  /**
   * 实时行情类：
   * - stock_realtime=45：EQUITY 盘中短缓存，降关注列表批拉压力（非盘中冻结）
   * - index_realtime / crypto_realtime=0：关闭覆盖层缓存，避免 24h 兜底冻结
   * - fund_quote=600：场外基金净值日更，10 分钟缓存
   * 若不在此列出，兜底 86400 会把报价冻结 24h 并持久化到 cache.json；
   * ttl<=0 时 Cache.getWithTtl/setWithTtl 直接短路。
   */
  stock_realtime: 45,
  index_realtime: 0,
  fund_quote: 600,
  crypto_realtime: 0,
  stock_profile: 86400 * 7,
  financial_summary: 86400 * 3,
  balance_sheet: 86400 * 3,
  income_statement: 86400 * 3,
  cash_flow: 86400 * 3,
  shareholder: 86400 * 3,
  dividend: 86400 * 7,
  stock_kline: 86400,
  news: 3600 * 6,
  sentiment: 3600 * 6,
  /** 公告类 — 更新较频，短 TTL */
  announcements: 3600 * 4,
  stock_list: 3600,
  etf_profile: 86400 * 3,
  etf_nav: 86400,
  etf_holdings: 86400 * 3,
}

export function watchlistCacheTtl(cacheType: string): number {
  return WATCHLIST_INSTRUMENT_TTL[cacheType] ?? 86400
}
