import { useCallback, useEffect, useRef, useState } from 'react'
import { portfolioClearInstrument, portfolioDeleteTrade, portfolioTrade, research } from '../api/client'
import type { PortfolioSummaryData, PortfolioTradeItem } from '../types/schemas'
import { normalizeCode, portfolioHoldingsKey } from './format'

export type HoldingSnapshot = PortfolioSummaryData['holdings'][number]

export function useFollowPortfolio() {
  const [holdingsByCode, setHoldingsByCode] = useState<Record<string, HoldingSnapshot>>({})
  const [loading, setLoading] = useState(false)
  const tradesCache = useRef<Record<string, PortfolioTradeItem[]>>({})

  const tradeCacheKey = (code: string, market?: string) => `${market ?? 'CN'}:${code.trim()}`

  const refreshHoldings = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await research.portfolioSummary()
      if (resp.success && resp.data?.holdings) {
        const map: Record<string, HoldingSnapshot> = {}
        for (const row of resp.data.holdings) {
          const key = portfolioHoldingsKey(row.code, row.market)
          map[key] = row
        }
        setHoldingsByCode(map)
      }
    } catch {
      /* ignore transient errors */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshHoldings()
    const timer = window.setInterval(() => { void refreshHoldings() }, 20000)
    return () => window.clearInterval(timer)
  }, [refreshHoldings])

  const loadTrades = useCallback(async (code: string, market?: string) => {
    const cacheKey = tradeCacheKey(code, market)
    const lookupCode = market && market !== 'CN' ? code.trim() : normalizeCode(code)
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
      delete next[portfolioHoldingsKey(code, market)]
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
    loading,
    refreshHoldings,
    loadTrades,
    submitTrade,
    deleteTrade,
    clearPortfolioForCode,
    isHolding,
  }
}
