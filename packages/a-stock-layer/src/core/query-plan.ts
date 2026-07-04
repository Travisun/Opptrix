import type { AssetClass, Market, QueryResult } from '@opptrix/shared'
import { Capability, CACHE_TYPE } from './capabilities.js'
import type { Cache } from './cache.js'
import type { DriverRegistry } from './registry.js'
import type { BaseDriver } from '../providers/common/base.js'
import { bindingKey } from './bindings.js'
import { isCnEtfCode } from './instrument.js'
import { normalizeCode } from '../utils/helpers.js'
import {
  normalizePreOpenRealtimeQuote,
} from '../utils/quote-normalize.js'
import type { StockRealtime } from '@opptrix/shared'
import { getProviderHealthTracker } from './provider-health.js'
import { validateResponse } from './data-validator.js'

export type QueryPlanStrategy = 'sequential' | 'merge' | 'race'

export type QueryPlanId =
  | 'cn_equity_stock_kline_daily'
  | 'cn_equity_stock_kline_minute'
  | 'cn_equity_stock_realtime_batch'
  | 'cn_index_index_kline'

export interface QueryPlan {
  id: QueryPlanId
  market: Market
  assetClass: AssetClass
  capability: Capability
  strategy: QueryPlanStrategy
}

export interface QueryExecutionContext {
  method: string
  cacheType: string
  useCache: boolean
  args: unknown[]
  /** For merge: dedupe key */
  mergeKey?: (item: unknown) => string
  /** Optional asset class override (e.g. ETF quote) */
  assetClass?: AssetClass
}

/** CN query plans — provider order comes from registry priority + user settings. */
export const QUERY_PLANS: Record<QueryPlanId, QueryPlan> = {
  cn_equity_stock_kline_daily: {
    id: 'cn_equity_stock_kline_daily',
    market: 'CN',
    assetClass: 'EQUITY',
    capability: Capability.STOCK_KLINE,
    strategy: 'sequential',
  },
  cn_equity_stock_kline_minute: {
    id: 'cn_equity_stock_kline_minute',
    market: 'CN',
    assetClass: 'EQUITY',
    capability: Capability.STOCK_KLINE,
    strategy: 'sequential',
  },
  cn_equity_stock_realtime_batch: {
    id: 'cn_equity_stock_realtime_batch',
    market: 'CN',
    assetClass: 'EQUITY',
    capability: Capability.STOCK_REALTIME,
    strategy: 'merge',
  },
  cn_index_index_kline: {
    id: 'cn_index_index_kline',
    market: 'CN',
    assetClass: 'INDEX',
    capability: Capability.INDEX_KLINE,
    strategy: 'sequential',
  },
}

function isProviderRunnable(driver: BaseDriver, registry: DriverRegistry): boolean {
  if (registry.getEffectivePriority(driver.name) <= 0) return false
  const enabled = (driver as { isRuntimeEnabled?: () => boolean }).isRuntimeEnabled
  return enabled ? enabled.call(driver) : true
}

function resolveAssetClassFromArgs(args: unknown[], fallback: AssetClass): AssetClass {
  const code = String(args[0] ?? '')
  if (code && isCnEtfCode(code)) return 'ETF'
  return fallback
}

export class QueryPlanExecutor {
  constructor(
    private readonly registry: DriverRegistry,
    private readonly cache: Cache,
  ) {}

  getPlan(id: QueryPlanId): QueryPlan {
    return QUERY_PLANS[id]
  }

  async execute<T>(plan: QueryPlan, ctx: QueryExecutionContext): Promise<QueryResult<T[]>> {
    if (ctx.useCache && ctx.cacheType) {
      const params = {
        method: ctx.method,
        plan: plan.id,
        market: plan.market,
        assetClass: ctx.assetClass ?? plan.assetClass,
        args: JSON.stringify(ctx.args),
      }
      const cached = this.cache.get<T[]>(ctx.cacheType, ctx.method, params)
      if (cached) return { success: true, data: cached, source: 'cache', cached: true }
    }

    const result = plan.strategy === 'merge'
      ? await this.executeMerge<T>(plan, ctx)
      : await this.executeSequential<T>(plan, ctx)

    if (result.success && result.data && ctx.useCache && ctx.cacheType) {
      this.cache.set(ctx.cacheType, result.data, ctx.method, {
        method: ctx.method,
        plan: plan.id,
        market: plan.market,
        assetClass: ctx.assetClass ?? plan.assetClass,
        args: JSON.stringify(ctx.args),
      }, result.source)
    }
    return result
  }

  /** Registry-ordered providers for this plan (priority + enabled + runtime gates). */
  private resolveDrivers(plan: QueryPlan, ctx: QueryExecutionContext): BaseDriver[] {
    const assetClass = ctx.assetClass ?? resolveAssetClassFromArgs(ctx.args, plan.assetClass)
    const bound = this.registry.getProvidersWithFallback(plan.market, assetClass, plan.capability) as BaseDriver[]
    return bound.filter(d => d.supports(plan.capability) && isProviderRunnable(d, this.registry))
  }

  private async executeSequential<T>(
    plan: QueryPlan,
    ctx: QueryExecutionContext,
  ): Promise<QueryResult<T[]>> {
    const drivers = this.resolveDrivers(plan, ctx)
    if (!drivers.length) {
      const key = bindingKey(plan.market, ctx.assetClass ?? plan.assetClass, plan.capability)
      return { success: false, error: `没有可用的 provider 支持 [${key}]` }
    }

    const health = getProviderHealthTracker()
    const capStr = String(plan.capability)
    let lastError = ''

    for (const driver of drivers) {
      if (health.shouldSkip(driver.name, capStr)) {
        const h = health.getHealth(driver.name, capStr)
        if (h?.state === 'open') {
          lastError = `${driver.name}: 熔断中 (连续失败${h.consecutiveFails}次)`
        }
        continue
      }

      const fn = (driver as unknown as Record<string, unknown>)[ctx.method] as
        ((...a: unknown[]) => Promise<unknown[] | null> | unknown[] | null) | undefined
      if (!fn) continue
      try {
        const data = await fn.apply(driver, ctx.args)
        if (!data?.length) {
          health.recordInvalidResponse(driver.name, capStr)
          continue
        }

        const validation = validateResponse(plan.capability, data)
        if (!validation.valid) {
          health.recordInvalidResponse(driver.name, capStr, validation.reason)
          continue
        }

        health.recordSuccess(driver.name, capStr)
        return { success: true, data: data as T[], source: driver.name, cached: false }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        lastError = `${driver.name}: ${msg}`
        health.recordFailure(driver.name, capStr, msg)
      }
    }
    return { success: false, error: `所有 provider 均失败: ${lastError}` }
  }

  private async executeMerge<T>(
    plan: QueryPlan,
    ctx: QueryExecutionContext,
  ): Promise<QueryResult<T[]>> {
    if (plan.id !== 'cn_equity_stock_realtime_batch') {
      return { success: false, error: `merge 策略尚未支持 plan ${plan.id}` }
    }

    const codes = ctx.args[0]
    if (!Array.isArray(codes) || !codes.length) {
      return { success: false, error: 'codes empty' }
    }

    const markets = ctx.args[1] as Record<string, import('../utils/helpers.js').StockMarket | undefined> | undefined
    const normalized = codes.map(c => normalizeCode(String(c)))
    const results: StockRealtime[] = []
    const seen = new Set<string>()
    const mergeKey = ctx.mergeKey ?? ((item: unknown) => normalizeCode(String((item as StockRealtime).code)))

    const pushRows = (rows: StockRealtime[] | null | undefined) => {
      if (!rows?.length) return
      for (const row of rows) {
        const key = mergeKey(row)
        if (seen.has(key)) continue
        seen.add(key)
        results.push(normalizePreOpenRealtimeQuote({ ...row, code: key }))
      }
    }

    const drivers = this.resolveDrivers(plan, ctx)
    const health = getProviderHealthTracker()
    const capStr = String(plan.capability)

    for (const driver of drivers) {
      if (health.shouldSkip(driver.name, capStr)) continue

      const batch = normalized.filter(c => !seen.has(c))
      if (!batch.length) break
      const fn = driver.batchRealtime as (
        codes: string[],
        markets?: Record<string, import('../utils/helpers.js').StockMarket | undefined>,
      ) => Promise<StockRealtime[] | null> | undefined
      if (typeof fn !== 'function') continue
      try {
        const result = await fn(batch, markets)
        if (!result?.length) {
          health.recordInvalidResponse(driver.name, capStr)
          continue
        }

        const validation = validateResponse(plan.capability, result)
        if (!validation.valid) {
          health.recordInvalidResponse(driver.name, capStr, validation.reason)
          continue
        }

        health.recordSuccess(driver.name, capStr)
        pushRows(result)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        health.recordFailure(driver.name, capStr, msg)
      }
    }

    if (!results.length) return { success: false, error: 'batchRealtime failed' }
    return { success: true, data: results as T[], source: 'mixed', cached: false }
  }
}

export function defaultCacheType(cap: Capability, method: string): string {
  return CACHE_TYPE[cap] ?? method
}
