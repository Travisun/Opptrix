import type { InstrumentRef, Market } from './market-data.js'
import {
  buildInstrumentNamespace,
  buildOpptrixInstrumentId,
  canonicalCnSymbol,
  normalizeInstrumentRef,
} from './instrument-symbol.js'

export type PortfolioLedgerKind = 'exchange' | 'otc_fund'
export type TradeSide = 'buy' | 'sell'

/** inherit = 使用全局默认；none = 不计费 */
export type FeeCalcMode = 'inherit' | 'none' | 'rate' | 'min_rate' | 'fixed'

export interface FeeRule {
  mode: FeeCalcMode
  /** 费率小数，如 0.00025 表示 0.025% */
  rate?: number
  /** 最低费用，用于 min_rate */
  min?: number
  /** 固定每笔费用，用于 fixed */
  fixed?: number
}

/** 场内交易费率模板 — 对齐主流券商字段 */
export interface ExchangeFeeTemplate {
  commission: FeeRule
  stampDuty: FeeRule
  transferFee: FeeRule
  /** 平台费 / 交易系统使用费（美股常见） */
  platformFee?: FeeRule
}

export interface OtcFundFeeTemplate {
  subscriptionFee: FeeRule
  redemptionFee: FeeRule
}

export interface PortfolioGlobalFees {
  cn: ExchangeFeeTemplate
  us: ExchangeFeeTemplate
  hk: ExchangeFeeTemplate
  otcFund: OtcFundFeeTemplate
  /** 旧版单模板；加载时迁移到 cn */
  exchange?: ExchangeFeeTemplate
}

export interface InstrumentFeeOverrides {
  ledgerKind?: PortfolioLedgerKind
  commission?: FeeRule
  stampDuty?: FeeRule
  transferFee?: FeeRule
  platformFee?: FeeRule
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

const DEFAULT_CN_EXCHANGE: ExchangeFeeTemplate = {
  commission: DEFAULT_EXCHANGE_COMMISSION,
  stampDuty: DEFAULT_STAMP_DUTY,
  transferFee: DEFAULT_TRANSFER_FEE,
  platformFee: DEFAULT_FEE_NONE,
}

/** 美股常见：佣金 + 卖出规费（SEC/TAF 等合并到 stamp/transfer 槽位） */
const DEFAULT_US_EXCHANGE: ExchangeFeeTemplate = {
  commission: { mode: 'min_rate', rate: 0.0003, min: 0.99 },
  stampDuty: { mode: 'rate', rate: 0.0000278 },
  transferFee: { mode: 'rate', rate: 0.000166 },
  platformFee: { mode: 'none' },
}

/** 港股常见：佣金 + 印花税 + 交易征费/财汇局征费等 */
const DEFAULT_HK_EXCHANGE: ExchangeFeeTemplate = {
  commission: { mode: 'min_rate', rate: 0.0003, min: 3 },
  stampDuty: { mode: 'rate', rate: 0.001 },
  transferFee: { mode: 'rate', rate: 0.0000565 },
  platformFee: { mode: 'none' },
}

export const DEFAULT_PORTFOLIO_GLOBAL_FEES: PortfolioGlobalFees = {
  cn: structuredClone(DEFAULT_CN_EXCHANGE),
  us: structuredClone(DEFAULT_US_EXCHANGE),
  hk: structuredClone(DEFAULT_HK_EXCHANGE),
  otcFund: {
    subscriptionFee: DEFAULT_FEE_NONE,
    redemptionFee: DEFAULT_FEE_NONE,
  },
}

export function marketFeeCurrencyUnit(market?: Market | string): string {
  if (market === 'US') return '美元'
  if (market === 'HK') return '港币'
  return '元'
}

export function marketFeeCurrencySymbol(market?: Market | string): string {
  if (market === 'US') return '$'
  if (market === 'HK') return 'HK$'
  return '¥'
}

function cloneExchangeTemplate(t: ExchangeFeeTemplate): ExchangeFeeTemplate {
  return structuredClone(t)
}

/** 读盘 / API 入参归一 — 兼容旧版仅 exchange 字段 */
export function normalizePortfolioGlobalFees(raw: unknown): PortfolioGlobalFees {
  const base = structuredClone(DEFAULT_PORTFOLIO_GLOBAL_FEES)
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Partial<PortfolioGlobalFees>
  if (obj.exchange && typeof obj.exchange === 'object') {
    base.cn = { ...base.cn, ...cloneExchangeTemplate(obj.exchange) }
  }
  if (obj.cn && typeof obj.cn === 'object') {
    base.cn = { ...base.cn, ...cloneExchangeTemplate(obj.cn) }
  }
  if (obj.us && typeof obj.us === 'object') {
    base.us = { ...base.us, ...cloneExchangeTemplate(obj.us) }
  }
  if (obj.hk && typeof obj.hk === 'object') {
    base.hk = { ...base.hk, ...cloneExchangeTemplate(obj.hk) }
  }
  if (obj.otcFund && typeof obj.otcFund === 'object') {
    base.otcFund = { ...base.otcFund, ...structuredClone(obj.otcFund) }
  }
  return base
}

export function resolveMarketExchangeFees(
  globalFees: PortfolioGlobalFees,
  market?: Market,
): ExchangeFeeTemplate {
  const normalized = normalizePortfolioGlobalFees(globalFees)
  if (market === 'US') return normalized.us
  if (market === 'HK') return normalized.hk
  return normalized.cn
}

function isCnFundHoldingsRef(ref: InstrumentRef): boolean {
  const exUp = ref.exchange?.toUpperCase()
  return ref.assetClass === 'FUND' || exUp === 'PF' || exUp === 'OF'
}

/** 持仓账本与 API 返回 holdings[].code 对齐 — Opptrix ID */
export function portfolioHoldingsStorageKey(ref: InstrumentRef): string {
  return buildOpptrixInstrumentId(normalizeInstrumentRef(ref))
}

/**
 * 读路径别名：Opptrix + 命名空间 + 旧裸码 / CN:PF（不覆盖同码个股槽位由调用方决定）
 */
export function portfolioHoldingsStorageKeyAliases(ref: InstrumentRef): string[] {
  const n = normalizeInstrumentRef(ref)
  const aliases = new Set<string>()
  aliases.add(portfolioHoldingsStorageKey(n))
  aliases.add(buildInstrumentNamespace(n))
  aliases.add(n.symbol)
  if (n.market === 'CN') {
    const bare = canonicalCnSymbol(n.symbol)
    aliases.add(bare)
    if (isCnFundHoldingsRef(n)) {
      aliases.add(`CN:PF.${bare}`)
      aliases.add(`CN:OF.${bare}`)
      aliases.add(`${bare}.OF`)
    }
  }
  if (n.market === 'HK') {
    aliases.add(`HK:${n.symbol}`)
    aliases.add(n.symbol.replace(/^0+/, '') || n.symbol)
  }
  if (n.market === 'US') {
    aliases.add(`US:${n.symbol}`)
  }
  return [...aliases]
}

/** A 股场内上市基金代码段（ETF / LOF 等） */
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
  if (ref.assetClass === 'REIT') return 'otc_fund'
  if (ref.assetClass === 'FUND') {
    return isCnListedFundSymbol(ref.symbol) ? 'exchange' : 'otc_fund'
  }
  if (ref.assetClass === 'LOF' || ref.assetClass === 'ETF') return 'exchange'
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
  const cn: ExchangeFeeTemplate = {
    commission: { mode: 'min_rate', rate: cfg.commissionRate, min: cfg.commissionMin },
    stampDuty: { mode: 'rate', rate: cfg.stampDutyRate },
    transferFee: { mode: 'rate', rate: cfg.transferFeeRate },
    platformFee: DEFAULT_FEE_NONE,
  }
  return {
    cn: structuredClone(cn),
    us: structuredClone(DEFAULT_US_EXCHANGE),
    hk: structuredClone(DEFAULT_HK_EXCHANGE),
    otcFund: structuredClone(DEFAULT_PORTFOLIO_GLOBAL_FEES.otcFund),
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
  market?: Market
}): TradeFeeBreakdown {
  const { ledgerKind, side, amount, globalFees, overrides, market } = input
  let commission = 0
  let stampDuty = 0
  let transferFee = 0

  if (ledgerKind === 'exchange') {
    const tpl = resolveMarketExchangeFees(globalFees, market)
    const comm = resolveFeeRule(overrides?.commission, tpl.commission)
    const platform = resolveFeeRule(overrides?.platformFee, tpl.platformFee ?? DEFAULT_FEE_NONE)
    const stamp = resolveFeeRule(overrides?.stampDuty, tpl.stampDuty)
    const transfer = resolveFeeRule(overrides?.transferFee, tpl.transferFee)

    commission = round2(calcOne(comm, amount) + calcOne(platform, amount))

    if (!market || market === 'CN') {
      transferFee = round2(calcOne(transfer, amount))
      stampDuty = side === 'sell' ? round2(calcOne(stamp, amount)) : 0
    } else if (market === 'HK') {
      transferFee = round2(calcOne(transfer, amount))
      stampDuty = round2(calcOne(stamp, amount))
    } else if (market === 'US') {
      if (side === 'sell') {
        stampDuty = round2(calcOne(stamp, amount))
        transferFee = round2(calcOne(transfer, amount))
      }
    }
  } else {
    const normalized = normalizePortfolioGlobalFees(globalFees)
    const sub = resolveFeeRule(overrides?.subscriptionFee, normalized.otcFund.subscriptionFee)
    const red = resolveFeeRule(overrides?.redemptionFee, normalized.otcFund.redemptionFee)
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
    market: ref.market,
  })
}
