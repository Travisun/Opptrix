import { parseTickflowSymbol } from '../api/symbols.js'

export interface TickflowMarketDepth {
  symbol: string
  region: string
  timestamp: number
  bid_prices: number[]
  bid_volumes: number[]
  ask_prices: number[]
  ask_volumes: number[]
}

export function mapTickflowDepth(depth: TickflowMarketDepth): Record<string, unknown> {
  const { code, market } = parseTickflowSymbol(depth.symbol)
  return {
    code,
    market,
    symbol: depth.symbol,
    region: depth.region,
    timestamp: depth.timestamp,
    bidPrices: depth.bid_prices,
    bidVolumes: depth.bid_volumes,
    askPrices: depth.ask_prices,
    askVolumes: depth.ask_volumes,
  }
}
