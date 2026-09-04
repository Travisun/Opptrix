/**
 * Phase A capability handlers — real implementations for self-contained tokens.
 *
 * Self-contained (registered by platform context):
 *   - events.subscribe / events.emit → EventDispatcher
 *   - platform.info → deployment + pack snapshot
 *   - storage.* → per-extension PluginStorageService (Tier 1)
 *
 * Late-bound (registered by index.ts, thin stubs here):
 *   - llm.chat, data.query, shell.run, schedule.*
 */

import type { PackInfo } from '../packs/types.js'
import type { CapabilityHandler, CapabilityHost } from './capability-host.js'
import type { PluginStorageService } from '@opptrix/plugin-storage'
import { SqlitePluginKvStore } from '@opptrix/plugin-storage'
import {
  exportPluginData,
  importPluginData,
  removePluginDataDir,
} from '@opptrix/plugin-storage'
import { resolveCapabilityRule } from './capability-token-registry.js'
import type { DomainPackId } from '../packs/types.js'

// ── events.subscribe / events.emit ──────────────────────────────────────────

/** Per-plugin event subscription disposals — cleaned up on deactivate/uninstall. */
const eventDisposals = new Map<string, Array<() => void>>()

/** Max serialized event payload size for extension emits (design §10.11). */
const EVENT_PAYLOAD_MAX_BYTES = 64 * 1024

/**
 * Dispose all event subscriptions registered by a plugin
 * (deactivate / uninstall contribution cleanup).
 */
export function cleanupExtensionEventListeners(pluginId: string): void {
  const disposals = eventDisposals.get(pluginId)
  if (!disposals) return
  for (const dispose of disposals) {
    try {
      dispose()
    } catch {
      // best-effort
    }
  }
  eventDisposals.delete(pluginId)
}

const eventsHandler: CapabilityHandler = async (args, ctx) => {
  const action = String(args.action ?? '')
  if (action === 'subscribe') {
    const topic = String(args.topic ?? '')
    if (!topic) return { error: 'topic required', code: 'invalid_args' }
    const remote = args.remote === true
    const handler = args.handler
    if (!remote && typeof handler !== 'function') {
      return { error: 'handler must be a function', code: 'invalid_args' }
    }
    let dispose: (() => void) | undefined
    if (remote) {
      // Hosted extension: forward matching events to the shared host child.
      const forwardHost = (ctx.services as Record<string, unknown> | undefined)?.extHost as
        | { dispatchEvent: (extensionId: string, name: string, payload: unknown) => void }
        | undefined
      if (forwardHost) {
        const listener = (envelope: unknown) => {
          try {
            const name = (envelope as { name?: string }).name ?? ''
            forwardHost.dispatchEvent(ctx.pluginId, name, (envelope as { payload?: unknown }).payload)
          } catch {
            // best-effort
          }
        }
        const d = ctx.events.subscribeTopic(topic, listener as never)
        dispose = typeof d === 'function' ? d : undefined
      }
    } else {
      const d = ctx.events.subscribeTopic(topic, handler as never)
      dispose = typeof d === 'function' ? d : undefined
    }
    if (dispose) {
      const list = eventDisposals.get(ctx.pluginId) ?? []
      list.push(dispose)
      eventDisposals.set(ctx.pluginId, list)
    }
    return { subscribed: topic, ok: true }
  }
  if (action === 'emit') {
    // Extensions may only emit inside their own `ext.{pluginId}.*` namespace
    // (design §26.4 — prevents forging system event names).
    const name = String(args.name ?? '')
    const expectedPrefix = `ext.${ctx.pluginId}.`
    if (!name) return { error: 'name required', code: 'invalid_args' }
    if (!name.startsWith(expectedPrefix)) {
      return {
        error: `extensions may only emit events under ${expectedPrefix}*`,
        code: 'invalid_args',
      }
    }
    const payload = (args.payload ?? {}) as Record<string, unknown>
    let payloadBytes = 0
    try {
      payloadBytes = Buffer.byteLength(JSON.stringify(payload) ?? '', 'utf8')
    } catch {
      return { error: 'payload must be JSON-serializable', code: 'invalid_args' }
    }
    if (payloadBytes > EVENT_PAYLOAD_MAX_BYTES) {
      return {
        error: `event payload exceeds ${EVENT_PAYLOAD_MAX_BYTES} bytes`,
        code: 'payload_too_large',
      }
    }
    ctx.events.emit(name, payload, { kind: 'extension', id: ctx.pluginId })
    return { emitted: name }
  }
  return { error: `unknown events action: ${action}`, code: 'invalid_args' }
}

// ── platform.info ───────────────────────────────────────────────────────────

const platformInfoHandler: CapabilityHandler = async (args, ctx) => {
  const scope = String(args.scope ?? 'full')
  const packs: PackInfo[] = ctx.packs.list()
  if (scope === 'packs') {
    return { packs: packs.map((p) => ({ id: p.id, enabled: p.enabled })) }
  }
  if (scope === 'supports') {
    const feature = String(args.feature ?? '')
    const known: DomainPackId[] = ['research', 'coding']
    const supported = known.includes(feature as DomainPackId)
      ? ctx.packs.supports(feature as DomainPackId)
      : false
    return { supported }
  }
  return {
    deployment: 'self-hosted',
    packs: packs.map((p) => ({ id: p.id, enabled: p.enabled })),
  }
}

// ── storage.* (per-extension Tier 1 KV) ─────────────────────────────────────

// Per-extension storage handles, created lazily and cached.
const storageCache = new Map<string, PluginStorageService>()

function getStorage(pluginId: string): PluginStorageService {
  const existing = storageCache.get(pluginId)
  if (existing) return existing
  // Do NOT pass dataRoot: SqlitePluginKvStore defaults to resolvePluginDataDir(pluginId)
  // which yields ~/.opptrix/plugin-data/{pluginId}/storage.db — per-extension isolation.
  const store = new SqlitePluginKvStore({ pluginId })
  storageCache.set(pluginId, store)
  return store
}

const storageHandler: CapabilityHandler = async (args, ctx) => {
  const op = String(args.op ?? '')
  const key = String(args.key ?? '')
  const store = getStorage(ctx.pluginId)

  switch (op) {
    case 'get': {
      const value = await store.get(key)
      return { key, value, found: value !== null }
    }
    case 'set': {
      await store.set(key, args.value)
      return { key, ok: true }
    }
    case 'delete': {
      await store.delete(key)
      return { key, ok: true }
    }
    case 'list': {
      const prefix = args.prefix != null ? String(args.prefix) : undefined
      const keys = await store.keys(prefix)
      return { keys }
    }
    case 'export': {
      // Do NOT pass dataRoot: exportPluginData defaults to resolvePluginDataDir(pluginId)
      // which matches the cached store's path. Passing dataRoot would redirect to a
      // different directory (dataRoot is the full plugin dir, not the user root).
      const data = exportPluginData(ctx.pluginId)
      return { version: data.version, pluginId: data.pluginId, kv: data.kv }
    }
    case 'import': {
      const payload = args.payload as Parameters<typeof importPluginData>[1]
      if (!payload || typeof payload !== 'object') {
        return { error: 'payload required', code: 'invalid_args' }
      }
      await importPluginData(ctx.pluginId, payload, { merge: args.merge === true })
      return { ok: true }
    }
    default:
      return { error: `unknown storage op: ${op}`, code: 'invalid_args' }
  }
}

/**
 * Close and evict one extension's cached storage handle. Must run BEFORE
 * removing the data directory — otherwise the cached SQLite handle points at
 * an unlinked inode and a same-id reinstall would silently write into the
 * deleted file (pre-release audit F4a).
 */
export function evictExtensionStorage(pluginId: string): void {
  const store = storageCache.get(pluginId)
  if (!store) return
  try {
    store.close()
  } catch {
    // best-effort
  }
  storageCache.delete(pluginId)
}

/**
 * Remove an extension's private data directory (uninstall cleanup).
 * Best-effort: returns { ok: false } if the directory is absent or removal fails.
 */
export function removeExtensionData(pluginId: string): { ok: boolean } {
  evictExtensionStorage(pluginId)
  try {
    removePluginDataDir(pluginId)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * Close all cached storage handles (R1 shutdown).
 */
export function closeAllStorage(): void {
  for (const store of storageCache.values()) {
    try {
      store.close()
    } catch {
      // best-effort
    }
  }
  storageCache.clear()
}

export type ScheduleDeclaration = {
  jobKind: string
  cron: string
  title?: string
}

/**
 * Register contribution handlers (hooks, routes, schedules) that need the
 * manager's registries. Called by the manager after constructing
 * hookRegistry + routeRegistry. Hosted (subprocess) extensions send
 * declarations with `remote: true` and no handler — handlers stay in the
 * child; the platform dispatches triggers back via RPC.
 */
export function registerContributionHandlers(
  host: CapabilityHost,
  hooks: import('./hook-registry.js').HookRegistry,
  routes: import('./route-contributions.js').RouteContributionRegistry,
  opts?: {
    onScheduleDeclare?: (extensionId: string, decl: ScheduleDeclaration) => { ok: boolean; error?: string }
    onScheduleRemove?: (extensionId: string, jobKind: string) => void
  },
): void {
  host.register('schedule.register', async (args, ctx) => {
    if (!opts?.onScheduleDeclare) {
      return { error: 'schedule registry unavailable', code: 'service_unavailable' }
    }
    const jobKind = String(args.jobKind ?? '')
    const cron = String(args.cron ?? '')
    if (!jobKind || !cron) {
      return { error: 'jobKind and cron required', code: 'invalid_args' }
    }
    const result = opts.onScheduleDeclare(ctx.pluginId, {
      jobKind,
      cron,
      ...(typeof args.title === 'string' ? { title: args.title } : {}),
    })
    if (!result.ok) return { error: result.error ?? 'schedule rejected', code: 'invalid_args' }
    return { ok: true, jobKind }
  })

  host.register('schedule.unregister', async (args, ctx) => {
    if (!opts?.onScheduleRemove) {
      return { error: 'schedule registry unavailable', code: 'service_unavailable' }
    }
    opts.onScheduleRemove(ctx.pluginId, String(args.jobKind ?? ''))
    return { ok: true }
  })
  host.register('hooks.register', async (args, ctx) => {
    const point = String(args.point ?? '')
    const remote = args.remote === true
    const handler = args.handler
    if (!remote && typeof handler !== 'function') {
      return { error: 'handler must be a function', code: 'invalid_args' }
    }
    const reg = hooks.register({
      pluginId: ctx.pluginId,
      point: point as import('./hook-registry.js').HookPoint,
      ...(remote ? { remote: true } : { handler: handler as (payload: Record<string, unknown>) => Promise<unknown> }),
      priority: typeof args.priority === 'number' ? args.priority : undefined,
      timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
    })
    if ('error' in reg) return { error: reg.error, code: 'invalid_args' }
    return { id: reg.id, ok: true }
  })

  host.register('hooks.unregister', async (args, ctx) => {
    const id = String(args.id ?? '')
    const reg = hooks.list().find((h) => h.id === id)
    if (reg && reg.pluginId !== ctx.pluginId) {
      return { error: 'hook belongs to another extension', code: 'invalid_args' }
    }
    hooks.unregister(id)
    return { ok: true }
  })

  host.register('routes.register', async (args, ctx) => {
    const path = String(args.path ?? '')
    const remote = args.remote === true
    const handler = args.handler
    if (!remote && typeof handler !== 'function') {
      return { error: 'handler must be a function', code: 'invalid_args' }
    }
    const methods = Array.isArray(args.methods)
      ? (args.methods.map(String) as import('./route-contributions.js').RouteMethod[])
      : undefined
    const reg = routes.register({
      pluginId: ctx.pluginId,
      path,
      methods,
      ...(remote ? { remote: true } : { handler: handler as import('./route-contributions.js').RouteHandler }),
    })
    if ('error' in reg) return { error: reg.error, code: 'invalid_args' }
    return { id: reg.id, path: reg.path, ok: true }
  })

  host.register('routes.unregister', async (args, ctx) => {
    const id = String(args.id ?? '')
    const reg = routes.list().find((r) => r.id === id)
    if (reg && reg.pluginId !== ctx.pluginId) {
      return { error: 'route belongs to another extension', code: 'invalid_args' }
    }
    routes.unregister(id)
    return { ok: true }
  })
}

/**
 * Register all self-contained Phase A handlers on a host.
 */
export function registerSelfContainedHandlers(
  host: CapabilityHost,
  _packs: unknown,
): void {
  host.register('events.', eventsHandler)
  host.register('platform.info', platformInfoHandler)
  host.register('storage.', storageHandler)
}

/**
 * Check whether a token is handled by the self-contained set (no late-bound service).
 */
export function isSelfContainedToken(token: string): boolean {
  const rule = resolveCapabilityRule(token)
  if (!rule) return false
  // Self-contained: events.*, platform.info, storage.*
  return (
    token.startsWith('events.') ||
    token === 'platform.info' ||
    token.startsWith('storage.')
  )
}
