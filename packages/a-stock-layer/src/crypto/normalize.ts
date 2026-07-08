import type { StockKline, StockRealtime } from '@opptrix/shared'
import type { CryptoPairRef } from '../utils/crypto-market.js'
import { formatCryptoKlineDate } from '../utils/crypto-kline.js'

function n(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export function mapBinanceTicker(pair: CryptoPairRef, row: Record<string, unknown>): StockRealtime {
  const price = n(row.lastPrice)
  const changePct = n(row.priceChangePercent)
  return {
    code: pair.pair,
    name: pair.pair,
    price,
    changePct,
    pe: null,
    pb: null,
    turnoverRate: null,
    open: n(row.openPrice),
    high: n(row.highPrice),
    low: n(row.lowPrice),
    preClose: n(row.prevClosePrice),
    volume: n(row.volume),
    amount: n(row.quoteVolume),
  }
}

export function mapBinanceKlines(
  pair: CryptoPairRef,
  rows: unknown[],
  intraday = false,
): StockKline[] {
  const out: StockKline[] = []
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue
    const open = n(row[1]) ?? 0
    const close = n(row[4]) ?? 0
    const prev = out.length ? out[out.length - 1]!.close : open
    out.push({
      code: pair.pair,
      date: String(row[0]),
      open,
      high: n(row[2]) ?? close,
      low: n(row[3]) ?? close,
      close,
      volume: n(row[5]) ?? 0,
      amount: n(row[7]) ?? 0,
      changePct: prev ? ((close - prev) / prev) * 100 : null,
      turnoverRate: null,
    })
  }
  return out.map(k => ({
    ...k,
    date: formatCryptoKlineDate(k.date, intraday),
  }))
}

export function mapOkxTicker(pair: CryptoPairRef, row: Record<string, unknown>): StockRealtime {
  const price = n(row.last)
  const open = n(row.open24h)
  let changePct: number | null = null
  if (price != null && open != null && open !== 0) {
    changePct = ((price - open) / open) * 100
  }
  return {
    code: pair.pair,
    name: pair.pair,
    price,
    changePct,
    pe: null,
    pb: null,
    turnoverRate: null,
    open,
    high: n(row.high24h),
    low: n(row.low24h),
    preClose: open,
    volume: n(row.vol24h),
    amount: n(row.volCcy24h),
  }
}

export function mapOkxCandles(
  pair: CryptoPairRef,
  rows: unknown[],
  intraday = false,
): StockKline[] {
  const out: StockKline[] = []
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue
    const ts = n(row[0])
    const open = n(row[1]) ?? 0
    const close = n(row[4]) ?? 0
    const prev = out.length ? out[out.length - 1]!.close : open
    out.push({
      code: pair.pair,
      date: ts != null ? String(ts) : String(row[0]),
      open,
      high: n(row[2]) ?? close,
      low: n(row[3]) ?? close,
      close,
      volume: n(row[5]) ?? 0,
      amount: n(row[6]) ?? 0,
      changePct: prev ? ((close - prev) / prev) * 100 : null,
      turnoverRate: null,
    })
  }
  return out.reverse().map(k => ({
    ...k,
    date: formatCryptoKlineDate(k.date, intraday),
  }))
}
