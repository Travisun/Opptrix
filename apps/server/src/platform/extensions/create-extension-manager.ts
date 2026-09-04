import { randomUUID } from 'node:crypto'
import type { CapabilityGate, CapabilityObservation } from '@opptrix/agent'
import { SystemEvents, type EventDispatcher } from '@opptrix/event-bus'
import {
  createExtensionHostSupervisor,
  type CreateExtensionHostSupervisorOptions,
  type ExtensionHostSupervisor,
} from './host-worker-rpc.js'
import type {
  ExtensionActivationMode,
  ExtensionGatewayAction,
  ExtensionHostApi,
  ExtensionHostFacade,
  ExtensionManager,
  ExtensionManifest,
  ExtensionRecord,
  ExtensionRunResult,
} from './types.js'

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
  'name' | 'version' | 'capabilities' | 'activation' | 'hostBound' | 'jsLoaded'
> {
  const out: Pick<
    ExtensionRecord,
    'name' | 'version' | 'capabilities' | 'activation' | 'hostBound' | 'jsLoaded'
  > = {}
  if (rec.name !== undefined) out.name = rec.name
  if (rec.version !== undefined) out.version = rec.version
  if (rec.capabilities !== undefined) out.capabilities = [...rec.capabilities]
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
    return gate.submit(
      {
        token: action.token,
        args: action.args ?? {},
        principal: action.principal,
        traceId: action.traceId,
      },
      exec,
    )
  }

  function markRunError(id: string, message: string): void {
    const prev = records.get(id)
    records.set(id, {
      id,
      state: 'error',
      error: message,
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
          async () => ({ hostEcho: true, token, args: safeArgs }),
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
    regOpts?: { entrySource?: string },
  ): { ok: true } | { ok: false; error: string } {
    if (manifest == null || typeof manifest !== 'object') {
      return { ok: false, error: 'manifest required' }
    }

    const raw = manifest as Record<string, unknown>

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

    const record: ExtensionRecord = { id: key, state: 'inactive' }
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
    return { ok: true }
  }

  return {
    list(): ExtensionRecord[] {
      return [...records.values()].map((r) => ({ ...r }))
    },

    register(id: string): { ok: true } | { ok: false; error: string } {
      return registerFromManifest({ id })
    },

    registerFromManifest,

    async activate(id: string): Promise<{ ok: boolean; error?: string }> {
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
      emitBestEffort(SystemEvents.extension.activated, { id: key })
      return { ok: true }
    },

    async deactivate(id: string): Promise<{ ok: boolean }> {
      const key = String(id ?? '').trim()
      if (!key) return { ok: false }
      const existing = records.get(key)
      if (!existing) return { ok: false }
      records.set(key, {
        id: key,
        state: 'inactive',
        ...stripMeta(existing),
      })
      emitBestEffort(SystemEvents.extension.deactivated, { id: key })
      return { ok: true }
    },

    async bootScan(): Promise<void> {
      // No filesystem / .opx load in Wave 9A/38A — clear prior run errors only.
      for (const [id, rec] of records) {
        if (rec.state === 'error') {
          records.set(id, {
            id,
            state: 'inactive',
            ...stripMeta(rec),
          })
        }
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
