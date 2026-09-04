/**
 * Extension SDK types — Phase A.
 *
 * These types describe the surface available to extension `host` entry modules.
 * They mirror the runtime implementation in apps/server/src/platform/extensions/*.
 */

/** Permission an extension may declare in its manifest. */
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

/** Activation mode. `catalog_only` is the Phase A product path. */
export type ExtensionActivationMode = 'catalog_only' | 'worker_stub' | 'worker_js'

/** Phase A contribution points declared in the manifest. */
export type ExtensionContributes = {
  hooks?: Array<'session.messageCommitted' | 'agent.toolPreExecute'>
  routes?: string[]
  views?: Array<{
    id: string
    type: 'sidebar' | 'page' | 'settings'
    title: string
    module?: string
  }>
}

/** The manifest file (`opptrix.plugin.json` / `manifest.json`) schema. */
export type ExtensionManifest = {
  id: string
  name?: string
  version?: string
  description?: string
  permissions?: ExtensionPermission[]
  /** Legacy alias for permissions[] (mapped automatically). */
  capabilities?: string[]
  activation?: ExtensionActivationMode
  entry?: string
  contributes?: ExtensionContributes
  activationEvents?: Array<'onStartup' | 'onCommand' | 'onView'>
  engines?: { opptrix?: string; node?: string }
}

// ── Storage (Tier 1 Private KV) ─────────────────────────────────────────────

export type StorageApi = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
  export(): Promise<Record<string, unknown>>
  import(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<void>
}

// ── Events ──────────────────────────────────────────────────────────────────

export type EventsApi = {
  subscribe(topic: string, handler: (envelope: unknown) => void): () => void
  emit(name: string, payload?: Record<string, unknown>): void
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export type HookPoint = 'session.messageCommitted' | 'agent.toolPreExecute'

export type HooksApi = {
  register(
    point: HookPoint,
    handler: (payload: Record<string, unknown>) => Promise<unknown> | unknown,
    opts?: { priority?: number; timeoutMs?: number },
  ): Promise<{ id: string }>
  unregister(id: string): Promise<void>
}

// ── Routes ──────────────────────────────────────────────────────────────────

export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export type RouteRequest = {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  headers: Record<string, string>
}

export type RouteResponse = {
  status: number
  body: unknown
  headers?: Record<string, string>
}

export type RouteHandler = (
  req: RouteRequest,
) => Promise<RouteResponse> | RouteResponse

export type RoutesApi = {
  register(
    path: string,
    handler: RouteHandler,
    opts?: { methods?: RouteMethod[] },
  ): Promise<{ id: string; path: string }>
  unregister(id: string): Promise<void>
}

// ── Platform info ───────────────────────────────────────────────────────────

export type PlatformInfo = {
  deployment: 'self-hosted'
  packs: Array<{ id: string; enabled: boolean }>
}

// ── Core API (low-level callGate) ───────────────────────────────────────────

export type ExtensionHostApi = {
  /**
   * The sole side-effect channel — routes through the CapabilityGate.
   * Prefer the typed helpers (storage/events/hooks/routes) over raw callGate.
   */
  callGate(token: string, args?: Record<string, unknown>): Promise<{
    ok: boolean
    data?: unknown
    denialCode?: string
    message?: string
  }>
}

// ── The context injected into activate() ────────────────────────────────────

export type ExtensionHostContext = ExtensionHostApi & {
  /** Extension's own id (for namespacing). */
  readonly extensionId: string
  /** Extension's resolved root directory. */
  readonly pluginRoot: string
  /** Private per-extension KV storage. */
  readonly storage: StorageApi
  /** Event subscribe/emit. */
  readonly events: EventsApi
  /** Read-only hook registration. */
  readonly hooks: HooksApi
  /** HTTP sub-route registration. */
  readonly routes: RoutesApi
  /** Structured logger (console-compatible). */
  readonly log: {
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
}
