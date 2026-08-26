import type { AssetClass, InstrumentRef, Market } from './market-data.js'
import { hasApplicationCapability } from './instrument-capabilities.js'
import { normalizeInstrumentRef } from './instrument-symbol.js'
import { resolvePortfolioLedgerKind, type PortfolioLedgerKind } from './portfolio-fees.js'

/** 持仓数量单位 — 股 / 份（ETF·基金） / 张（扩展位） */
export type PortfolioQuantityUnit = 'share' | 'unit' | 'contract'

/** 计价用的 InstrumentDataCapability 别名（与 a-stock-layer 对齐） */
export type PortfolioMarkCapability = 'realtime' | 'fund_quote'

export interface PortfolioProfile {
  ledgerKind: PortfolioLedgerKind
  quantityUnit: PortfolioQuantityUnit
  /** 是否开放持仓盈亏（与 application capability `portfolio_pnl` 对齐） */
  supportsPnl: boolean
  /** 持仓盯市拉取能力；FUND 走 fund_quote，其余 realtime */
  markCapability: PortfolioMarkCapability
}

type ProfileKey = `${Market}:${AssetClass}`

/**
 * 轻量 Adapter：按 market+assetClass 解析账本类型 / 数量单位 / 是否支持盈亏 / 盯市能力。
 * 新标的加一行即可，勿在 buy/sell / UI 散落 if/else。
 */
const PORTFOLIO_PROFILE_TABLE: Partial<Record<ProfileKey, Omit<PortfolioProfile, 'ledgerKind'>>> = {
  'CN:EQUITY': { quantityUnit: 'share', supportsPnl: true, markCapability: 'realtime' },
  'CN:ETF': { quantityUnit: 'unit', supportsPnl: true, markCapability: 'realtime' },
  'CN:LOF': { quantityUnit: 'unit', supportsPnl: true, markCapability: 'realtime' },
  'CN:REIT': { quantityUnit: 'unit', supportsPnl: true, markCapability: 'fund_quote' },
  'CN:FUND': { quantityUnit: 'unit', supportsPnl: true, markCapability: 'fund_quote' },
  'CN:INDEX': { quantityUnit: 'share', supportsPnl: false, markCapability: 'realtime' },
  'US:EQUITY': { quantityUnit: 'share', supportsPnl: true, markCapability: 'realtime' },
  'US:ETF': { quantityUnit: 'unit', supportsPnl: true, markCapability: 'realtime' },
  'US:INDEX': { quantityUnit: 'share', supportsPnl: false, markCapability: 'realtime' },
  'HK:EQUITY': { quantityUnit: 'share', supportsPnl: true, markCapability: 'realtime' },
  'HK:ETF': { quantityUnit: 'unit', supportsPnl: true, markCapability: 'realtime' },
  'HK:INDEX': { quantityUnit: 'share', supportsPnl: false, markCapability: 'realtime' },
  // CRYPTO：扩展位已挂好；supportsPnl=false，与能力矩阵 portfolio_pnl 关闭对齐
  'CRYPTO:CRYPTO_SPOT': { quantityUnit: 'unit', supportsPnl: false, markCapability: 'realtime' },
  'CRYPTO:CRYPTO_PERP': { quantityUnit: 'contract', supportsPnl: false, markCapability: 'realtime' },
  'JP:EQUITY': { quantityUnit: 'share', supportsPnl: false, markCapability: 'realtime' },
  'KR:EQUITY': { quantityUnit: 'share', supportsPnl: false, markCapability: 'realtime' },
}

function defaultProfile(ref: InstrumentRef): Omit<PortfolioProfile, 'ledgerKind'> {
  if (ref.assetClass === 'INDEX') {
    return { quantityUnit: 'share', supportsPnl: false, markCapability: 'realtime' }
  }
  if (ref.assetClass === 'FUND' || ref.assetClass === 'REIT') {
    return { quantityUnit: 'unit', supportsPnl: true, markCapability: 'fund_quote' }
  }
  if (ref.assetClass === 'ETF' || ref.assetClass === 'LOF') {
    return { quantityUnit: 'unit', supportsPnl: true, markCapability: 'realtime' }
  }
  if (ref.market === 'CRYPTO') {
    return { quantityUnit: 'unit', supportsPnl: false, markCapability: 'realtime' }
  }
  return { quantityUnit: 'share', supportsPnl: true, markCapability: 'realtime' }
}

/**
 * 解析持仓账本 profile — 单一注册点。
 * supportsPnl 以能力矩阵为准；表内声明可再收紧（不可擅自打开矩阵未开的能力）。
 */
export function resolvePortfolioProfile(ref: InstrumentRef): PortfolioProfile {
  const normalized = normalizeInstrumentRef(ref)
  const key = `${normalized.market}:${normalized.assetClass}` as ProfileKey
  const row = PORTFOLIO_PROFILE_TABLE[key] ?? defaultProfile(normalized)
  const matrixAllowsPnl = hasApplicationCapability(normalized, 'portfolio_pnl')
  return {
    ledgerKind: resolvePortfolioLedgerKind(normalized),
    quantityUnit: row.quantityUnit,
    supportsPnl: row.supportsPnl && matrixAllowsPnl,
    markCapability: row.markCapability,
  }
}
