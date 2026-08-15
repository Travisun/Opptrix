import {
  getPythonInstallJobStatus,
  subscribePythonInstallJob,
  PYTHON_INSTALL_JOB_ID,
  type PythonInstallJobSnapshot,
} from '@opptrix/agent-workspace'
import {
  JOB_IN_FLIGHT_STATES,
  type BackgroundJobState,
} from '../constants.js'
import type { BackgroundJobSnapshot, JobRegistry } from '../types.js'
import type { JobAdapter } from './types.js'

function mapPythonState(snap: PythonInstallJobSnapshot): BackgroundJobState | null {
  if (snap.state === 'idle' && !snap.job_id) return null
  if (snap.state === 'queued') return 'queued'
  if (snap.state === 'running') return 'running'
  if (snap.state === 'completed') return 'completed'
  if (snap.state === 'failed') return 'failed'
  if (snap.accepted) return 'accepted'
  return null
}

function toSnapshot(snap: PythonInstallJobSnapshot): BackgroundJobSnapshot | null {
  const state = mapPythonState(snap)
  if (!state) return null
  const jobId = snap.job_id?.trim() || PYTHON_INSTALL_JOB_ID
  const now = Date.now()
  return {
    jobId,
    kind: 'python-install',
    state,
    title: '准备 Python 环境',
    progress: {
      percent: snap.percent,
      phase: snap.phase,
      message: snap.message,
      bytesDownloaded: snap.bytes_downloaded,
      bytesTotal: snap.bytes_total,
    },
    cancelable: false,
    createdAtMs: snap.started_at_ms ?? now,
    updatedAtMs: now,
    startedAtMs: snap.started_at_ms,
    error: snap.error,
    suggestedWakeSeconds: undefined,
  }
}

function publish(registry: JobRegistry, snap: PythonInstallJobSnapshot): void {
  const mapped = toSnapshot(snap)
  if (!mapped) return
  const existing = registry.get(mapped.jobId)
  if (existing && !JOB_IN_FLIGHT_STATES.has(existing.state) && existing.state === mapped.state) {
    return
  }
  if (JOB_IN_FLIGHT_STATES.has(mapped.state)) {
    registry.upsert(mapped)
    return
  }
  if (mapped.state === 'completed' || mapped.state === 'failed' || mapped.state === 'cancelled') {
    if (existing && JOB_IN_FLIGHT_STATES.has(existing.state)) {
      registry.markTerminal(mapped.jobId, mapped.state, {
        progress: mapped.progress,
        error: mapped.error,
      })
    } else {
      registry.upsert(mapped)
    }
  }
}

export const pythonInstallAdapter: JobAdapter = {
  kind: 'python-install',

  syncFromSource(jobId?: string) {
    const snap = getPythonInstallJobStatus()
    const mapped = toSnapshot(snap)
    if (!mapped) return null
    if (jobId && mapped.jobId !== jobId.trim()) return null
    return mapped
  },

  bind(registry: JobRegistry) {
    // 启动时若已有进行中任务，先同步一次
    publish(registry, getPythonInstallJobStatus())
    return subscribePythonInstallJob((snap) => {
      publish(registry, snap)
    })
  },
}
