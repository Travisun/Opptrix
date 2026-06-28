import { useCallback, useEffect, useMemo, useState } from 'react'
import { research } from '../api/client'
import type { InstitutionRatingData, LatestEvalData, StrategySignalData } from '../types/schemas'
import type { ApiResponse } from '../types/schemas'
import type { ChipDistributionPoint, StockMoneyFlowItem, WatchlistItem } from '../types/market'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { buildDecisionCardViewModel, type DecisionCardViewModel } from './decisionCardLogic'
import { normalizeCode } from './format'

export interface StockDecisionCardData {
  vm: DecisionCardViewModel
  evalData: LatestEvalData | null
  strategy: StrategySignalData | null
  institution: InstitutionRatingData | null
}

interface RawDecisionPayload {
  evalData: LatestEvalData | null
  strategy: StrategySignalData | null
  institution: InstitutionRatingData | null
  cyq: ChipDistributionPoint | null
  radar: import('../types/schemas').WatchlistRadarItem | null
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

function unwrapApi<T>(result: PromiseSettledResult<ApiResponse<T>>): T | null {
  if (result.status !== 'fulfilled' || !result.value.success) return null
  return result.value.data ?? null
}

function firstRejectionMessage(results: PromiseSettledResult<unknown>[]): string {
  for (const result of results) {
    if (result.status === 'rejected') {
      const reason = result.reason
      if (isAbortError(reason)) continue
      if (reason instanceof Error) return reason.message
    }
  }
  return '分析加载失败'
}

export function useStockDecisionCard(
  stock: WatchlistItem | null,
  holding: HoldingSnapshot | null | undefined,
  price: number | null,
  moneyFlow: StockMoneyFlowItem | null | undefined,
  quotePe?: number | null,
  quotePb?: number | null,
) {
  const [raw, setRaw] = useState<RawDecisionPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const stockCode = stock?.code ?? null

  useEffect(() => {
    if (!stockCode || !stock) {
      setRaw(null)
      setError('')
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    let active = true

    setRaw(null)
    setLoading(true)
    setError('')

    void (async () => {
      try {
        const [evalResult, strategyResult, instResult, cyqResult, radarResult] = await Promise.allSettled([
          research.latestEval(stockCode, controller.signal),
          research.strategySignals(stockCode, controller.signal),
          research.institutionRating(stockCode, undefined, controller.signal),
          research.stockCyq(stockCode, controller.signal),
          research.watchlistRadar([stockCode], controller.signal),
        ])

        if (!active || controller.signal.aborted) return

        const evalData = unwrapApi(evalResult)
        const strategy = unwrapApi(strategyResult)
        const institution = unwrapApi(instResult)
        const cyqData = unwrapApi(cyqResult)
        const cyq = cyqData?.latest ?? null
        const radarItems = unwrapApi(radarResult)?.items ?? []
        const normCode = normalizeCode(stockCode)
        const radar = radarItems.find(item => normalizeCode(item.code) === normCode) ?? radarItems[0] ?? null

        const payload: RawDecisionPayload = { evalData, strategy, institution, cyq, radar }
        setRaw(payload)

        if (!evalData && !strategy && !institution && !cyq) {
          setError(firstRejectionMessage([evalResult, strategyResult, instResult, cyqResult]))
        }
      } catch (e) {
        if (!active || controller.signal.aborted || isAbortError(e)) return
        setError(e instanceof Error ? e.message : '分析加载失败')
        setRaw(null)
      } finally {
        if (active && !controller.signal.aborted) setLoading(false)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [stock, stockCode, reloadToken])

  const data = useMemo((): StockDecisionCardData | null => {
    if (!stock || !raw) return null
    const vm = buildDecisionCardViewModel({
      stock,
      price,
      evalData: raw.evalData,
      strategy: raw.strategy,
      institution: raw.institution,
      cyq: raw.cyq,
      moneyFlow: moneyFlow ?? null,
      holding,
      quotePe,
      quotePb,
      radar: raw.radar,
    })
    return {
      vm,
      evalData: raw.evalData,
      strategy: raw.strategy,
      institution: raw.institution,
    }
  }, [stock, raw, price, holding, moneyFlow, quotePe, quotePb])

  const reload = useCallback(() => {
    setReloadToken(token => token + 1)
  }, [])

  return { data, loading, error, reload }
}
