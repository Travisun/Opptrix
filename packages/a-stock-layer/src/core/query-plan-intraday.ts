import type { DriverRegistry } from './registry.js'
import { Capability } from './capabilities.js'
import type { IntradayTrendFetchResult } from '../utils/intraday-trends.js'
import type { StockMarket } from '../utils/helpers.js'

/** Intraday sessions — licensed providers with INTRADAY_TICK (e.g. TickFlow for CN). */
export async function executeIntradaySessionsPlan(
  registry: DriverRegistry,
  code: string,
  ndays = 5,
  market?: StockMarket,
): Promise<{ success: true; data: IntradayTrendFetchResult; source: string } | { success: false; error: string }> {
  const data = await fetchLicensedIntradaySessions(registry, code, ndays, market)
  if (data?.sessions.length) {
    return { success: true, data, source: data.source ?? 'unknown' }
  }
  return {
    success: false,
    error: '暂无分时数据。请在设置 → 数据源中启用 TickFlow 并配置 API Key。',
  }
}

async function fetchLicensedIntradaySessions(
  registry: DriverRegistry,
  code: string,
  ndays = 5,
  market?: StockMarket,
): Promise<(IntradayTrendFetchResult & { source?: string }) | null> {
  const drivers = registry.getDriversForCapability(Capability.INTRADAY_TICK)
  for (const driver of drivers) {
    const fn = (driver as { fetchIntradaySessions?: (c: string, n?: number, m?: StockMarket) => Promise<unknown> })
      .fetchIntradaySessions
    if (typeof fn !== 'function') continue
    try {
      const data = await fn.call(driver, code, ndays, market)
      if (data && typeof data === 'object' && 'sessions' in data) {
        const sessions = (data as IntradayTrendFetchResult).sessions
        if (sessions?.length) return { ...(data as IntradayTrendFetchResult), source: driver.name }
      }
    } catch {
      /* try next driver */
    }
  }
  return null
}
