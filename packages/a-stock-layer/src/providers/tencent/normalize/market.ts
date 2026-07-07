import type { MoneyFlow, StockKline, StockListItem, StockRealtime } from '../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import { fromTencentSymbol } from '../api/proxy.js'
import type {
  TencentBigOrderData,
  TencentFundFlowData,
  TencentKlineNode,
  TencentPlateNewData,
  TencentRelatedPlateRow,
  TencentSmartboxStock,
  TencentSqtQuoteArray,
  TencentTradeDetailData,
} from '../api/types.js'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function hhmmToTime(hhmm: string): string {
  const raw = hhmm.trim().padStart(4, '0')
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`
}

/**
 * `sqt.gtimg.cn` UTF-8 JSON 数组 → {@link StockRealtime}。
 *
 * 字段下标与腾讯 `qt` 文本协议一致（数组从名称位起算）。
 */
export function mapTencentSqtRealtime(code: string, fields: TencentSqtQuoteArray): StockRealtime | null {
  if (fields.length < 7) return null
  const price = safeFloat(fields[3])
  if (price == null) return null
  return {
    code: normalizeCode(code),
    name: fields[1] ?? '',
    price,
    preClose: safeFloat(fields[4]),
    open: safeFloat(fields[5]),
    volume: safeFloat(fields[6]),
    amount: safeFloat(fields[37]),
    changePct: safeFloat(fields[32]),
    pe: safeFloat(fields[39]),
    pb: safeFloat(fields[46]),
    turnoverRate: safeFloat(fields[38]),
    marketCap: safeFloat(fields[44]),
  }
}

/**
 * `minute/query` 原始行 → 分时 tick 记录。
 */
export function mapTencentMinuteTicks(
  code: string,
  rows: string[],
  tradeDate = todayYmd(),
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  const out: Record<string, unknown>[] = []
  for (const row of rows) {
    const parts = row.trim().split(/\s+/)
    if (parts.length < 2) continue
    const time = hhmmToTime(parts[0]!)
    const price = safeFloat(parts[1])
    if (price == null) continue
    out.push({
      code: bare,
      date: tradeDate,
      time,
      price,
      volume: parts[2] ? safeFloat(parts[2]) : null,
      amount: parts[3] ? safeFloat(parts[3]) : null,
      source: 'tencent_minute',
    })
  }
  return out
}

/**
 * `minute/query` → 1 分钟 K 线（用于 `minuteTrendKline`）。
 */
export function mapTencentMinuteKlines(
  code: string,
  rows: string[],
  tradeDate = todayYmd(),
): StockKline[] {
  const bare = normalizeCode(code)
  const out: StockKline[] = []
  for (const row of rows) {
    const parts = row.trim().split(/\s+/)
    if (parts.length < 2) continue
    const price = safeFloat(parts[1])
    if (price == null) continue
    const time = hhmmToTime(parts[0]!)
    out.push({
      code: bare,
      date: `${tradeDate} ${time}:00`,
      open: price,
      close: price,
      high: price,
      low: price,
      volume: safeFloat(parts[2]) ?? 0,
      amount: safeFloat(parts[3]) ?? 0,
      changePct: null,
      turnoverRate: null,
    })
  }
  return out
}

const KLINE_PERIOD_MAP: Record<string, 'day' | 'week' | 'month'> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
}

/**
 * 将引擎 K 线 period 映射为 `kline/app/get` 的 `kline.type`。
 */
export function resolveTencentKlineAppType(period: string): 'day' | 'week' | 'month' | null {
  return KLINE_PERIOD_MAP[period] ?? null
}

/**
 * `kline/app/get` nodes → {@link StockKline}。
 */
export function mapTencentKlineAppNodes(code: string, nodes: TencentKlineNode[]): StockKline[] {
  const bare = normalizeCode(code)
  const out: StockKline[] = []
  for (const node of nodes) {
    const open = safeFloat(node.open)
    const close = safeFloat(node.last)
    const high = safeFloat(node.high)
    const low = safeFloat(node.low)
    if (open == null || close == null || high == null || low == null) continue
    const date = String(node.date ?? '').slice(0, 10)
    if (!date) continue
    const preClose = open
    const changePct = preClose
      ? Math.round(((close - preClose) / preClose) * 10000) / 100
      : safeFloat(node.exchange)
    out.push({
      code: bare,
      date,
      open,
      close,
      high,
      low,
      volume: safeFloat(node.volume) ?? 0,
      amount: safeFloat(node.amount) ?? 0,
      changePct: changePct ?? null,
      turnoverRate: safeFloat(node.exchange),
    })
  }
  return out
}

/**
 * `hsfundtab` 多周期块 → {@link MoneyFlow} 序列（含 5 日与历史）。
 */
export function mapTencentFundFlowSeries(code: string, data: TencentFundFlowData): MoneyFlow[] {
  const bare = normalizeCode(code)
  const byDate = new Map<string, MoneyFlow>()

  const ingest = (dateRaw: unknown, mainNetRaw: unknown) => {
    const date = String(dateRaw ?? '').slice(0, 10)
    const mainNet = safeFloat(mainNetRaw)
    if (!date || mainNet == null) return
    const prev = byDate.get(date) ?? { code: bare, date }
    byDate.set(date, { ...prev, mainNet })
  }

  const today = data.todayFundFlow
  if (today?.mainNetIn) ingest(todayYmd(), today.mainNetIn)

  for (const row of data.fiveDayFundFlow?.DayMainNetInList ?? []) {
    ingest(row.date, row.mainNetIn)
  }
  for (const row of data.historyFundFlow?.oneDayKlineList ?? []) {
    ingest(row.date, row.mainNetIn)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * `plateNew` → 板块标签记录（行业 / 概念 / 地域）。
 */
export function mapTencentPlateTagRows(code: string, data: TencentPlateNewData): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  const rows: Record<string, unknown>[] = []
  const push = (kind: string, items: Array<{ id?: string; name?: string; tag?: string; zdf?: string }> = []) => {
    for (const item of items) {
      const name = String(item.name ?? '').trim()
      if (!name) continue
      rows.push({
        code: bare,
        plateCode: item.id ?? '',
        plateName: name,
        plateType: kind,
        changePct: safeFloat(item.zdf),
        tag: item.tag ?? '',
        source: 'tencent_plateNew',
      })
    }
  }
  push('industry', data.plate ?? [])
  push('concept', data.concept ?? [])
  push('area', data.area ?? [])
  return rows
}

/**
 * `relate/data/plate` → 关联板块 / 概念（`PEER_COMPANY` 代理）。
 */
export function mapTencentRelatedPlateRows(
  code: string,
  rows: TencentRelatedPlateRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    peerCode: String(row.code ?? ''),
    peerName: String(row.name ?? ''),
    source: 'tencent_related_plate',
  })).filter(r => r.peerName)
}

/**
 * `hypm/get` → 行业排名摘要记录。
 */
export function mapTencentIndustryRankRow(
  code: string,
  data: Record<string, unknown>,
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  const hyinfo = data.hyinfo as Record<string, unknown> | undefined
  const pm = data.pm as Record<string, unknown> | undefined
  const stock = data.data as Record<string, unknown> | undefined
  if (!hyinfo && !pm && !stock) return []
  return [{
    code: bare,
    industryCode: hyinfo?.dm ?? '',
    industryName: hyinfo?.hymc ?? '',
    pe: safeFloat(stock?.syl),
    marketCap: safeFloat(stock?.zsz),
    eps: safeFloat(stock?.mgsy),
    peRank: pm?.syl_pm ?? null,
    marketCapRank: pm?.zsz_pm ?? null,
    epsRank: pm?.mgsy_pm ?? null,
    industryAvgPe: safeFloat((data.plate_avg as Record<string, unknown> | undefined)?.avg_syl),
    source: 'tencent_hypm',
  }]
}

/**
 * `getDadan` → 大单成交记录（`BLOCK_TRADE`）。
 */
export function mapTencentBigOrderRows(code: string, data: TencentBigOrderData): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  const summaryDate = String(data.summary?.date ?? '').trim()
  const tradeDate = summaryDate.length === 8
    ? `${summaryDate.slice(0, 4)}-${summaryDate.slice(4, 6)}-${summaryDate.slice(6, 8)}`
    : todayYmd()
  return (data.detail ?? []).map(row => ({
    code: bare,
    time: row[0] ?? '',
    price: safeFloat(row[1]),
    volume: safeFloat(row[2]),
    side: row[3] ?? '',
    date: tradeDate,
    source: 'tencent_dadan',
  }))
}

/**
 * `getMingxiV2` → 逐笔成交明细。
 */
export function mapTencentTradeDetailRows(
  code: string,
  data: TencentTradeDetailData,
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  const rawDate = String(data.date ?? '').trim()
  const tradeDate = rawDate.length === 8
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : todayYmd()
  return (data.data ?? []).map(cols => ({
    code: bare,
    date: tradeDate,
    time: cols[0] ?? '',
    price: safeFloat(cols[1]),
    volume: safeFloat(cols[2]),
    side: cols[3] ?? '',
    source: 'tencent_mingxi',
  }))
}

/**
 * `smartbox/search` → {@link StockListItem}。
 */
export function mapTencentSmartboxStocks(rows: TencentSmartboxStock[]): StockListItem[] {
  return rows.map(row => {
    const code = fromTencentSymbol(String(row.code ?? ''))
    const industry = String(row.type ?? '').replace(/^GP-A-/, '') || ''
    return {
      code,
      name: String(row.name ?? code),
      industry,
      market: code.startsWith('6') ? 'SH' : 'SZ',
    }
  }).filter(item => item.code && item.name)
}

/**
 * 解析 `sectorList` / `stockList` 扩展入参：`stock:300308` / `search:茅台`。
 */
export function parseTencentScopedMarket(market: string): {
  kind: 'board' | 'stock' | 'search' | 'default'
  value: string
} {
  const raw = market.trim()
  if (!raw || raw === 'all') return { kind: 'default', value: '' }
  const stockMatch = raw.match(/^stock:(.+)$/i)
  if (stockMatch?.[1]) return { kind: 'stock', value: stockMatch[1].trim() }
  const searchMatch = raw.match(/^search:(.+)$/i)
  if (searchMatch?.[1]) return { kind: 'search', value: searchMatch[1].trim() }
  return { kind: 'board', value: raw }
}
