/**
 * Shared extension-host subprocess supervisor (Phase B isolation).
 *
 * Parent side of `host-process-entry.ts` (see that file for the protocol and
 * the density/isolation rationale). One fork for ALL worker_js extensions;
 * per-extension vm contexts inside the child; handlers never cross the
 * process boundary — the platform dispatches triggers via RPC.
 *
 * Gate calls from the child are executed by the injected `execCapability`
 * callback, which MUST run the real capability dispatch with the extension's
 * own principal (pre-release audit P0-4: the previous worker backend answered
 * with a hard-coded echo and skipped permission checks entirely).
 */

import { randomUUID } from 'node:crypto'
import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export type SharedHostStatus = 'stopped' | 'starting' | 'running' | 'crashed'

export type RouteRequestMsg = {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  headers: Record<string, string>
}

export type RouteResponseMsg = { status: number; body: unknown; headers?: Record<string, string> }

export type SharedHostOptions = {
  /** Execute a capability call for an extension (real dispatch + gate). */
  execCapability: (
    extensionId: string,
    token: string,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  /** Called when the child exits unexpectedly. */
  onCrash?: () => void
  /** Absolute path to the compiled child entry (tests may override). */
  entryPath?: string
  /** Per-child V8 heap cap (MiB). */
  maxOldSpaceMiB?: number
  requestTimeoutMs?: number
}

export type SharedHostSupervisor = {
  start(): Promise<void>
  stop(): Promise<void>
  status(): SharedHostStatus
  ping(): Promise<void>
  /** Load an extension entry into a fresh vm context inside the child. */
  load(
    extensionId: string,
    source: string,
    timeoutMs?: number,
  ): Promise<{ ok: true; hasResidentTouchpoint: boolean } | { ok: false; error: string }>
  /** Bound identity for a load nonce (anti-spoofing; audit P2-2). */
  resolveNonce(nonce: string): string | null
  /** Drop the extension's vm context and local handlers. */
  unload(extensionId: string): Promise<void>
  dispatchHook(
    extensionId: string,
    point: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<{ results: unknown[]; abort: boolean }>
  invokeRoute(
    extensionId: string,
    req: RouteRequestMsg,
    timeoutMs: number,
  ): Promise<RouteResponseMsg>
  dispatchEvent(extensionId: string, name: string, payload: unknown): void
  scheduleTick(
    extensionId: string,
    jobKind: string,
    context: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<void>
  listResidentExtensions(): string[]
}

type Pending = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
  kind: 'ping' | 'load' | 'hook' | 'invoke' | 'schedule' | 'unload'
}

const READY_TIMEOUT_MS = 10_000

function defaultEntryPath(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'host-process-entry.js',
  )
}

export function createSharedHostSupervisor(opts: SharedHostOptions): SharedHostSupervisor {
  const entryPath = opts.entryPath ?? defaultEntryPath()
  const timeoutMs = opts.requestTimeoutMs ?? 30_000
  const maxOldSpace =
    opts.maxOldSpaceMiB ?? (Number(process.env.OPPTRIX_EXT_HOST_MAX_OLD_SPACE ?? 256) || 256)

  let child: ChildProcess | null = null
  let status: SharedHostStatus = 'stopped'
  let intentionalStop = false
  let startPromise: Promise<void> | null = null
  const pending = new Map<string, Pending>()
  const resident = new Set<string>()
  /** nonce → extensionId. Parent derives gate identity from the nonce, never
   * from the child's claim (audit P2-2: a compromised child cannot impersonate
   * another extension's principal). */
  const nonceToExtension = new Map<string, string>()

  function rejectAll(err: Error): void {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    pending.clear()
  }

  function failPending(err: Error): void {
    rejectAll(err)
  }

  function send(msg: Record<string, unknown>): boolean {
    if (!child || !child.connected || status !== 'running') return false
    child.send(msg)
    return true
  }

  function request<T>(
    msg: Record<string, unknown>,
    replyType: string,
    kind: Pending['kind'],
    timeout: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (status !== 'running' || !send(msg)) {
        reject(new Error('extension host not running'))
        return
      }
      const id = String(msg.id)
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`extension host ${kind} timeout after ${timeout}ms`))
      }, timeout)
      pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
        kind,
      })
      void replyType
    })
  }

  function onChildMessage(raw: unknown): void {
    if (raw == null || typeof raw !== 'object') return
    const m = raw as Record<string, unknown>
    const id = typeof m.id === 'string' ? m.id : undefined
    switch (m.t) {
      case 'pong':
      case 'loadOk':
      case 'unloadOk':
      case 'hookResult':
      case 'invokeResult':
      case 'scheduleDone': {
        const p = id ? pending.get(id) : undefined
        if (p && id) {
          clearTimeout(p.timer)
          pending.delete(id)
          p.resolve(m)
        }
        return
      }
      case 'loadError': {
        const p = id ? pending.get(id) : undefined
        if (p && id) {
          clearTimeout(p.timer)
          pending.delete(id)
          p.reject(new Error(String(m.error ?? 'load failed')))
        }
        return
      }
      case 'gate': {
        // REAL dispatch: capability host + gate. Identity comes from the load
        // nonce — the child's claimed extensionId is never trusted (P2-2).
        void (async () => {
          const boundExtensionId = nonceToExtension.get(String(m.nonce ?? ''))
          let observation: Record<string, unknown>
          if (!boundExtensionId) {
            observation = {
              ok: false,
              denialCode: 'gate_identity_unknown',
              message: 'gate nonce not bound to a loaded extension',
            }
          } else
          try {
            observation = await opts.execCapability(
              boundExtensionId,
              String(m.token ?? ''),
              (m.args && typeof m.args === 'object' ? m.args : {}) as Record<string, unknown>,
            )
          } catch (err) {
            observation = {
              ok: false,
              denialCode: 'host_gate_error',
              message: err instanceof Error ? err.message : String(err),
            }
          }
          if (!send({ t: 'gateReply', id: m.id, observation })) {
            // Channel dropped — the pending gate safety net in the child fires.
          }
        })()
        return
      }
      case 'log': {
        const level = String(m.level ?? 'log')
        const line = `[ext:${String(m.extensionId ?? '?')}] ${String((m.args as unknown[]) ?? '')}`
        if (level === 'error') console.error(line)
        else if (level === 'warn') console.warn(line)
        else console.log(line)
        return
      }
      default:
        return
    }
  }

  function wireChild(c: ChildProcess): void {
    c.on('message', onChildMessage)
    c.on('error', () => {
      if (!intentionalStop && status === 'running') {
        status = 'crashed'
        failPending(new Error('extension host crashed'))
        opts.onCrash?.()
      }
    })
    c.on('exit', () => {
      if (intentionalStop) {
        status = 'stopped'
        child = null
        return
      }
      if (status === 'running') {
        status = 'crashed'
        child = null
        failPending(new Error('extension host crashed'))
        opts.onCrash?.()
      }
    })
  }

  return {
    status(): SharedHostStatus {
      return status
    },

    async start(): Promise<void> {
      if (status === 'running' && child) return
      // In-flight guard: concurrent start() calls share one fork (audit P2-1).
      if (status === 'starting' && startPromise) return startPromise
      intentionalStop = false
      status = 'starting'
      startPromise = (async () => {
        let c: ChildProcess | null = null
        try {
          // Env allowlist: the child runs untrusted extension code inside a
          // vm whose escape is a known boundary — never leak host secrets
          // (API keys, tokens) through the environment (audit P1-2).
          const allowEnv = ['PATH', 'HOME', 'NODE_ENV', 'LANG', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'COMSPEC']
          const env: Record<string, string> = {}
          for (const k of allowEnv) {
            const v = process.env[k]
            if (v !== undefined) env[k] = v
          }
          const spawned = fork(entryPath, [], {
            execArgv: [`--max-old-space-size=${maxOldSpace}`],
            env,
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
          })
          c = spawned
          child = c
          wireChild(c)
          // Wait for the child's ready handshake.
          await new Promise<void>((resolve, reject) => {
            const onReady = (raw: unknown): void => {
              if (raw != null && typeof raw === 'object' && (raw as Record<string, unknown>).t === 'ready') {
                c!.off('message', onReady)
                clearTimeout(timer)
                resolve()
              }
            }
            const timer = setTimeout(() => {
              c!.off('message', onReady)
              reject(new Error('extension host ready timeout'))
            }, READY_TIMEOUT_MS)
            c!.on('message', onReady)
          })
          status = 'running'
        } catch (err) {
          // Kill the spawned child — a ready-timeout orphan would otherwise
          // leak a full Node process per failed start (audit P2-1).
          if (c) {
            try {
              c.removeAllListeners('exit')
              c.kill('SIGKILL')
            } catch {
              // already gone
            }
          }
          if (child === c) child = null
          status = intentionalStop ? 'stopped' : 'crashed'
          throw err instanceof Error ? err : new Error(String(err))
        } finally {
          startPromise = null
        }
      })()
      return startPromise
    },

    async stop(): Promise<void> {
      intentionalStop = true
      const c = child
      child = null
      rejectAll(new Error('extension host stopped'))
      resident.clear()
      nonceToExtension.clear()
      if (!c) {
        status = 'stopped'
        return
      }
      try {
        send({ t: 'stop' })
      } catch {
        // fall through to kill
      }
      await new Promise<void>((resolve) => {
        const killer = setTimeout(() => {
          try {
            c.kill('SIGKILL')
          } catch {
            // already gone
          }
          resolve()
        }, 1500)
        c.once('exit', () => {
          clearTimeout(killer)
          resolve()
        })
      })
      status = 'stopped'
    },

    async ping(): Promise<void> {
      const id = randomUUID()
      await request({ t: 'ping', id }, 'pong', 'ping', Math.min(timeoutMs, 5000))
    },

    async load(
      extensionId: string,
      source: string,
      loadTimeoutMs = 10_000,
    ): Promise<{ ok: true; hasResidentTouchpoint: boolean } | { ok: false; error: string }> {
      const id = randomUUID()
      const nonce = randomUUID()
      nonceToExtension.set(nonce, extensionId)
      try {
        const m = await request<Record<string, unknown>>(
          { t: 'load', id, extensionId, source, nonce },
          'loadOk',
          'load',
          loadTimeoutMs,
        )
        if (m.t === 'loadOk') {
          resident.add(extensionId)
          return {
            ok: true,
            hasResidentTouchpoint: m.hasResidentTouchpoint === true,
          }
        }
        return { ok: false, error: String(m.error ?? 'load failed') }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },

    async unload(extensionId: string): Promise<void> {
      const id = randomUUID()
      try {
        await request({ t: 'unload', id, extensionId }, 'unloadOk', 'unload', 5000)
      } catch {
        // best-effort
      }
      resident.delete(extensionId)
      for (const [n, ext] of nonceToExtension) {
        if (ext === extensionId) nonceToExtension.delete(n)
      }
    },

    async dispatchHook(
      extensionId: string,
      point: string,
      payload: Record<string, unknown>,
      hookTimeoutMs: number,
    ): Promise<{ results: unknown[]; abort: boolean }> {
      const id = randomUUID()
      try {
        const m = await request<Record<string, unknown>>(
          { t: 'hook', id, extensionId, point, payload },
          'hookResult',
          'hook',
          Math.max(hookTimeoutMs + 250, 1000),
        )
        const result = (m.result ?? {}) as { results?: unknown[]; abort?: boolean }
        return { results: result.results ?? [], abort: result.abort === true }
      } catch (err) {
        return {
          results: [{ error: err instanceof Error ? err.message : String(err) }],
          abort: false,
        }
      }
    },

    async invokeRoute(
      extensionId: string,
      req: RouteRequestMsg,
      routeTimeoutMs: number,
    ): Promise<RouteResponseMsg> {
      const id = randomUUID()
      const m = await request<Record<string, unknown>>(
        { t: 'invoke', id, extensionId, route: req },
        'invokeResult',
        'invoke',
        routeTimeoutMs,
      )
      const response = (m.response ?? {}) as RouteResponseMsg
      return {
        status: typeof response.status === 'number' ? response.status : 200,
        body: response.body ?? null,
        headers: response.headers ?? {},
      }
    },

    dispatchEvent(extensionId: string, name: string, payload: unknown): void {
      // Fire-and-forget notification — no pending tracking.
      send({ t: 'event', extensionId, name, payload })
    },

    async scheduleTick(
      extensionId: string,
      jobKind: string,
      context: Record<string, unknown>,
      tickTimeoutMs: number,
    ): Promise<void> {
      const id = randomUUID()
      await request(
        { t: 'scheduleTick', id, extensionId, jobKind, context },
        'scheduleDone',
        'schedule',
        tickTimeoutMs,
      )
    },

    listResidentExtensions(): string[] {
      return [...resident]
    },

    resolveNonce(nonce: string): string | null {
      return nonceToExtension.get(nonce) ?? null
    },
  }
}
