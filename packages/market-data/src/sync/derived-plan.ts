import type { DerivedReadiness, MarketDbStatus } from '../store.js'
import { CN_DERIVED_MAINTENANCE_JOBS } from './config.js'

export interface DerivedMaintenancePlan {
  jobs: readonly string[]
  label: string
}

export function computeDerivedOverallPercent(derived: DerivedReadiness): number {
  if (!derived.klines_prerequisite) return 0
  let sum = 0
  if (derived.screen_factors) sum += 1
  if (derived.industry_stats) sum += 1
  return Math.round((sum / CN_DERIVED_MAINTENANCE_JOBS.length) * 1000) / 10
}

/** 本地衍生层是否仍需维护 */
export function derivedMaintenanceNeeded(status: MarketDbStatus): boolean {
  const derived = status.derived
  if (!derived?.klines_prerequisite) return false
  return !derived.ready
}

export function shouldAutoDerivedMaintenanceOnBoot(status: MarketDbStatus): boolean {
  return derivedMaintenanceNeeded(status)
}

export function resolveDerivedMaintenancePlan(status: MarketDbStatus): DerivedMaintenancePlan | null {
  if (!shouldAutoDerivedMaintenanceOnBoot(status)) return null

  const derived = status.derived
  const jobs = CN_DERIVED_MAINTENANCE_JOBS.filter(job => {
    if (job === 'screen_factors') return !derived.screen_factors
    if (job === 'industry_stats') return !derived.industry_stats
    return true
  })

  if (jobs.length === 0) return null

  return {
    jobs,
    label: '本地指标维护',
  }
}

/** 手动触发 — force 时全量重算两项衍生任务 */
export function resolveDerivedMaintenanceManualPlan(
  status: MarketDbStatus,
  force = false,
): DerivedMaintenancePlan | null {
  if (!status.derived?.klines_prerequisite) return null
  if (force) {
    return {
      jobs: [...CN_DERIVED_MAINTENANCE_JOBS],
      label: '本地指标维护（全量重算）',
    }
  }
  return resolveDerivedMaintenancePlan(status)
}
