/**
 * 查询计划引擎 — 根据市场、资产类别和能力，选择最优 Provider 执行策略。
 *
 * 核心职责：
 *   1. 按 QueryPlanId 查找预定义的查询计划（market + assetClass + capability + strategy）
 *   2. 按优先级依次尝试 Provider（sequential）、合并多 Provider 结果（merge）或竞速取最快（race）
 *   3. 集成缓存、熔断器、数据校验
 */

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

/**
 * 查询执行策略 — 决定多个 Provider 之间如何协调。
 *
 * - sequential: 按优先级依次尝试，首个成功即返回（适用于单标的查询）
 * - merge:      多个 Provider 并行/串行合并结果，去重后返回（适用于批量实时行情）
 * - race:       多个 Provider 竞速，最快返回者胜出（预留，当前未使用）
 */
export type QueryPlanStrategy = 'sequential' | 'merge' | 'race'

/**
 * 预定义查询计划标识 — 每个 ID 对应一组固定的 market + assetClass + capability + strategy。
 * 新增查询类型时在此扩展。
 */
export type QueryPlanId =
  | 'cn_equity_stock_kline_daily'      // A 股日 K 线
  | 'cn_equity_stock_kline_minute'     // A 股分钟 K 线
  | 'cn_equity_stock_realtime_batch'   // A 股批量实时行情
  | 'cn_index_index_kline'             // A 股指数 K 线

/**
 * 查询计划定义 — 绑定市场、资产类别、数据能力与执行策略。
 * 由 QUERY_PLANS 常量表驱动，QueryPlanExecutor 根据此执行实际查询。
 */
export interface QueryPlan {
  /** 计划唯一标识 */
  id: QueryPlanId
  /** 目标市场（CN/US/HK/CRYPTO） */
  market: Market
  /** 资产类别（EQUITY/ETF/INDEX/CRYPTO_SPOT） */
  assetClass: AssetClass
  /** 所需数据能力（STOCK_KLINE/STOCK_REALTIME/INDEX_KLINE 等） */
  capability: Capability
  /** 执行策略 */
  strategy: QueryPlanStrategy
}

/**
 * 查询执行上下文 — 单次查询的运行时参数。
 * 由调用方传入，控制缓存、方法分发、参数传递和合并逻辑。
 */
export interface QueryExecutionContext {
  /** Provider 上要调用的方法名（如 "kline"、"realtime"） */
  method: string
  /** 缓存类型键（如 "stock_kline"、"stock_realtime"），为空则不缓存 */
  cacheType: string
  /** 是否启用缓存读写 */
  useCache: boolean
  /** 传递给 Provider 方法的参数列表 */
  args: unknown[]
  /** merge 策略下的去重键函数，默认按归一化 code 去重 */
  mergeKey?: (item: unknown) => string
  /** 可选资产类别覆盖（如 ETF 行情走 ETF 路由而非 EQUITY） */
  assetClass?: AssetClass
}

/** CN 查询计划表 — Provider 顺序由 Registry 优先级 + 用户设置决定。 */
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

/**
 * 查询计划执行器 — 协调 Registry、Cache、HealthTracker 完成实际数据查询。
 * 优先从缓存读取，miss 时按策略执行，成功后写入缓存。
 */
export class QueryPlanExecutor {
  constructor(
    private readonly registry: DriverRegistry,
    private readonly cache: Cache,
    private readonly speedRanker?: import('@opptrix/market-data-core').SpeedRankingBridge,
  ) {}

  /** 获取指定 ID 的查询计划定义 */
  getPlan(id: QueryPlanId): QueryPlan {
    return QUERY_PLANS[id]
  }

  private withTimeout<T>(fn: () => Promise<T>, ms: number, name: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`provider ${name} 超时 (${ms}ms)`)), ms)
      fn().then(
        v => { clearTimeout(timer); resolve(v) },
        e => { clearTimeout(timer); reject(e) },
      )
    })
  }

  /**
   * 执行查询计划 — 检查缓存 → 按策略调用 Provider → 写入缓存 → 返回结果。
   * @typeParam T - 返回数据元素类型
   */
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

  /** 按 Registry 优先级解析可用 Provider 列表（过滤掉禁用/低优先级/熔断中的） */
  private resolveDrivers(plan: QueryPlan, ctx: QueryExecutionContext): BaseDriver[] {
    const assetClass = ctx.assetClass ?? resolveAssetClassFromArgs(ctx.args, plan.assetClass)
    const bound = this.registry.getProvidersWithFallback(plan.market, assetClass, plan.capability) as BaseDriver[]
    return bound.filter(d => d.supports(plan.capability) && isProviderRunnable(d, this.registry))
  }

  /** sequential 策略：负载感知选择 + fallback */
  private async executeSequential<T>(
    plan: QueryPlan,
    ctx: QueryExecutionContext,
  ): Promise<QueryResult<T[]>> {
    const health = getProviderHealthTracker()
    const capStr = String(plan.capability)
    let lastError = ''

    const attempted = new Set<string>()
    for (let attempt = 0; attempt < 3; attempt++) {
      const assetClass = ctx.assetClass ?? resolveAssetClassFromArgs(ctx.args, plan.assetClass)
      const driver = this.registry.getLoadAwareProvider(plan.market, assetClass, plan.capability)
      if (!driver) {
        const key = bindingKey(plan.market, assetClass, plan.capability)
        return { success: false, error: `没有可用的 provider 支持 [${key}]` }
      }
      if (attempted.has(driver.name)) break
      attempted.add(driver.name)

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

      this.registry.notifyAcquire(driver.name)
      try {
        const call = () => fn.apply(driver, ctx.args) as Promise<unknown[] | null>
        const t0 = Date.now()
        const data = driver.selfThrottled
          ? await call()
          : await this.withTimeout(call, 15_000, driver.name)
        const elapsed = Date.now() - t0
        if (!data?.length) {
          health.recordInvalidResponse(driver.name, capStr)
          this.registry.notifyRelease(driver.name, elapsed, false)
          this.speedRanker?.recordResult(driver.name, capStr, elapsed, false)
          lastError = `${driver.name}: 空数据`
          continue
        }

        const validation = validateResponse(plan.capability, data)
        if (!validation.valid) {
          health.recordInvalidResponse(driver.name, capStr, validation.reason)
          this.registry.notifyRelease(driver.name, elapsed, false)
          this.speedRanker?.recordResult(driver.name, capStr, elapsed, false)
          lastError = `${driver.name}: ${validation.reason}`
          continue
        }

        health.recordSuccess(driver.name, capStr)
        this.registry.notifyRelease(driver.name, elapsed, true)
        this.speedRanker?.recordResult(driver.name, capStr, elapsed, true)
        return { success: true, data: data as T[], source: driver.name, cached: false }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        lastError = `${driver.name}: ${msg}`
        health.recordFailure(driver.name, capStr, msg)
        this.registry.notifyRelease(driver.name, 0, false)
        this.speedRanker?.recordResult(driver.name, capStr, 0, false)
        if (this.speedRanker?.shouldRebuild(driver.name, capStr)) {
          this.registry.rebuildIndicesWithRanking()
        }
      }
    }
    return { success: false, error: `所有 provider 均失败: ${lastError}` }
  }

  /** merge 策略：多 Provider 合并去重结果（当前仅支持 cn_equity_stock_realtime_batch） */
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

      this.registry.notifyAcquire(driver.name)
      try {
        const call = () => fn(batch, markets) as Promise<StockRealtime[] | null>
        const t0 = Date.now()
        const result = driver.selfThrottled
          ? await call()
          : await this.withTimeout(call, 15_000, driver.name)
        const elapsed = Date.now() - t0
        if (!result?.length) {
          health.recordInvalidResponse(driver.name, capStr)
          this.registry.notifyRelease(driver.name, elapsed, false)
          this.speedRanker?.recordResult(driver.name, capStr, elapsed, false)
          continue
        }

        const validation = validateResponse(plan.capability, result)
        if (!validation.valid) {
          health.recordInvalidResponse(driver.name, capStr, validation.reason)
          this.registry.notifyRelease(driver.name, elapsed, false)
          this.speedRanker?.recordResult(driver.name, capStr, elapsed, false)
          continue
        }

        health.recordSuccess(driver.name, capStr)
        this.registry.notifyRelease(driver.name, elapsed, true)
        this.speedRanker?.recordResult(driver.name, capStr, elapsed, true)
        pushRows(result)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        health.recordFailure(driver.name, capStr, msg)
        this.registry.notifyRelease(driver.name, 0, false)
        this.speedRanker?.recordResult(driver.name, capStr, 0, false)
        if (this.speedRanker?.shouldRebuild(driver.name, capStr)) {
          this.registry.rebuildIndicesWithRanking()
        }
      }
    }

    if (!results.length) return { success: false, error: 'batchRealtime failed' }
    return { success: true, data: results as T[], source: 'mixed', cached: false }
  }
}

/**
 * 根据能力与方法名解析默认缓存类型。
 * @param cap  数据能力枚举
 * @param method Provider 方法名
 * @returns 缓存类型键，未匹配时返回方法名本身
 */
export function defaultCacheType(cap: Capability, method: string): string {
  return CACHE_TYPE[cap] ?? method
}
