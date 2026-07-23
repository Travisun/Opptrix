import { safeFloat } from '../../../utils/helpers.js'
import { fetchTencentBoardRankList } from './proxy.js'
import { fetchText } from './http.js'
import { parseTencentLine, tencentChangePct } from '../normalize/quote.js'
import { mapTencentIndustryConstituentRows } from '../normalize/market.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../common/free-provider-call.js'

const QT_INDEX_URL = 'https://qt.gtimg.cn/q='

/** mstats 首页 ScrollIndex 滚动条 codes（不含 CAC/DAX/日经：上游常空） */
export const TENCENT_MSTATS_SCROLL_INDEX_CODES = [
  'sh000001', 'sz399001', 'r_hkHSI', 'usDJI', 'usIXIC',
  'gzFTSTI', 'gzTWII', 'fqUS_GC_1', 'fqUS_CL_1',
] as const

/** mstats A 股主要指数快照（沪深市场一览） */
export const TENCENT_CN_MAJOR_INDEX_CODES = [
  'sh000001', 'sz399001', 'sz399006', 'sh000016', 'sz399300', 'sh000905', 'sh000852',
] as const

export type TencentCnIndexPreset = 'major' | 'mstats_home' | 'custom'

export type TencentCnIndexSnapshotRow = {
  qtCode: string
  code: string
  name: string
  price: number | null
  preClose: number | null
  open: number | null
  high: number | null
  low: number | null
  changeAmt: number | null
  changePct: number | null
  volume: number | null
  amount: number | null
  quoteTime: string
  market: string
}

function bareIndexCode(qtCode: string): string {
  const raw = qtCode.trim()
  const lower = raw.toLowerCase()
  if (lower.startsWith('sh') || lower.startsWith('sz') || lower.startsWith('bj')) {
    return raw.slice(2)
  }
  if (lower.startsWith('r_hk')) return raw.slice(4)
  if (lower.startsWith('us')) return raw.slice(2)
  if (lower.startsWith('gz')) return raw.slice(2)
  if (lower.startsWith('fq')) return raw
  return raw
}

function resolveIndexMarket(qtCode: string): string {
  const lower = qtCode.toLowerCase()
  if (lower.startsWith('sh') || lower.startsWith('sz') || lower.startsWith('bj')) return 'CN'
  if (lower.startsWith('r_hk')) return 'HK'
  if (lower.startsWith('us') || lower.startsWith('gz')) return 'global'
  if (lower.startsWith('fq')) return 'futures'
  return 'index'
}

function formatQuoteTime(raw: string): string {
  const s = raw.trim()
  if (s.length >= 12) return `${s.slice(8, 10)}:${s.slice(10, 12)}`
  return s || '--'
}

function mapQtIndexParts(qtCode: string, parts: string[]): TencentCnIndexSnapshotRow | null {
  const price = safeFloat(parts[3])
  if (price == null) return null
  const preClose = safeFloat(parts[4])
  const changeAmt = price != null && preClose != null
    ? Number((price - preClose).toFixed(4))
    : safeFloat(parts[31])
  return {
    qtCode,
    code: bareIndexCode(qtCode),
    name: String(parts[1] ?? qtCode).trim(),
    price,
    preClose,
    open: safeFloat(parts[5]),
    high: safeFloat(parts[33]),
    low: safeFloat(parts[34]),
    changeAmt,
    changePct: tencentChangePct(parts),
    volume: safeFloat(parts[6]),
    amount: safeFloat(parts[37]),
    quoteTime: formatQuoteTime(String(parts[30] ?? parts[5] ?? '')),
    market: resolveIndexMarket(qtCode),
  }
}

export function resolveTencentCnIndexPreset(preset: string): TencentCnIndexPreset {
  const key = preset.trim().toLowerCase()
  if (key === 'mstats_home' || key === 'home' || key === 'scroll') return 'mstats_home'
  if (key === 'custom' || key === 'codes') return 'custom'
  return 'major'
}

export function pickTencentCnIndexSymbols(opts: {
  preset?: string
  codes?: string
}): string[] {
  const preset = resolveTencentCnIndexPreset(opts.preset ?? 'major')
  if (opts.codes?.trim()) {
    return opts.codes.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
  }
  if (preset === 'mstats_home') return [...TENCENT_MSTATS_SCROLL_INDEX_CODES]
  return [...TENCENT_CN_MAJOR_INDEX_CODES]
}

/**
 * 批量拉取 qt.gtimg.cn 指数/行情快照。
 *
 * @sourceUrl https://qt.gtimg.cn/q=sh000001,sz399001,...
 * @pageUrl https://stockapp.finance.qq.com/mstats/#
 */
export async function fetchTencentQtIndexQuotes(symbols: string[]): Promise<TencentCnIndexSnapshotRow[]> {
  if (!symbols.length) return []
  const text = await fetchText(`${QT_INDEX_URL}${symbols.join(',')}`, 'gbk')
  const lines = text.trim().split('\n').filter(Boolean)
  const rows: TencentCnIndexSnapshotRow[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const parts = parseTencentLine(lines[i]!)
    if (!parts) continue
    const qtCode = symbols[i] ?? parts[2] ?? ''
    const row = mapQtIndexParts(String(qtCode).trim(), parts)
    if (row) rows.push(row)
  }
  return rows
}

export function mapTencentCnIndexSnapshotRows(
  rows: TencentCnIndexSnapshotRow[],
): Record<string, unknown>[] {
  return rows.map(row => ({
    code: row.code,
    qtCode: row.qtCode,
    name: row.name,
    price: row.price,
    preClose: row.preClose,
    open: row.open,
    high: row.high,
    low: row.low,
    changeAmt: row.changeAmt,
    changePct: row.changePct,
    volume: row.volume,
    amount: row.amount,
    quoteTime: row.quoteTime,
    market: row.market,
    source: 'tencent_qt_index',
  }))
}

/**
 * 拉取 A 股/首页指数快照，可选附带上证/深证指数成分涨跌榜。
 *
 * @param opts.preset major（默认主要 A 股指数）/ mstats_home（首页滚动条）/ custom（配合 codes）
 * @param opts.codes 逗号分隔 qt 代码，覆盖 preset
 * @param opts.includeBoardRanks 是否附带 bkqtRank_A_sh / bkqtRank_A_sz 涨跌榜
 */
export async function fetchTencentCnIndexSnapshot(opts: {
  preset?: string
  codes?: string
  includeBoardRanks?: boolean
  boardRankPageSize?: number
}): Promise<{
  preset: TencentCnIndexPreset
  symbols: string[]
  items: Record<string, unknown>[]
  boardRanks?: Record<string, unknown>
}> {
  const preset = resolveTencentCnIndexPreset(opts.preset ?? 'major')
  const symbols = pickTencentCnIndexSymbols({ preset, codes: opts.codes })
  const rows = await fetchTencentQtIndexQuotes(symbols)
  const result: {
    preset: TencentCnIndexPreset
    symbols: string[]
    items: Record<string, unknown>[]
    boardRanks?: Record<string, unknown>
  } = {
    preset,
    symbols,
    items: mapTencentCnIndexSnapshotRows(rows),
  }

  if (opts.includeBoardRanks) {
    const pageSize = Math.max(1, Math.min(opts.boardRankPageSize ?? 10, 50))
    const [shRank, szRank] = await Promise.all([
      fetchTencentBoardRankList({
        boardCode: 'bkqtRank_A_sh',
        sortType: 'priceRatio',
        direct: 'down',
        offset: 0,
        count: pageSize,
      }).catch((e) => {
        rethrowIfFreeProviderThrottleTrigger(e)
        return { rank_list: [], total: 0 }
      }),
      fetchTencentBoardRankList({
        boardCode: 'bkqtRank_A_sz',
        sortType: 'priceRatio',
        direct: 'down',
        offset: 0,
        count: pageSize,
      }).catch((e) => {
        rethrowIfFreeProviderThrottleTrigger(e)
        return { rank_list: [], total: 0 }
      }),
    ])
    result.boardRanks = {
      shanghai: {
        boardCode: 'bkqtRank_A_sh',
        total: shRank.total ?? 0,
        items: mapTencentIndustryConstituentRows(shRank.rank_list ?? []),
      },
      shenzhen: {
        boardCode: 'bkqtRank_A_sz',
        total: szRank.total ?? 0,
        items: mapTencentIndustryConstituentRows(szRank.rank_list ?? []),
      },
    }
  }

  return result
}
