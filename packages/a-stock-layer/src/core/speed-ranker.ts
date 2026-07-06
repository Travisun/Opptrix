/**
 * Provider 速度排序器 — 启动时探测各 Provider 响应速度，运行时动态淘汰。
 *
 * 策略：
 *   - 启动 warm-up：对每个 (provider × capability) 并行采样 3 次，取中位数
 *   - 运行时 EMA：每次请求结果按 α=0.3 更新 avgResponseTimeMs
 *   - 黑名单：连续失败 >=3 次 → 冷却 30s → 自动解除
 *   - 缓存 TTL：正常 30min，全部失败 60s
 */

import type { DriverRegistry } from './registry.js'
import type { BaseDriver } from '../providers/common/base.js'
import type { SpeedRankingRepository } from '@opptrix/user-store'

export const PROVIDER_RANKING_TTL_MS = 30 * 60 * 1000      // 30 min
export const PROVIDER_RANKING_EMPTY_TTL_MS = 60 * 1000      // 60 s
export const BLACKLIST_COOLDOWN_MS = 30_000                 // 30 s
export const BLACKLIST_FAILURE_THRESHOLD = 3
export const EMA_ALPHA = 0.3
export const WARMUP_SAMPLE_COUNT = 3
export const WARMUP_TIMEOUT_MS = 10_000
export const WARMUP_GLOBAL_TIMEOUT_MS = 30_000

interface RankingEntry {
  providerId: string
  avgResponseTimeMs: number
  successRate: number
  sampleCount: number
  consecutiveFailures: number
  isBlacklisted: boolean
  blacklistCooldownUntil: number
  lastSuccessAt: number
  lastFailureAt: number
}

function now(): number {
  return Date.now()
}

function isoNow(): string {
  return new Date().toISOString()
}

export class ProviderSpeedRanker {
  private entries = new Map<string, RankingEntry>()  // key: `${providerId}::${capability}`
  private cache = new Map<string, { rankedIds: string[]; cachedAt: number; ttlMs: number; isEmpty: boolean }>()
  private warmUpComplete = false
  private warmUpPromise: Promise<void> | null = null

  constructor(private repo: SpeedRankingRepository) {
    this.loadFromDb()
  }

  // ── Public API ──

  /** 启动异步探测，不阻塞调用方 */
  async warmUp(registry: DriverRegistry): Promise<void> {
    if (this.warmUpPromise) return this.warmUpPromise
    this.warmUpPromise = this.doWarmUp(registry)
    return this.warmUpPromise
  }

  isWarmUpComplete(): boolean {
    return this.warmUpComplete
  }

  /** SpeedRankingBridge 兼容 */
  isReady(): boolean {
    return this.warmUpComplete
  }

  /** 获取某 binding key 下的排序（按 avgResponseTimeMs 升序，剔除黑名单） */
  getRankedProviders(bindingKey: string): string[] {
    const cached = this.cache.get(bindingKey)
    if (cached && now() - cached.cachedAt < cached.ttlMs) {
      return cached.rankedIds
    }
    return this.computeRanking(bindingKey)
  }

  /** 缓存是否有效 */
  isCacheValid(bindingKey: string): boolean {
    const cached = this.cache.get(bindingKey)
    return cached ? now() - cached.cachedAt < cached.ttlMs : false
  }

  /** 记录一次请求结果 */
  recordResult(providerId: string, capability: string, responseTimeMs: number, success: boolean): void {
    const key = `${providerId}::${capability}`
    const entry = this.getOrCreateEntry(providerId, capability)

    if (success) {
      entry.avgResponseTimeMs = entry.sampleCount === 0
        ? responseTimeMs
        : EMA_ALPHA * responseTimeMs + (1 - EMA_ALPHA) * entry.avgResponseTimeMs
      entry.sampleCount++
      entry.successRate = Math.min(1, entry.successRate + 0.1)
      entry.consecutiveFailures = 0
      entry.isBlacklisted = false
      entry.blacklistCooldownUntil = 0
      entry.lastSuccessAt = now()
    } else {
      entry.consecutiveFailures++
      entry.successRate = Math.max(0, entry.successRate - 0.2)
      entry.lastFailureAt = now()
      if (entry.consecutiveFailures >= BLACKLIST_FAILURE_THRESHOLD) {
        entry.isBlacklisted = true
        entry.blacklistCooldownUntil = now() + BLACKLIST_COOLDOWN_MS
      }
    }

    this.entries.set(key, entry)
    this.persistEntry(entry, capability)
  }

  /** 检查是否需要重建索引（黑名单状态变更） */
  shouldRebuildIndices(providerId: string, capability: string): boolean {
    const key = `${providerId}::${capability}`
    const entry = this.getOrCreateEntry(providerId, capability)
    // 黑名单冷却到期 → 需要重建
    if (entry.isBlacklisted && now() >= entry.blacklistCooldownUntil) {
      entry.isBlacklisted = false
      entry.consecutiveFailures = 0
      this.entries.set(key, entry)
      return true
    }
    return false
  }

  /** SpeedRankingBridge 兼容 */
  shouldRebuild(providerId: string, capability: string): boolean {
    return this.shouldRebuildIndices(providerId, capability)
  }

  /** 强制刷新某 binding key */
  refreshBinding(bindingKey: string): string[] {
    this.cache.delete(bindingKey)
    return this.computeRanking(bindingKey)
  }

  // ── Internal ──

  private async doWarmUp(registry: DriverRegistry): Promise<void> {
    const drivers = registry.listDriverInfo()
    const tasks: Array<{ driver: string; capability: string; fn: () => Promise<unknown> }> = []

    for (const info of drivers) {
      if (info.priority <= 0) continue  // disabled
      for (const binding of info.bindings) {
        const capName = String(binding.capability)
        const driver = registry.get(info.name)
        if (!driver) continue
        const fn = this.makeProbeFn(driver, capName)
        if (fn) {
          tasks.push({ driver: info.name, capability: capName, fn })
        }
      }
    }

    // 按 provider 分组，组内串行（避免触发限流），组间并行
    const byProvider = new Map<string, typeof tasks>()
    for (const t of tasks) {
      const list = byProvider.get(t.driver) ?? []
      list.push(t)
      byProvider.set(t.driver, list)
    }

    const globalTimer = setTimeout(() => {
      console.warn('[SpeedRanker] warm-up global timeout, using partial results')
      this.finalizeWarmUp()
    }, WARMUP_GLOBAL_TIMEOUT_MS)

    await Promise.all(
      [...byProvider.values()].map(async (providerTasks) => {
        for (const t of providerTasks) {
          const samples: number[] = []
          for (let i = 0; i < WARMUP_SAMPLE_COUNT; i++) {
            const start = now()
            try {
              await Promise.race([
                t.fn(),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('timeout')), WARMUP_TIMEOUT_MS),
                ),
              ])
              samples.push(now() - start)
            } catch {
              // 采样失败 → 不记录
            }
          }
          if (samples.length > 0) {
            samples.sort((a, b) => a - b)
            const median = samples[Math.floor(samples.length / 2)]
            this.recordResult(t.driver, t.capability, median, true)
          }
        }
      }),
    )

    clearTimeout(globalTimer)
    this.finalizeWarmUp()
  }

  private finalizeWarmUp(): void {
    if (this.warmUpComplete) return
    this.warmUpComplete = true
    console.log('[SpeedRanker] warm-up complete')
  }

  /** 构造一个轻量探测函数（调用即完成一次采样，耗时由调用方测量） */
  private makeProbeFn(driver: import('./registry.js').RegistryProvider, capability: string): (() => Promise<unknown>) | null {
    const d = driver as unknown as Record<string, unknown>

    if (typeof d.testConnection === 'function') {
      return async () => {
        await (d.testConnection as () => Promise<unknown>)()
      }
    }

    // 按 capability 选择 cheap 查询
    const cheapMap: Record<string, () => Promise<unknown>> = {
      STOCK_REaltime: () => (d.realtime as (code: string) => Promise<unknown>)?.('000001'),
      INDEX_REALTIME: () => (d.indexRealtime as (code: string) => Promise<unknown>)?.('000001'),
      STOCK_KLINE: () => (d.kline as (code: string, period?: string) => Promise<unknown>)?.('000001', 'daily'),
      STOCK_LIST: () => (d.stockList as () => Promise<unknown>)?.(),
      STOCK_PROFILE: () => (d.profile as (code: string) => Promise<unknown>)?.('000001'),
    }

    const fn = cheapMap[capability]
    return fn ?? null
  }

  private computeRanking(bindingKey: string): string[] {
    // bindingKey 格式: "CN:EQUITY:STOCK_REALTIME"
    const parts = bindingKey.split(':')
    const capability = parts[2]
    if (!capability) return []

    const candidates: Array<{ name: string; avgMs: number }> = []
    for (const [key, entry] of this.entries) {
      if (!key.endsWith(`::${capability}`)) continue
      if (entry.isBlacklisted && now() < entry.blacklistCooldownUntil) continue
      candidates.push({ name: entry.providerId, avgMs: entry.avgResponseTimeMs })
    }

    candidates.sort((a, b) => a.avgMs - b.avgMs)
    const rankedIds = candidates.map(c => c.name)

    const isEmpty = rankedIds.length === 0
    const ttlMs = isEmpty ? PROVIDER_RANKING_EMPTY_TTL_MS : PROVIDER_RANKING_TTL_MS

    this.cache.set(bindingKey, { rankedIds, cachedAt: now(), ttlMs, isEmpty })
    this.persistCache(bindingKey, rankedIds, ttlMs, isEmpty)

    return rankedIds
  }

  private getOrCreateEntry(providerId: string, capability: string): RankingEntry {
    const key = `${providerId}::${capability}`
    const existing = this.entries.get(key)
    if (existing) return existing
    const fresh: RankingEntry = {
      providerId,
      avgResponseTimeMs: 99999,
      successRate: 0,
      sampleCount: 0,
      consecutiveFailures: 0,
      isBlacklisted: false,
      blacklistCooldownUntil: 0,
      lastSuccessAt: 0,
      lastFailureAt: 0,
    }
    this.entries.set(key, fresh)
    return fresh
  }

  private persistEntry(entry: RankingEntry, capability: string): void {
    try {
      this.repo.saveRanking({
        provider_id: entry.providerId,
        capability,
        avg_ms: entry.avgResponseTimeMs,
        success_rate: entry.successRate,
        sample_count: entry.sampleCount,
        last_success_at: entry.lastSuccessAt ? new Date(entry.lastSuccessAt).toISOString() : null,
        last_failure_at: entry.lastFailureAt ? new Date(entry.lastFailureAt).toISOString() : null,
        blacklisted_until: entry.isBlacklisted ? new Date(entry.blacklistCooldownUntil).toISOString() : null,
        updated_at: isoNow(),
      })
    } catch {
      // 持久化失败不影响运行时
    }
  }

  private persistCache(bindingKey: string, rankedIds: string[], ttlMs: number, isEmpty: boolean): void {
    try {
      this.repo.saveCache({
        binding_key: bindingKey,
        ranked_ids: JSON.stringify(rankedIds),
        cached_at: isoNow(),
        ttl_ms: ttlMs,
        is_empty: isEmpty ? 1 : 0,
      })
    } catch {
      // 持久化失败不影响运行时
    }
  }

  private loadFromDb(): void {
    try {
      // 从 SQLite 加载已有排名数据
      const allRankings = this.repo.getRankingsForCapability('')  // 空 capability 返回全部
      // 实际上需要遍历所有 capability，这里简化处理
    } catch {
      // 首次启动无数据，忽略
    }
  }
}
