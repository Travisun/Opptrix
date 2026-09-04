/**
 * Shared extension-host subprocess (Phase B isolation, VS Code model).
 *
 * ONE child process hosts ALL active worker_js extensions — each in its own
 * `node:vm` context. Rationale (see ADR-02 amendment §6 / review decision):
 *   - Memory density: one process baseline (~100–150MB) + ~2–8MB per vm
 *     context. 20 extensions ≈ 300MB, vs 2–3GB for per-extension fork.
 *   - Isolation: a vm escape reaches only this child, never the API server.
 *   - Crash containment: child exit kills extensions, not the server; the
 *     supervisor restarts (bounded) and reloads contributions in <1s.
 *
 * Reactive model (Laravel-style): extensions with no resident touchpoints
 * (hooks / routes / event subscriptions / scheduled jobs) are loaded
 * fire-once — `activate()` runs, then the extension is unloaded and the
 * record is marked back to inactive-with-run-result. Only extensions with
 * resident touchpoints stay loaded in the host.
 *
 * Protocol over the fork IPC channel (JSON messages, JSON-RPC semantics —
 * EXTENSION-PLATFORM §6.2):
 *   parent → child: load / unload / ping / gateReply / hook / invoke /
 *                   event / scheduleTick / stop
 *   child  → parent: ready / pong / loadOk / loadError / gate / hookResult /
 *                    invokeResult / log
 */

import { randomUUID } from 'node:crypto'
import vm from 'node:vm'

type Ipc = {
  send: (msg: Record<string, unknown>) => boolean
  on: (event: 'message', listener: (msg: unknown) => void) => void
}

const msg = (m: Record<string, unknown>): void => {
  if (process.send) process.send(m)
}

/** Console bridge — forward structured logs to the parent (no host console). */
function bridgedConsole(extensionId: string): Console {
  const out = {} as unknown as Record<string, (...args: unknown[]) => void>
  for (const level of ['log', 'info', 'warn', 'error']) {
    out[level] = (...args: unknown[]) => {
      msg({ t: 'log', level, extensionId, args: safeArgs(args) })
    }
  }
  return out as unknown as Console
}

function safeArgs(args: unknown[]): unknown[] {
  return args.map((a) => {
    if (a == null) return a
    if (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') return a
    try {
      return JSON.stringify(a)
    } catch {
      return String(a)
    }
  })
}

const pendingGates = new Map<string, { resolve: (obs: Record<string, unknown>) => void }>()

/**
 * Local per-extension contribution registries — handlers stay in THIS process
 * and only execute when the platform dispatches the matching trigger (hook
 * fire / route request / event / scheduler tick).
 */
type LocalExt = {
  hooks: Map<string, Array<{ priority: number; handler: (p: Record<string, unknown>) => Promise<unknown> | unknown }>>
  routes: Map<string, { path: string; methods: string[]; handler: (req: Record<string, unknown>) => Promise<unknown> | unknown }>
  eventSubs: Array<{ topic: string; handler: (envelope: unknown) => void }>
  schedules: Array<{ jobKind: string; cron: string; handler: (ctx: Record<string, unknown>) => Promise<unknown> | unknown }>
  hasResidentTouchpoint: boolean
}

const extensions = new Map<string, LocalExt>()

function ext(id: string): LocalExt {
  let e = extensions.get(id)
  if (!e) {
    e = {
      hooks: new Map(),
      routes: new Map(),
      eventSubs: [],
      schedules: [],
      hasResidentTouchpoint: false,
    }
    extensions.set(id, e)
  }
  return e
}

/** Per-load nonce — bound to the loaded extensionId; parent validates on gate. */
let loadNonce = ''

function askGate(
  extensionId: string,
  token: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = randomUUID()
  return new Promise((resolve) => {
    pendingGates.set(id, { resolve })
    msg({ t: 'gate', id, extensionId, token, args, nonce: loadNonce })
    // Parent enforces the 30s RPC timeout; safety net for a dropped channel.
    setTimeout(() => {
      if (pendingGates.has(id)) {
        pendingGates.delete(id)
        resolve({ ok: false, denialCode: 'gate_timeout', message: 'gate round-trip timed out' })
      }
    }, 35_000)
  })
}

function matchTopic(topic: string, name: string): boolean {
  if (topic === '*' || topic === '**') return true
  if (topic.endsWith('.**')) return name.startsWith(topic.slice(0, -3))
  if (topic.endsWith('.*')) return name.startsWith(topic.slice(0, -1))
  return name === topic
}

function unwrapObservation(obs: Record<string, unknown>): unknown {
  if (obs && typeof obs === 'object' && obs.ok === false) {
    const err = new Error(String(obs.message ?? 'capability denied')) as Error & { code?: string }
    err.code = String(obs.denialCode ?? obs.code ?? 'denied')
    throw err
  }
  return (obs as { data?: unknown })?.data
}

/**
 * SDK facade (contract: packages/extension-sdk) — built on callGate so the
 * scaffolded `ctx.storage / ctx.events / ctx.hooks / ctx.routes / ctx.log`
 * surface works at runtime (closes the SDK contract gap).
 */
function buildContextFacade(
  extensionId: string,
  callGate: (token: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Record<string, unknown> {
  async function unwrap(p: Promise<Record<string, unknown>>): Promise<unknown> {
    return unwrapObservation(await p)
  }
  return {
    extensionId,
    log: bridgedConsole(extensionId),
    callGate,
    storage: {
      get: async (key: string) => {
        const data = (await unwrap(
          callGate('storage.get', { op: 'get', key }),
        )) as { found?: boolean; value?: unknown } | undefined
        return data?.found ? (data.value ?? null) : null
      },
      set: async (key: string, value: unknown) => {
        await unwrap(callGate('storage.set', { op: 'set', key, value }))
      },
      delete: async (key: string) => {
        await unwrap(callGate('storage.delete', { op: 'delete', key }))
      },
      list: async (prefix?: string) => {
        const data = (await unwrap(
          callGate('storage.list', { op: 'list', ...(prefix ? { prefix } : {}) }),
        )) as { keys?: string[] } | undefined
        return data?.keys ?? []
      },
      export: async () => {
        const data = (await unwrap(callGate('storage.export', { op: 'export' }))) as {
          kv?: Record<string, unknown>
        }
        return data?.kv ?? {}
      },
    },
    events: {
      subscribe: (topic: string, handler: (envelope: unknown) => void) => {
        // Handler interception happens inside callGate; the parent records the
        // declaration and dispatches matching events back via RPC.
        void callGate('events.subscribe', { action: 'subscribe', topic, handler }).catch(() => {})
      },
      emit: (name: string, payload?: Record<string, unknown>) => {
        void unwrap(callGate('events.emit', { action: 'emit', name, payload }))
      },
    },
    hooks: {
      register: async (
        point: string,
        handler: (payload: Record<string, unknown>) => Promise<unknown> | unknown,
        opts?: { priority?: number; timeoutMs?: number },
      ) => {
        const data = (await unwrap(
          callGate('hooks.register', {
            point,
            handler,
            ...(opts?.priority !== undefined ? { priority: opts.priority } : {}),
            ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
          }),
        )) as { id?: string }
        return { id: data?.id ?? '' }
      },
      unregister: async (id: string) => {
        await unwrap(callGate('hooks.unregister', { id }))
      },
    },
    routes: {
      register: async (
        routePath: string,
        handler: (req: Record<string, unknown>) => Promise<unknown> | unknown,
        opts?: { methods?: string[] },
      ) => {
        const data = (await unwrap(
          callGate('routes.register', {
            path: routePath,
            handler,
            ...(opts?.methods ? { methods: opts.methods } : {}),
          }),
        )) as { id?: string; path?: string }
        return { id: data?.id ?? '', path: data?.path ?? routePath }
      },
      unregister: async (id: string) => {
        await unwrap(callGate('routes.unregister', { id }))
      },
    },
  }
}

/**
 * Load the extension entry in a callGate-only vm context, register local
 * handlers, and forward declarations (never functions) to the parent.
 * Handlers execute ONLY when the platform dispatches the matching trigger.
 */
async function runExtensionInVm(extensionId: string, source: string): Promise<{ hasResidentTouchpoint: boolean }> {
  const e = ext(extensionId)
  const module = { exports: {} as Record<string, unknown> }

  const callGate = async (
    token: string,
    args?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>

    if (token === 'hooks.register') {
      const point = String(a.point ?? '')
      const handler = a.handler
      if (typeof handler !== 'function') {
        return { ok: false, denialCode: 'invalid_args', message: 'handler must be a function' }
      }
      const list = e.hooks.get(point) ?? []
      list.push({ priority: typeof a.priority === 'number' ? a.priority : 0, handler: handler as never })
      e.hooks.set(point, list)
      e.hasResidentTouchpoint = true
      return askGate(extensionId, token, { point, priority: a.priority, remote: true })
    }
    if (token === 'routes.register') {
      const routePath = String(a.path ?? '')
      const handler = a.handler
      if (typeof handler !== 'function') {
        return { ok: false, denialCode: 'invalid_args', message: 'handler must be a function' }
      }
      const methods = Array.isArray(a.methods) ? a.methods.map(String) : ['GET']
      e.routes.set(`${methods.join(',')}:${routePath}`, { path: routePath, methods, handler: handler as never })
      e.hasResidentTouchpoint = true
      return askGate(extensionId, token, { path: routePath, methods, remote: true })
    }
    if (token === 'events.subscribe') {
      const topic = String(a.topic ?? '')
      const handler = a.handler
      if (typeof handler !== 'function') {
        return { ok: false, denialCode: 'invalid_args', message: 'handler must be a function' }
      }
      e.eventSubs.push({ topic, handler: handler as never })
      e.hasResidentTouchpoint = true
      return askGate(extensionId, token, { action: 'subscribe', topic, remote: true })
    }
    if (token === 'schedule.register') {
      const jobKind = String(a.jobKind ?? '')
      const handler = a.handler
      if (typeof handler !== 'function') {
        return { ok: false, denialCode: 'invalid_args', message: 'handler must be a function' }
      }
      e.schedules.push({
        jobKind,
        cron: String(a.cron ?? ''),
        handler: handler as never,
      })
      e.hasResidentTouchpoint = true
      return askGate(extensionId, token, {
        action: 'register',
        jobKind,
        cron: a.cron,
        title: a.title,
        remote: true,
      })
    }
    if (token === 'events.emit') {
      return askGate(extensionId, token, { action: 'emit', name: a.name, payload: a.payload })
    }
    return askGate(extensionId, token, a)
  }

  const ctx = buildContextFacade(extensionId, callGate)
  const sandbox: Record<string, unknown> = {
    module,
    exports: module.exports,
    extensionId,
    console: bridgedConsole(extensionId),
    callGate,
    ctx,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, {
    filename: `opx:${extensionId}.js`,
    timeout: 3000,
  })
  const exported = module.exports as { activate?: unknown }
  if (typeof exported.activate === 'function') {
    // SDK contract: activate(ctx: ExtensionHostContext) — pass the facade as
    // the first argument (the vm global is also present, but the parameter is
    // the documented signature and must not be undefined).
    await Promise.resolve(
      (exported.activate as (c: unknown) => unknown | Promise<unknown>)(ctx),
    )
  }
  return { hasResidentTouchpoint: e.hasResidentTouchpoint }
}

function unloadExtension(extensionId: string): void {
  extensions.delete(extensionId)
}

function findLocalRoute(
  extensionId: string,
  method: string,
  path: string,
): { handler: (req: Record<string, unknown>) => Promise<unknown> | unknown; params: Record<string, string> } | null {
  const e = extensions.get(extensionId)
  if (!e) return null
  for (const route of e.routes.values()) {
    if (!route.methods.includes(method)) continue
    const pSeg = route.path.split('/')
    const aSeg = path.split('/')
    if (pSeg.length !== aSeg.length) continue
    const params: Record<string, string> = {}
    let ok = true
    for (let i = 0; i < pSeg.length; i++) {
      if (pSeg[i].startsWith(':')) params[pSeg[i].slice(1)] = aSeg[i]
      else if (pSeg[i] !== aSeg[i]) { ok = false; break }
    }
    if (ok) return { handler: route.handler, params }
  }
  return null
}

let booted = false

function onMessage(raw: unknown): void {
  if (raw == null || typeof raw !== 'object') return
  const m = raw as Record<string, unknown>
  const id = typeof m.id === 'string' ? m.id : undefined
  void (async () => {
    switch (m.t) {
      case 'ping': {
        msg({ t: 'pong', id })
        return
      }
      case 'gateReply': {
        const pending = pendingGates.get(String(id))
        if (pending) {
          pendingGates.delete(String(id))
          pending.resolve((m.observation ?? {}) as Record<string, unknown>)
        }
        return
      }
      case 'load': {
        const extensionId = String(m.extensionId ?? '')
        loadNonce = String(m.nonce ?? '')
        try {
          const info = await runExtensionInVm(extensionId, String(m.source ?? ''))
          msg({ t: 'loadOk', id, hasResidentTouchpoint: info.hasResidentTouchpoint })
        } catch (err) {
          extensions.delete(extensionId)
          msg({ t: 'loadError', id, error: err instanceof Error ? err.message : String(err) })
        }
        return
      }
      case 'unload': {
        unloadExtension(String(m.extensionId ?? ''))
        msg({ t: 'unloadOk', id })
        return
      }
      case 'hook': {
        const extensionId = String(m.extensionId ?? '')
        const point = String(m.point ?? '')
        const payload = (m.payload ?? {}) as Record<string, unknown>
        const e = extensions.get(extensionId)
        const handlers = (e?.hooks.get(point) ?? [])
          .slice()
          .sort((a, b) => b.priority - a.priority)
        const results: unknown[] = []
        let abort = false
        for (const h of handlers) {
          try {
            const r = (await h.handler(payload)) as { abort?: boolean } | undefined
            results.push(r ?? null)
            if (r && typeof r === 'object' && r.abort === true) { abort = true; break }
          } catch (err) {
            results.push({ error: err instanceof Error ? err.message : String(err) })
          }
        }
        msg({ t: 'hookResult', id, result: { results, abort } })
        return
      }
      case 'invoke': {
        const extensionId = String(m.extensionId ?? '')
        const routeReq = (m.route ?? {}) as Record<string, unknown>
        const method = String(routeReq.method ?? 'GET')
        const routePath = String(routeReq.path ?? '/')
        const found = findLocalRoute(extensionId, method, routePath)
        if (!found) {
          msg({ t: 'invokeResult', id, response: { status: 404, body: { error: 'no local route' } } })
          return
        }
        try {
          const out = (await found.handler({
            method,
            path: routePath,
            params: found.params,
            query: routeReq.query ?? {},
            body: routeReq.body ?? null,
            headers: routeReq.headers ?? {},
          })) as { status?: number; body?: unknown; headers?: Record<string, string> }
          msg({
            t: 'invokeResult',
            id,
            response: {
              status: typeof out?.status === 'number' ? out.status : 200,
              body: out?.body ?? null,
              headers: out?.headers ?? {},
            },
          })
        } catch (err) {
          msg({
            t: 'invokeResult',
            id,
            response: { status: 500, body: { error: err instanceof Error ? err.message : 'route error' } },
          })
        }
        return
      }
      case 'event': {
        const extensionId = String(m.extensionId ?? '')
        const name = String(m.name ?? '')
        const e = extensions.get(extensionId)
        if (!e) return
        for (const sub of e.eventSubs) {
          if (!matchTopic(sub.topic, name)) continue
          try {
            sub.handler({ name, payload: m.payload })
          } catch {
            // observer errors never kill the host
          }
        }
        return
      }
      case 'scheduleTick': {
        const extensionId = String(m.extensionId ?? '')
        const jobKind = String(m.jobKind ?? '')
        const e = extensions.get(extensionId)
        if (!e) return
        for (const job of e.schedules) {
          if (job.jobKind !== jobKind) continue
          try {
            await job.handler((m.context ?? {}) as Record<string, unknown>)
          } catch (err) {
            msg({
              t: 'log',
              level: 'error',
              extensionId,
              args: [`schedule ${jobKind} failed: ${err instanceof Error ? err.message : String(err)}`],
            })
          }
        }
        msg({ t: 'scheduleDone', id })
        return
      }
      case 'stop': {
        process.exit(0)
        return
      }
      default:
        return
    }
  })().catch((err) => {
    if (id) msg({ t: 'loadError', id, error: err instanceof Error ? err.message : String(err) })
  })
}

const ipc = process as unknown as {
  send?: (m: unknown) => boolean
  on: (e: 'message', l: (m: unknown) => void) => void
}
if (typeof ipc.send === 'function') {
  ipc.on('message', onMessage)
  booted = true
  msg({ t: 'ready' })
} else {
  process.exit(1)
}
void booted
