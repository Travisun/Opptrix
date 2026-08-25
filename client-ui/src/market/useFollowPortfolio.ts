import { useCallback, useEffect, useRef, useState } from 'react'
import { portfolioClearInstrument, portfolioDeleteTrade, portfolioTrade, research } from '../api/client'
import type { PortfolioSummaryData, PortfolioTradeItem } from '../types/schemas'
import { normalizeCode, portfolioHoldingsKey } from './format'
import {
  instrumentKey,
  tryParseInstrumentInput,
  normalizeInstrumentRefLocal,
} from './instrument'
import { portfolioHoldingsStorageKey } from '@opptrix/shared/portfolio-fees'
import type { Market } from '../types/instrument'

export type HoldingSnapshot = PortfolioSummaryData['holdings'][number]

function holdingRowRef(row: HoldingSnapshot) {
  const parsed = tryParseInstrumentInput(row.code.trim())
  if (parsed) return normalizeInstrumentRefLocal(parsed)
  const market = (row.market ?? 'CN') as Market
  return normalizeInstrumentRefLocal({
    market,
    assetClass: 'EQUITY',
    symbol: row.code.trim(),
  })
}

function indexHoldingRow(map: Record<string, HoldingSnapshot>, row: HoldingSnapshot) {
  const ref = holdingRowRef(row)
  const keys = [
    portfolioHoldingsStorageKey(ref),
    instrumentKey(ref),
    portfolioHoldingsKey(row.code, row.market),
  ]
  for (const key of keys) {
    if (key) map[key] = row
  }
}

export function useFollowPortfolio(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const [holdingsByCode, setHoldingsByCode] = useState<Record<string, HoldingSnapshot>>({})
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const tradesCache = useRef<Record<string, PortfolioTradeItem[]>>({})

  const tradeCacheKey = (code: string, market?: string) => {
    const trimmed = code.trim()
    if (/^CN:/i.test(trimmed)) {
      const parsed = tryParseInstrumentInput(trimmed)
      return parsed ? instrumentKey(parsed) : trimmed
    }
    return `${market ?? 'CN'}:${trimmed}`
  }

  const resolveTradeLookupCode = (code: string, market?: string) => {
    const trimmed = code.trim()
    if (market && market !== 'CN') return trimmed
    if (/^CN:/i.test(trimmed)) return trimmed
    return normalizeCode(trimmed)
  }

  const refreshHoldings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await research.portfolioSummary()
      if (resp.success && resp.data) {
        setSummary(resp.data)
        const map: Record<string, HoldingSnapshot> = {}
        for (const row of resp.data.holdings) {
          indexHoldingRow(map, row)
        }
        setHoldingsByCode(map)
      } else {
        setError(resp.message || '组合数据加载失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '组合数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    void refreshHoldings()
    const timer = window.setInterval(() => { void refreshHoldings() }, 20000)
    return () => window.clearInterval(timer)
  }, [refreshHoldings, enabled])

  const loadTrades = useCallback(async (code: string, market?: string) => {
    const cacheKey = tradeCacheKey(code, market)
    const lookupCode = resolveTradeLookupCode(code, market)
    try {
      const resp = await research.portfolioTrades(lookupCode, market)
      if (resp.success && resp.data?.trades) {
        tradesCache.current[cacheKey] = resp.data.trades
        return resp.data.trades
      }
    } catch { /* ignore */ }
    return tradesCache.current[cacheKey] ?? []
  }, [])

  const submitTrade = useCallback(async (payload: {
    code: string
    market?: string
    shares: number
    price: number
    side: 'buy' | 'sell'
    date?: string
  }) => {
    await portfolioTrade(payload)
    await refreshHoldings()
    return loadTrades(payload.code, payload.market)
  }, [loadTrades, refreshHoldings])

  const deleteTrade = useCallback(async (id: number, code: string, market?: string) => {
    await portfolioDeleteTrade(id)
    await refreshHoldings()
    return loadTrades(code, market)
  }, [loadTrades, refreshHoldings])

  const clearPortfolioForCode = useCallback(async (code: string, market?: string) => {
    try {
      await portfolioClearInstrument(code, market)
    } catch {
      /* best-effort cleanup when removing watchlist row */
    }
    delete tradesCache.current[tradeCacheKey(code, market)]
    setHoldingsByCode(prev => {
      const next = { ...prev }
      const ref = tryParseInstrumentInput(code)
      const keys = new Set<string>()
      keys.add(portfolioHoldingsKey(code, market))
      if (ref) {
        keys.add(portfolioHoldingsStorageKey(normalizeInstrumentRefLocal(ref)))
        keys.add(instrumentKey(ref))
      }
      for (const k of keys) {
        if (k) delete next[k]
      }
      return next
    })
    await refreshHoldings()
  }, [refreshHoldings])

  const isHolding = useCallback((code: string, market?: string) => {
    const row = holdingsByCode[portfolioHoldingsKey(code, market)]
    return Boolean(row && row.shares > 0)
  }, [holdingsByCode])

  return {
    holdingsByCode,
    summary,
    loading,
    error,
    refreshHoldings,
    loadTrades,
    submitTrade,
    deleteTrade,
    clearPortfolioForCode,
    isHolding,
  }
}
