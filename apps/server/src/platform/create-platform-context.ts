import {
  getEventDispatcher,
  resetEventDispatcherForTests,
} from '@opptrix/event-bus'
import { resolveUserDataRoot } from '@opptrix/shared'
import { createAlertFacade } from './alerts/create-alert-facade.js'
import { createApprovalQueue } from './approval/create-approval-queue.js'
import { createCheckpointStore } from './checkpoint/create-checkpoint-store.js'
import { createExtensionManager } from './extensions/create-extension-manager.js'
import { createCapabilityHost } from './extensions/capability-host.js'
import { registerSelfContainedHandlers } from './extensions/capability-handlers.js'
import { resetBrowserDetectCacheForTests } from './hands/browser-detect.js'
import { createHandsPort } from './hands/create-hands-port.js'
import { createIngressRouter } from './ingress/create-ingress-router.js'
import { createJobsFacade } from './jobs/create-jobs-facade.js'
import { createMemoryFacade } from './memory/create-memory-facade.js'
import {
  clearDomainPackPreferencesForTests,
  createPackRegistry,
} from './packs/create-pack-registry.js'
import { createPlatformGate } from './gate/index.js'
import { createExtensionRegistryStore } from './extensions/registry-store.js'
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

/**
 * Env `OPPTRIX_PLATFORM_PACK_ENFORCE` — domain-pack checks at the gate.
 * Unset → ON (SF1 default). Explicit `0|false|no` → OFF. `1|true|yes` → ON.
 */
export function readPackEnforceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.OPPTRIX_PLATFORM_PACK_ENFORCE
  if (raw === undefined || raw === null) return true
  const v = String(raw).trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  if (v === '1' || v === 'true' || v === 'yes') return true
  // Unknown non-empty values: treat as ON (fail closed toward enforce).
  return true
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
  // Extension registry persistence — R0 Phase 1 scan on boot loads from here.
  const extensionRegistry = createExtensionRegistryStore()
  // Capability host — dispatches extension callGate tokens to real services.
  // Self-contained handlers (events, platform.info, storage) registered here;
  // late-bound handlers (llm, data.query, shell, schedule) registered by index.ts.
  const capabilityHost = createCapabilityHost({ events, packs })
  registerSelfContainedHandlers(capabilityHost, packs)
  const extensions = createExtensionManager({
    events,
    gate,
    registry: extensionRegistry,
    capabilityHost,
    dataRoot: resolveUserDataRoot(),
  })
  const hands = createHandsPort({ gate })
  // SF-thin-A: Hands grant file overwrite/delete match WorkspaceService (no confirm wire).
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
    bindHandsConfirmHandler(handler) {
      hands.bindHandsConfirmHandler(handler)
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

/** Tests only — clears platform + shared event dispatcher + pack prefs. */
export function resetPlatformContextForTests(): void {
  const prev = shared
  shared = null
  if (prev) {
    void prev.extensions.host.stop().catch(() => {
      // soft
    })
  }
  clearDomainPackPreferencesForTests()
  resetBrowserDetectCacheForTests()
  resetEventDispatcherForTests()
}
