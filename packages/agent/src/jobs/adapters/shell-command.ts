import {
  getShellCommandJob,
  subscribeShellCommandJob,
  cancelShellCommandJob,
  type ShellCommandJobSnapshot,
} from '@opptrix/agent-workspace'
import {
  JOB_IN_FLIGHT_STATES,
  type BackgroundJobState,
} from '../constants.js'
import type { BackgroundJobSnapshot, JobRegistry } from '../types.js'
import type { JobAdapter } from './types.js'

function mapShellState(status: ShellCommandJobSnapshot['status']): BackgroundJobState {
  if (status === 'running') return 'running'
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  return 'failed'
}

function toSnapshot(snap: ShellCommandJobSnapshot): BackgroundJobSnapshot {
  const state = mapShellState(snap.status)
  return {
    jobId: snap.job_id,
    kind: 'shell-command',
    state,
    progress: {
      percent: snap.percent,
      message: snap.message,
      etaSeconds: snap.eta_seconds,
    },
    cancelable: true,
    createdAtMs: snap.started_at_ms,
    updatedAtMs: snap.updated_at_ms,
    startedAtMs: snap.started_at_ms,
    error: snap.error,
    suggestedWakeSeconds: snap.suggested_wake_seconds ?? undefined,
    meta: {
      session_id: snap.session_id,
      command_summary: snap.command_summary,
      exit_code: snap.exit_code,
      stdout_tail: snap.stdout_tail,
      stderr_tail: snap.stderr_tail,
    },
  }
}

function publish(registry: JobRegistry, snap: ShellCommandJobSnapshot): void {
  const mapped = toSnapshot(snap)
  const existing = registry.get(mapped.jobId)
  if (JOB_IN_FLIGHT_STATES.has(mapped.state)) {
    registry.upsert(mapped)
    return
  }
  if (mapped.state === 'completed' || mapped.state === 'failed' || mapped.state === 'cancelled') {
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

export const shellCommandAdapter: JobAdapter = {
  kind: 'shell-command',

  syncFromSource(jobId?: string) {
    const id = jobId?.trim()
    if (!id) return null
    const snap = getShellCommandJob(id)
    if (!snap) return null
    return toSnapshot(snap)
  },

  async cancel(jobId: string) {
    return cancelShellCommandJob(jobId)
  },

  bind(registry: JobRegistry) {
    registry.setCancelHandler('shell-command', async (jobId) => cancelShellCommandJob(jobId))
    return subscribeShellCommandJob((snap) => {
      publish(registry, snap)
    })
  },
}
