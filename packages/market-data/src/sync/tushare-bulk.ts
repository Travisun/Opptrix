import { isTushareEnabled, TushareClient, fromTsCode } from '@opptrix/a-stock-layer'
import { KLINE_BOOTSTRAP_DAYS } from './config.js'

export interface BulkDailyBar {
  code: string
  tradeDate: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  amount: number | null
  changePct: number | null
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function fmtDate(v: unknown): string {
  const s = String(v ?? '')
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return s.slice(0, 10)
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function ymdDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export function tushareBulkEnabled(): boolean {
  return isTushareEnabled()
}

export async function fetchRecentOpenTradeDates(count: number): Promise<string[]> {
  if (!isTushareEnabled()) return []
  const client = new TushareClient()
  const rows = await client.queryAll(
    'trade_cal',
    { exchange: 'SSE', start_date: ymdDaysAgo(count * 2 + 30), end_date: todayYmd() },
    'cal_date,is_open',
  )
  return rows
    .filter(r => String(r.is_open) === '1')
    .map(r => fmtDate(r.cal_date))
    .sort()
    .slice(-count)
}

export async function fetchBulkDailyBars(tradeDate: string): Promise<BulkDailyBar[]> {
  if (!isTushareEnabled()) return []
  const client = new TushareClient()
  const ymd = tradeDate.replace(/-/g, '')
  const rows = await client.queryAll(
    'daily',
    { trade_date: ymd },
    'ts_code,trade_date,open,high,low,close,vol,amount,pct_chg',
  )
  return rows.map(r => ({
    code: fromTsCode(String(r.ts_code ?? '')),
    tradeDate: fmtDate(r.trade_date),
    open: num(r.open),
    high: num(r.high),
    low: num(r.low),
    close: num(r.close),
    volume: num(r.vol),
    amount: num(r.amount),
    changePct: num(r.pct_chg),
  }))
}

export async function listBootstrapTradeDates(): Promise<string[]> {
  return fetchRecentOpenTradeDates(KLINE_BOOTSTRAP_DAYS)
}
