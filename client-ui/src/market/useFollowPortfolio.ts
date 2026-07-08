import { useCallback, useEffect, useRef, useState } from 'react'
import { portfolioClearInstrument, portfolioDeleteTrade, portfolioTrade, research } from '../api/client'
import type { PortfolioSummaryData, PortfolioTradeItem } from '../types/schemas'
import { normalizeCode } from './format'

export type HoldingSnapshot = PortfolioSummaryData['holdings'][number]

export function useFollowPortfolio() {
  const [holdingsByCode, setHoldingsByCode] = useState<Record<string, HoldingSnapshot>>({})
  const [loading, setLoading] = useState(false)
  const tradesCache = useRef<Record<string, PortfolioTradeItem[]>>({})

  const refreshHoldings = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await research.portfolioSummary()
      if (resp.success && resp.data?.holdings) {
        const map: Record<string, HoldingSnapshot> = {}
        for (const row of resp.data.holdings) {
          map[normalizeCode(row.code)] = row
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

  const loadTrades = useCallback(async (code: string) => {
    const normalized = normalizeCode(code)
    try {
      const resp = await research.portfolioTrades(normalized)
      if (resp.success && resp.data?.trades) {
        tradesCache.current[normalized] = resp.data.trades
        return resp.data.trades
      }
    } catch { /* ignore */ }
    return tradesCache.current[normalized] ?? []
  }, [])

  const submitTrade = useCallback(async (payload: {
    code: string
    shares: number
    price: number
    side: 'buy' | 'sell'
    date?: string
  }) => {
    await portfolioTrade(payload)
    await refreshHoldings()
    return loadTrades(payload.code)
  }, [loadTrades, refreshHoldings])

  const deleteTrade = useCallback(async (id: number, code: string) => {
    await portfolioDeleteTrade(id)
    await refreshHoldings()
    return loadTrades(code)
  }, [loadTrades, refreshHoldings])

  const clearPortfolioForCode = useCallback(async (code: string) => {
    const normalized = normalizeCode(code)
    try {
      await portfolioClearInstrument(code)
    } catch {
      /* best-effort cleanup when removing watchlist row */
    }
    delete tradesCache.current[normalized]
    delete tradesCache.current[code.trim()]
    setHoldingsByCode(prev => {
      const next = { ...prev }
      delete next[normalized]
      delete next[code.trim()]
      return next
    })
    await refreshHoldings()
  }, [refreshHoldings])

  const isHolding = useCallback((code: string) => {
    const row = holdingsByCode[normalizeCode(code)]
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
