import {
  getRegionalEquitySeedCount,
  getRegionalEquitySeeds,
  type RegionalEquitySeed,
} from '@opptrix/a-stock-layer'

export type RegionalListSeed = RegionalEquitySeed

/** @deprecated use getRegionalEquitySeeds from @opptrix/a-stock-layer */
export function getRegionalListSeeds(market: 'JP' | 'KR' | 'HK'): readonly RegionalListSeed[] {
  return getRegionalEquitySeeds(market)
}

export function getRegionalListSeedCount(market: 'JP' | 'KR' | 'HK'): number {
  return getRegionalEquitySeedCount(market)
}

export function regionalListJobMarket(job: string): 'JP' | 'KR' | 'HK' | null {
  if (job === 'jp_list') return 'JP'
  if (job === 'kr_list') return 'KR'
  if (job === 'hk_list') return 'HK'
  return null
}

export function isRegionalListJob(job: string): job is 'jp_list' | 'kr_list' | 'hk_list' {
  return regionalListJobMarket(job) != null
}

export function regionalQuotesJobMarket(job: string): 'JP' | 'KR' | 'HK' | null {
  if (job === 'jp_quotes') return 'JP'
  if (job === 'kr_quotes') return 'KR'
  if (job === 'hk_quotes') return 'HK'
  return null
}

export function isRegionalQuotesJob(job: string): job is 'jp_quotes' | 'kr_quotes' | 'hk_quotes' {
  return regionalQuotesJobMarket(job) != null
}
