/**
 * 搜索路径按需轻量名录灌库 — 仅缺的 CN/HK/US universe job，不跑 taxonomy/quotes/financials。
 */

import type { SyncStateSnapshot } from './coordinator.js'

export type SearchUniversePrepStatus = 'ready' | 'preparing' | 'failed'

export interface SearchUniverseReadyResult {
  status: SearchUniversePrepStatus
  started: boolean
  jobs: string[]
  percent: number
  message: string
}

export const SEARCH_UNIVERSE_JOB_SPECS = [
  { job: 'initial_cn_universe', market: 'CN' as const, minCount: 1000 },
  { job: 'initial_hk_universe', market: 'HK' as const, minCount: 500 },
  { job: 'initial_us_universe', market: 'US' as const, minCount: 1000 },
] as const

export type SearchUniverseJobName = (typeof SEARCH_UNIVERSE_JOB_SPECS)[number]['job']

const PREP_MESSAGE = '正在准备标的库…'
const FAIL_MESSAGE = '标的库暂时没法准备好，可以稍后再搜试试'

export interface SearchUniverseReadyDeps {
  getCursorLastSuccess: (jobName: string) => string | null
  countEquity: (market: 'CN' | 'HK' | 'US') => number
  isRunning: () => boolean
  getSnapshot: () => Pick<SyncStateSnapshot, 'overall_percent' | 'message' | 'running'>
  /** 当前 session 正在跑的 job 列表（coordinator 单飞） */
  getSessionJobs: () => readonly string[]
  start: (jobs: string[]) => Promise<{ started: boolean; running: boolean }>
}

export function listMissingSearchUniverseJobs(
  deps: Pick<SearchUniverseReadyDeps, 'getCursorLastSuccess' | 'countEquity'>,
): string[] {
  const missing: string[] = []
  for (const spec of SEARCH_UNIVERSE_JOB_SPECS) {
    const last = deps.getCursorLastSuccess(spec.job)
    let count = 0
    try {
      count = deps.countEquity(spec.market)
    } catch {
      count = 0
    }
    if (!last || count < spec.minCount) {
      missing.push(spec.job)
    }
  }
  return missing
}

function sessionCoversMissing(sessionJobs: readonly string[], missing: string[]): boolean {
  if (!missing.length) return true
  if (!sessionJobs.length) return false
  return missing.every(j => sessionJobs.includes(j))
}

function preparingFromSnapshot(
  snap: Pick<SyncStateSnapshot, 'overall_percent' | 'message'>,
  jobs: string[],
  started: boolean,
): SearchUniverseReadyResult {
  const percent = Math.max(0, Math.min(100, Number(snap.overall_percent) || 0))
  return {
    status: 'preparing',
    started,
    jobs,
    percent,
    message: PREP_MESSAGE,
  }
}

/**
 * 检查轻量名录是否就绪；缺则后台 start 仅缺的 jobs（单飞，不 await 整次灌完）。
 */
export async function ensureSearchUniverseReady(
  deps: SearchUniverseReadyDeps,
): Promise<SearchUniverseReadyResult> {
  const missing = listMissingSearchUniverseJobs(deps)
  if (!missing.length) {
    return {
      status: 'ready',
      started: false,
      jobs: [],
      percent: 100,
      message: '',
    }
  }

  const snap = deps.getSnapshot()
  const sessionJobs = deps.getSessionJobs()

  if (deps.isRunning()) {
    const jobs = sessionCoversMissing(sessionJobs, missing) ? missing : [...missing]
    return preparingFromSnapshot(snap, jobs, false)
  }

  try {
    const result = await deps.start(missing)
    if (!result.started && !result.running) {
      return {
        status: 'failed',
        started: false,
        jobs: missing,
        percent: 0,
        message: FAIL_MESSAGE,
      }
    }
    const after = deps.getSnapshot()
    return preparingFromSnapshot(after, missing, result.started)
  } catch {
    return {
      status: 'failed',
      started: false,
      jobs: missing,
      percent: 0,
      message: FAIL_MESSAGE,
    }
  }
}
