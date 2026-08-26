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
import type { InstrumentRef, Market } from '../types/instrument'

export type HoldingSnapshot = PortfolioSummaryData['holdings'][number]

function holdingRowRef(row: HoldingSnapshot) {
  const trimmed = row.code.trim()
  const parsed = tryParseInstrumentInput(trimmed)
  if (parsed) return normalizeInstrumentRefLocal(parsed)
  // CN:PF.xxx / xxx.OF 等场外基金命名（与 shared parse 对齐的兜底）
  const fundNs = /^CN:(?:PF|OF)[.:](\d{6})$/i.exec(trimmed)
  if (fundNs) {
    return normalizeInstrumentRefLocal({
      market: 'CN',
      assetClass: 'FUND',
      symbol: fundNs[1]!,
      exchange: 'PF',
    })
  }
  const fundSuffix = /^(\d{6})\.(?:OF|PF)$/i.exec(trimmed)
  if (fundSuffix) {
    return normalizeInstrumentRefLocal({
      market: 'CN',
      assetClass: 'FUND',
      symbol: fundSuffix[1]!,
      exchange: 'PF',
    })
  }
  const market = (row.market ?? 'CN') as Market
  const assetClass = (row as { assetClass?: InstrumentRef['assetClass'] }).assetClass
  // 优先持仓行 assetClass；未知时仍默认 EQUITY，但六位裸码保留 market
  return normalizeInstrumentRefLocal({
    market,
    assetClass: assetClass ?? 'EQUITY',
    symbol: trimmed,
  })
}

function indexHoldingRow(map: Record<string, HoldingSnapshot>, row: HoldingSnapshot) {
  const ref = holdingRowRef(row)
  const primary = portfolioHoldingsStorageKey(ref)
  map[primary] = row
  const nsKey = instrumentKey(ref)
  if (nsKey && nsKey !== primary) map[nsKey] = row
  // 历史场外基金裸六位 alias：仅当槽位空闲，避免盖掉同码个股
  if (ref.market === 'CN' && (ref.assetClass === 'FUND' || ref.exchange === 'PF')) {
    const bare = ref.symbol.replace(/\D/g, '').slice(-6).padStart(6, '0')
    if (bare && !map[bare]) map[bare] = row
  }
}

export function useFollowPortfolio(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const [holdingsByCode, setHoldingsByCode] = useState<Record<string, HoldingSnapshot>>({})
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const tradesCache = useRef<Record<string, PortfolioTradeItem[]>>({})

  /** 与 store portfolioCodesMatch / 账本对齐的稳定缓存键 */
  const tradeCacheKey = (code: string, market?: string) => {
    const trimmed = code.trim()
    const parsed = tryParseInstrumentInput(trimmed)
    if (parsed) {
      const ref = normalizeInstrumentRefLocal(parsed)
      const storageKey = portfolioHoldingsStorageKey(ref)
      if (ref.market === 'CN') {
        return storageKey.startsWith('CN:') ? storageKey : `CN:${storageKey}`
      }
      return instrumentKey(ref)
    }
    const fundNs = /^CN:(?:PF|OF)[.:](\d{6})$/i.exec(trimmed)
    if (fundNs) return `CN:PF.${fundNs[1]}`
    const fundSuffix = /^(\d{6})\.(?:OF|PF)$/i.exec(trimmed)
    if (fundSuffix) return `CN:PF.${fundSuffix[1]}`
    if (market && market !== 'CN') return `${market}:${trimmed}`
    if (/^\d{6}$/.test(trimmed)) return `CN:${normalizeCode(trimmed)}`
    return `${market ?? 'CN'}:${trimmed}`
  }

  const resolveTradeLookupCode = (code: string, market?: string) => {
    const trimmed = code.trim()
    const parsed = tryParseInstrumentInput(trimmed)
    if (parsed) {
      const ref = normalizeInstrumentRefLocal(parsed)
      if (ref.assetClass === 'FUND' || ref.exchange === 'PF' || ref.exchange === 'OF') {
        const key = portfolioHoldingsStorageKey(ref)
        return key.startsWith('CN:PF.') ? key : `CN:PF.${key}`
      }
      if (ref.market === 'CN') return portfolioHoldingsStorageKey(ref)
      return ref.symbol
    }
    const fundNs = /^CN:(?:PF|OF)[.:](\d{6})$/i.exec(trimmed)
    if (fundNs) return `CN:PF.${fundNs[1]}`
    const fundSuffix = /^(\d{6})\.(?:OF|PF)$/i.exec(trimmed)
    if (fundSuffix) return `CN:PF.${fundSuffix[1]}`
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
      // 失败勿用空数组覆盖已有成功缓存
    } catch { /* ignore */ }
    return tradesCache.current[cacheKey] ?? []
  }, [])

  const submitTrade = useCallback(async (payload: {
    code: string
    market?: string
    assetClass?: string
    instrument?: InstrumentRef
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

  const clearPortfolioForCode = useCallback(async (
    code: string,
    market?: string,
    assetClass?: string,
  ) => {
    try {
      await portfolioClearInstrument(code, market, assetClass)
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
      if (assetClass && ref) {
        keys.add(instrumentKey({ ...ref, assetClass: assetClass as import('../types/instrument').InstrumentRef['assetClass'] }))
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
