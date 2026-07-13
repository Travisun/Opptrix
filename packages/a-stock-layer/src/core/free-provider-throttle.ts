/**
 * 免费行情源硬性限流 — 持久化冷却状态 + 查询守卫（引擎 / QueryPlan 共用）。
 */

import {
  formatFreeProviderThrottleWait,
  freeProviderThrottleCooldownMs,
  isFreeProviderThrottleTrigger,
  providerRequiresApiKey,
  type FreeProviderThrottleLogEntry,
  type FreeProviderThrottleState,
} from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import { getProviderManifest } from '../providers/manifests.js'
import { resolveProviderAlias } from '../providers/common/provider-aliases.js'
import { isProviderCapabilityDenied } from '../providers/common/permission-denial.js'
import {
  getProviderHealthTracker,
  type ProviderHealthTracker,
} from './provider-health.js'

export function isFreeMarketDataProvider(providerId: string): boolean {
  const manifest = getProviderManifest(resolveProviderAlias(providerId))
  if (!manifest?.settings) return false
  return !providerRequiresApiKey(manifest.settings.fields ?? [])
}

export class FreeProviderThrottle {
  private get repo() {
    return getUserDataStore().freeProviderThrottle
  }

  getState(providerId: string): FreeProviderThrottleState | null {
    return this.repo.get(resolveProviderAlias(providerId))
  }

  listAll(): FreeProviderThrottleState[] {
    return this.repo.listAll()
  }

  listLogs(providerId?: string, limit = 100): FreeProviderThrottleLogEntry[] {
    return this.repo.listLogs(providerId ? resolveProviderAlias(providerId) : undefined, limit)
  }

  shouldSkip(providerId: string): {
    skip: boolean
    remainingMs: number
    level: number
    lastError: string
  } {
    const id = resolveProviderAlias(providerId)
    if (!isFreeMarketDataProvider(id)) {
      return { skip: false, remainingMs: 0, level: 0, lastError: '' }
    }
    const state = this.repo.get(id)
    if (!state) {
      return { skip: false, remainingMs: 0, level: 0, lastError: '' }
    }
    const remaining = state.cooldownUntil - Date.now()
    if (remaining <= 0) {
      return { skip: false, remainingMs: 0, level: state.escalationLevel, lastError: state.lastError }
    }
    return {
      skip: true,
      remainingMs: remaining,
      level: state.escalationLevel,
      lastError: state.lastError,
    }
  }

  recordTrigger(providerId: string, reason: string): FreeProviderThrottleState | null {
    const id = resolveProviderAlias(providerId)
    if (!isFreeMarketDataProvider(id)) return null

    const now = Date.now()
    const prev = this.repo.get(id)
    const newLevel = (prev?.escalationLevel ?? 0) + 1
    const cooldownMs = freeProviderThrottleCooldownMs(newLevel)
    const state: FreeProviderThrottleState = {
      providerId: id,
      escalationLevel: newLevel,
      cooldownUntil: now + cooldownMs,
      lastError: reason.slice(0, 200),
      lastTriggeredAt: now,
      updatedAt: now,
    }
    this.repo.upsert(state)
    this.repo.appendLog({
      providerId: id,
      event: 'trigger',
      detail: reason.slice(0, 200),
      escalationLevel: newLevel,
      cooldownUntil: state.cooldownUntil,
      createdAt: now,
    })
    console.warn(
      `[FreeProviderThrottle] ${id} 触发限流保护 level=${newLevel} `
      + `冷却=${formatFreeProviderThrottleWait(cooldownMs)} reason=${reason.slice(0, 80)}`,
    )
    return state
  }

  recordSuccess(providerId: string): void {
    const id = resolveProviderAlias(providerId)
    if (!isFreeMarketDataProvider(id)) return

    const prev = this.repo.get(id)
    if (!prev || (prev.escalationLevel === 0 && prev.cooldownUntil <= Date.now())) return

    const now = Date.now()
    const state: FreeProviderThrottleState = {
      providerId: id,
      escalationLevel: 0,
      cooldownUntil: 0,
      lastError: '',
      lastTriggeredAt: prev.lastTriggeredAt,
      updatedAt: now,
    }
    this.repo.upsert(state)
    this.repo.appendLog({
      providerId: id,
      event: 'success',
      detail: 'request_ok_reset',
      escalationLevel: 0,
      cooldownUntil: 0,
      createdAt: now,
    })
  }

  reset(providerId?: string): void {
    const now = Date.now()
    if (providerId) {
      const id = resolveProviderAlias(providerId)
      this.repo.delete(id)
      this.repo.appendLog({
        providerId: id,
        event: 'reset',
        detail: 'manual_reset',
        escalationLevel: 0,
        cooldownUntil: 0,
        createdAt: now,
      })
      return
    }
    for (const row of this.repo.listAll()) {
      this.repo.delete(row.providerId)
    }
    this.repo.appendLog({
      providerId: '*',
      event: 'reset',
      detail: 'manual_reset_all',
      escalationLevel: 0,
      cooldownUntil: 0,
      createdAt: now,
    })
  }
}

let shared: FreeProviderThrottle | null = null

export function getFreeProviderThrottle(): FreeProviderThrottle {
  if (!shared) shared = new FreeProviderThrottle()
  return shared
}

export function resetFreeProviderThrottleSingleton(): void {
  shared = null
}

export interface ProviderQuerySkipResult {
  skip: boolean
  lastError: string
}

/** 查询前：免费源冷却 + 熔断 + 权限屏蔽 */
export function shouldSkipProviderQuery(
  providerId: string,
  capStr: string,
  health: ProviderHealthTracker = getProviderHealthTracker(),
): ProviderQuerySkipResult {
  const throttle = getFreeProviderThrottle()
  const t = throttle.shouldSkip(providerId)
  if (t.skip) {
    return {
      skip: true,
      lastError: `${providerId}: 限流冷却中 (${t.level}级, `
        + `${formatFreeProviderThrottleWait(t.remainingMs)}后重试)`,
    }
  }

  if (health.shouldSkip(providerId, capStr)) {
    const h = health.getHealth(providerId, capStr)
    if (h?.state === 'open') {
      const sec = Math.max(0, Math.ceil((h.cooldownUntil - Date.now()) / 1000))
      return {
        skip: true,
        lastError: `${providerId}: 熔断中 (连续失败${h.consecutiveFails}次, ${sec}s后重试)`,
      }
    }
    return { skip: true, lastError: `${providerId}: 熔断中` }
  }

  if (isProviderCapabilityDenied(providerId, capStr)) {
    return { skip: true, lastError: `${providerId}: 接口无权限（已登记屏蔽）` }
  }

  return { skip: false, lastError: '' }
}

export function recordProviderQuerySuccess(
  providerId: string,
  capStr: string,
  health: ProviderHealthTracker = getProviderHealthTracker(),
): void {
  if (isFreeMarketDataProvider(providerId)) {
    getFreeProviderThrottle().recordSuccess(providerId)
  }
  health.recordSuccess(providerId, capStr)
}

export function recordProviderQueryEmpty(
  providerId: string,
  capStr: string,
  health: ProviderHealthTracker = getProviderHealthTracker(),
): void {
  // 业务空结果（合法无数据）不触发免费源长冷却，仅计软失败并换源
  health.recordInvalidResponse(providerId, capStr, 'empty_data')
}

export function recordProviderQueryInvalid(
  providerId: string,
  capStr: string,
  reason: string,
  health: ProviderHealthTracker = getProviderHealthTracker(),
): void {
  if (isFreeMarketDataProvider(providerId)) {
    const { trigger } = isFreeProviderThrottleTrigger(reason)
    if (trigger) {
      getFreeProviderThrottle().recordTrigger(providerId, reason)
      return
    }
  }
  health.recordInvalidResponse(providerId, capStr, reason)
}

export function recordProviderQueryError(
  providerId: string,
  capStr: string,
  error: unknown,
  health: ProviderHealthTracker = getProviderHealthTracker(),
): void {
  const msg = error instanceof Error ? error.message : String(error)

  if (isFreeMarketDataProvider(providerId)) {
    const { trigger, reason } = isFreeProviderThrottleTrigger(error)
    if (trigger) {
      getFreeProviderThrottle().recordTrigger(providerId, reason || msg)
      return
    }
    health.recordFailure(providerId, capStr, msg)
    return
  }

  health.recordFailure(providerId, capStr, msg)
}

export function pickNextDriver<T extends { name: string }>(
  primary: T,
  allDrivers: T[],
  attempted: Set<string>,
): T | null {
  if (!attempted.has(primary.name)) return primary
  return allDrivers.find(d => !attempted.has(d.name)) ?? null
}
