/** aaashare unified data schemas (extends @inno-a-stock/shared where applicable) */
export type {
  FinancialSummary, QueryResult, StockKline, StockListItem, StockRealtime,
} from '@inno-a-stock/shared'

export interface MoneyFlow {
  code: string
  date: string
  mainNet?: number | null
  superLargeNet?: number | null
  largeNet?: number | null
  mediumNet?: number | null
  smallNet?: number | null
  mainNetPct?: number | null
  close?: number | null
  changePct?: number | null
}

export interface IndexRealtime {
  code: string
  name?: string
  price?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  preClose?: number | null
  change?: number | null
  changePct?: number | null
  volume?: number | null
  amount?: number | null
  timestamp?: string
}

export interface IndexKline {
  code: string
  date: string
  open: number
  close: number
  high: number
  low: number
  volume?: number
  amount?: number
  changePct?: number | null
}

export interface MarketMoneyFlow {
  direction: string
  date: string
  netAmount: number
  shNet?: number | null
  szNet?: number | null
  cumulative?: number | null
}

export interface SectorMoneyFlow {
  sectorCode: string
  sectorName: string
  date: string
  netAmount?: number | null
  changePct?: number | null
}

export interface StockProfile {
  code: string
  name?: string
  industry?: string
  concepts?: string[]
  listingDate?: string
  mainBusiness?: string
  totalMarketCap?: number | null
  circulatingMarketCap?: number | null
  employees?: number | null
  province?: string
  city?: string
  website?: string
}

export interface NewsItem {
  code: string
  title: string
  date: string
  url?: string
  source?: string
  type?: string
}

export interface SentimentData {
  code: string
  score?: number | null
  label?: string
  summary?: string
  timestamp?: string
}

export interface Dividend {
  code: string
  year?: string
  cashBonus?: number | null
  stockBonus?: number | null
  exDate?: string
  recordDate?: string
}

export interface DragonTiger {
  code: string
  name: string
  date: string
  reason?: string
  buyAmount?: number | null
  sellAmount?: number | null
  netAmount?: number | null
  changePct?: number | null
}

export interface LimitUpDown {
  code: string
  name: string
  date: string
  type: 'limit_up' | 'limit_down'
  changePct?: number | null
  reason?: string
}

export interface GlobalIndex {
  code: string
  name: string
  price?: number | null
  changePct?: number | null
  market?: string
  timestamp?: string
}

export interface TechnicalIndicator {
  code: string
  date: string
  ma5?: number | null
  ma10?: number | null
  ma20?: number | null
  ma60?: number | null
  rsi6?: number | null
  rsi12?: number | null
  macd?: number | null
  macdSignal?: number | null
  macdHist?: number | null
}
