import type { DriverRegistry } from './registry.js'
import { Capability } from './capabilities.js'
import { tdxClient } from '../providers/tdx/client.js'
import {
  hasIntradaySessionOnDate,
  mergeIntradaySessions,
} from '../providers/tdx/intraday.js'
import type { IntradayTrendFetchResult } from '../utils/intraday-trends.js'
import { cnTodayString, shouldPreferTodayIntraday } from '../utils/market-session.js'
import type { StockMarket } from '../utils/helpers.js'

/** Intraday session merge — TDX history + EastMoney today (formerly Engine inline). */
export async function executeIntradaySessionsPlan(
  registry: DriverRegistry,
  code: string,
  ndays = 5,
  market?: StockMarket,
): Promise<{ success: true; data: IntradayTrendFetchResult; source: string } | { success: false; error: string }> {
  const today = cnTodayString()
  const preferToday = shouldPreferTodayIntraday()

  let tdx: IntradayTrendFetchResult | null = null
  try {
    tdx = await tdxClient.fetchIntradaySessions(code, ndays, market)
  } catch { /* EastMoney supplement */ }

  const em = await fetchEastmoneyIntradaySessions(registry, code, ndays, market)

  if (preferToday && em && hasIntradaySessionOnDate(em.sessions, today)) {
    const emToday = em.sessions.find(row => row.sessionDate === today)!
    const tdxHistory = (tdx?.sessions ?? []).filter(row => row.sessionDate !== today)
    const merged = mergeIntradaySessions(
      [...tdxHistory, emToday],
      em.apiPreClose ?? tdx?.apiPreClose ?? null,
    )
    if (merged.sessions.length) {
      const source = hasIntradaySessionOnDate(tdx?.sessions ?? [], today) ? 'tdx' : 'eastmoney'
      return { success: true, data: merged, source }
    }
  }

  if (tdx?.sessions.length) {
    return { success: true, data: tdx, source: 'tdx' }
  }
  if (em?.sessions.length) {
    return { success: true, data: em, source: 'eastmoney' }
  }
  return { success: false, error: '分时数据获取失败' }
}

async function fetchEastmoneyIntradaySessions(
  registry: DriverRegistry,
  code: string,
  ndays = 5,
  market?: StockMarket,
): Promise<IntradayTrendFetchResult | null> {
  const drivers = registry.getDriversForCapability(Capability.INTRADAY_TICK)
  for (const driver of drivers) {
    const fn = (driver as { fetchIntradaySessions?: (c: string, n?: number, m?: StockMarket) => Promise<unknown> })
      .fetchIntradaySessions
    if (typeof fn !== 'function') continue
    try {
      const data = await fn.call(driver, code, ndays, market)
      if (data && typeof data === 'object' && 'sessions' in data) {
        const sessions = (data as IntradayTrendFetchResult).sessions
        if (sessions?.length) return data as IntradayTrendFetchResult
      }
    } catch {
      /* try next driver */
    }
  }
  return null
}
