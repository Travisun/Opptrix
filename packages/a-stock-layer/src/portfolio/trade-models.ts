import type { AssetClass, InstrumentRef, Market, TradeSide } from '@opptrix/shared'

export type { TradeSide }

export type TradeRecord = {
  id: number
  /** Opptrix ID（MARKET:CLASS:SYMBOL）；旧库可能仍为裸码，读路径双读 */
  code: string
  name: string
  market?: Market
  /** 可选；旧 JSON 无此字段时由 code 推断（FUND→CN:PF / ETF 代码段等） */
  assetClass?: AssetClass
  /** 权威 InstrumentRef；新成交强制写入 */
  instrument?: InstrumentRef
  tradeSide: TradeSide
  shares: number
  price: number
  amount: number
  commission: number
  stampDuty: number
  transferFee: number
  totalFee: number
  tradeDate: string
  createdAt?: string
}

export interface HoldingPosition {
  /** Opptrix ID，与 trades[].code 对齐 */
  code: string
  name: string
  market?: Market
  /** 与成交行一致；旧数据无字段时从 code 推断 */
  assetClass?: AssetClass
  instrument?: InstrumentRef
  shares: number
  costBasis: number
  totalCost: number
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  realizedPnl: number
  totalPnl: number
  totalPnlPct: number
}

export interface PnLSummary {
  totalCost: number
  totalMarketValue: number
  totalUnrealizedPnl: number
  totalRealizedPnl: number
  totalPnl: number
  totalPnlPct: number
  holdingsCount: number
  tradesCount: number
  holdings: HoldingPosition[]
}
