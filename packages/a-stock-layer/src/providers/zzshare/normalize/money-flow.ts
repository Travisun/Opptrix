import type { MarketMoneyFlow, MoneyFlow } from '../../../core/schema.js'
import { normalizeCode } from '../../../utils/helpers.js'
import { genericRecords, num, pick, rowsFromPayload, str } from './common.js'

/** 个股资金流向 — 字段名以 Zzshare 服务端为准，上层可再规范化 */
export function mapZzshareStockMoneyFlowRows(
  code: string,
  data: unknown,
  dateHint = '',
): MoneyFlow[] {
  const bare = normalizeCode(code)
  const rows = rowsFromPayload(data)
  if (!rows.length && (data === 0 || data === null || data === undefined)) return []

  const out: MoneyFlow[] = []
  for (const row of rows) {
    const date = str(pick(row, 'date', 'trade_date', 'date1')) || dateHint
    out.push({
      code: bare,
      date,
      mainNet: num(pick(row, 'main_net', 'mainNet', 'main_amount', 'net_mf_amount')),
      superLargeNet: num(pick(row, 'super_large_net', 'superLargeNet', 'buy_elg_amount', 'sell_elg_amount')),
      largeNet: num(pick(row, 'large_net', 'largeNet', 'buy_lg_amount', 'sell_lg_amount')),
      mediumNet: num(pick(row, 'medium_net', 'mediumNet', 'buy_md_amount', 'sell_md_amount')),
      smallNet: num(pick(row, 'small_net', 'smallNet', 'buy_sm_amount', 'sell_sm_amount')),
      mainNetPct: num(pick(row, 'main_net_pct', 'mainNetPct', 'net_mf_ratio')),
      close: num(pick(row, 'close', 'price')),
      changePct: num(pick(row, 'change_pct', 'changePct', 'pct_chg', 'quote_rate')),
    })
  }

  if (!out.length && data != null && typeof data === 'object' && !Array.isArray(data)) {
    const row = data as Record<string, unknown>
    out.push({
      code: bare,
      date: dateHint,
      mainNet: num(pick(row, 'main_net', 'mainNet', 'net_mf_amount')),
      superLargeNet: num(pick(row, 'super_large_net', 'superLargeNet')),
      largeNet: num(pick(row, 'large_net', 'largeNet')),
      mediumNet: num(pick(row, 'medium_net', 'mediumNet')),
      smallNet: num(pick(row, 'small_net', 'smallNet')),
      mainNetPct: num(pick(row, 'main_net_pct', 'mainNetPct')),
      close: num(pick(row, 'close', 'price')),
      changePct: num(pick(row, 'change_pct', 'changePct', 'pct_chg')),
    })
  }

  return out
}

/** 全市场资金流 — 透传原始字段供上层聚合 */
export function mapZzshareMarketMoneyFlowRows(
  data: unknown,
  dateHint = '',
  direction = 'market',
): MarketMoneyFlow[] {
  const rows = rowsFromPayload(data)
  if (!rows.length) {
    const recs = genericRecords(data)
    if (!recs.length) return []
    return recs.map(row => ({
      direction,
      date: str(row.date ?? row.trade_date ?? dateHint),
      netAmount: num(row.net_amount ?? row.netAmount ?? row.amount ?? row.main_net) ?? 0,
      shNet: num(row.sh_net ?? row.shNet),
      szNet: num(row.sz_net ?? row.szNet),
      cumulative: num(row.cumulative ?? row.cum_net),
      ...row,
    } as MarketMoneyFlow & Record<string, unknown>))
  }

  return rows.map(row => ({
    direction,
    date: str(pick(row, 'date', 'trade_date', 'time')) || dateHint,
    netAmount: num(pick(row, 'net_amount', 'netAmount', 'amount', 'main_net', 'value')) ?? 0,
    shNet: num(pick(row, 'sh_net', 'shNet')),
    szNet: num(pick(row, 'sz_net', 'szNet')),
    cumulative: num(pick(row, 'cumulative', 'cum_net')),
  }))
}

/** 市场 TopN 热点情绪 — 原始记录，上层再解读 */
export function mapZzshareSentimentMarketTopNRows(data: unknown): Record<string, unknown>[] {
  return genericRecords(data).map(row => ({
    source: 'sentiment_market_top_n',
    ...row,
  }))
}
