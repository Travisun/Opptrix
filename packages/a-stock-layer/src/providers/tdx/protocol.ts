import { tdxClient } from './client.js'
import { fetchTdxKlinePaginated } from './kline-paginate.js'
import { MarketHandlerShell } from '../common/driver-factory.js'
import type { IndexKline, StockKline } from '../../core/schema.js'
import type { StockMarket } from '../../utils/helpers.js'
import { cnTodayString } from '../../utils/market-session.js'
import { transformTdxMinutePoints } from './intraday.js'

/** Shared TDX-protocol market handler — metadata via manifest + applyManifestSpec on *Driver */
export class TdxProtocolDriver extends MarketHandlerShell {
  realtime(code: string) { return tdxClient.realtime(code) }
  batchRealtime(codes: string[]) { return tdxClient.batchRealtime(codes) }
  kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count = 800,
    _market?: unknown,
    startOffset = 0,
  ) {
    const want = Math.max(1, Number(count) || 800)
    const offset = Math.max(0, Number(startOffset) || 0)
    return fetchTdxKlinePaginated<StockKline>(
      want,
      offset,
      (n, off) => tdxClient.kline(code, period, start, end, n, off),
    )
  }
  indexRealtime(code: string) { return tdxClient.indexRealtime(code) }
  indexKline(code: string, period = 'daily', start = '', end = '', count = 800) {
    const want = Math.max(1, Number(count) || 800)
    return fetchTdxKlinePaginated<IndexKline>(
      want,
      0,
      n => tdxClient.indexKline(code, period, start, end, n),
    )
  }

  fetchIntradaySessions(code: string, ndays = 5, market?: StockMarket) {
    return tdxClient.fetchIntradaySessions(code, ndays, market)
  }

  async intradayTick(code: string, date = '', market?: StockMarket) {
    const sessionDate = date?.slice(0, 10) || cnTodayString()
    const points = sessionDate === cnTodayString()
      ? await tdxClient.minuteTimeData(code, market)
      : await tdxClient.historyMinuteTimeData(code, sessionDate, market)
    if (!points?.length) return null
    const quote = await tdxClient.realtime(code, market)
    const preClose = quote?.[0]?.preClose ?? null
    const session = transformTdxMinutePoints(sessionDate, points, preClose)
    if (!session?.bars.length) return null
    return session.bars.map(bar => ({
      code,
      time: bar.time,
      price: bar.price,
      volume: bar.volume,
      amount: bar.amount,
      avgPrice: bar.avgPrice,
    }))
  }
}
