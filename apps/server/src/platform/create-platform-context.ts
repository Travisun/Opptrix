import {
  getEventDispatcher,
  resetEventDispatcherForTests,
} from '@opptrix/event-bus'
import { getWorkspaceService } from '@opptrix/agent-workspace'
import { createAlertFacade } from './alerts/create-alert-facade.js'
import { createApprovalQueue } from './approval/create-approval-queue.js'
import { createCheckpointStore } from './checkpoint/create-checkpoint-store.js'
import { createExtensionManager } from './extensions/create-extension-manager.js'
import { resetBrowserDetectCacheForTests } from './hands/browser-detect.js'
import { createHandsPort } from './hands/create-hands-port.js'
import { createIngressRouter } from './ingress/create-ingress-router.js'
import { createJobsFacade } from './jobs/create-jobs-facade.js'
import { createMemoryFacade } from './memory/create-memory-facade.js'
import { createPackRegistry } from './packs/create-pack-registry.js'
import { createPlatformGate } from './gate/index.js'
import {
  CHAT_ADMIT_RING_CAP,
  JOB_WAKE_RING_CAP,
  PLATFORM_ABI_VERSION,
  type ChatAdmitRecord,
  type JobWakeRecord,
  type PlatformContext,
  type PlatformInfoSnapshot,
} from './types.js'

let shared: PlatformContext | null = null

/** Env `OPPTRIX_PLATFORM_PACK_ENFORCE=1|true|yes` enables domain-pack checks (default OFF). */
export function readPackEnforceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.OPPTRIX_PLATFORM_PACK_ENFORCE
  if (raw === undefined || raw === null) return false
  const v = String(raw).trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/**
 * Env `OPPTRIX_PLATFORM_GATE_MAX_SUBMITS` — positive integer soft quota.
 * Unset / empty / invalid / ≤0 → unlimited (`null`).
 */
export function readGateMaxSubmitsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = env.OPPTRIX_PLATFORM_GATE_MAX_SUBMITS
  if (raw === undefined || raw === null) return null
  const trimmed = String(raw).trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

/** Create (or return) the process-wide PlatformContext singleton. */
export function createPlatformContext(): PlatformContext {
  if (shared) return shared
  const events = getEventDispatcher()
  const packs = createPackRegistry()
  const packEnforce = readPackEnforceFromEnv()
  const maxSubmits = readGateMaxSubmitsFromEnv()
  const { gate, meter } = createPlatformGate(events, {
    packs,
    packEnforce,
    maxSubmits,
  })
  const extensions = createExtensionManager({ events, gate })
  const hands = createHandsPort({
    gate,
    workspace: {
      listGrants: (sessionId) => getWorkspaceService().listGrants(sessionId),
      listDir: (sessionId, rootId, relPath) =>
        getWorkspaceService().listDir(sessionId, rootId, relPath),
      readFile: (sessionId, rootId, relPath) =>
        getWorkspaceService().readFile(sessionId, rootId, relPath),
      writeFile: (sessionId, rootId, relPath, content, opts) => {
        const confirm =
          opts?.confirmOverwrite === true
            ? async () => ({ selected_ids: ['once'] })
            : undefined
        return getWorkspaceService().writeFile(
          sessionId,
          rootId,
          relPath,
          content,
          confirm,
        )
      },
      mkdir: (sessionId, rootId, relPath) =>
        getWorkspaceService().mkdir(sessionId, rootId, relPath),
      deletePath: (sessionId, rootId, relPath, opts) => {
        const confirm =
          opts?.confirmDelete === true
            ? async () => ({ selected_ids: ['once'] })
            : undefined
        return getWorkspaceService().deletePath(
          sessionId,
          rootId,
          relPath,
          confirm,
        )
      },
    },
  })
  const jobs = createJobsFacade({ events })
  const ingress = createIngressRouter()
  const checkpoint = createCheckpointStore()
  const approval = createApprovalQueue()
  const memory = createMemoryFacade()
  const alerts = createAlertFacade({ events })
  /** job.wake observability ring — newest last; cap JOB_WAKE_RING_CAP. */
  const jobWakes: JobWakeRecord[] = []
  /** chat admit observability ring — newest last; cap CHAT_ADMIT_RING_CAP. */
  const chatAdmits: ChatAdmitRecord[] = []

  const ctx: PlatformContext = {
    abiVersion: PLATFORM_ABI_VERSION,
    events,
    extensions,
    packs,
    meter,
    gate,
    hands,
    jobs,
    ingress,
    checkpoint,
    checkpointApply: null,
    bindCheckpointApply(hooks) {
      ctx.checkpointApply = hooks
    },
    approval,
    memory,
    alerts,
    rememberJobWake(record: JobWakeRecord): void {
      jobWakes.push({ ...record })
      while (jobWakes.length > JOB_WAKE_RING_CAP) {
        jobWakes.shift()
      }
    },
    listRecentJobWakes(): JobWakeRecord[] {
      return jobWakes.map((r) => ({ ...r }))
    },
    rememberChatAdmit(record: ChatAdmitRecord): void {
      chatAdmits.push({ ...record })
      while (chatAdmits.length > CHAT_ADMIT_RING_CAP) {
        chatAdmits.shift()
      }
    },
    listRecentChatAdmits(): ChatAdmitRecord[] {
      return chatAdmits.map((r) => ({ ...r }))
    },
    info(): PlatformInfoSnapshot {
      const snap = meter.snapshot()
      let jobsListed = 0
      try {
        jobsListed = jobs.list().length
      } catch {
        jobsListed = 0
      }
      const extensionList = extensions.list()
      return {
        abiVersion: PLATFORM_ABI_VERSION,
        packs: packs.list(),
        packEnforce,
        extensions: extensionList.length,
        extensionsActive: extensionList.filter((r) => r.state === 'active').length,
        meter: {
          submitCount: snap.submitCount,
          errorCount: snap.errorCount,
          denyCount: snap.denyCount,
          maxSubmits,
          recentCount: snap.recent.length,
          recentDenials: snap.recentDenialCount,
          tokenInTotal: snap.tokenInTotal,
          tokenOutTotal: snap.tokenOutTotal,
        },
        jobsListed,
        approvalsPending: approval.list().length,
        jobWakesRecent: jobWakes.length,
        chatAdmitsRecent: chatAdmits.length,
        handsTicketsPending: hands.pendingCount(),
        memoryDurable: memory.listDurable().length,
        alertsPending: alerts.list({ includeAcknowledged: false }).length,
        hostWorker: extensions.getHostSupervisor().status(),
      }
    },
  }
  shared = ctx
  return shared
}

/** Return the singleton; throws if `createPlatformContext()` was never called. */
export function getPlatformContext(): PlatformContext {
  if (!shared) {
    throw new Error('PlatformContext not created; call createPlatformContext() first')
  }
  return shared
}

/** Tests only — clears platform + shared event dispatcher. */
export function resetPlatformContextForTests(): void {
  const prev = shared
  shared = null
  if (prev) {
    void prev.extensions.host.stop().catch(() => {
      // soft
    })
  }
  resetBrowserDetectCacheForTests()
  resetEventDispatcherForTests()
}
