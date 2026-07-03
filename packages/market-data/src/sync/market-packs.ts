import type { MarketDataPackConfig, MarketDataPackId } from '@opptrix/shared'
import {
  BOOTSTRAP_SYNC_JOBS,
  DEEP_SYNC_JOBS,
} from './config.js'

/** Jobs belonging to each optional/local pack */
export const US_PACK_JOBS = ['us_list', 'us_quotes'] as const
export const CRYPTO_PACK_JOBS = ['crypto_list', 'crypto_quotes'] as const

/** CN deep jobs = all DEEP minus cross-market list jobs */
export const CN_DEEP_JOBS = DEEP_SYNC_JOBS.filter(
  j => !(US_PACK_JOBS as readonly string[]).includes(j)
    && !(CRYPTO_PACK_JOBS as readonly string[]).includes(j),
)

export const CN_PACK_JOBS = [...BOOTSTRAP_SYNC_JOBS, ...CN_DEEP_JOBS] as const

export const PACK_JOBS: Record<MarketDataPackId, readonly string[]> = {
  cn: CN_PACK_JOBS,
  us: US_PACK_JOBS,
  crypto: CRYPTO_PACK_JOBS,
}

const JOB_TO_PACK = new Map<string, MarketDataPackId>()
for (const [pack, jobs] of Object.entries(PACK_JOBS) as [MarketDataPackId, readonly string[]][]) {
  for (const job of jobs) JOB_TO_PACK.set(job, pack)
}

export function jobMarketPack(job: string): MarketDataPackId {
  return JOB_TO_PACK.get(job) ?? 'cn'
}

export function filterJobsByMarketPacks(
  jobs: readonly string[],
  config: MarketDataPackConfig,
): string[] {
  return jobs.filter(job => {
    const pack = jobMarketPack(job)
    if (pack === 'cn') return true
    return config[pack]?.enabled === true
  })
}

export function enabledMarketPackIds(config: MarketDataPackConfig): MarketDataPackId[] {
  const out: MarketDataPackId[] = ['cn']
  if (config.us.enabled) out.push('us')
  if (config.crypto.enabled) out.push('crypto')
  return out
}

export function jobsForMarketPack(pack: MarketDataPackId): readonly string[] {
  return PACK_JOBS[pack]
}

export function allJobsForEnabledPacks(config: MarketDataPackConfig): string[] {
  const merged = new Set<string>()
  for (const pack of enabledMarketPackIds(config)) {
    for (const job of PACK_JOBS[pack]) merged.add(job)
  }
  return [...merged]
}
