import type { EventDispatcher } from '@opptrix/event-bus'
import type { CapabilityGate, CheckpointApplyHooks } from '@opptrix/agent'
import type { AlertFacade } from './alerts/types.js'
import type { ApprovalQueue } from './approval/types.js'
import type { ExtensionManager, HostWorkerStatus } from './extensions/types.js'
import type { HandsPort } from './hands/types.js'
import type { JobsFacade } from './jobs/types.js'
import type { MemoryFacade } from './memory/types.js'
import type { PackRegistry, PackInfo } from './packs/types.js'
import type { PlatformMeter } from './gate/types.js'
import type { IngressRouter } from './ingress/types.js'
import type { CheckpointStore } from './checkpoint/types.js'

/** Platform ABI — Wave 58A: .opx worker_js load in host worker vm (callGate-only). */
export const PLATFORM_ABI_VERSION = '0.8.43-w58'

/** Cap for in-memory job.wake observability ring (newest last). */
export const JOB_WAKE_RING_CAP = 16

/** Cap for in-memory chat admit observability ring (newest last). */
export const CHAT_ADMIT_RING_CAP = 16

/** Observability record for a best-effort job.wake admit (Ingress ⊥ Inference). */
export type JobWakeRecord = {
  traceId: string
  sessionId: string
  jobId?: string
  at: string
  origin: string
}

/** Observability record for a best-effort chat admit (Ingress ⊥ Inference). */
export type ChatAdmitRecord = {
  traceId: string
  sessionId: string
  origin: string
  at: string
}

export type PlatformInfoSnapshot = {
  abiVersion: string
  packs: PackInfo[]
  /** Whether gate domain-pack checks are active (env OPPTRIX_PLATFORM_PACK_ENFORCE). */
  packEnforce: boolean
  /** Total registered extensions (list().length). */
  extensions: number
  /** Count of extensions with state === 'active'. */
  extensionsActive: number
  meter: {
    submitCount: number
    errorCount: number
    denyCount: number
    /** Soft quota; `null` = unlimited (env OPPTRIX_PLATFORM_GATE_MAX_SUBMITS). */
    maxSubmits: number | null
    recentCount: number
    /** Length of recent clean-deny ring (cap 32). */
    recentDenials: number
    /** Soft cumulative prompt/input tokens (default 0). */
    tokenInTotal: number
    /** Soft cumulative completion/output tokens (default 0). */
    tokenOutTotal: number
  }
  jobsListed: number
  /** Count of pending approval requests. */
  approvalsPending: number
  /** Length of recent job.wake admit ring (cap 16). */
  jobWakesRecent: number
  /** Length of recent chat admit ring (cap 16). */
  chatAdmitsRecent: number
  /** Unused HandsPort ActionTickets currently held (cap 128). */
  handsTicketsPending: number
  /** Count of durable memory promotions currently held (cap 256). */
  memoryDurable: number
  /** Count of unacknowledged platform alerts (ring cap 64). */
  alertsPending: number
  /** Extension Host worker_threads supervisor status. */
  hostWorker: HostWorkerStatus
}

export type PlatformContext = {
  abiVersion: string
  events: EventDispatcher
  /** Extension Host sandbox (in-process); callGate → invokeViaGateway ≡ gate.submit. */
  extensions: ExtensionManager
  /** Domain pack registry (research default on). */
  packs: PackRegistry
  /** Gate submit / error meter + audit ring. */
  meter: PlatformMeter
  /**
   * Capability Gate (audit + meter). May deny for soft quota (`quota_exceeded`)
   * or, when packEnforce is ON, disabled domain packs (`pack_disabled`).
   */
  gate: CapabilityGate
  /** HandsPort: ActionTicket issue → invoke via gate.submit (workspace + ping + shell.platform). */
  hands: HandsPort
  /** Unified jobs read + cancel facade (K3). */
  jobs: JobsFacade
  /** Ingress admit stub (not wired to HTTP). */
  ingress: IngressRouter
  /** In-memory session checkpoints (cap 32). */
  checkpoint: CheckpointStore
  /**
   * Late-bound hard restore apply (Wave 51+). Null until server wires SessionStore.
   * Soft restore (`apply` omitted/false) never calls this.
   * Wave 52: payload may include bounded `turns`; apply prefers turns over turnCount.
   */
  checkpointApply: CheckpointApplyHooks | null
  /** Bind / clear the hard restore apply hook. */
  bindCheckpointApply(hooks: CheckpointApplyHooks | null): void
  /** In-memory approval queue (cap 64 pending). */
  approval: ApprovalQueue
  /** Memory facade: late-bound working snapshot + durable promote with provenance. */
  memory: MemoryFacade
  /** In-memory alerts from EventBus (job.terminal / extension.crashed); ring cap 64. */
  alerts: AlertFacade
  /** Push a job.wake observability record (ring cap 16; drops oldest). */
  rememberJobWake(record: JobWakeRecord): void
  /** Recent job.wake admits; newest last; max 16. */
  listRecentJobWakes(): JobWakeRecord[]
  /** Push a chat admit observability record (ring cap 16; drops oldest). */
  rememberChatAdmit(record: ChatAdmitRecord): void
  /** Recent chat admits; newest last; max 16. */
  listRecentChatAdmits(): ChatAdmitRecord[]
  /** Kernel surface snapshot for diagnostics. */
  info(): PlatformInfoSnapshot
}

export type { JobsFacade, PlatformJobSnapshot } from './jobs/types.js'
export type { CapabilityGate, CapabilityAction, CapabilityObservation } from '@opptrix/agent'
export type {
  ExtensionActivationMode,
  ExtensionHostApi,
  ExtensionHostFacade,
  ExtensionManager,
  ExtensionManifest,
  ExtensionRecord,
  ExtensionRunResult,
  ExtensionHostSupervisor,
  HostWorkerStatus,
} from './extensions/types.js'
export type { DomainPackId, PackInfo, PackRegistry } from './packs/types.js'
export type {
  AuditEntry,
  DenialRecord,
  MeterUsageInput,
  PlatformMeter,
} from './gate/types.js'
export { DENIAL_RING_CAP, METER_USAGE_DELTA_CAP } from './gate/types.js'
export type {
  Envelope,
  IngressAdmitResult,
  IngressPrincipal,
  IngressRouter,
} from './ingress/types.js'
export type { CheckpointListItem, CheckpointLatest, CheckpointStore } from './checkpoint/types.js'
export type { CheckpointApplyHooks, CheckpointApplyInput } from '@opptrix/agent'
export type {
  ApprovalDecision,
  ApprovalQueue,
  ApprovalRequest,
  ApprovalRequestInput,
  ApprovalRequestResult,
  ApprovalStatus,
  ApprovalUserPromptResolveHandler,
} from './approval/types.js'
export type {
  ActionTicket,
  HandsBrowserAdapter,
  HandsBrowserDetectResult,
  HandsNavigateResult,
  HandsObservation,
  HandsPort,
  HandsWaitUntil,
  HandsWorkspaceAdapter,
} from './hands/types.js'
export type {
  DurableMemoryEntry,
  MemoryFacade,
  MemoryProvenance,
  MemoryWorkingSnapshot,
} from './memory/types.js'
export type { AlertFacade, PlatformAlert } from './alerts/types.js'
