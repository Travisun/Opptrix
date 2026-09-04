/** Extension host — in-process sandbox; sole side-effect channel is callGate → Gateway ≡ Gate. */

import type { CapabilityObservation } from '@opptrix/agent'
import type {
  ExtensionHostSupervisor,
  HostWorkerStatus,
} from './host-worker-rpc.js'

/**
 * Activation mode.
 * `catalog_only` (default): state flip only.
 * `worker_stub`: ensure shared host worker is running + hostBound; still no user JS load.
 * `worker_js` (Wave 58A): start host worker + load allowlisted entry source in worker `vm`
 *   (callGate-only sandbox) — never eval/require extension JS in the main/server process.
 */
export type ExtensionActivationMode = 'catalog_only' | 'worker_stub' | 'worker_js'

/**
 * Phase A capability permissions.
 * Each token maps to a required permission; the CapabilityGate enforces at callGate time.
 */
export type ExtensionPermission =
  | 'storage'
  | 'llm'
  | 'sessions.read'
  | 'data.query'
  | 'shell'
  | 'schedule'
  | 'events.subscribe'
  | 'events.emit'
  | 'platform.info'

/**
 * Phase A contribution points.
 * Extensions declare contributions in manifest; the manager registers/clears on activate/deactivate.
 */
export type ExtensionContributes = {
  /** Read-only hooks (Phase A): observe without mutating. */
  hooks?: Array<'session.messageCommitted' | 'agent.toolPreExecute'>
  /** HTTP sub-routes proxied to extension Host RPC. */
  routes?: string[]
  /** UI contribution points (Phase A views; MF remote modules Phase B+). */
  views?: Array<{
    id: string
    type: 'sidebar' | 'page' | 'settings'
    title: string
    module?: string
  }>
}

/** In-memory manifest — Wave 49A zip parse; Wave 55A/58A optional activation. */
export type ExtensionManifest = {
  id: string
  name?: string
  version?: string
  /** Phase A: required permissions for capability tokens. Replaces `capabilities[]`. */
  permissions?: ExtensionPermission[]
  /** Legacy alias — kept for backward compat; mapped to permissions on register. */
  capabilities?: string[]
  /** Default `catalog_only` when omitted. */
  activation?: ExtensionActivationMode
  /**
   * Relative root path to entry JS inside an .opx zip (Wave 58A).
   * Path-safe only (`..` / absolute rejected). Used solely to read bytes from zip —
   * never `require()`'d on the host.
   */
  entry?: string
  /** Phase A contribution points. */
  contributes?: ExtensionContributes
  /** Events that trigger activation (MVP: onStartup). */
  activationEvents?: Array<'onStartup' | 'onCommand' | 'onView'>
}

export type ExtensionRecord = {
  id: string
  state: 'inactive' | 'active' | 'disabled' | 'error'
  error?: string
  name?: string
  version?: string
  capabilities?: string[]
  /** Phase A permissions (from manifest.permissions[]). */
  permissions?: ExtensionPermission[]
  /** From manifest; omitted ⇒ treat as catalog_only. */
  activation?: ExtensionActivationMode
  /**
   * Lazy-activation gate (reactive model): extensions without 'onStartup' are
   * NOT re-activated at server boot — they wait for a trigger (command, view,
   * route request) or a manual activate.
   */
  activationEvents?: Array<'onStartup' | 'onCommand' | 'onView'>
  /**
   * Set true after worker_stub / worker_js activate binds the shared host worker.
   */
  hostBound?: boolean
  /** True after worker_js successfully loaded entry source into the host vm. */
  jsLoaded?: boolean
  /**
   * Install-time trust (SF1). Set `true` only when register/register-opx accepted
   * `trusted: true`. Activate/run do not re-ask trust.
   */
  trusted: boolean
}

export type ExtensionGatewayAction = {
  token: string
  args?: Record<string, unknown>
  principal?: { kind: string; id?: string; sessionId?: string }
  traceId?: string
}

/** Host API exposed to extension work — no Hub / Agent / store handles. */
export type ExtensionHostApi = {
  /** Sole side-effect channel — Gateway ≡ Gate. */
  callGate(
    token: string,
    args?: Record<string, unknown>,
  ): Promise<CapabilityObservation>
}

export type ExtensionRunResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

/** Soft-fail facade over the worker_threads Host supervisor (Wave 13A). */
export type ExtensionHostFacade = {
  start(): Promise<{ ok: boolean; error?: string }>
  stop(): Promise<void>
  ping(): Promise<{ ok: boolean; error?: string }>
  /** Proves worker → parent → gate path. */
  callGateFromWorker(
    token: string,
    args?: Record<string, unknown>,
  ): Promise<CapabilityObservation | { ok: false; error: string }>
}

export type ExtensionManager = {
  list(): ExtensionRecord[]
  /** Register an inactive catalog entry; duplicate / empty → ok:false. Requires install-time trust. */
  register(
    id: string,
    opts?: { trusted?: boolean },
  ): { ok: true } | { ok: false; error: string }
  /**
   * Manifest-only register: metadata → inactive catalog entry.
   * Requires install-time `trusted: true` (opts or body field); else `trust_required`.
   * Rejects host file-path fields (`sourcePath` / `path` / …).
   * Wave 58A: optional `entrySource` (already extracted from .opx zip) is stored
   * in-memory for worker_js activate — never eval'd/require'd in this process.
   */
  registerFromManifest(
    manifest: ExtensionManifest | Record<string, unknown>,
    opts?: { trusted?: boolean; entrySource?: string },
  ): { ok: true } | { ok: false; error: string }
  /**
   * Activate a registered extension.
   * `experimental: true` soft warning when mode is `worker_js` (not the product
   * system-extension path — in-process Host contribution points are).
   */
  activate(id: string): Promise<{ ok: boolean; error?: string; experimental?: true }>
  deactivate(id: string): Promise<{ ok: boolean }>
  /**
   * Uninstall: deactivate (contribution cleanup), remove from registry + memory.
   * Does NOT remove private data (caller decides via removeExtensionData).
   */
  uninstall(id: string): { ok: boolean; id: string }
  /** R0: never throws; failures become disabled+error */
  bootScan(): Promise<void>
  /**
   * R0 Phase 1+2: load persisted records + re-activate previously-active extensions.
   * Idempotent, non-throwing. Called post-listen.
   */
  ready(): Promise<void>
  /**
   * R1 ordered shutdown: deactivate active extensions, flush registry, stop host worker.
   * Bounded best-effort, never throws.
   */
  shutdown(): Promise<void>
  /**
   * Run work only if extension is active.
   * R0: never throws out of run — timeout / work throw → state error + ok:false.
   */
  run(
    id: string,
    work: (api: ExtensionHostApi) => Promise<unknown>,
    opts?: { timeoutMs?: number },
  ): Promise<ExtensionRunResult>
  /**
   * Extension Gateway ≡ Gate: always routes through CapabilityGate.submit.
   * Soft-fails with denialCode `gate_unavailable` when no gate is wired.
   */
  invokeViaGateway(
    action: ExtensionGatewayAction,
    exec: () => Promise<unknown>,
  ): Promise<CapabilityObservation>
  /** Soft-fail worker Host control surface. */
  host: ExtensionHostFacade
  /** Underlying supervisor (status / restart). */
  getHostSupervisor(): ExtensionHostSupervisor
  /**
   * Phase B shared host subprocess supervisor (all worker_js extensions in one
   * forked child, per-extension vm contexts). Null when the legacy worker
   * backend is selected via OPPTRIX_EXT_RUNTIME=worker.
   */
  getSharedHost(): import('./subprocess-host.js').SharedHostSupervisor | null
  /** Registered extension schedule declarations (diagnostics). */
  listExtensionSchedules(): Array<{ extensionId: string; jobKind: string; cron: string }>
  // Phase A contribution accessors.
  getHookRegistry(): import('./hook-registry.js').HookRegistry
  getRouteRegistry(): import('./route-contributions.js').RouteContributionRegistry
  /**
   * Dispatch a hook event to registered extension handlers (R0: non-blocking).
   * Called by the platform at lifecycle points (session commit, tool pre-execute).
   */
  hooksDispatch(
    point: import('./hook-registry.js').HookPoint,
    payload: Record<string, unknown>,
  ): Promise<Array<{ pluginId: string; observation: CapabilityObservation }>>
}

export type { ExtensionHostSupervisor, HostWorkerStatus }
