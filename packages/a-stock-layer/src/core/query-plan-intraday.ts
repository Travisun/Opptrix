import type { DriverRegistry } from './registry.js'
import { Capability } from './capabilities.js'
import type { IntradayTrendFetchResult } from '../utils/intraday-trends.js'
import { minuteKlinesToIntradaySessions } from '../utils/intraday-trends.js'
import type { StockMarket } from '../utils/helpers.js'
import type { StockKline } from '@opptrix/shared'

type IntradayDriver = {
  name: string
  fetchIntradaySessions?: (c: string, n?: number, m?: StockMarket) => Promise<unknown>
  minuteTrendKline?: (c: string, ndays?: number, count?: number) => Promise<StockKline[] | null>
}

/** Intraday sessions — licensed + 在线 fallback（sinafinance / 腾讯 minuteTrendKline） */
export async function executeIntradaySessionsPlan(
  registry: DriverRegistry,
  code: string,
  ndays = 5,
  market?: StockMarket,
): Promise<{ success: true; data: IntradayTrendFetchResult; source: string } | { success: false; error: string }> {
  const licensed = await fetchIntradaySessionsFromDrivers(
    registry.getDriversForCapability(Capability.INTRADAY_TICK) as IntradayDriver[],
    code,
    ndays,
    market,
  )
  if (licensed) {
    return { success: true, data: licensed, source: licensed.source ?? 'unknown' }
  }

  const online = await fetchIntradaySessionsFromDrivers(
    ['sinafinance', 'tencent'].map(id => registry.get(id)).filter(Boolean) as IntradayDriver[],
    code,
    1,
    market,
    { minuteFallbackOnly: true },
  )
  if (online) {
    return { success: true, data: online, source: online.source ?? 'unknown' }
  }

  return {
    success: false,
    error: '暂无分时数据，请稍后重试或检查网络连接',
  }
}

async function fetchIntradaySessionsFromDrivers(
  drivers: IntradayDriver[],
  code: string,
  ndays: number,
  market?: StockMarket,
  opts?: { minuteFallbackOnly?: boolean },
): Promise<(IntradayTrendFetchResult & { source?: string }) | null> {
  for (const driver of drivers) {
    if (!opts?.minuteFallbackOnly && typeof driver.fetchIntradaySessions === 'function') {
      try {
        const data = await driver.fetchIntradaySessions.call(driver, code, ndays, market)
        if (data && typeof data === 'object' && 'sessions' in data) {
          const sessions = (data as IntradayTrendFetchResult).sessions
          if (sessions?.some(s => s.bars.length > 0)) {
            return { ...(data as IntradayTrendFetchResult), source: driver.name }
          }
        }
      } catch {
        /* try next driver */
      }
    }

    if (typeof driver.minuteTrendKline === 'function') {
      try {
        const klines = await driver.minuteTrendKline.call(driver, code, 1, 800)
        const converted = minuteKlinesToIntradaySessions(klines ?? [])
        if (converted?.sessions.some(s => s.bars.length > 0)) {
          return { ...converted, source: driver.name }
        }
      } catch {
        /* try next driver */
      }
    }
  }
  return null
}
