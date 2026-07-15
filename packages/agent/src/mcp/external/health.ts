/**
 * 外部 MCP Server 健康 / 熔断（per-server）。
 */

import type { McpServerHealthState } from '@opptrix/shared'
import { isMcpServerFailoverError } from '@opptrix/shared'

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
    if (!isMcpServerFailoverError(error)) {
      // 业务错误：不升熔断，仅记 degraded
      const prev = this.entries.get(serverId)
      this.entries.set(serverId, {
        consecutiveFails: prev?.consecutiveFails ?? 0,
        cooldownUntil: prev?.cooldownUntil ?? 0,
        state: prev?.state === 'open' ? 'open' : 'degraded',
        lastError: error instanceof Error ? error.message : String(error),
      })
      return
    }

    const prev = this.entries.get(serverId)
    const fails = (prev?.consecutiveFails ?? 0) + 1
    const msg = error instanceof Error ? error.message : String(error)
    if (fails >= FAILURE_THRESHOLD || /429|quota|额度/i.test(msg)) {
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
