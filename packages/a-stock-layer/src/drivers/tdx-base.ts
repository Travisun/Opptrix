import { Capability } from '../core/capabilities.js'
import { tdxClient } from '../tdx/client.js'
import { BaseDriver } from './base.js'

/** Shared TDX-protocol driver logic (mootdx / pytdx — pure Node, no Python) */
export abstract class TdxProtocolDriver extends BaseDriver {
  abstract override get name(): string
  abstract override get priority(): number

  capabilities() {
    return [
      Capability.STOCK_REALTIME, Capability.STOCK_KLINE,
      Capability.INDEX_REALTIME, Capability.INDEX_KLINE,
    ]
  }

  realtime(code: string) { return tdxClient.realtime(code) }
  batchRealtime(codes: string[]) { return tdxClient.batchRealtime(codes) }
  kline(code: string, period?: string, start?: string, end?: string, count?: number) {
    return tdxClient.kline(code, period, start, end, count)
  }
  indexRealtime(code: string) { return tdxClient.indexRealtime(code) }
  indexKline(code: string, period?: string, start?: string, end?: string, count?: number) {
    return tdxClient.indexKline(code, period, start, end, count)
  }
}
