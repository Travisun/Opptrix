/**
 * Phase A Capability Host — dispatches extension callGate tokens to real services.
 *
 * The manager's callGate → invokeViaGateway → gate.submit → exec thunk → host.dispatch.
 * The host routes by token prefix to registered handlers.
 *
 * Two-phase registration:
 *   1. Platform context registers self-contained handlers (events, platform.info, storage).
 *   2. index.ts registers late-bound handlers (llm, data.query, shell, schedule) after
 *      those services are constructed.
 *
 * ADR-02 amendment: the host is the ONLY path from an extension to platform capabilities.
 * Permissions are enforced in the exec thunk (invokeViaGateway) BEFORE dispatch.
 */

import type { EventDispatcher } from '@opptrix/event-bus'
import type { PackRegistry } from '../packs/types.js'
import type { ExtensionPermission } from './types.js'
import { resolveCapabilityRule } from './capability-token-registry.js'

export type CapabilityHandler = (
  args: Record<string, unknown>,
  ctx: CapabilityDispatchContext,
) => Promise<unknown>

export type CapabilityDispatchContext = {
  pluginId: string
  events: EventDispatcher
  packs: PackRegistry
  dataRoot?: string
  /** Late-bound services (populated by index.ts). */
  services: CapabilityServices
}

/** Late-bound services — registered by index.ts after construction. */
export type CapabilityServices = {
  /** LLM provider for llm.chat. */
  llm?: unknown
  /** Schedule service for schedule.*. */
  schedule?: unknown
  /** Instrument data query for data.query (queryInstrumentData). */
  dataQuery?: unknown
  /** Shell runner for shell.run. */
  shell?: unknown
  /** Shared host supervisor (Phase B) — used for remote event forwarding. */
  extHost?: unknown
}

export type CapabilityHost = {
  dispatch(
    token: string,
    args: Record<string, unknown>,
    /** Caller-provided context; merged over the base context (base fills gaps). */
    ctx: Partial<CapabilityDispatchContext>,
  ): Promise<unknown>
  /** Register a handler for a token prefix (e.g. "storage." → handles storage.get/set/...). */
  register(prefix: string, handler: CapabilityHandler): void
}

export type CreateCapabilityHostOptions = {
  events: EventDispatcher
  packs: PackRegistry
  dataRoot?: string
  services?: CapabilityServices
}

export function createCapabilityHost(
  opts: CreateCapabilityHostOptions,
): CapabilityHost {
  const handlers = new Map<string, CapabilityHandler>()

  const ctx: CapabilityDispatchContext = {
    pluginId: '',
    events: opts.events,
    packs: opts.packs,
    dataRoot: opts.dataRoot,
    services: opts.services ?? {},
  }

  return {
    async dispatch(
      token: string,
      args: Record<string, unknown>,
      dispatchCtx: CapabilityDispatchContext,
    ): Promise<unknown> {
      // Merge: caller-provided ctx takes precedence (carries pluginId).
      const merged: CapabilityDispatchContext = {
        ...ctx,
        ...dispatchCtx,
        services: { ...ctx.services, ...dispatchCtx.services },
      }
      // Exact prefix match, then longest-prefix match.
      const handler = matchHandler(handlers, token)
      if (!handler) {
        return {
          error: `unknown capability token: ${token}`,
          code: 'unknown_capability',
        }
      }
      return handler(args ?? {}, merged)
    },

    register(prefix: string, handler: CapabilityHandler): void {
      const normalized = prefix.endsWith('.') ? prefix : prefix + '.'
      handlers.set(normalized, handler)
    },
  }
}

function matchHandler(
  handlers: Map<string, CapabilityHandler>,
  token: string,
): CapabilityHandler | undefined {
  // Exact match first.
  const exact = handlers.get(token)
  if (exact) return exact
  // Longest prefix match.
  let best: { len: number; h: CapabilityHandler } | undefined
  for (const [prefix, h] of handlers) {
    if (token.startsWith(prefix) || token + '.' === prefix) {
      if (!best || prefix.length > best.len) {
        best = { len: prefix.length, h }
      }
    }
  }
  return best?.h
}

/**
 * Map a denial from the capability host into a CapabilityObservation.
 * Used by invokeViaGateway's exec thunk.
 */
export function denial(
  code: string,
  message: string,
): { ok: false; denialCode: string; message: string } {
  return { ok: false, denialCode: code, message }
}

/**
 * Resolve the required permission for a token. Returns null for unknown tokens.
 */
export function requiredPermission(token: string): ExtensionPermission | null {
  const rule = resolveCapabilityRule(token)
  return rule?.permission ?? null
}
