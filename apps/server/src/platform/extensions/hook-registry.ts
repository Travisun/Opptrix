/**
 * Phase A Hook Registry — read-only hooks dispatched to extensions.
 *
 * Hooks let extensions observe platform lifecycle without mutating it (Phase A).
 * Dispatch is async, timeout-bounded, priority-ordered, and never throws (R0).
 *
 * Supported Phase A hooks (read-only):
 *   - session.messageCommitted : fired after a message is committed to a session
 *   - agent.toolPreExecute     : fired before a tool executes (audit-only)
 *
 * Extensions register hook handlers via callGate('hooks.register', {...}).
 * The handler runs in the extension's worker_js VM sandbox (callGate-only).
 */

import { randomUUID } from 'node:crypto'
import type { CapabilityObservation } from '@opptrix/agent'

export type HookPoint = 'session.messageCommitted' | 'agent.toolPreExecute'

export type HookHandler = {
  pluginId: string
  /** Priority: higher runs first. Default 0. */
  priority: number
  /** Timeout in ms (default 100ms, max 500ms). */
  timeoutMs: number
  /** The extension-side handler, invoked via callGate. */
  handle: (payload: Record<string, unknown>) => Promise<unknown>
}

export type HookRegistration = {
  id: string
  pluginId: string
  point: HookPoint
  priority: number
  timeoutMs: number
  handle: HookHandler['handle']
}

const DEFAULT_HOOK_TIMEOUT_MS = 100
const MAX_HOOK_TIMEOUT_MS = 500

export type HookRegistry = {
  register(reg: {
    pluginId: string
    point: HookPoint
    handler: HookHandler['handle']
    priority?: number
    timeoutMs?: number
  }): { id: string } | { error: string }
  unregister(id: string): void
  /** Unregister all hooks for a plugin (deactivate cleanup). */
  unregisterForPlugin(pluginId: string): void
  /**
   * Dispatch a hook event to all registered handlers (parallel, timeout-bounded).
   * Returns observations; never throws (R0).
   */
  dispatch(
    point: HookPoint,
    payload: Record<string, unknown>,
  ): Promise<Array<{ pluginId: string; observation: CapabilityObservation }>>
  /** List registered hooks (diagnostics). */
  list(): HookRegistration[]
}

export function createHookRegistry(): HookRegistry {
  const hooks = new Map<string, HookRegistration>()

  function register(reg: {
    pluginId: string
    point: HookPoint
    handler: HookHandler['handle']
    priority?: number
    timeoutMs?: number
  }): { id: string } | { error: string } {
    const validPoints: HookPoint[] = ['session.messageCommitted', 'agent.toolPreExecute']
    if (!validPoints.includes(reg.point)) {
      return { error: `unknown hook point: ${reg.point}` }
    }
    if (typeof reg.handler !== 'function') {
      return { error: 'handler must be a function' }
    }
    const id = randomUUID()
    const timeoutMs = Math.min(
      Math.max(reg.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS, 1),
      MAX_HOOK_TIMEOUT_MS,
    )
    hooks.set(id, {
      id,
      pluginId: reg.pluginId,
      point: reg.point,
      priority: reg.priority ?? 0,
      timeoutMs,
      handle: reg.handler,
    })
    return { id }
  }

  function unregister(id: string): void {
    hooks.delete(id)
  }

  function unregisterForPlugin(pluginId: string): void {
    for (const [id, h] of hooks) {
      if (h.pluginId === pluginId) hooks.delete(id)
    }
  }

  async function dispatch(
    point: HookPoint,
    payload: Record<string, unknown>,
  ): Promise<Array<{ pluginId: string; observation: CapabilityObservation }>> {
    const matched = [...hooks.values()]
      .filter((h) => h.point === point)
      .sort((a, b) => b.priority - a.priority)

    const results = await Promise.all(
      matched.map(async (h) => {
        const auditId = randomUUID()
        try {
          const data = await runWithTimeout(
            () => h.handle(payload),
            h.timeoutMs,
            `hook ${point} timed out after ${h.timeoutMs}ms`,
          )
          return {
            pluginId: h.pluginId,
            observation: {
              ok: true,
              data,
              auditId,
              message: `hook ${point} observed`,
            },
          }
        } catch (err) {
          // R0: single hook failure does not block others or the main path.
          return {
            pluginId: h.pluginId,
            observation: {
              ok: false,
              auditId,
              message: err instanceof Error ? err.message : String(err),
            },
          }
        }
      }),
    )
    return results
  }

  function list(): HookRegistration[] {
    return [...hooks.values()].map((h) => ({ ...h }))
  }

  return { register, unregister, unregisterForPlugin, dispatch, list }
}

async function runWithTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  timeoutMsg: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMsg)), ms)
    Promise.resolve(fn())
      .then((v) => {
        clearTimeout(timer)
        resolve(v)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}
