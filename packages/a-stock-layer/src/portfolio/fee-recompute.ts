import type { InstrumentFeeOverrides, PortfolioGlobalFees } from '@opptrix/shared'
import { resolvePortfolioLedgerKind } from '@opptrix/shared'
import { calcFeesFromSettings } from './models.js'
import type { TradeRecord } from './trade-models.js'
import {
  inferTradeAssetClass,
  portfolioDisplayCode,
  portfolioInstrumentRef,
} from './instrument.js'

function feesEqual(a: TradeRecord, b: TradeRecord): boolean {
  return a.commission === b.commission
    && a.stampDuty === b.stampDuty
    && a.transferFee === b.transferFee
    && a.totalFee === b.totalFee
}

function resolveOverridesForTrade(
  trade: TradeRecord,
  instrumentFees: Record<string, InstrumentFeeOverrides>,
): InstrumentFeeOverrides {
  const ac = inferTradeAssetClass(trade.code, trade.market, trade.assetClass)
  const key = portfolioDisplayCode(trade.code, trade.market, ac)
  return instrumentFees[key] ?? instrumentFees[trade.code] ?? {}
}

export function recomputeTradeRecordFees(
  trade: TradeRecord,
  globalFees: PortfolioGlobalFees,
  instrumentFees: Record<string, InstrumentFeeOverrides>,
): TradeRecord {
  const overrides = resolveOverridesForTrade(trade, instrumentFees)
  const ac = inferTradeAssetClass(trade.code, trade.market, trade.assetClass)
  const ref = portfolioInstrumentRef(trade.code, trade.market, ac)
  const ledgerKind = overrides.ledgerKind ?? resolvePortfolioLedgerKind(ref)
  const fees = calcFeesFromSettings(
    ledgerKind,
    trade.amount,
    trade.tradeSide,
    globalFees,
    overrides,
    ref.market,
  )
  return {
    ...trade,
    assetClass: trade.assetClass ?? ac,
    commission: fees.commission,
    stampDuty: fees.stampDuty,
    transferFee: fees.transferFee,
    totalFee: fees.totalFee,
  }
}

export function recomputeAllTradeFees(
  trades: TradeRecord[],
  globalFees: PortfolioGlobalFees,
  instrumentFees: Record<string, InstrumentFeeOverrides>,
): { trades: TradeRecord[]; updated: number } {
  let updated = 0
  const nextTrades = trades.map(trade => {
    const next = recomputeTradeRecordFees(trade, globalFees, instrumentFees)
    if (!feesEqual(trade, next)) updated += 1
    return next
  })
  return { trades: nextTrades, updated }
}
