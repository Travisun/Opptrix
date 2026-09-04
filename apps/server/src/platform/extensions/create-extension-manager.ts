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

function stripMeta(rec: ExtensionRecord): Pick<
  ExtensionRecord,
  'name' | 'version' | 'capabilities' | 'permissions' | 'activation' | 'hostBound' | 'jsLoaded' | 'trusted'
> {
  const out: Pick<
    ExtensionRecord,
    'name' | 'version' | 'capabilities' | 'permissions' | 'activation' | 'hostBound' | 'jsLoaded' | 'trusted'
  > = { trusted: rec.trusted === true }
  if (rec.name !== undefined) out.name = rec.name
  if (rec.version !== undefined) out.version = rec.version
  if (rec.capabilities !== undefined) out.capabilities = [...rec.capabilities]
  if (rec.permissions !== undefined) out.permissions = [...rec.permissions]
  if (rec.activation !== undefined) out.activation = rec.activation
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
}

const DEFAULT_RUN_TIMEOUT_MS = 5000

/**
 * In-process ExtensionManager Host sandbox.
 * Extensions only receive ExtensionHostApi.callGate → invokeViaGateway → gate.submit.
 * Wave 13A: optional worker_threads isolate via `host` / getHostSupervisor().
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

  // Capability host — the ONLY path from extensions to platform capabilities.
  const capabilityHost: CapabilityHost =
    opts?.capabilityHost ??
    createCapabilityHost({ events: events!, packs: undefined as never, dataRoot, services })
  // Register self-contained handlers (events, platform.info, storage).
  registerSelfContainedHandlers(capabilityHost, undefined as never)

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
              { pluginId: extensionId, events: events!, dataRoot, services: services ?? {} },
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
        const loaded = await hostSupervisor.loadExtension(key, source)
        if (!loaded.ok) {
          return {
            ok: false,
            error: loaded.error ?? 'extension load failed in host worker',
          }
        }
        jsLoaded = true
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
      for (const rec of loaded) {
        if (rec.state === 'active' && rec.activation !== 'catalog_only') {
          void (async () => {
            const mode = rec.activation ?? 'catalog_only'
            if (mode === 'worker_stub' || mode === 'worker_js') {
              try {
                if (hostSupervisor.status() !== 'running') {
                  await hostSupervisor.start()
                }
              } catch {
                return
              }
              if (hostSupervisor.status() !== 'running') return
            }
            const next: ExtensionRecord = {
              id: rec.id,
              state: 'active',
              ...stripMeta(rec),
              ...(mode === 'worker_stub' || mode === 'worker_js' ? { hostBound: true } : {}),
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
  }
}
