import { klineDuckDbPath, marketDbPath } from '../paths.js'
import type { LocalUniverseScreenQuery } from '../query/screen.js'
import { getMarketDuckGateway, type AnalyticsSyncScope } from '../duck/market-duck-gateway.js'

export type { AnalyticsSyncScope }

export function syncAnalyticsViaSubprocess(
  scope: AnalyticsSyncScope = 'all',
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): Record<string, number> {
  return getMarketDuckGateway(duckDbPath, sqliteDbPath).syncAnalyticsSync(scope)
}

export function computeScreenFactorsViaSubprocess(
  tradeDate: string,
  codes?: string[],
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): { computed: number; written: number } {
  return getMarketDuckGateway(duckDbPath, sqliteDbPath).computeFactorsSync(tradeDate, codes)
}

export interface SpawnComputeFactorsOptions {
  tradeDate: string
  codes?: string[]
  duckDbPath?: string
  sqliteDbPath?: string
  onProgress?: (message: string, percent: number) => void
}

export async function spawnComputeScreenFactorsAsync(
  opts: SpawnComputeFactorsOptions,
): Promise<{ computed: number; written: number }> {
  const duckDbPath = opts.duckDbPath ?? klineDuckDbPath()
  const sqliteDbPath = opts.sqliteDbPath ?? marketDbPath()
  return getMarketDuckGateway(duckDbPath, sqliteDbPath).spawnComputeFactorsAsync(opts)
}

export function analyticsStatsViaSubprocess(duckDbPath = klineDuckDbPath()) {
  return getMarketDuckGateway(duckDbPath).analyticsStatsSync()
}

export function hasAnalyticsDimsViaSubprocess(duckDbPath = klineDuckDbPath()): boolean {
  return getMarketDuckGateway(duckDbPath).hasMarketData()
}

export function queryIndustryStatsViaSubprocess(
  tradeDate: string,
  duckDbPath = klineDuckDbPath(),
) {
  return getMarketDuckGateway(duckDbPath).queryIndustryStatsSync(tradeDate)
}

export function queryIndustryStocksViaSubprocess(
  industry: string,
  tradeDate: string,
  limit: number,
  duckDbPath = klineDuckDbPath(),
) {
  return getMarketDuckGateway(duckDbPath).queryIndustryStocksSync(industry, tradeDate, limit)
}

export function queryUniverseScreenViaSubprocess(
  query: LocalUniverseScreenQuery,
  tradeDate: string,
  duckDbPath = klineDuckDbPath(),
) {
  return getMarketDuckGateway(duckDbPath).queryUniverseScreenSync(query, tradeDate)
}
