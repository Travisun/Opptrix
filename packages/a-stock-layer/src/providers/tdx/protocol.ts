import { tdxClient } from './client.js'
import { fetchTdxKlinePaginated } from './kline-paginate.js'
import { MarketHandlerShell } from '../common/driver-factory.js'
import type { IndexKline, StockKline } from '../../core/schema.js'

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
}
