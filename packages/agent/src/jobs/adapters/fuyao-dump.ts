import {
  getFuyaoDumpJob,
  subscribeFuyaoDumpJob,
  type FuyaoDumpJobResult,
} from '@opptrix/market-data-store'
import {
  JOB_IN_FLIGHT_STATES,
  type BackgroundJobState,
} from '../constants.js'
import type { BackgroundJobSnapshot, JobRegistry } from '../types.js'
import type { JobAdapter } from './types.js'

function mapFuyaoState(status: FuyaoDumpJobResult['status']): BackgroundJobState {
  if (status === 'preparing') return 'preparing'
  if (status === 'ready') return 'completed'
  return 'failed'
}

function toSnapshot(result: FuyaoDumpJobResult): BackgroundJobSnapshot | null {
  const jobId = result.job_id?.trim()
  if (!jobId) return null
  const state = mapFuyaoState(result.status)
  const now = Date.now()
  return {
    jobId,
    kind: 'fuyao-dump',
    state,
    title: '准备离线数据包',
    progress: {
      percent: result.percent,
      message: result.message
        ?? (state === 'preparing'
          ? '正在准备数据包…'
          : state === 'completed'
            ? '已就绪'
            : (result.error ?? '准备失败')),
      etaSeconds: result.eta_seconds ?? null,
    },
    cancelable: false,
    createdAtMs: now,
    updatedAtMs: now,
    startedAtMs: now,
    error: result.error ?? null,
    suggestedWakeSeconds: result.suggested_wake_seconds,
    meta: {
      dump_kind: result.dump_kind,
    },
  }
}

function publish(registry: JobRegistry, result: FuyaoDumpJobResult): void {
  const mapped = toSnapshot(result)
  if (!mapped) return
  const existing = registry.get(mapped.jobId)
  if (JOB_IN_FLIGHT_STATES.has(mapped.state)) {
    registry.upsert(mapped)
    return
  }
  if (mapped.state === 'completed' || mapped.state === 'failed') {
    if (existing && JOB_IN_FLIGHT_STATES.has(existing.state)) {
      registry.markTerminal(mapped.jobId, mapped.state, {
        progress: mapped.progress,
        error: mapped.error,
        meta: mapped.meta,
      })
    } else {
      registry.upsert(mapped)
    }
  }
}

export const fuyaoDumpAdapter: JobAdapter = {
  kind: 'fuyao-dump',

  syncFromSource(jobId?: string) {
    const id = jobId?.trim()
    if (!id) return null
    const result = getFuyaoDumpJob(id)
    if (!result) return null
    return toSnapshot(result)
  },

  bind(registry: JobRegistry) {
    return subscribeFuyaoDumpJob((result) => {
      publish(registry, result)
    })
  },
}
