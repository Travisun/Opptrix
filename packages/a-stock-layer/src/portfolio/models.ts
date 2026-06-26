export type TradeSide = 'buy' | 'sell'

export interface TradeRecord {
  id: number
  code: string
  name: string
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

export interface FeeConfig {
  commissionRate: number
  commissionMin: number
  stampDutyRate: number
  transferFeeRate: number
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  commissionRate: 0.00025,
  commissionMin: 5,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
}
