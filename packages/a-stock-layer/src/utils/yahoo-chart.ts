import type { StockKline, StockRealtime } from '@opptrix/shared'
import { usDateFromMs, usQuoteSessionLabel, resolveUsQuoteSession, type UsQuoteSession } from './us-market.js'

function n(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function yahooMarketSession(meta: Record<string, unknown>): UsQuoteSession {
  const state = String(meta.marketState ?? meta.marketHours ?? '').toUpperCase()
  if (state.includes('PRE')) return 'pre'
  if (state === 'REGULAR') return 'regular'
  if (state.includes('POST')) return 'post'
  if (state === 'CLOSED') return 'closed'
  return resolveUsQuoteSession()
}

export function parseYahooRealtime(
  json: Record<string, unknown>,
  displayCode: string,
): StockRealtime[] | null {
  try {
    const result = ((json.chart as Record<string, unknown>)?.result as unknown[])?.[0] as Record<string, unknown> | undefined
    if (!result) return null
    const meta = result.meta as Record<string, unknown>
    const session = yahooMarketSession(meta)
    const preMarketPrice = n(meta.preMarketPrice)
    const postMarketPrice = n(meta.postMarketPrice)
    const regularPrice = n(meta.regularMarketPrice)
    const preClose = n(meta.chartPreviousClose) ?? n(meta.previousClose)
    let price = regularPrice ?? preClose
    if (session === 'pre' && preMarketPrice != null) price = preMarketPrice
    else if (session === 'post' && postMarketPrice != null) price = postMarketPrice
    let changePct = n(meta.regularMarketChangePercent)
    if (session === 'pre') changePct = n(meta.preMarketChangePercent) ?? changePct
    if (session === 'post') changePct = n(meta.postMarketChangePercent) ?? changePct
    if (changePct != null && Math.abs(changePct) < 1 && changePct !== 0) {
      changePct = changePct * 100
    }
    if (changePct == null && price != null && preClose != null && preClose !== 0) {
      changePct = ((price - preClose) / preClose) * 100
    }
    return [{
      code: displayCode,
      name: String(meta.shortName ?? meta.longName ?? displayCode),
      price,
      changePct,
      pe: null,
      pb: null,
      turnoverRate: null,
      open: n(meta.regularMarketOpen),
      high: n(meta.regularMarketDayHigh),
      low: n(meta.regularMarketDayLow),
      preClose,
      volume: n(meta.regularMarketVolume),
      amount: null,
      quoteSession: session,
      sessionLabel: usQuoteSessionLabel(session),
      preMarketPrice,
      postMarketPrice,
    }]
  } catch {
    return null
  }
}

export function parseYahooKlines(
  json: Record<string, unknown>,
  displayCode: string,
  count?: number,
): StockKline[] | null {
  try {
    const result = ((json.chart as Record<string, unknown>)?.result as unknown[])?.[0] as Record<string, unknown> | undefined
    if (!result) return null
    const timestamps = (result.timestamp ?? []) as number[]
    const quote = ((result.indicators as Record<string, unknown>)?.quote as unknown[])?.[0] as Record<string, unknown[]>
    if (!quote) return null
    const opens = quote.open ?? []
    const highs = quote.high ?? []
    const lows = quote.low ?? []
    const closes = quote.close ?? []
    const volumes = quote.volume ?? []
    const rows: StockKline[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = n(closes[i])
      if (close == null) continue
      const open = n(opens[i]) ?? close
      const prev = rows.length ? rows[rows.length - 1]!.close : open
      rows.push({
        code: displayCode,
        date: usDateFromMs((timestamps[i] ?? 0) * 1000),
        open,
        high: n(highs[i]) ?? close,
        low: n(lows[i]) ?? close,
        close,
        volume: n(volumes[i]) ?? 0,
        amount: 0,
        changePct: prev ? ((close - prev) / prev) * 100 : null,
        turnoverRate: null,
      })
    }
    const limit = count ?? rows.length
    return rows.slice(-limit).length ? rows.slice(-limit) : null
  } catch {
    return null
  }
}
