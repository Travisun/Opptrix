import type { AshareEngine, InstrumentDataCapability, InstrumentQueryOpts } from '@opptrix/a-stock-layer'
import type { InstrumentRef, QueryResult } from '@opptrix/shared'
import { normalizeInstrumentRef, resolveCnInstrumentRef } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import { normalizeStockCode } from '../utils.js'
import { sleep } from './pool.js'

type CnEquityRefStore = Pick<MarketDataStore, 'stockMeta' | 'stockMarket'>

export type CnEquityRefOpts = {
  exchange?: string | null
  assetClass?: InstrumentRef['assetClass']
  store?: CnEquityRefStore
}

function normalizeCnSymbol(code: string): string {
  const bare = code.trim().replace(/^(sh|sz|bj)/i, '').replace(/\D/g, '')
  return bare.length <= 6 ? bare.padStart(6, '0') : bare.slice(-6)
}

function resolveCnExchangeFromStore(store: CnEquityRefStore, symbol: string): string | undefined {
  const meta = store.stockMeta(symbol)
  const fromMeta = meta?.exchange
  if (fromMeta) return fromMeta
  return store.stockMarket(symbol) ?? undefined
}

export type InitialEquityMarket = 'CN' | 'HK' | 'US'

/** 本地因子/行业筛选已停用；保留常量供门禁与 Hub 判断 */
export const LOCAL_OFFLINE_SCREENING_ENABLED = false

const PLACEHOLDER_SYMBOL: Record<InitialEquityMarket, string> = {
  CN: '000001',
  HK: '00700',
  US: 'SPY',
}

export function cnEtfRef(code: string): InstrumentRef {
  return resolveCnInstrumentRef(code.trim() || '510300')
}

export function cnEtfListRef(): InstrumentRef {
  return cnEtfRef('510300')
}

export function cnEquityRef(code: string, opts?: CnEquityRefOpts): InstrumentRef {
  const symbol = normalizeCnSymbol(code) || '000001'
  const exchange = opts?.exchange
    ?? (opts?.store ? resolveCnExchangeFromStore(opts.store, symbol) : undefined)
  return normalizeInstrumentRef({
    market: 'CN',
    assetClass: opts?.assetClass ?? 'EQUITY',
    symbol,
    exchange: exchange ?? undefined,
  })
}

/** 从本地库解析 exchange，构造 CN InstrumentRef — sync / Hub 消歧主路径 */
export function cnRefFromCode(
  store: CnEquityRefStore,
  code: string,
  opts?: Omit<CnEquityRefOpts, 'store'>,
): InstrumentRef {
  const symbol = normalizeStockCode(normalizeCnSymbol(code))
  const exchange = opts?.exchange ?? resolveCnExchangeFromStore(store, symbol)
  return cnEquityRef(symbol, { ...opts, exchange })
}

/** 资料类 deprecated API（dividend / shareholders）可用的 A 股线格式 */
export function cnLegacyProviderCode(ref: InstrumentRef): string {
  const n = normalizeInstrumentRef(ref)
  if (n.market !== 'CN') return n.symbol
  const ex = n.exchange?.toUpperCase()
  if (ex === 'SH' || ex === 'SZ' || ex === 'BJ') return `${n.symbol}.${ex}`
  return n.symbol
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
