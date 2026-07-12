import type { GlobalIndex, MoneyFlow, NewsItem } from '../../core/schema.js'
import { normalizeCode } from '../../utils/helpers.js'
import { resolveIndexConstQuery } from '../baostock/normalize/index-const.js'

/** 宽基 ETF → 跟踪指数（用于免费源成分股代理持仓） */
export const CN_ETF_INDEX_PROXY: Record<string, string> = {
  '510050': '000016',
  '510300': '000300',
  '510500': '000905',
  '159919': '000300',
}

export function resolveEtfIndexProxy(etfCode: string): string | null {
  const c = normalizeCode(etfCode)
  return CN_ETF_INDEX_PROXY[c] ?? null
}

/** 全球指数别名 → TickFlow 可查询的 ETF/指数代码 */
export const GLOBAL_INDEX_TICKFLOW: Record<string, { symbol: string; name: string; market: string; outCode: string }> = {
  dji: { symbol: 'DIA.US', name: '道琼斯', market: 'US', outCode: 'DJI' },
  djia: { symbol: 'DIA.US', name: '道琼斯', market: 'US', outCode: 'DJI' },
  dow: { symbol: 'DIA.US', name: '道琼斯', market: 'US', outCode: 'DJI' },
  spx: { symbol: 'SPY.US', name: '标普500', market: 'US', outCode: 'SPX' },
  spy: { symbol: 'SPY.US', name: '标普500', market: 'US', outCode: 'SPX' },
  ixic: { symbol: 'QQQ.US', name: '纳斯达克', market: 'US', outCode: 'IXIC' },
  nasdaq: { symbol: 'QQQ.US', name: '纳斯达克', market: 'US', outCode: 'IXIC' },
  qqq: { symbol: 'QQQ.US', name: '纳斯达克', market: 'US', outCode: 'IXIC' },
  hsi: { symbol: '2800.HK', name: '恒生指数', market: 'HK', outCode: 'HSI' },
  n225: { symbol: '1321.T', name: '日经225', market: 'JP', outCode: 'N225' },
  nikkei: { symbol: '1321.T', name: '日经225', market: 'JP', outCode: 'N225' },
}

/** A 股指数代码也可通过 indexRealtime 查询 */
export const GLOBAL_INDEX_CN: Record<string, { indexCode: string; name: string }> = {
  '000001': { indexCode: '000001', name: '上证指数' },
  '399001': { indexCode: '399001', name: '深证成指' },
  '399006': { indexCode: '399006', name: '创业板指' },
  '000300': { indexCode: '000300', name: '沪深300' },
}

export function resolveGlobalIndexAlias(code = ''): {
  kind: 'cn' | 'tickflow' | 'all'
  cn?: { indexCode: string; name: string; outCode: string }
  tickflow?: (typeof GLOBAL_INDEX_TICKFLOW)[string]
} {
  const raw = code.trim().toLowerCase()
  if (!raw) return { kind: 'all' }
  const cn = GLOBAL_INDEX_CN[normalizeCode(code)] ?? GLOBAL_INDEX_CN[normalizeCode(raw)]
  if (cn) return { kind: 'cn', cn: { ...cn, outCode: normalizeCode(cn.indexCode) } }
  const tf = GLOBAL_INDEX_TICKFLOW[raw]
  if (tf) return { kind: 'tickflow', tickflow: tf }
  return { kind: 'all' }
}

export function mapRecordsToNewsItems(code: string, rows: Record<string, unknown>[]): NewsItem[] {
  const c = normalizeCode(code)
  return rows.map(row => {
    const reason = String(row.reason ?? row.uplimit_reason ?? row.logic ?? row.alert ?? row.title ?? '').trim()
    const title = reason || String(row.name ?? row.stock_name ?? '市场动态').trim()
    const date = String(row.date ?? row.trade_date ?? row.date1 ?? '').slice(0, 10)
    const source = String(row.source ?? 'zzshare')
    const type = source.includes('ai_report') ? '研报'
      : source.includes('movement') ? '异动'
        : source.includes('uplimit') ? '涨停复盘'
          : '资讯'
    return { code: c || String(row.code ?? ''), title, date, source, type, category: reason || undefined }
  }).filter(item => item.title && item.date)
}

export function mapLhbDetailToMoneyFlow(code: string, rows: Record<string, unknown>[]): MoneyFlow[] {
  const c = normalizeCode(code)
  const byDate = new Map<string, MoneyFlow>()
  for (const row of rows) {
    const date = String(row.date ?? '').slice(0, 10)
    if (!date) continue
    const buy = Number(row.buyAmount ?? row.buy_amount ?? row.buy_in ?? row.buy_total ?? 0) || 0
    const sell = Number(row.sellAmount ?? row.sell_amount ?? row.sell_total ?? 0) || 0
    const net = Number(row.netAmount ?? row.net_amount ?? buy - sell) || (buy - sell)
    const prev = byDate.get(date) ?? { code: c, date }
    byDate.set(date, {
      ...prev,
      mainNet: (prev.mainNet ?? 0) + net,
      largeNet: (prev.largeNet ?? 0) + buy,
      mainNetPct: null,
    })
  }
  return [...byDate.values()]
}

export function mapLhbDetailToInstHolding(code: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const c = normalizeCode(code)
  const instPattern = /基金|社保|保险|信托|资管|QFII|券商|银行|投资|有限|合伙|机构/i
  const named = rows
    .filter(row => instPattern.test(String(row.traderName ?? row.trader_name ?? row.branch_name ?? '')))
    .map(row => ({
      code: c,
      holder_name: String(row.traderName ?? row.trader_name ?? row.branch_name ?? ''),
      hold_amount: row.buyAmount ?? row.buy_amount ?? row.buy_in ?? row.buy_total ?? null,
      end_date: String(row.date ?? '').slice(0, 10),
      source: 'lhb_inst_proxy',
    }))
  if (named.length) return named
  return rows.map(row => ({
    code: c,
    holder_name: String(row.reason ?? row.up_reason ?? row.traderName ?? '龙虎榜上榜'),
    hold_amount: row.buy_in ?? row.buy_total ?? row.buyAmount ?? null,
    end_date: String(row.date ?? '').slice(0, 10),
    source: 'lhb_inst_proxy',
  }))
}

export function mapLhbHistoryToShareholders(code: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const c = normalizeCode(code)
  return rows.map(row => ({
    code: c,
    holder_name: String(row.traderName ?? row.trader_name ?? row.branch_name ?? row.reason ?? '龙虎榜席位'),
    hold_amount: row.buyAmount ?? row.buy_amount ?? null,
    end_date: String(row.date ?? '').slice(0, 10),
    source: 'lhb_shareholder_proxy',
  }))
}

export function mapIndexConstToEtfHoldings(
  etfCode: string,
  indexCode: string,
  constituents: Record<string, unknown>[],
): Record<string, unknown>[] {
  const etf = normalizeCode(etfCode)
  return constituents.map(row => ({
    etfCode: etf,
    stockCode: String(row.stockCode ?? row.code ?? ''),
    stockName: String(row.stockName ?? row.name ?? ''),
    weight: row.weight ?? null,
    indexCode: normalizeCode(indexCode),
    updateDate: row.updateDate ?? null,
    source: 'index_constituent_proxy',
  })).filter(r => r.stockCode)
}

export function mapQuoteToGlobalIndex(
  outCode: string,
  name: string,
  market: string,
  quote: { price?: number | null; changePct?: number | null; name?: string },
): GlobalIndex {
  return {
    code: outCode,
    name: quote.name || name,
    price: quote.price ?? null,
    changePct: quote.changePct ?? null,
    market,
    timestamp: new Date().toISOString(),
  }
}

export function canProxyEtfHoldings(etfCode: string): boolean {
  const index = resolveEtfIndexProxy(etfCode)
  return index != null && resolveIndexConstQuery(index) != null
}
