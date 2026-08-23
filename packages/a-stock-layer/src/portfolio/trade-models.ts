import type { Market, TradeSide } from '@opptrix/shared'

export type { TradeSide }

export type TradeRecord = {
  id: number
  code: string
  name: string
  market?: Market
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
  code: string
  name: string
  market?: Market
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
