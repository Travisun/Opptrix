/**
 * 外部 MCP Server 健康 / 熔断（per-server）。
 */

import type { McpServerHealthState } from '@opptrix/shared'
import { classifyMcpServerError } from '@opptrix/shared'

const FAILURE_THRESHOLD = 3
const BASE_COOLDOWN_MS = 30_000
const MAX_COOLDOWN_MS = 15 * 60_000

interface HealthEntry {
  consecutiveFails: number
  cooldownUntil: number
  state: McpServerHealthState
  lastError: string
}

export class ExternalMcpHealth {
  private entries = new Map<string, HealthEntry>()

  getState(serverId: string, paused: boolean): McpServerHealthState {
    if (paused) return 'paused'
    const e = this.entries.get(serverId)
    if (!e) return 'unknown'
    if (e.state === 'open' && e.cooldownUntil > Date.now()) return 'open'
    if (e.state === 'open' && e.cooldownUntil <= Date.now()) return 'degraded'
    return e.state
  }

  shouldSkip(serverId: string, paused: boolean): boolean {
    if (paused) return true
    const e = this.entries.get(serverId)
    if (!e) return false
    if (e.state === 'open' && e.cooldownUntil > Date.now()) return true
    return false
  }

  recordSuccess(serverId: string): void {
    this.entries.set(serverId, {
      consecutiveFails: 0,
      cooldownUntil: 0,
      state: 'healthy',
      lastError: '',
    })
  }

  recordFailure(serverId: string, error: unknown): void {
    const cls = classifyMcpServerError(error)
    const msg = error instanceof Error ? error.message : String(error)
    const prev = this.entries.get(serverId)

    if (cls === 'business') {
      this.entries.set(serverId, {
        consecutiveFails: prev?.consecutiveFails ?? 0,
        cooldownUntil: prev?.cooldownUntil ?? 0,
        state: prev?.state === 'open' ? 'open' : 'degraded',
        lastError: msg.slice(0, 200),
      })
      return
    }

    // 429 / quota：记 degraded，不立刻 open，不把 fails 拉到阈值熔断
    if (cls === 'rate_limited') {
      this.entries.set(serverId, {
        consecutiveFails: prev?.consecutiveFails ?? 0,
        cooldownUntil: prev?.cooldownUntil ?? 0,
        state: prev?.state === 'open' ? 'open' : 'degraded',
        lastError: msg.slice(0, 200),
      })
      return
    }

    const fails = (prev?.consecutiveFails ?? 0) + 1
    if (fails >= FAILURE_THRESHOLD) {
      const level = Math.max(1, fails - FAILURE_THRESHOLD + 1)
      const cooldown = Math.min(BASE_COOLDOWN_MS * 2 ** (level - 1), MAX_COOLDOWN_MS)
      this.entries.set(serverId, {
        consecutiveFails: fails,
        cooldownUntil: Date.now() + cooldown,
        state: 'open',
        lastError: msg.slice(0, 200),
      })
      return
    }
    this.entries.set(serverId, {
      consecutiveFails: fails,
      cooldownUntil: 0,
      state: 'degraded',
      lastError: msg.slice(0, 200),
    })
  }

  reset(serverId?: string): void {
    if (serverId) this.entries.delete(serverId)
    else this.entries.clear()
  }

  lastError(serverId: string): string {
    return this.entries.get(serverId)?.lastError ?? ''
  }
}
