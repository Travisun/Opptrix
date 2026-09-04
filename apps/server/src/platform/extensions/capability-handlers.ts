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

const eventsHandler: CapabilityHandler = async (args, ctx) => {
  const action = String(args.action ?? '')
  if (action === 'subscribe') {
    const topic = String(args.topic ?? '')
    if (!topic) return { error: 'topic required', code: 'invalid_args' }
    const handler = args.handler
    if (typeof handler !== 'function') {
      return { error: 'handler must be a function', code: 'invalid_args' }
    }
    const dispose = ctx.events.subscribeTopic(topic, handler as never)
    return { subscribed: topic, dispose: typeof dispose === 'function' }
  }
  if (action === 'emit') {
    const name = String(args.name ?? '')
    if (!name) return { error: 'name required', code: 'invalid_args' }
    ctx.events.emit(name, (args.payload ?? {}) as Record<string, unknown>, {
      kind: 'extension',
      id: ctx.pluginId,
    })
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
 * Remove an extension's private data directory (uninstall cleanup).
 * Best-effort: returns { ok: false } if the directory is absent or removal fails.
 */
export function removeExtensionData(pluginId: string): { ok: boolean } {
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
