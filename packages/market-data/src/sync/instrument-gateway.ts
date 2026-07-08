import type { AshareEngine, InstrumentDataCapability, InstrumentQueryOpts } from '@opptrix/a-stock-layer'
import type { InstrumentRef, QueryResult } from '@opptrix/shared'
import { normalizeInstrumentRef } from '@opptrix/shared'
import { sleep } from './pool.js'

export type InitialEquityMarket = 'CN' | 'HK' | 'US'

/** 本地因子/K 线筛选已停用 — 指标与筛选改走在线 instrument_* 按需计算 */
export const LOCAL_OFFLINE_SCREENING_ENABLED = false

const PLACEHOLDER_SYMBOL: Record<InitialEquityMarket, string> = {
  CN: '000001',
  HK: '00700',
  US: 'SPY',
}

export function cnEtfRef(code: string): InstrumentRef {
  return normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'ETF',
    symbol: code.trim() || '510300',
  })
}

export function cnEtfListRef(): InstrumentRef {
  return cnEtfRef('510300')
}

export function equityListRef(market: InitialEquityMarket): InstrumentRef {
  return normalizeInstrumentRef({
    market,
    assetClass: 'EQUITY',
    symbol: PLACEHOLDER_SYMBOL[market],
    exchange: market === 'HK' ? 'HK' : undefined,
  })
}

export interface GatewayCallOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  onRetry?: (attempt: number, error: string) => void
}

const DEFAULT_GATEWAY_OPTS: Required<GatewayCallOptions> = {
  maxAttempts: 6,
  baseDelayMs: 800,
  maxDelayMs: 60_000,
  onRetry: () => {},
}

function backoffDelayMs(attempt: number, base: number, max: number): number {
  const exp = Math.min(max, base * 2 ** attempt)
  const jitter = Math.floor(Math.random() * Math.min(500, exp * 0.15))
  return exp + jitter
}

function queryErrorMessage(result: QueryResult<unknown>): string {
  return result.error ?? '标准数据接口返回失败'
}

/**
 * 市场数据同步唯一出口 — 仅经 DataEngine.queryInstrumentData，底层 Provider 自适应。
 * 无可用实现或临时故障时指数退避重试。
 */
export class StandardInstrumentGateway {
  constructor(
    private readonly de: AshareEngine,
    private readonly defaults: GatewayCallOptions = {},
  ) {}

  async query<T>(
    ref: InstrumentRef,
    capability: InstrumentDataCapability,
    opts: InstrumentQueryOpts = {},
    callOpts?: GatewayCallOptions,
  ): Promise<QueryResult<T>> {
    const cfg = { ...DEFAULT_GATEWAY_OPTS, ...this.defaults, ...callOpts }
    let lastError = '未知错误'

    for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
      try {
        const resp = await this.de.queryInstrumentData(ref, capability, opts) as QueryResult<T>
        if (resp.success) return resp
        lastError = queryErrorMessage(resp)
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }

      if (attempt < cfg.maxAttempts - 1) {
        const wait = backoffDelayMs(attempt, cfg.baseDelayMs, cfg.maxDelayMs)
        cfg.onRetry(attempt + 1, lastError)
        await sleep(wait)
      }
    }

    return { success: false, error: lastError }
  }
}
