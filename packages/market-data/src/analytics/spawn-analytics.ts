import { klineDuckDbPath, marketDbPath } from '../paths.js'
import { getMarketDuckGateway, type AnalyticsSyncScope } from '../duck/market-duck-gateway.js'

export type { AnalyticsSyncScope }

export function syncAnalyticsViaSubprocess(
  scope: AnalyticsSyncScope = 'all',
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): Record<string, number> {
  return getMarketDuckGateway(duckDbPath, sqliteDbPath).syncAnalyticsSync(scope)
}

export function analyticsStatsViaSubprocess(duckDbPath = klineDuckDbPath()) {
  return getMarketDuckGateway(duckDbPath).analyticsStatsSync()
}

export function hasAnalyticsDimsViaSubprocess(duckDbPath = klineDuckDbPath()): boolean {
  return getMarketDuckGateway(duckDbPath).hasMarketData()
}
