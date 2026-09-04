import { randomUUID } from 'node:crypto'
import type { CapabilityGate, CapabilityObservation } from '@opptrix/agent'
import { SystemEvents, type EventDispatcher } from '@opptrix/event-bus'
import {
  createExtensionHostSupervisor,
  type CreateExtensionHostSupervisorOptions,
  type ExtensionHostSupervisor,
} from './host-worker-rpc.js'
import {
  createExtensionRegistryStore,
  type ExtensionRegistryStore,
} from './registry-store.js'
import {
  createCapabilityHost,
  requiredPermission,
  type CapabilityHost,
  type CapabilityServices,
} from './capability-host.js'
import {
  registerSelfContainedHandlers,
  closeAllStorage,
  registerContributionHandlers,
  cleanupExtensionEventListeners,
} from './capability-handlers.js'
import type {
  ExtensionActivationMode,
  ExtensionGatewayAction,
  ExtensionHostApi,
  ExtensionHostFacade,
  ExtensionManager,
  ExtensionManifest,
  ExtensionPermission,
  ExtensionRecord,
  ExtensionRunResult,
} from './types.js'
import { mapLegacyCapabilities } from './capability-token-registry.js'
import { createHookRegistry, type HookRegistry } from './hook-registry.js'
import {
  createRouteContributionRegistry,
  type RouteContributionRegistry,
} from './route-contributions.js'
import {
  createSharedHostSupervisor,
  type SharedHostSupervisor,
} from './subprocess-host.js'
import { getMarketPlane } from '../../market-data-plane.js'

/** Thrown by the exec thunk when the capability host returns a structured denial. */
class CapabilityDenialError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CapabilityDenialError'
  }
}

function isCapabilityDenial(result: unknown): result is { code: string; error: string } {
  return (
    result != null &&
    typeof result === 'object' &&
    'code' in result &&
    'error' in result &&
    typeof (result as Record<string, unknown>).code === 'string' &&
    typeof (result as Record<string, unknown>).error === 'string'
  )
}

/** File-path / code-load keys — rejected this wave (in-memory JSON only). */
const REJECTED_PATH_KEYS = [
  'sourcePath',
  'path',
  'file',
  'entry',
  'main',
  'module',
  'script',
  'bundle',
  'opxPath',
  'packagePath',
] as const

const ACTIVATION_MODES = new Set<ExtensionActivationMode>([
  'catalog_only',
  'worker_stub',
  'worker_js',
])

/**
 * Storage-safe extension id — the id must equal its own sanitized form
 * (see `@opptrix/shared` path sanitizers). Rejects `..` traversal, ids ending
 * in `.` (dir-vs-file ambiguity) and any character that would be rewritten.
 */
export function isStorageSafeId(id: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) return false
  if (id.includes('..')) return false
  if (id.endsWith('.')) return false
  return true
}

function stripMeta(rec: ExtensionRecord): Pick<
  ExtensionRecord,
  'name' | 'version' | 'capabilities' | 'permissions' | 'activation' | 'activationEvents' | 'hostBound' | 'jsLoaded' | 'trusted'
> {
  const out: Pick<
    ExtensionRecord,
    'name' | 'version' | 'capabilities' | 'permissions' | 'activation' | 'activationEvents' | 'hostBound' | 'jsLoaded' | 'trusted'
  > = { trusted: rec.trusted === true }
  if (rec.name !== undefined) out.name = rec.name
  if (rec.version !== undefined) out.version = rec.version
  if (rec.capabilities !== undefined) out.capabilities = [...rec.capabilities]
  if (rec.permissions !== undefined) out.permissions = [...rec.permissions]
  if (rec.activation !== undefined) out.activation = rec.activation
  if (rec.activationEvents !== undefined) out.activationEvents = [...rec.activationEvents]
  if (rec.hostBound !== undefined) out.hostBound = rec.hostBound
  if (rec.jsLoaded !== undefined) out.jsLoaded = rec.jsLoaded
  return out
}

function parseActivation(
  raw: unknown,
):
  | { ok: true; value?: ExtensionActivationMode }
  | { ok: false; error: string } {
  if (raw === undefined) return { ok: true }
  if (typeof raw !== 'string' || !ACTIVATION_MODES.has(raw as ExtensionActivationMode)) {
    return {
      ok: false,
      error: "activation must be 'catalog_only', 'worker_stub', or 'worker_js'",
    }
  }
  return { ok: true, value: raw as ExtensionActivationMode }
}

function parseCapabilities(
  raw: unknown,
): { ok: true; value?: string[] } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'capabilities must be a string array' }
  }
  const caps: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'capabilities must be a string array' }
    }
    const t = item.trim()
    if (t) caps.push(t)
  }
  return { ok: true, value: caps }
}

export type CreateExtensionManagerOptions = {
  events?: EventDispatcher
  /** When set, invokeViaGateway routes exclusively through this gate. */
  gate?: CapabilityGate
  /** Optional Host worker overrides (tests). */
  hostWorker?: Pick<
    CreateExtensionHostSupervisorOptions,
    'workerFactory' | 'workerEntryPath' | 'requestTimeoutMs'
  >
  /**
   * Persistence store. When provided, extension records survive restart
   * (R0 Phase 1 scan on boot). When omitted, in-memory only (tests).
   */
  registry?: ExtensionRegistryStore
  /**
   * Capability host — dispatches callGate tokens to real services.
   * When omitted, a default host with self-contained handlers is created.
   */
  capabilityHost?: CapabilityHost
  /** Late-bound services (llm, schedule, data query, shell). Set by index.ts. */
  services?: CapabilityServices
  /** Data root for per-extension storage paths. */
  dataRoot?: string
  /**
   * Host runtime for worker_js extensions: 'subprocess' (Phase B default —
   * shared forked child, per-extension vm contexts) or 'worker' (legacy
   * worker_threads backend, kept for tests). Unset → read
   * OPPTRIX_EXT_RUNTIME (default 'subprocess').
   */
  runtime?: 'subprocess' | 'worker'
}

const DEFAULT_RUN_TIMEOUT_MS = 5000

/** Env selection for the hosted-extension runtime (default: subprocess). */
export function readExtRuntimeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): 'subprocess' | 'worker' {
  return env.OPPTRIX_EXT_RUNTIME === 'worker' ? 'worker' : 'subprocess'
}

/** Restart budget for the shared host child (design §6.3). */
const HOST_RESTART_WINDOW_MS = 10 * 60_000
const HOST_RESTART_MAX = 5
/** Scheduler tick cadence for extension-registered jobs. */
const EXT_SCHEDULE_TICK_MS = 60_000
/** Max resident worker_js extensions (bounds shared-host child memory). */
const EXT_MAX_RESIDENT = Number(process.env.OPPTRIX_EXT_MAX_RESIDENT ?? 16) || 16

/**
 * In-process ExtensionManager Host sandbox.
 * Extensions only receive ExtensionHostApi.callGate → invokeViaGateway → gate.submit.
 * Phase B: worker_js extensions run in a shared host subprocess by default.
 */
export function createExtensionManager(
  opts?: CreateExtensionManagerOptions,
): ExtensionManager {
  const records = new Map<string, ExtensionRecord>()
  /** In-memory entry JS from .opx zip — never eval'd in this process (Wave 58A). */
  const entrySources = new Map<string, string>()
  const events = opts?.events
  const gate = opts?.gate
  const registry = opts?.registry
  const services = opts?.services
  const dataRoot = opts?.dataRoot
  const runtime: 'subprocess' | 'worker' = opts?.runtime ?? readExtRuntimeFromEnv()

  // Hook + route contribution registries (Phase A contributions). Remote
  // entries dispatch triggers back to the shared host child via RPC.
  const hookRegistry: HookRegistry = createHookRegistry({
    dispatchRemote: async (extensionId, point, payload, timeoutMs) => {
      if (!sharedHost) {
        // Throw (not a soft result) so the registry records a FAILED
        // observation instead of ok:true-with-error-data (audit F6).
        throw new Error('extension host not running')
      }
      return sharedHost.dispatchHook(extensionId, point, payload, timeoutMs)
    },
  })
  const routeRegistry: RouteContributionRegistry = createRouteContributionRegistry()

  // Capability host — the ONLY path from extensions to platform capabilities.
  const capabilityHost: CapabilityHost =
    opts?.capabilityHost ??
    createCapabilityHost({ events: events!, packs: undefined as never, dataRoot, services })
  // Register self-contained handlers (events, platform.info, storage).
  registerSelfContainedHandlers(capabilityHost, undefined as never)
  // Register contribution handlers (hooks, routes, schedules) bound to this
  // manager's registries.
  registerContributionHandlers(capabilityHost, hookRegistry, routeRegistry, {
    onScheduleDeclare: (extensionId, decl) => {
      // cron-lite validation: interval:<N>s|m|h or daily@HH:MM
      if (!/^(interval:\d+(s|m|h)|daily@\d{2}:\d{2})$/.test(decl.cron)) {
        return { ok: false, error: 'cron must be interval:<N>s|m|h or daily@HH:MM' }
      }
      // Tick cadence is 60s — sub-tick intervals would silently fire every
      // tick (60× deviation from the declared cadence). Reject explicitly.
      const m2 = /^interval:(\d+)(s|m|h)$/.exec(decl.cron)
      if (m2) {
        const n = Number(m2[1])
        const unitMs = m2[2] === 's' ? 1000 : m2[2] === 'm' ? 60_000 : 3_600_000
        if (n * unitMs < 60_000) {
          return { ok: false, error: 'interval must be ≥ 1m (scheduler cadence is 60s)' }
        }
      }
      extSchedules.set(`${extensionId}:${decl.jobKind}`, { extensionId, ...decl })
      ensureScheduleTimer()
      return { ok: true }
    },
    onScheduleRemove: (extensionId, jobKind) => {
      extSchedules.delete(`${extensionId}:${jobKind}`)
    },
  })

  /**
   * Real capability dispatch for a hosted extension (child gate calls come
   * here): gate check with the extension's OWN principal, then capability
   * host dispatch. Audit P0-4 fix — the child never gets an echo.
   */
  function execCapabilityFor(
    extensionId: string,
    token: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return invokeViaGateway(
      {
        token,
        args,
        principal: { kind: 'extension', id: extensionId },
      },
      async () =>
        capabilityHost.dispatch(token, args, {
          pluginId: extensionId,
          events: events!,
          dataRoot,
          services: services ?? {},
        }),
    ) as Promise<Record<string, unknown>>
  }

  /** Phase B shared host subprocess (created lazily below; closure-bound). */
  let sharedHost: ReturnType<typeof createSharedHostSupervisor> | null = null
  const hostCrashTimes: number[] = []
  /** Extension schedule declarations (reactive model: cron/interval callbacks). */
  const extSchedules = new Map<string, { extensionId: string; jobKind: string; cron: string }>()
  /** Fire-once worker_js extensions — never replayed on host crash (audit F4). */
  const fireOnceExtensions = new Set<string>()
  let scheduleTimer: ReturnType<typeof setInterval> | null = null

  function handleHostCrash(): void {
    const now = Date.now()
    hostCrashTimes.push(now)
    while (hostCrashTimes.length > 0 && now - hostCrashTimes[0] > HOST_RESTART_WINDOW_MS) {
      hostCrashTimes.shift()
    }
    const activeWorkerJs = [...records.values()].filter(
      (r) => r.state === 'active' && r.activation === 'worker_js',
    )
    if (activeWorkerJs.length === 0) return
    if (hostCrashTimes.length > HOST_RESTART_MAX) {
      for (const r of activeWorkerJs) {
        markRunError(r.id, '扩展宿主进程连续崩溃次数过多，已停止自动重启，请手动重新启用')
      }
      return
    }
    // Bounded restart + reload every active RESIDENT worker_js extension.
    // Fire-once extensions (no touchpoints) are NOT reloaded — reloading would
    // replay their activate() side effects with no trigger (audit F4).
    const reloadables = activeWorkerJs.filter((r) => !fireOnceExtensions.has(r.id))
    // Contribution declarations are re-sent by the reloaded entry — clear the
    // parent-side registries first or hooks double-fire (audit F1).
    for (const r of reloadables) {
      hookRegistry.unregisterForPlugin(r.id)
      routeRegistry.unregisterForPlugin(r.id)
      cleanupExtensionEventListeners(r.id)
    }
    void (async () => {
      if (!sharedHost) return
      try {
        await sharedHost.start()
      } catch {
        for (const r of reloadables) {
          markRunError(r.id, '扩展宿主进程重启失败')
        }
        return
      }
      for (const r of reloadables) {
        const src = entrySources.get(r.id)
        if (!src) continue
        const loaded = await sharedHost.load(r.id, src)
        if (loaded.ok && !loaded.hasResidentTouchpoint) {
          await sharedHost.unload(r.id)
        }
      }
    })().catch(() => {
      // R0: restart failures never propagate
    })
  }

  function persist(record: ExtensionRecord): void {
    if (!registry) return
    try {
      registry.upsert(record)
    } catch {
      // persistence is best-effort; in-memory stays authoritative
    }
  }

  function emitBestEffort(name: string, payload: Record<string, unknown>): void {
    if (!events) return
    try {
      events.emit(name, payload)
    } catch {
      // best-effort
    }
  }

  async function invokeViaGateway(
    action: ExtensionGatewayAction,
    exec: () => Promise<unknown>,
  ): Promise<CapabilityObservation> {
    if (!gate) {
      return {
        ok: false,
        denialCode: 'gate_unavailable',
        auditId: randomUUID(),
        message: 'Capability gate is not available',
      }
    }
    // Permission enforcement: an extension principal must have declared the
    // required permission for the token (fail-closed).
    if (action.principal?.kind === 'extension') {
      const rec = records.get(action.principal.id ?? '')
      const required = requiredPermission(action.token)
      if (required && rec && !rec.permissions?.includes(required)) {
        return {
          ok: false,
          denialCode: 'permission_denied',
          auditId: randomUUID(),
          message: `extension ${action.principal.id} lacks permission '${required}' for token '${action.token}'`,
        }
      }
    }
    try {
      return await gate.submit(
        {
          token: action.token,
          args: action.args ?? {},
          principal: action.principal,
          traceId: action.traceId,
        },
        exec,
      )
    } catch (err) {
      // A structured capability denial (e.g. unknown token) is surfaced as a
      // denial observation, not a thrown error (R0: never throw from callGate).
      if (err instanceof CapabilityDenialError) {
        return {
          ok: false,
          denialCode: err.code,
          auditId: randomUUID(),
          message: err.message,
        }
      }
      throw err
    }
  }

  function markRunError(id: string, message: string): void {
    const prev = records.get(id)
    records.set(id, {
      id,
      state: 'error',
      error: message,
      trusted: prev?.trusted === true,
      ...(prev ? stripMeta(prev) : {}),
    })
    emitBestEffort(SystemEvents.extension.crashed, { id, error: message })
  }

  /** cron-lite evaluation state: last daily-run date per declaration key. */
  const scheduleLastRun = new Map<string, string>()

  function evaluateScheduleTick(now = new Date()): void {
    if (!sharedHost || sharedHost.status() !== 'running') return
    for (const [key, decl] of extSchedules) {
      let due = false
      const intervalMatch = /^interval:(\d+)(s|m|h)$/.exec(decl.cron)
      if (intervalMatch) {
        const n = Number(intervalMatch[1])
        const unitMs = intervalMatch[2] === 's' ? 1000 : intervalMatch[2] === 'm' ? 60_000 : 3_600_000
        due = now.getTime() % (n * unitMs) < EXT_SCHEDULE_TICK_MS
      } else {
        const dailyMatch = /^daily@(\d{2}):(\d{2})$/.exec(decl.cron)
        if (dailyMatch) {
          const hh = Number(dailyMatch[1])
          const mm = Number(dailyMatch[2])
          const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
          const lastKey = scheduleLastRun.get(key)
          if (now.getHours() === hh && now.getMinutes() === mm && lastKey !== todayKey) {
            due = true
            scheduleLastRun.set(key, todayKey)
          }
        }
      }
      if (!due) continue
      void sharedHost
        .scheduleTick(decl.extensionId, decl.jobKind, { triggeredAt: now.toISOString() }, 60_000)
        .catch(() => {
          // best-effort: a failed tick never breaks the scheduler
        })
    }
  }

  function ensureScheduleTimer(): void {
    if (scheduleTimer) return
    scheduleTimer = setInterval(() => {
      try {
        evaluateScheduleTick()
      } catch {
        // never break the event loop
      }
    }, EXT_SCHEDULE_TICK_MS)
    scheduleTimer.unref?.()
  }

  // ── Phase B: shared host subprocess (subprocess runtime only) ─────────────
  if (runtime === 'subprocess') {
    sharedHost = createSharedHostSupervisor({
      execCapability: execCapabilityFor,
      onCrash: () => handleHostCrash(),
    })
  }

  /** Load (or reload) a worker_js extension into the selected runtime. */
  async function loadIntoRuntime(
    key: string,
    source: string,
    loadTimeoutMs?: number,
    residentHint?: boolean,
  ): Promise<{ ok: true; resident: boolean } | { ok: false; error: string }> {
    if (runtime === 'subprocess' && sharedHost) {
      if (sharedHost.status() !== 'running') {
        try {
          await sharedHost.start()
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      }
      // Resident cap (1GB VPS profile): each vm context adds child heap.
      if (
        !residentHint &&
        sharedHost.listResidentExtensions().length >= EXT_MAX_RESIDENT &&
        !sharedHost.listResidentExtensions().includes(key)
      ) {
        return {
          ok: false,
          error: `resident extension limit reached (${EXT_MAX_RESIDENT}); deactivate one first`,
        }
      }
      const loaded = await sharedHost.load(key, source, loadTimeoutMs)
      if (!loaded.ok) return { ok: false, error: loaded.error }
      // Reactive model (fire-once): an extension with no resident touchpoints
      // (hooks / routes / events / schedules) does not stay loaded.
      if (!loaded.hasResidentTouchpoint) {
        await sharedHost.unload(key)
        return { ok: true, resident: false }
      }
      return { ok: true, resident: true }
    }
    // Legacy worker_threads backend.
    const loaded = await hostSupervisorProxy.loadExtension(key, source)
    if (!loaded.ok) return { ok: false, error: loaded.error ?? 'load failed' }
    return { ok: true, resident: true }
  }

  /** Forward-declared proxy to the legacy supervisor (defined below). */
  const hostSupervisorProxy = {
    loadExtension(id: string, source: string) {
      return hostSupervisor.loadExtension(id, source)
    },
  }

  function hostApiFor(extensionId: string): ExtensionHostApi {
    return {
      callGate(
        token: string,
        args?: Record<string, unknown>,
      ): Promise<CapabilityObservation> {
        const safeArgs = args ?? {}
        return invokeViaGateway(
          {
            token,
            args: safeArgs,
            principal: { kind: 'extension', id: extensionId },
          },
          async () => {
            const result = await capabilityHost.dispatch(
              token,
              safeArgs,
              {
                pluginId: extensionId,
                events: events!,
                dataRoot,
                services: { ...(services ?? {}), extHost: sharedHost },
              },
            )
            // If the host returns a structured denial, throw to convert into a
            // gate denial observation (keeps the success path unwrapped).
            if (isCapabilityDenial(result)) {
              throw new CapabilityDenialError(result.code, result.error)
            }
            return result
          },
        )
      },
    }
  }

  const hostSupervisor: ExtensionHostSupervisor = createExtensionHostSupervisor({
    invokeViaGateway,
    workerFactory: opts?.hostWorker?.workerFactory,
    workerEntryPath: opts?.hostWorker?.workerEntryPath,
    requestTimeoutMs: opts?.hostWorker?.requestTimeoutMs,
  })

  const host: ExtensionHostFacade = {
    async start(): Promise<{ ok: boolean; error?: string }> {
      try {
        await hostSupervisor.start()
        return { ok: true }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },

    async stop(): Promise<void> {
      try {
        await hostSupervisor.stop()
      } catch {
        // R0 soft
      }
    },

    async ping(): Promise<{ ok: boolean; error?: string }> {
      try {
        await hostSupervisor.ping()
        return { ok: true }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },

    async callGateFromWorker(
      token: string,
      args?: Record<string, unknown>,
    ): Promise<CapabilityObservation | { ok: false; error: string }> {
      try {
        return await hostSupervisor.requestGate(token, args)
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }

  function registerFromManifest(
    manifest: ExtensionManifest | Record<string, unknown>,
    regOpts?: { trusted?: boolean; entrySource?: string },
  ): { ok: true } | { ok: false; error: string } {
    if (manifest == null || typeof manifest !== 'object') {
      return { ok: false, error: 'manifest required' }
    }

    const raw = manifest as Record<string, unknown>

    // SF1: install-time trust only (opts.trusted or body field trusted === true).
    const trusted =
      regOpts?.trusted === true || raw.trusted === true
    if (!trusted) {
      return { ok: false, error: 'trust_required' }
    }

    for (const pathKey of REJECTED_PATH_KEYS) {
      if (
        Object.prototype.hasOwnProperty.call(raw, pathKey) &&
        raw[pathKey] != null &&
        String(raw[pathKey]).trim() !== ''
      ) {
        return {
          ok: false,
          error: `file path fields rejected (in-memory manifest only): ${pathKey}`,
        }
      }
    }

    const key = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!key) {
      return { ok: false, error: 'extension id required' }
    }
    // Storage-safe id invariant: the id must equal its own sanitized form so
    // that (a) the registry key, data directory and route namespace never
    // drift, (b) look-alike ids (`com/a`, `com a`, …) cannot collide into one
    // extension's storage, and (c) `..`-style traversal ids are impossible.
    if (!isStorageSafeId(key)) {
      return {
        ok: false,
        error:
          'extension id must match ^[A-Za-z0-9][A-Za-z0-9._-]*$ and must not contain ".." or end with "."',
      }
    }
    if (records.has(key)) {
      return { ok: false, error: `extension already registered: ${key}` }
    }

    const record: ExtensionRecord = { id: key, state: 'inactive', trusted: true }
    if (typeof raw.name === 'string' && raw.name.trim()) {
      record.name = raw.name.trim()
    }
    if (typeof raw.version === 'string' && raw.version.trim()) {
      record.version = raw.version.trim()
    }
    const capsParsed = parseCapabilities(raw.capabilities)
    if (!capsParsed.ok) {
      return { ok: false, error: capsParsed.error }
    }
    if (capsParsed.value !== undefined) {
      record.capabilities = capsParsed.value
    }
    // Phase A: map manifest.permissions[] (and legacy capabilities[]) → record.permissions[].
    const rawPermissions = Array.isArray(raw.permissions) ? raw.permissions : undefined
    const perms = mapLegacyCapabilities(
      rawPermissions ?? capsParsed.value ?? [],
    )
    if (perms.length > 0) {
      record.permissions = perms
    }
    const actParsed = parseActivation(raw.activation)
    if (!actParsed.ok) {
      return { ok: false, error: actParsed.error }
    }
    if (actParsed.value !== undefined) {
      record.activation = actParsed.value
    }
    // Reactive model: activationEvents gate lazy activation at boot.
    if (Array.isArray(raw.activationEvents)) {
      const events = raw.activationEvents
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v === 'onStartup' || v === 'onCommand' || v === 'onView')
      record.activationEvents = events as ExtensionRecord['activationEvents']
    }

    if (actParsed.value === 'worker_js') {
      const src =
        typeof regOpts?.entrySource === 'string' ? regOpts.entrySource : ''
      if (!src) {
        return {
          ok: false,
          error: 'worker_js requires entry source extracted from .opx zip',
        }
      }
      entrySources.set(key, src)
    }

    records.set(key, record)
    persist(record)
    return { ok: true }
  }

  return {
    list(): ExtensionRecord[] {
      return [...records.values()].map((r) => ({ ...r }))
    },

    register(id: string, regOpts?: { trusted?: boolean }): { ok: true } | { ok: false; error: string } {
      return registerFromManifest({ id }, regOpts)
    },

    registerFromManifest,

    async activate(
      id: string,
    ): Promise<{ ok: boolean; error?: string; experimental?: true }> {
      const key = String(id ?? '').trim()
      if (!key) {
        return { ok: false, error: 'extension id required' }
      }
      const existing = records.get(key)
      if (!existing) {
        return { ok: false, error: `extension not found: ${key}` }
      }
      if (existing.state === 'disabled') {
        return { ok: false, error: `extension disabled: ${key}` }
      }

      if (existing.state === 'active') {
        // Idempotent activate: do not re-run entry JS or re-register
        // contributions on repeated activate calls.
        return { ok: true }
      }

      const mode: ExtensionActivationMode =
        existing.activation ?? 'catalog_only'

      // worker_stub / worker_js: ensure shared host worker is up.
      // worker_js additionally posts source into the worker vm — never eval here.
      if (mode === 'worker_stub' || mode === 'worker_js') {
        if (hostSupervisor.status() !== 'running') {
          try {
            await hostSupervisor.start()
          } catch (err) {
            return {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }
        if (hostSupervisor.status() !== 'running') {
          return { ok: false, error: 'host worker failed to start' }
        }
      }

      let jsLoaded = false
      let resident = true
      // C1–C3 / Selection A: worker_js is experimental and is NOT the system-extension model.
      // Product path for system .opx: in-process Host contribution points (routes/pages/hooks);
      // Gateway→Gate. Trust Gate + install claim; worker_threads vm ≠ process isolation.
      if (mode === 'worker_js') {
        const source = entrySources.get(key)
        if (!source) {
          return {
            ok: false,
            error: 'worker_js entry source missing (register via .opx zip)',
          }
        }
        const loaded = await loadIntoRuntime(
          key,
          source,
          undefined,
          sharedHost?.listResidentExtensions().includes(key) ?? false,
        )
        if (!loaded.ok) {
          // Failure cleanup: the child may have executed part of activate()
          // and registered declarations before failing — leave nothing live
          // behind a failed activation (audit P3-8).
          hookRegistry.unregisterForPlugin(key)
          routeRegistry.unregisterForPlugin(key)
          cleanupExtensionEventListeners(key)
          for (const [k, decl] of [...extSchedules]) {
            if (decl.extensionId === key) extSchedules.delete(k)
          }
          if (sharedHost) {
            await sharedHost.unload(key).catch(() => {})
          }
          return {
            ok: false,
            error: loaded.error,
          }
        }
        jsLoaded = true
        resident = loaded.resident
      }

      const next: ExtensionRecord = {
        id: key,
        state: 'active',
        ...stripMeta(existing),
      }
      if (mode === 'worker_stub' || mode === 'worker_js') {
        next.hostBound = true
      }
      if (jsLoaded) {
        next.jsLoaded = true
      }
      records.set(key, next)
      persist(next)
      emitBestEffort(SystemEvents.extension.activated, { id: key })
      // Reactive model bookkeeping: fire-once extensions (no touchpoints)
      // are tracked so a host crash does not replay their activate().
      if (mode === 'worker_js' && !resident) {
        fireOnceExtensions.add(key)
      } else {
        fireOnceExtensions.delete(key)
      }
      // Soft warning only — do not disable worker_js.
      if (mode === 'worker_js') {
        return { ok: true, experimental: true }
      }
      return { ok: true }
    },

    async deactivate(id: string): Promise<{ ok: boolean }> {
      const key = String(id ?? '').trim()
      if (!key) return { ok: false }
      const existing = records.get(key)
      if (!existing) return { ok: false }
      // Contribution cleanup: unregister hooks + routes + event listeners (R1).
      hookRegistry.unregisterForPlugin(key)
      routeRegistry.unregisterForPlugin(key)
      cleanupExtensionEventListeners(key)
      // Reactive model: drop this extension's schedule declarations (audit F2
      // — zombie schedules kept ticking against a deactivated extension).
      for (const [k, decl] of [...extSchedules]) {
        if (decl.extensionId === key) extSchedules.delete(k)
      }
      getMarketPlane().unsubscribeFor(key)
      if (sharedHost) {
        await sharedHost.unload(key).catch(() => {})
      }
      const next: ExtensionRecord = {
        id: key,
        state: 'inactive',
        ...stripMeta(existing),
      }
      records.set(key, next)
      persist(next)
      emitBestEffort(SystemEvents.extension.deactivated, { id: key })
      return { ok: true }
    },

    /**
     * Uninstall: deactivate (contribution cleanup), remove from registry + memory.
     * Does NOT remove private data (caller decides via removeExtensionData).
     */
    uninstall(id: string): { ok: boolean; id: string } {
      const key = String(id ?? '').trim()
      if (!key) return { ok: false, id: id ?? '' }
      if (!records.has(key)) return { ok: false, id: key }
      // Contribution cleanup.
      hookRegistry.unregisterForPlugin(key)
      routeRegistry.unregisterForPlugin(key)
      cleanupExtensionEventListeners(key)
      for (const [k, decl] of [...extSchedules]) {
        if (decl.extensionId === key) extSchedules.delete(k)
      }
      getMarketPlane().unsubscribeFor(key)
      // Uninstall is sync; unload is best-effort cleanup (child state dies with
      // the extension record).
      void sharedHost?.unload(key).catch(() => {})
      // Drop the in-memory entry source (pre-release audit: stale source leak).
      entrySources.delete(key)
      records.delete(key)
      if (registry) {
        try {
          registry.remove(key)
        } catch {
          // best-effort
        }
      }
      return { ok: true, id: key }
    },

    async bootScan(): Promise<void> {
      // R0 Phase 1: clear prior run errors in-memory.
      for (const [id, rec] of records) {
        if (rec.state === 'error') {
          const restored: ExtensionRecord = {
            id,
            state: 'inactive',
            ...stripMeta(rec),
          }
          records.set(id, restored)
          persist(restored)
        }
      }
    },

    /**
     * R0 Phase 1+2: load persisted records (if registry) and activate
     * previously-active extensions. Idempotent, non-throwing.
     * Called post-listen from bootstrap Phase B — must NOT block startup.
     */
    async ready(): Promise<void> {
      if (!registry) return
      if (records.size > 0) return // already loaded (e.g. test pre-seed)
      let loaded: ExtensionRecord[] = []
      try {
        loaded = registry.loadAll()
      } catch {
        return // R0: persistence failure must not block startup
      }
      for (const rec of loaded) {
        records.set(rec.id, rec)
      }
      // R0 Phase 2: re-activate extensions that were active before restart.
      // Fire-and-forget per extension; failures mark error, never throw.
      // Inline (not via activate()) to avoid forward-reference to a sibling closure.
      //
      // Reactive model (activationEvents gate): extensions whose manifest did
      // not declare 'onStartup' wait for a trigger or manual activate.
      //
      // worker_js honesty (pre-release audit F2): entry sources live only in
      // the in-memory `entrySources` map and are NOT persisted. Re-activating
      // without the source would produce a false-active record whose JS is
      // never loaded. Mark such extensions `error` with a clear message — the
      // honest recovery path is uninstall + re-install via the UI.
      for (const rec of loaded) {
        if (rec.state !== 'active') continue
        const events = rec.activationEvents
        if (events !== undefined && !events.includes('onStartup')) {
          // Reactive model: no onStartup → not boot-activated. Honest state:
          // worker_js sources are lost on restart anyway, so leaving
          // state='active' would create a false-active zombie (audit F3).
          // Mark inactive — the user re-enables manually (trigger-based lazy
          // activation lands in a follow-up).
          if (rec.activation === 'worker_js') {
            const reset: ExtensionRecord = {
              id: rec.id,
              state: 'inactive',
              ...stripMeta(rec),
              jsLoaded: false,
              hostBound: false,
            }
            records.set(rec.id, reset)
            persist(reset)
          }
          continue
        }
        const mode = rec.activation ?? 'catalog_only'
        if (mode === 'worker_js') {
          const next: ExtensionRecord = {
            id: rec.id,
            state: 'error',
            error:
              '扩展入口代码不随重启保留，需要卸载后重新安装（.opx）以恢复运行',
            ...stripMeta(rec),
          }
          next.jsLoaded = false
          records.set(rec.id, next)
          persist(next)
          emitBestEffort(SystemEvents.extension.crashed, {
            id: rec.id,
            error: next.error,
          })
          continue
        }
        if (mode === 'worker_stub') {
          void (async () => {
            try {
              if (hostSupervisor.status() !== 'running') {
                await hostSupervisor.start()
              }
            } catch {
              return
            }
            if (hostSupervisor.status() !== 'running') return
            const next: ExtensionRecord = {
              id: rec.id,
              state: 'active',
              ...stripMeta(rec),
              hostBound: true,
            }
            records.set(rec.id, next)
            persist(next)
            emitBestEffort(SystemEvents.extension.activated, { id: rec.id })
          })().catch(() => {
            // R0: single extension failure does not block others
          })
        }
      }
    },

    /**
     * R1 ordered shutdown: deactivate active extensions, flush + close registry.
     * Bounded best-effort — never throws. Safe to call multiple times.
     */
    async shutdown(): Promise<void> {
      const activeIds = [...records.values()]
        .filter((r) => r.state === 'active')
        .map((r) => r.id)
      // Deactivate in parallel, per-ext best-effort. Inline (not via deactivate())
      // to avoid forward-reference to a sibling closure.
      await Promise.all(
        activeIds.map((id) =>
          (async () => {
            const existing = records.get(id)
            if (!existing) return
            hookRegistry.unregisterForPlugin(id)
            routeRegistry.unregisterForPlugin(id)
            cleanupExtensionEventListeners(id)
            for (const [k, decl] of [...extSchedules]) {
              if (decl.extensionId === id) extSchedules.delete(k)
            }
            getMarketPlane().unsubscribeFor(id)
            if (sharedHost) {
              await sharedHost.unload(id).catch(() => {})
            }
            const next: ExtensionRecord = {
              id,
              state: 'inactive',
              ...stripMeta(existing),
            }
            records.set(id, next)
            persist(next)
            emitBestEffort(SystemEvents.extension.deactivated, { id })
          })().catch(() => {
            // R1: single failure does not block others
          }),
        ),
      )
      if (registry) {
        try {
          registry.close()
        } catch {
          // R1: best-effort
        }
      }
      // R1: close per-extension storage handles (Tier 1 flush).
      closeAllStorage()
      // R1: stop the extension schedule timer.
      if (scheduleTimer) {
        clearInterval(scheduleTimer)
        scheduleTimer = null
      }
      // R1: stop the shared host subprocess (Phase B).
      if (sharedHost) {
        try {
          await sharedHost.stop()
        } catch {
          // best-effort
        }
      }
      // Stop the shared host worker (R1: release worker_threads).
      try {
        await host.stop()
      } catch {
        // R1: best-effort
      }
    },

    async run(
      id: string,
      work: (api: ExtensionHostApi) => Promise<unknown>,
      opts?: { timeoutMs?: number },
    ): Promise<ExtensionRunResult> {
      const key = String(id ?? '').trim()
      if (!key) {
        return { ok: false, error: 'extension id required' }
      }
      const existing = records.get(key)
      if (!existing) {
        return { ok: false, error: `extension not found: ${key}` }
      }
      if (existing.state === 'disabled') {
        return { ok: false, error: `extension disabled: ${key}` }
      }
      if (existing.state !== 'active') {
        return { ok: false, error: `extension not active: ${key}` }
      }

      const timeoutMs = opts?.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS
      const api = hostApiFor(key)
      let timer: ReturnType<typeof setTimeout> | undefined

      try {
        const data = await new Promise<unknown>((resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`extension run timeout after ${timeoutMs}ms`))
          }, timeoutMs)
          work(api).then(resolve, reject)
        })
        return { ok: true, data }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        markRunError(key, message)
        return { ok: false, error: message }
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
    },

    invokeViaGateway,
    host,
    getHostSupervisor(): ExtensionHostSupervisor {
      return hostSupervisor
    },
    getSharedHost(): SharedHostSupervisor | null {
      return runtime === 'subprocess' ? sharedHost : null
    },
    listExtensionSchedules(): Array<{ extensionId: string; jobKind: string; cron: string }> {
      return [...extSchedules.values()].map((d) => ({
        extensionId: d.extensionId,
        jobKind: d.jobKind,
        cron: d.cron,
      }))
    },
    // Phase A contribution accessors.
    getHookRegistry(): HookRegistry {
      return hookRegistry
    },
    getRouteRegistry(): RouteContributionRegistry {
      return routeRegistry
    },
    /**
     * Dispatch a hook event to all registered extension handlers (R0: non-blocking).
     * Called by the platform (session store, agent engine) at lifecycle points.
     */
    hooksDispatch(
      point: Parameters<HookRegistry['dispatch']>[0],
      payload: Record<string, unknown>,
    ): Promise<Array<{ pluginId: string; observation: CapabilityObservation }>> {
      return hookRegistry.dispatch(point, payload)
    },
  }
}
