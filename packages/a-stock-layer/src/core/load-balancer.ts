/**
 * 负载感知路由器 — 跟踪各 Provider 实时在途请求，动态派发到空闲或即将空闲的节点。
 *
 * 策略：
 *   1. 未满负载的 provider 中，选在途最少的
 *   2. 全部满载时，选预计最先释放的（lastReleasedAt + avgResponseMs）
 *   3. 负载相同时，用测速排名做 tie-breaker
 *   4. 冷启动时（请求数 < 5），按测速排名轮询
 */

import type { SpeedRankingBridge } from './registry.js'

export interface LoadBalancerConfig {
  /** 全局默认最大并发数 */
  defaultMaxConcurrent: number
  /** 冷启动阈值：累计请求数低于此值使用轮询 */
  coldStartThreshold: number
}

interface ProviderLoadState {
  providerId: string
  inFlight: number
  maxConcurrent: number
  avgResponseMs: number
  lastReleasedAt: number
  totalRequests: number
  consecutiveErrors: number
}

const DEFAULT_CONFIG: LoadBalancerConfig = {
  defaultMaxConcurrent: 3,
  coldStartThreshold: 5,
}

export class LoadBalancer {
  private states = new Map<string, ProviderLoadState>()
  private config: LoadBalancerConfig
  private speedRanker: SpeedRankingBridge | null = null
  private roundRobinIndex = 0

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  attachSpeedRanker(ranker: SpeedRankingBridge): void {
    this.speedRanker = ranker
  }

  /** 注册 provider 及其并发上限 */
  registerProvider(providerId: string, maxConcurrent: number): void {
    if (!this.states.has(providerId)) {
      this.states.set(providerId, {
        providerId,
        inFlight: 0,
        maxConcurrent,
        avgResponseMs: 99999,
        lastReleasedAt: 0,
        totalRequests: 0,
        consecutiveErrors: 0,
      })
    } else {
      this.states.get(providerId)!.maxConcurrent = maxConcurrent
    }
  }

  /** 批量注册 */
  registerProviders(entries: Array<{ providerId: string; maxConcurrent: number }>): void {
    for (const e of entries) this.registerProvider(e.providerId, e.maxConcurrent)
  }

  /**
   * 为指定 capability 选择最优 provider。
   * @param capability 能力名（如 STOCK_REALTIME）
   * @param candidates 候选 provider 列表（已按测速排序）
   */
  route(capability: string, candidates: string[]): string {
    if (!candidates.length) throw new Error(`No providers for ${capability}`)
    if (candidates.length === 1) return candidates[0]!

    // 确保所有候选都已注册
    for (const id of candidates) {
      if (!this.states.has(id)) {
        this.registerProvider(id, this.config.defaultMaxConcurrent)
      }
    }

    const states = candidates.map(id => this.states.get(id)!)

    // 冷启动：按轮询分配，积累数据
    const totalReqs = states.reduce((sum, s) => sum + s.totalRequests, 0)
    if (totalReqs < this.config.coldStartThreshold * states.length) {
      const idx = this.roundRobinIndex++ % candidates.length
      return candidates[idx]!
    }

    // 阶段 1: 找未满负载的，选在途最少的
    const available = states.filter(s => s.inFlight < s.maxConcurrent)
    if (available.length > 0) {
      // 按在途数升序，再按平均响应时间升序（速度排名兜底）
      available.sort((a, b) => {
        if (a.inFlight !== b.inFlight) return a.inFlight - b.inFlight
        return a.avgResponseMs - b.avgResponseMs
      })
      return available[0]!.providerId
    }

    // 阶段 2: 全部满载，找预计最先释放的
    const now = Date.now()
    const withRelease = states.map(s => ({
      ...s,
      predictedRelease: s.lastReleasedAt + s.avgResponseMs,
      // 如果 lastReleasedAt 为 0（从未完成），用 now + avgMs 估算
      effectiveRelease: s.lastReleasedAt === 0
        ? now + s.avgResponseMs
        : s.lastReleasedAt + s.avgResponseMs,
    }))
    withRelease.sort((a, b) => a.effectiveRelease - b.effectiveRelease)
    return withRelease[0]!.providerId
  }

  /** 请求开始时调用 */
  acquire(providerId: string): void {
    const s = this.states.get(providerId)
    if (!s) return
    s.inFlight++
    s.totalRequests++
  }

  /** 请求完成时调用 */
  release(providerId: string, responseTimeMs: number, success: boolean): void {
    const s = this.states.get(providerId)
    if (!s) return
    s.inFlight = Math.max(0, s.inFlight - 1)
    s.lastReleasedAt = Date.now()

    if (success) {
      // EMA 更新平均响应时间
      s.avgResponseMs = s.totalRequests <= 1
        ? responseTimeMs
        : 0.3 * responseTimeMs + 0.7 * s.avgResponseMs
      s.consecutiveErrors = 0
    } else {
      s.consecutiveErrors++
    }
  }

  /** 获取 provider 的预计等待时间（ms） */
  predictedWaitMs(providerId: string): number {
    const s = this.states.get(providerId)
    if (!s) return 0
    if (s.inFlight < s.maxConcurrent) return 0
    if (s.lastReleasedAt === 0) return s.avgResponseMs
    const remaining = (s.lastReleasedAt + s.avgResponseMs) - Date.now()
    return Math.max(0, remaining)
  }

  /** 获取所有 provider 的负载快照（用于诊断） */
  getSnapshot(): Array<LoadSnapshot> {
    const now = Date.now()
    return [...this.states.values()].map(s => ({
      providerId: s.providerId,
      inFlight: s.inFlight,
      maxConcurrent: s.maxConcurrent,
      avgResponseMs: Math.round(s.avgResponseMs),
      predictedWaitMs: this.predictedWaitMs(s.providerId),
      totalRequests: s.totalRequests,
      consecutiveErrors: s.consecutiveErrors,
      isFull: s.inFlight >= s.maxConcurrent,
    }))
  }

  /** 重置某 provider 的状态（用于卸载/重载） */
  resetProvider(providerId: string): void {
    this.states.delete(providerId)
  }
}

export interface LoadSnapshot {
  providerId: string
  inFlight: number
  maxConcurrent: number
  avgResponseMs: number
  predictedWaitMs: number
  totalRequests: number
  consecutiveErrors: number
  isFull: boolean
}
