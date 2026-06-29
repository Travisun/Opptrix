import { useMemo } from 'react'
import type { InstitutionRatingData, LatestEvalData, StrategySignalData } from '../types/schemas'
import type { ChipDistributionPoint, StockMoneyFlowItem, WatchlistItem } from '../types/market'
import type { WatchlistRadarItem } from '../types/schemas'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { buildDecisionCardViewModel, type DecisionCardViewModel } from './decisionCardLogic'

export interface RawDecisionPayload {
  evalData: LatestEvalData | null
  strategy: StrategySignalData | null
  institution: InstitutionRatingData | null
  cyq: ChipDistributionPoint | null
  radar: WatchlistRadarItem | null
}

export interface StockDecisionCardData {
  vm: DecisionCardViewModel
  evalData: LatestEvalData | null
  strategy: StrategySignalData | null
  institution: InstitutionRatingData | null
}

export function useStockDecisionCard(
  stock: WatchlistItem | null,
  raw: RawDecisionPayload | null,
  holding: HoldingSnapshot | null | undefined,
  price: number | null,
  moneyFlow: StockMoneyFlowItem | null | undefined,
  quotePe?: number | null,
  quotePb?: number | null,
) {
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

  return { data }
}
