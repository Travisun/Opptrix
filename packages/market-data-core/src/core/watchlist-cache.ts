/**
 * 关注列表个股数据缓存 TTL — 仅对 watchlist 内标的启用（见 MarketDataEngine.queryScoped）。
 * 变化慢的维度 TTL 更长；行情类不缓存。
 */

/** 秒 */
export const WATCHLIST_INSTRUMENT_TTL: Record<string, number> = {
  /**
   * 实时行情类 — TTL 0 即关闭 watchlist 覆盖层缓存。
   * 若不在此列出，兜底 86400 会把 US/HK/CRYPTO 实时报价冻结 24h
   * 且持久化到 ~/.aaashare/cache.json 重启也不失效；ttl<=0 时
   * Cache.getWithTtl/setWithTtl 直接短路，保持与 DEFAULT_TTL 一致。
   */
  stock_realtime: 0,
  index_realtime: 0,
  fund_quote: 0,
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
