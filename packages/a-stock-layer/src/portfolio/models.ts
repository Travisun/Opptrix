import type {
  InstrumentFeeOverrides,
  LegacyFlatFeeConfig,
  PortfolioGlobalFees,
  TradeSide,
  TradeFeeBreakdown,
} from '@opptrix/shared'
import {
  DEFAULT_LEGACY_FLAT_FEE_CONFIG,
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  calcPortfolioTradeFees,
  legacyFlatFeesToGlobal,
  legacyFlatPartialToOverrides,
} from '@opptrix/shared'

export type FeeConfig = LegacyFlatFeeConfig

export const DEFAULT_FEE_CONFIG: FeeConfig = { ...DEFAULT_LEGACY_FLAT_FEE_CONFIG }

export type { TradeRecord, HoldingPosition, PnLSummary, TradeSide } from './trade-models.js'

export type {
  FeeRule,
  FeeCalcMode,
  PortfolioLedgerKind,
  PortfolioGlobalFees,
  InstrumentFeeOverrides,
  ExchangeFeeTemplate,
  OtcFundFeeTemplate,
  TradeFeeBreakdown,
} from '@opptrix/shared'

export {
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  DEFAULT_EXCHANGE_COMMISSION,
  DEFAULT_STAMP_DUTY,
  DEFAULT_TRANSFER_FEE,
  DEFAULT_FEE_NONE,
  resolvePortfolioLedgerKind,
  estimatePortfolioTradeFees,
  calcPortfolioTradeFees,
  resolveFeeRule,
  legacyFlatFeesToGlobal,
  legacyFlatPartialToOverrides,
} from '@opptrix/shared'

export function migrateLegacyFeeState(input: {
  config?: Partial<FeeConfig>
  stockConfig?: Record<string, Partial<FeeConfig>>
}): { globalFees: PortfolioGlobalFees; instrumentFees: Record<string, InstrumentFeeOverrides> } {
  const globalFees = legacyFlatFeesToGlobal({
    ...DEFAULT_LEGACY_FLAT_FEE_CONFIG,
    ...input.config,
  })
  const instrumentFees: Record<string, InstrumentFeeOverrides> = {}
  if (input.stockConfig) {
    for (const [key, partial] of Object.entries(input.stockConfig)) {
      const overrides = legacyFlatPartialToOverrides(partial)
      if (Object.keys(overrides).length > 0) instrumentFees[key] = overrides
    }
  }
  return { globalFees, instrumentFees }
}

export function calcFeesFromSettings(
  ledgerKind: 'exchange' | 'otc_fund',
  amount: number,
  side: TradeSide,
  globalFees: PortfolioGlobalFees,
  overrides?: InstrumentFeeOverrides,
): TradeFeeBreakdown {
  return calcPortfolioTradeFees({
    ledgerKind,
    side,
    amount,
    globalFees,
    overrides,
  })
}
