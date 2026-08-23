import type { InstrumentRef } from './market-data.js'
import { canonicalCnSymbol } from './instrument-symbol.js'

export type PortfolioLedgerKind = 'exchange' | 'otc_fund'
export type TradeSide = 'buy' | 'sell'

/** inherit = 使用全局默认；none = 不计费 */
export type FeeCalcMode = 'inherit' | 'none' | 'rate' | 'min_rate' | 'fixed'

export interface FeeRule {
  mode: FeeCalcMode
  /** 费率小数，如 0.00025 表示 0.025% */
  rate?: number
  /** 最低费用（元），用于 min_rate */
  min?: number
  /** 固定每笔费用（元），用于 fixed */
  fixed?: number
}

export interface ExchangeFeeTemplate {
  commission: FeeRule
  stampDuty: FeeRule
  transferFee: FeeRule
}

export interface OtcFundFeeTemplate {
  subscriptionFee: FeeRule
  redemptionFee: FeeRule
}

export interface PortfolioGlobalFees {
  exchange: ExchangeFeeTemplate
  otcFund: OtcFundFeeTemplate
}

export interface InstrumentFeeOverrides {
  ledgerKind?: PortfolioLedgerKind
  commission?: FeeRule
  stampDuty?: FeeRule
  transferFee?: FeeRule
  subscriptionFee?: FeeRule
  redemptionFee?: FeeRule
}

export interface TradeFeeBreakdown {
  commission: number
  stampDuty: number
  transferFee: number
  totalFee: number
}

export const FEE_MODE_INHERIT: FeeCalcMode = 'inherit'

export const DEFAULT_EXCHANGE_COMMISSION: FeeRule = { mode: 'min_rate', rate: 0.00025, min: 5 }
export const DEFAULT_STAMP_DUTY: FeeRule = { mode: 'rate', rate: 0.0005 }
export const DEFAULT_TRANSFER_FEE: FeeRule = { mode: 'rate', rate: 0.00001 }
export const DEFAULT_FEE_NONE: FeeRule = { mode: 'none' }

export const DEFAULT_PORTFOLIO_GLOBAL_FEES: PortfolioGlobalFees = {
  exchange: {
    commission: DEFAULT_EXCHANGE_COMMISSION,
    stampDuty: DEFAULT_STAMP_DUTY,
    transferFee: DEFAULT_TRANSFER_FEE,
  },
  otcFund: {
    subscriptionFee: DEFAULT_FEE_NONE,
    redemptionFee: DEFAULT_FEE_NONE,
  },
}

/** 场内上市基金代码段（ETF / LOF 等） */
export function isCnListedFundSymbol(symbol: string): boolean {
  const c = canonicalCnSymbol(symbol)
  if (c.length !== 6) return false
  const head2 = c.slice(0, 2)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (c.startsWith('159') || c.startsWith('16')) return true
  return false
}

/** 持仓记账类型：场内按交易所规则；场外按申赎费 */
export function resolvePortfolioLedgerKind(ref: InstrumentRef): PortfolioLedgerKind {
  if (ref.market !== 'CN') return 'exchange'
  if (ref.assetClass === 'FUND') {
    return isCnListedFundSymbol(ref.symbol) ? 'exchange' : 'otc_fund'
  }
  return 'exchange'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function resolveFeeRule(rule: FeeRule | undefined, fallback: FeeRule): FeeRule {
  if (!rule || rule.mode === 'inherit') return fallback
  return rule
}

function calcOne(rule: FeeRule, amount: number): number {
  switch (rule.mode) {
    case 'none':
      return 0
    case 'rate':
      return amount * (rule.rate ?? 0)
    case 'min_rate':
      return Math.max(amount * (rule.rate ?? 0), rule.min ?? 0)
    case 'fixed':
      return rule.fixed ?? 0
  }
  return 0
}

/** 兼容旧版扁平 FeeConfig */
export interface LegacyFlatFeeConfig {
  commissionRate: number
  commissionMin: number
  stampDutyRate: number
  transferFeeRate: number
}

export const DEFAULT_LEGACY_FLAT_FEE_CONFIG: LegacyFlatFeeConfig = {
  commissionRate: 0.00025,
  commissionMin: 5,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
}

export function legacyFlatFeesToGlobal(cfg: LegacyFlatFeeConfig): PortfolioGlobalFees {
  return {
    exchange: {
      commission: { mode: 'min_rate', rate: cfg.commissionRate, min: cfg.commissionMin },
      stampDuty: { mode: 'rate', rate: cfg.stampDutyRate },
      transferFee: { mode: 'rate', rate: cfg.transferFeeRate },
    },
    otcFund: { ...DEFAULT_PORTFOLIO_GLOBAL_FEES.otcFund },
  }
}

export function legacyFlatPartialToOverrides(
  partial: Partial<LegacyFlatFeeConfig>,
): InstrumentFeeOverrides {
  const overrides: InstrumentFeeOverrides = {}
  if (partial.commissionRate != null || partial.commissionMin != null) {
    overrides.commission = {
      mode: 'min_rate',
      rate: partial.commissionRate ?? DEFAULT_LEGACY_FLAT_FEE_CONFIG.commissionRate,
      min: partial.commissionMin ?? DEFAULT_LEGACY_FLAT_FEE_CONFIG.commissionMin,
    }
  }
  if (partial.stampDutyRate != null) {
    overrides.stampDuty = { mode: 'rate', rate: partial.stampDutyRate }
  }
  if (partial.transferFeeRate != null) {
    overrides.transferFee = { mode: 'rate', rate: partial.transferFeeRate }
  }
  return overrides
}

export function calcPortfolioTradeFees(input: {
  ledgerKind: PortfolioLedgerKind
  side: TradeSide
  amount: number
  globalFees: PortfolioGlobalFees
  overrides?: InstrumentFeeOverrides
}): TradeFeeBreakdown {
  const { ledgerKind, side, amount, globalFees, overrides } = input
  let commission = 0
  let stampDuty = 0
  let transferFee = 0

  if (ledgerKind === 'exchange') {
    const comm = resolveFeeRule(overrides?.commission, globalFees.exchange.commission)
    const stamp = resolveFeeRule(overrides?.stampDuty, globalFees.exchange.stampDuty)
    const transfer = resolveFeeRule(overrides?.transferFee, globalFees.exchange.transferFee)
    commission = round2(calcOne(comm, amount))
    transferFee = round2(calcOne(transfer, amount))
    stampDuty = side === 'sell' ? round2(calcOne(stamp, amount)) : 0
  } else {
    const sub = resolveFeeRule(overrides?.subscriptionFee, globalFees.otcFund.subscriptionFee)
    const red = resolveFeeRule(overrides?.redemptionFee, globalFees.otcFund.redemptionFee)
    commission = side === 'buy'
      ? round2(calcOne(sub, amount))
      : round2(calcOne(red, amount))
  }

  return {
    commission,
    stampDuty,
    transferFee,
    totalFee: round2(commission + stampDuty + transferFee),
  }
}

export function estimatePortfolioTradeFees(
  ref: InstrumentRef,
  side: TradeSide,
  shares: number,
  price: number,
  globalFees: PortfolioGlobalFees,
  overrides?: InstrumentFeeOverrides,
): TradeFeeBreakdown {
  const amount = Math.round(shares * price * 100) / 100
  const ledgerKind = overrides?.ledgerKind ?? resolvePortfolioLedgerKind(ref)
  return calcPortfolioTradeFees({
    ledgerKind,
    side,
    amount,
    globalFees,
    overrides,
  })
}
