import type { LimitUpDown } from '@opptrix/a-stock-layer'
import { normalizeCode } from '@opptrix/a-stock-layer'

export type MarketLimitUpItem = {
  code: string
  name: string
  change_pct: number | null
  price?: number | null
  change_amt?: number | null
  reason?: string
  continue_day_text?: string
  board_label?: string
}

export type MarketHotItem = {
  code: string
  name: string
  rank?: number | null
  heat?: number | null
  rank_change?: number | null
}

export type MarketLimitLadderBoard = {
  key: string
  label: string
  items: Array<{
    code: string
    name: string
    board_num?: number
    price?: number | null
    change_pct?: number | null
    change_amt?: number | null
  }>
}

export type MarketLimitLadder = {
  date: string | null
  boards: MarketLimitLadderBoard[]
}

const LADDER_BOARD_DEFS = [
  { key: 'two_board', label: '2板', boardNum: 2 },
  { key: 'three_board', label: '3板', boardNum: 3 },
  { key: 'four_board', label: '4板', boardNum: 4 },
  { key: 'five_board', label: '5板', boardNum: 5 },
  { key: 'six_board', label: '6板', boardNum: 6 },
  { key: 'seven_over', label: '7板及以上', boardNum: 7 },
] as const

const MAX_LADDER_ITEMS_PER_BOARD = 8

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function bareCodeFromRow(row: Record<string, unknown>): string {
  const raw = String(row.thscode ?? row.ticker ?? row.code ?? '').trim()
  if (!raw) return ''
  const dot = raw.indexOf('.')
  return normalizeCode(dot >= 0 ? raw.slice(0, dot) : raw)
}

function numField(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function strField(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function ladderDateFromRow(row: Record<string, unknown>): string | null {
  const ymd = strField(row, 'date', 'trade_date', 'tradeDate')
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd
  const ms = numField(row, 'date_ms', 'trade_date_ms')
  if (ms != null && ms > 0) {
    const d = new Date(ms)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return null
}

function mapLadderStock(
  row: unknown,
  boardNum: number,
): { code: string; name: string; board_num?: number } | null {
  if (!isRecord(row)) return null
  const code = bareCodeFromRow(row)
  if (!code) return null
  const name = strField(row, 'name', 'stock_name') || code
  const cnt = numField(row, 'continue_day_cnt', 'board_num', 'limit_up_days')
  return {
    code,
    name,
    board_num: cnt ?? boardNum,
  }
}

/** 解析同花顺连板天梯 custom 响应为 UI 精简结构。 */
export function parseCnLimitLadder(raw: unknown): MarketLimitLadder | null {
  const envelope = Array.isArray(raw) ? raw[0] : raw
  if (!isRecord(envelope)) return null

  const dayRows = Array.isArray(envelope.item) ? envelope.item : []
  const latest = dayRows[0]
  if (!isRecord(latest)) return null

  const date = ladderDateFromRow(latest)
  const boardsRaw = latest.boards
  if (!isRecord(boardsRaw)) {
    return date ? { date, boards: [] } : null
  }

  const boards: MarketLimitLadderBoard[] = []
  for (const def of LADDER_BOARD_DEFS) {
    const list = boardsRaw[def.key]
    if (!Array.isArray(list)) continue
    const items = list
      .map(row => mapLadderStock(row, def.boardNum))
      .filter((item): item is NonNullable<typeof item> => item != null)
      .slice(0, MAX_LADDER_ITEMS_PER_BOARD)
    if (items.length) {
      boards.push({ key: def.key, label: def.label, items })
    }
  }

  if (!boards.length && !date) return null
  return { date, boards }
}

export function mapCnLimitUpItems(rows: LimitUpDown[]): MarketLimitUpItem[] {
  return rows
    .filter(row => row.type === 'limit_up')
    .map(row => {
      const ext = row as LimitUpDown & {
        continueDayText?: string
        continueDayCnt?: number | null
      }
      const continueText = ext.continueDayText?.trim()
        || (ext.continueDayCnt != null && ext.continueDayCnt > 1
          ? `${Math.round(ext.continueDayCnt)}连板`
          : undefined)
      return {
        code: row.code,
        name: row.name,
        change_pct: row.changePct ?? null,
        reason: row.reason?.trim() || undefined,
        continue_day_text: continueText,
        board_label: continueText,
      }
    })
    .filter(item => item.code)
}

export type MarketAnomalyItem = {
  code: string
  name: string
  reason?: string
  tag?: string
  change_pct?: number | null
}

export function mapCnLimitBreakItems(raw: unknown): MarketLimitUpItem[] {
  if (!Array.isArray(raw)) return []
  const out: MarketLimitUpItem[] = []
  for (const row of raw) {
    if (!isRecord(row)) continue
    const code = bareCodeFromRow(row)
    if (!code) continue
    const name = strField(row, 'name', 'stock_name') || code
    out.push({
      code,
      name,
      change_pct: numField(row, 'price_change_ratio_pct', 'change_pct', 'changePct'),
      reason: strField(row, 'reason', 'limit_break_reason', 'break_reason') || undefined,
    })
  }
  return out
}

export function mapCnHotStockItems(raw: unknown): MarketHotItem[] {
  return mapCnSkyrocketItems(raw)
}

export function mapCnAnomalyItems(raw: unknown): MarketAnomalyItem[] {
  if (!Array.isArray(raw)) return []
  const out: MarketAnomalyItem[] = []
  for (const row of raw) {
    if (!isRecord(row)) continue
    const code = bareCodeFromRow(row)
    if (!code) continue
    const name = strField(row, 'name', 'stock_name') || code
    out.push({
      code,
      name,
      reason: strField(row, 'reason', 'anomaly_reason', 'content', 'title') || undefined,
      tag: strField(row, 'tag', 'tag_name', 'anomaly_tag') || undefined,
      change_pct: numField(row, 'price_change_ratio_pct', 'change_pct', 'changePct'),
    })
  }
  return out
}

export function mapCnSkyrocketItems(raw: unknown): MarketHotItem[] {
  if (!Array.isArray(raw)) return []
  const out: MarketHotItem[] = []
  for (const row of raw) {
    if (!isRecord(row)) continue
    const code = bareCodeFromRow(row)
    if (!code) continue
    const name = strField(row, 'name', 'stock_name') || code
    out.push({
      code,
      name,
      rank: numField(row, 'rank', 'hot_rank', 'order'),
      heat: numField(row, 'heat', 'hot_value', 'hot_score', 'score'),
      rank_change: numField(row, 'rank_change', 'rankChange', 'rank_delta', 'change_rank'),
    })
  }
  return out
}
