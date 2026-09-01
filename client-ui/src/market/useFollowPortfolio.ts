import { useCallback, useEffect, useRef, useState } from 'react'
import { portfolioClearInstrument, portfolioDeleteTrade, portfolioTrade, research } from '../api/client'
import type { PortfolioSummaryData, PortfolioTradeItem } from '../types/schemas'
import { portfolioHoldingsKey } from './format'
import {
  buildOpptrixInstrumentId,
  instrumentKey,
  tryParseInstrumentInput,
  normalizeInstrumentRefLocal,
} from './instrument'
import {
  portfolioHoldingsStorageKey,
  portfolioHoldingsStorageKeyAliases,
} from '@opptrix/shared/portfolio-fees'
import {
  portfolioTradeCacheKey,
  resolvePortfolioTradeLookupCode,
} from './portfolioTradeLookup'
import type { InstrumentRef, Market } from '../types/instrument'
import {
  UI_CACHE_TTL_MS,
  UI_POLL_INTERVAL_MS,
  decideRevalidate,
  resolveFetchedAtMs,
} from '@opptrix/shared'
import {
  readPortfolioSummarySessionCache,
  writePortfolioSummarySessionCache,
} from './rightPanelSessionCache'

export type HoldingSnapshot = PortfolioSummaryData['holdings'][number]

export function portfolioHoldingRef(row: HoldingSnapshot) {
  return holdingRowRef(row)
}

function holdingRowRef(row: HoldingSnapshot) {
  const trimmed = row.code.trim()
  const parsed = tryParseInstrumentInput(trimmed)
  const assetClass = row.assetClass as InstrumentRef['assetClass'] | undefined
  if (parsed) {
    return normalizeInstrumentRefLocal(
      assetClass ? { ...parsed, assetClass } : parsed,
    )
  }
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
  const opptrixKey = buildOpptrixInstrumentId(ref)
  if (opptrixKey && opptrixKey !== primary && opptrixKey !== nsKey) {
    map[opptrixKey] = row
  }
  const raw = row.code.trim()
  if (raw && raw !== primary && raw !== nsKey && raw !== opptrixKey) {
    map[raw] = row
  }
  if (ref.market === 'CN' && (ref.assetClass === 'FUND' || ref.exchange === 'PF')) {
    const bare = ref.symbol.replace(/\D/g, '').slice(-6).padStart(6, '0')
    if (bare && !map[bare]) map[bare] = row
  }
}

function buildHoldingsMap(data: PortfolioSummaryData): Record<string, HoldingSnapshot> {
  const map: Record<string, HoldingSnapshot> = {}
  for (const row of data.holdings) {
    indexHoldingRow(map, row)
  }
  return map
}

export function useFollowPortfolio(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const bootCache = readPortfolioSummarySessionCache()
  const lastFetchedAtRef = useRef(bootCache?.cached_at_ms ?? 0)

  const [holdingsByCode, setHoldingsByCode] = useState<Record<string, HoldingSnapshot>>(() => {
    return bootCache ? buildHoldingsMap(bootCache.data) : {}
  })
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(
    () => bootCache?.data ?? null,
  )
  const [loading, setLoading] = useState(() => !bootCache)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const tradesCache = useRef<Record<string, PortfolioTradeItem[]>>({})

  const refreshHoldings = useCallback(async (opts?: { force?: boolean }) => {
    const hasDisplayed = summary != null
    const mode = decideRevalidate({
      cachedAtMs: lastFetchedAtRef.current,
      ttlMs: UI_CACHE_TTL_MS.portfolioSummary,
      force: opts?.force,
      hasDisplayedData: hasDisplayed,
    })
    if (mode === 'skip') return

    const silent = hasDisplayed
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      const resp = await research.portfolioSummary(mode === 'hard' ? { refresh: true } : undefined)
      if (resp.success && resp.data) {
        const fetchedAtMs = resolveFetchedAtMs(Date.now(), null)
        writePortfolioSummarySessionCache(resp.data, fetchedAtMs)
        lastFetchedAtRef.current = fetchedAtMs
        setSummary(resp.data)
        const map: Record<string, HoldingSnapshot> = {}
        for (const row of resp.data.holdings) {
          indexHoldingRow(map, row)
        }
        setHoldingsByCode(map)
      } else if (!summary) {
        setError(resp.message || '组合数据加载失败')
      }
    } catch (e) {
      if (!summary) {
        setError(e instanceof Error ? e.message : '组合数据加载失败')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [summary])

  useEffect(() => {
    if (!enabled) return undefined
    void refreshHoldings()
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void refreshHoldings()
    }, UI_POLL_INTERVAL_MS.portfolioSummary)
    return () => window.clearInterval(timer)
  }, [refreshHoldings, enabled])

  const loadTrades = useCallback(async (
    code: string,
    market?: string,
    assetClass?: InstrumentRef['assetClass'],
  ) => {
    const cacheKey = portfolioTradeCacheKey(code, market, assetClass)
    const lookupCode = resolvePortfolioTradeLookupCode(code, market, assetClass)
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
    assetClass?: string
    instrument?: InstrumentRef
    name?: string
    shares: number
    price: number
    side: 'buy' | 'sell'
    date?: string
  }) => {
    const instrument = payload.instrument
      ? normalizeInstrumentRefLocal(payload.instrument)
      : (() => {
        const parsed = tryParseInstrumentInput(payload.code)
        return parsed
          ? normalizeInstrumentRefLocal(
            payload.assetClass
              ? { ...parsed, assetClass: payload.assetClass as InstrumentRef['assetClass'] }
              : parsed,
          )
          : undefined
      })()
    const code = instrument ? buildOpptrixInstrumentId(instrument) : payload.code.trim()
    const ac = (payload.assetClass ?? instrument?.assetClass) as InstrumentRef['assetClass'] | undefined
    await portfolioTrade({
      code,
      name: payload.name,
      shares: payload.shares,
      price: payload.price,
      side: payload.side,
      date: payload.date,
      market: payload.market ?? instrument?.market,
      assetClass: payload.assetClass ?? instrument?.assetClass,
      instrument,
    })
    await refreshHoldings({ force: true })
    return loadTrades(code, payload.market ?? instrument?.market, ac)
  }, [loadTrades, refreshHoldings])

  const deleteTrade = useCallback(async (
    id: number,
    code: string,
    market?: string,
    assetClass?: InstrumentRef['assetClass'],
  ) => {
    await portfolioDeleteTrade(id)
    await refreshHoldings({ force: true })
    return loadTrades(code, market, assetClass)
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
    delete tradesCache.current[portfolioTradeCacheKey(
      code,
      market,
      assetClass as InstrumentRef['assetClass'] | undefined,
    )]
    setHoldingsByCode(prev => {
      const next = { ...prev }
      const parsed = tryParseInstrumentInput(code)
      let ref: InstrumentRef | null = null
      if (parsed) {
        ref = normalizeInstrumentRefLocal(
          assetClass
            ? { ...parsed, assetClass: assetClass as InstrumentRef['assetClass'] }
            : parsed,
        )
      } else if (market) {
        ref = normalizeInstrumentRefLocal({
          market: market as Market,
          assetClass: (assetClass as InstrumentRef['assetClass']) ?? 'EQUITY',
          symbol: code.trim(),
        })
      }
      if (ref) {
        for (const alias of portfolioHoldingsStorageKeyAliases(ref)) {
          delete next[alias]
        }
        delete next[instrumentKey(ref)]
        delete next[buildOpptrixInstrumentId(ref)]
      }
      delete next[portfolioHoldingsKey(code, market)]
      delete next[code.trim()]
      return next
    })
    await refreshHoldings({ force: true })
  }, [refreshHoldings])

  const isHolding = useCallback((code: string, market?: string) => {
    const trimmed = code.trim()
    const parsed = tryParseInstrumentInput(trimmed)
    if (parsed) {
      const ref = normalizeInstrumentRefLocal(parsed)
      const row = holdingsByCode[portfolioHoldingsStorageKey(ref)]
        ?? holdingsByCode[instrumentKey(ref)]
        ?? holdingsByCode[buildOpptrixInstrumentId(ref)]
        ?? holdingsByCode[trimmed]
      return Boolean(row && row.shares > 0)
    }
    const row = holdingsByCode[portfolioHoldingsKey(code, market)] ?? holdingsByCode[trimmed]
    return Boolean(row && row.shares > 0)
  }, [holdingsByCode])

  return {
    holdingsByCode,
    summary,
    loading,
    refreshing,
    error,
    refreshHoldings,
    loadTrades,
    submitTrade,
    deleteTrade,
    clearPortfolioForCode,
    isHolding,
  }
}
