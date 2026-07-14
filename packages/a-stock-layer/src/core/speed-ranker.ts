/**
 * Provider 速度排序器 — 运行时根据请求结果动态排序 / 淘汰。
 *
 * 策略：
 *   - 运行时 EMA：每次请求结果按 α=0.3 更新 avgResponseTimeMs
 *   - 黑名单：连续失败 >=3 次 → 冷却 30s → 自动解除
 *   - 缓存 TTL：正常 30min，全部失败 60s
 *   - 无启动探测：仅靠真实流量积累样本；无样本时 Registry 按优先级排序
 */

import type { SpeedRankingRepository } from '@opptrix/user-store'

export const PROVIDER_RANKING_TTL_MS = 30 * 60 * 1000      // 30 min
export const PROVIDER_RANKING_EMPTY_TTL_MS = 60 * 1000      // 60 s
export const BLACKLIST_COOLDOWN_MS = 30_000                 // 30 s
export const BLACKLIST_FAILURE_THRESHOLD = 3
export const EMA_ALPHA = 0.3

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

  constructor(private repo: SpeedRankingRepository) {
    this.loadFromDb()
  }

  // ── Public API ──

  /** Always ready — ranking uses runtime samples only (empty = priority-only sort). */
  isReady(): boolean {
    return true
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
      void allRankings
    } catch {
      // 首次启动无数据，忽略
    }
  }
}
