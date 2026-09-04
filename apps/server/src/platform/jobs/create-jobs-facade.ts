import { getJobRegistry, type BackgroundJobSnapshot } from '@opptrix/agent'
import { cancelShellCommandJob } from '@opptrix/agent-workspace'
import { SystemEvents, type EventDispatcher } from '@opptrix/event-bus'
import { getScheduleService } from '@opptrix/schedule'
import type { ScheduledJob } from '@opptrix/user-store'
import { cancelDiscoverJob, listDiscoverJobs, type DiscoverJobSnapshot } from '../../discover-jobs.js'
import type { JobsFacade, JobsFacadeBackend, PlatformJobSnapshot } from './types.js'

const AGENT_TERMINAL = new Set(['completed', 'failed', 'cancelled'])

function mapAgentSnapshot(snap: BackgroundJobSnapshot): PlatformJobSnapshot {
  const label = (snap.title?.trim() || snap.progress.message || '').trim() || undefined
  return {
    id: snap.jobId,
    kind: `agent.${snap.kind}`,
    status: snap.state,
    label,
    updatedAt: new Date(snap.updatedAtMs).toISOString(),
    source: 'agent-job-registry',
  }
}

function mapDiscoverSnapshot(job: DiscoverJobSnapshot): PlatformJobSnapshot {
  const label = (job.strategy_name?.trim() || job.message?.trim() || '').trim() || undefined
  return {
    id: job.id,
    kind: 'discover',
    status: job.status,
    label,
    updatedAt: job.updated_at,
    source: 'discover-jobs',
  }
}

function mapScheduleSnapshot(job: ScheduledJob): PlatformJobSnapshot {
  const status = job.enabled
    ? (job.last_status?.trim() || 'scheduled')
    : 'disabled'
  return {
    id: job.id,
    kind: `schedule.${job.kind}`,
    status,
    label: job.title,
    updatedAt: job.updated_at,
    source: 'schedule',
  }
}

function createAgentBackend(): JobsFacadeBackend {
  return {
    list() {
      return getJobRegistry().list().map(mapAgentSnapshot)
    },
    cancel(jobId: string) {
      const registry = getJobRegistry()
      const snap = registry.get(jobId)
      if (!snap) return false
      if (!snap.cancelable) return false
      if (AGENT_TERMINAL.has(snap.state)) return false

      // Shell cancel is sync; mirrors requestCancel handler for shell-command.
      if (snap.kind === 'shell-command') {
        const ok = cancelShellCommandJob(jobId)
        if (!ok) return false
        registry.markTerminal(jobId, 'cancelled', {
          progress: { ...snap.progress, message: '已取消' },
          error: null,
        })
        return true
      }

      // Other cancelable kinds: initiate async cancel; treat as accepted when queued.
      void registry.requestCancel(jobId)
      return true
    },
  }
}

function createDiscoverBackend(): JobsFacadeBackend {
  return {
    list() {
      return listDiscoverJobs().map(mapDiscoverSnapshot)
    },
    cancel(jobId: string) {
      return cancelDiscoverJob(jobId)
    },
  }
}

function createScheduleBackend(): JobsFacadeBackend {
  return {
    list() {
      try {
        return getScheduleService().listJobs().map(mapScheduleSnapshot)
      } catch {
        // Schedule store may be unavailable in isolated unit tests.
        return []
      }
    },
    cancel(jobId: string) {
      try {
        const svc = getScheduleService()
        const job = svc.getJob(jobId)
        if (!job) return false
        if (!job.enabled) return false
        return svc.disableJob(jobId) != null
      } catch {
        return false
      }
    },
  }
}

/**
 * Stub for enrichment / fuyao raw maps not yet wired as first-class platform sources.
 * Fuyao dump jobs already surface via agent-job-registry when adapters are bound.
 * TODO(K3+): list enrichment-routes in-memory jobs if a stable public list API lands.
 */
function createEnrichmentStubBackend(): JobsFacadeBackend {
  return {
    list() {
      return []
    },
    cancel() {
      return false
    },
  }
}

export type CreateJobsFacadeOptions = {
  /** Override backend list (order = cancel try order). */
  backends?: JobsFacadeBackend[]
  /** Optional bus — emit job.terminal on successful cancel (best-effort). */
  events?: EventDispatcher
}

/** Build the process Jobs facade; defaults wrap agent registry + discover + schedule. */
export function createJobsFacade(opts?: CreateJobsFacadeOptions): JobsFacade {
  const backends = opts?.backends ?? [
    createAgentBackend(),
    createDiscoverBackend(),
    createScheduleBackend(),
    createEnrichmentStubBackend(),
  ]
  const events = opts?.events

  return {
    list() {
      const out: PlatformJobSnapshot[] = []
      const seen = new Set<string>()
      for (const backend of backends) {
        for (const snap of backend.list()) {
          const key = `${snap.source}:${snap.id}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push(snap)
        }
      }
      return out
    },
    cancel(jobId: string) {
      const id = String(jobId ?? '').trim()
      if (!id) return false
      for (const backend of backends) {
        if (!backend.cancel(id)) continue
        if (events) {
          try {
            events.emit(SystemEvents.job.terminal, {
              jobId: id,
              status: 'cancelled',
            })
          } catch {
            // best-effort — cancel already succeeded
          }
        }
        return true
      }
      return false
    },
  }
}

export {
  mapAgentSnapshot,
  mapDiscoverSnapshot,
  mapScheduleSnapshot,
  createAgentBackend,
  createDiscoverBackend,
  createScheduleBackend,
  createEnrichmentStubBackend,
}
