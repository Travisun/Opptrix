import { randomUUID } from 'node:crypto'
import { Worker, MessageChannel } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import type { CapabilityObservation } from '@opptrix/agent'

/** Inline gateway action shape to avoid circular import with types.ts. */
export type HostWorkerGateAction = {
  token: string
  args?: Record<string, unknown>
  principal?: { kind: string; id?: string; sessionId?: string }
  traceId?: string
}

export type HostWorkerStatus = 'stopped' | 'running' | 'crashed'

/** Parent → worker */
export type HostWorkerParentMessage =
  | { type: 'ping'; id: string }
  | { type: 'request_gate'; id: string; token: string; args: Record<string, unknown> }
  | { type: 'gate_reply'; id: string; observation: CapabilityObservation }
  | {
      type: 'load_extension'
      id: string
      extensionId: string
      source: string
    }
  | { type: 'simulate_crash' }

/** Worker → parent */
export type HostWorkerChildMessage =
  | { type: 'pong'; id: string }
  | { type: 'gate'; id: string; token: string; args: Record<string, unknown> }
  | { type: 'gate_done'; id: string; observation: CapabilityObservation }
  | { type: 'load_ok'; id: string }
  | { type: 'load_error'; id: string; error: string }
  | { type: 'error'; id?: string; error: string }

export type ExtensionHostWorkerHandle = {
  postMessage(msg: unknown): void
  on(
    event: 'message' | 'error' | 'exit',
    listener: ((msg: unknown) => void) | ((err: Error) => void) | ((code: number) => void),
  ): void
  terminate(): Promise<number>
}

export type CreateExtensionHostSupervisorOptions = {
  invokeViaGateway: (
    action: HostWorkerGateAction,
    exec: () => Promise<unknown>,
  ) => Promise<CapabilityObservation>
  /** Inject a fake worker (MessagePort pair) for unit tests. */
  workerFactory?: () => ExtensionHostWorkerHandle | Promise<ExtensionHostWorkerHandle>
  /** Absolute path to worker entry; default = host-worker-entry.js next to this module. */
  workerEntryPath?: string
  requestTimeoutMs?: number
}

export type ExtensionHostSupervisor = {
  start(): Promise<void>
  stop(): Promise<void>
  ping(): Promise<{ ok: true }>
  requestGate(
    token: string,
    args?: Record<string, unknown>,
  ): Promise<CapabilityObservation>
  /**
   * Wave 58A: post entry source into the worker for `vm` load (never runs in parent).
   */
  loadExtension(
    extensionId: string,
    source: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  /** Test helper — ask worker to exit abnormally. */
  simulateCrash(): Promise<void>
  status(): HostWorkerStatus
}

const DEFAULT_REQUEST_TIMEOUT_MS = 5000
const DEFAULT_LOAD_TIMEOUT_MS = 8000
const VM_SCRIPT_TIMEOUT_MS = 3000

function defaultWorkerEntryPath(): string {
  return fileURLToPath(new URL('./host-worker-entry.js', import.meta.url))
}

function wrapRealWorker(worker: Worker): ExtensionHostWorkerHandle {
  return {
    postMessage(msg: unknown): void {
      worker.postMessage(msg)
    },
    on(
      event: 'message' | 'error' | 'exit',
      listener: ((msg: unknown) => void) | ((err: Error) => void) | ((code: number) => void),
    ): void {
      if (event === 'message') {
        worker.on('message', listener as (msg: unknown) => void)
        return
      }
      if (event === 'error') {
        worker.on('error', listener as (err: Error) => void)
        return
      }
      worker.on('exit', listener as (code: number) => void)
    },
    terminate(): Promise<number> {
      return worker.terminate()
    },
  }
}

export type AttachHostWorkerLoopOptions = {
  /** Override crash behavior (in-process fake); default = process.exit(1). */
  onSimulateCrash?: () => void
}

/**
 * Run extension source inside a callGate-only `vm` context.
 * No require / process / fs — ReferenceError on access.
 */
export async function runExtensionSourceInVm(
  source: string,
  extensionId: string,
  callGate: (
    token: string,
    args?: Record<string, unknown>,
  ) => Promise<CapabilityObservation>,
): Promise<void> {
  const module = { exports: {} as Record<string, unknown> }
  const sandbox: Record<string, unknown> = {
    module,
    exports: module.exports,
    extensionId,
    console,
    callGate,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, {
    filename: `opx:${extensionId}.js`,
    timeout: VM_SCRIPT_TIMEOUT_MS,
  })
  const exported = module.exports as { activate?: unknown }
  if (typeof exported.activate === 'function') {
    await Promise.resolve(
      (exported.activate as () => unknown | Promise<unknown>)(),
    )
  }
}

/**
 * Attach the controlled worker message loop to any port-like object.
 * Used by the real worker entry and by MessageChannel fakes in tests.
 */
export function attachHostWorkerLoop(
  port: {
    postMessage(msg: unknown): void
    on(event: 'message', listener: (msg: unknown) => void): void
  },
  loopOpts?: AttachHostWorkerLoopOptions,
): void {
  const pendingGateReplies = new Map<
    string,
    (obs: CapabilityObservation) => void
  >()

  function callGateFromVm(
    token: string,
    args?: Record<string, unknown>,
  ): Promise<CapabilityObservation> {
    const gateId = randomUUID()
    const safeArgs = args && typeof args === 'object' ? args : {}
    return new Promise<CapabilityObservation>((resolve) => {
      pendingGateReplies.set(gateId, resolve)
      const gateAsk: HostWorkerChildMessage = {
        type: 'gate',
        id: gateId,
        token: String(token ?? ''),
        args: safeArgs,
      }
      port.postMessage(gateAsk)
    })
  }

  port.on('message', (raw: unknown) => {
    void (async () => {
      if (raw == null || typeof raw !== 'object') return
      const msg = raw as HostWorkerParentMessage
      try {
        if (msg.type === 'ping') {
          const out: HostWorkerChildMessage = { type: 'pong', id: msg.id }
          port.postMessage(out)
          return
        }
        if (msg.type === 'gate_reply') {
          const resolve = pendingGateReplies.get(msg.id)
          if (resolve) {
            pendingGateReplies.delete(msg.id)
            resolve(msg.observation)
          }
          return
        }
        if (msg.type === 'simulate_crash') {
          if (loopOpts?.onSimulateCrash) {
            loopOpts.onSimulateCrash()
            return
          }
          process.exit(1)
          return
        }
        if (msg.type === 'load_extension') {
          try {
            await runExtensionSourceInVm(
              String(msg.source ?? ''),
              String(msg.extensionId ?? ''),
              callGateFromVm,
            )
            const ok: HostWorkerChildMessage = { type: 'load_ok', id: msg.id }
            port.postMessage(ok)
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            const fail: HostWorkerChildMessage = {
              type: 'load_error',
              id: msg.id,
              error,
            }
            port.postMessage(fail)
          }
          return
        }
        if (msg.type === 'request_gate') {
          const token = String(msg.token ?? '')
          const args =
            msg.args && typeof msg.args === 'object' ? msg.args : {}
          const gateAsk: HostWorkerChildMessage = {
            type: 'gate',
            id: msg.id,
            token,
            args,
          }
          const observation = await new Promise<CapabilityObservation>((resolve) => {
            pendingGateReplies.set(msg.id, resolve)
            port.postMessage(gateAsk)
          })
          const done: HostWorkerChildMessage = {
            type: 'gate_done',
            id: msg.id,
            observation,
          }
          port.postMessage(done)
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        const id =
          raw != null &&
          typeof raw === 'object' &&
          typeof (raw as { id?: unknown }).id === 'string'
            ? (raw as { id: string }).id
            : undefined
        const out: HostWorkerChildMessage = { type: 'error', id, error }
        port.postMessage(out)
      }
    })()
  })
}

/**
 * In-process MessageChannel pair that runs the same worker loop.
 * Useful when real Worker path resolution is awkward in tests.
 */
export function createInProcessHostWorkerHandle(): ExtensionHostWorkerHandle {
  const { port1, port2 } = new MessageChannel()
  let alive = true
  const errorListeners: Array<(err: Error) => void> = []
  const exitListeners: Array<(code: number) => void> = []

  const crash = (): void => {
    if (!alive) return
    alive = false
    const err = new Error('host-worker simulate_crash')
    for (const l of errorListeners) {
      try {
        l(err)
      } catch {
        // soft
      }
    }
    try {
      port1.close()
    } catch {
      // soft
    }
    try {
      port2.close()
    } catch {
      // soft
    }
    for (const l of exitListeners) {
      try {
        l(1)
      } catch {
        // soft
      }
    }
  }

  attachHostWorkerLoop(port2, { onSimulateCrash: crash })

  return {
    postMessage(msg: unknown): void {
      if (!alive) throw new Error('host worker not alive')
      port1.postMessage(msg)
    },
    on(
      event: 'message' | 'error' | 'exit',
      listener: ((msg: unknown) => void) | ((err: Error) => void) | ((code: number) => void),
    ): void {
      if (event === 'message') {
        port1.on('message', listener as (msg: unknown) => void)
        return
      }
      if (event === 'error') {
        errorListeners.push(listener as (err: Error) => void)
        return
      }
      exitListeners.push(listener as (code: number) => void)
    },
    async terminate(): Promise<number> {
      if (!alive) return 0
      alive = false
      try {
        port1.close()
      } catch {
        // soft
      }
      try {
        port2.close()
      } catch {
        // soft
      }
      for (const l of exitListeners) {
        try {
          l(0)
        } catch {
          // soft
        }
      }
      return 0
    },
  }
}

export function createExtensionHostSupervisor(
  opts: CreateExtensionHostSupervisorOptions,
): ExtensionHostSupervisor {
  const timeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const entryPath = opts.workerEntryPath ?? defaultWorkerEntryPath()

  let status: HostWorkerStatus = 'stopped'
  let handle: ExtensionHostWorkerHandle | null = null
  let intentionalStop = false

  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (err: Error) => void
      timer: ReturnType<typeof setTimeout>
      kind: 'ping' | 'gate' | 'load'
    }
  >()

  function clearPending(err: Error): void {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    pending.clear()
  }

  function markCrashed(): void {
    if (intentionalStop) return
    status = 'crashed'
    handle = null
    clearPending(new Error('host worker crashed'))
  }

  function onMessage(raw: unknown): void {
    if (raw == null || typeof raw !== 'object') return
    const msg = raw as HostWorkerChildMessage

    if (msg.type === 'pong') {
      const p = pending.get(msg.id)
      if (p && p.kind === 'ping') {
        clearTimeout(p.timer)
        pending.delete(msg.id)
        p.resolve({ ok: true as const })
      }
      return
    }

    if (msg.type === 'gate') {
      void (async () => {
        const token = String(msg.token ?? '')
        const args = msg.args && typeof msg.args === 'object' ? msg.args : {}
        let observation: CapabilityObservation
        try {
          observation = await opts.invokeViaGateway(
            {
              token,
              args,
              principal: { kind: 'extension', id: 'host-worker' },
            },
            async () => ({ hostWorkerEcho: true, token, args }),
          )
        } catch (err) {
          observation = {
            ok: false,
            denialCode: 'host_worker_gate_error',
            auditId: randomUUID(),
            message: err instanceof Error ? err.message : String(err),
          }
        }
        try {
          handle?.postMessage({
            type: 'gate_reply',
            id: msg.id,
            observation,
          } satisfies HostWorkerParentMessage)
        } catch {
          // soft
        }
      })()
      return
    }

    if (msg.type === 'gate_done') {
      const p = pending.get(msg.id)
      if (p && p.kind === 'gate') {
        clearTimeout(p.timer)
        pending.delete(msg.id)
        p.resolve(msg.observation)
      }
      return
    }

    if (msg.type === 'load_ok') {
      const p = pending.get(msg.id)
      if (p && p.kind === 'load') {
        clearTimeout(p.timer)
        pending.delete(msg.id)
        p.resolve({ ok: true as const })
      }
      return
    }

    if (msg.type === 'load_error') {
      const p = pending.get(msg.id)
      if (p && p.kind === 'load') {
        clearTimeout(p.timer)
        pending.delete(msg.id)
        p.resolve({ ok: false as const, error: msg.error })
      }
      return
    }

    if (msg.type === 'error' && msg.id) {
      const p = pending.get(msg.id)
      if (p) {
        clearTimeout(p.timer)
        pending.delete(msg.id)
        p.reject(new Error(msg.error))
      }
    }
  }

  function wireHandle(h: ExtensionHostWorkerHandle): void {
    h.on('message', onMessage)
    h.on('error', () => {
      if (!intentionalStop) markCrashed()
    })
    h.on('exit', () => {
      if (!intentionalStop) markCrashed()
      else {
        status = 'stopped'
        handle = null
      }
    })
  }

  return {
    status(): HostWorkerStatus {
      return status
    },

    async start(): Promise<void> {
      if (status === 'running' && handle) return
      intentionalStop = false
      try {
        const next = opts.workerFactory
          ? await opts.workerFactory()
          : wrapRealWorker(
              new Worker(entryPath, {
                workerData: { role: 'extension-host' },
              }),
            )
        handle = next
        wireHandle(next)
        status = 'running'
      } catch (err) {
        status = 'crashed'
        handle = null
        throw err instanceof Error ? err : new Error(String(err))
      }
    },

    async stop(): Promise<void> {
      intentionalStop = true
      const h = handle
      handle = null
      clearPending(new Error('host worker stopped'))
      if (!h) {
        status = 'stopped'
        return
      }
      try {
        await h.terminate()
      } catch {
        // soft
      }
      status = 'stopped'
    },

    async ping(): Promise<{ ok: true }> {
      if (status !== 'running' || !handle) {
        throw new Error('host worker not running')
      }
      const id = randomUUID()
      return new Promise<{ ok: true }>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`host worker ping timeout after ${timeoutMs}ms`))
        }, timeoutMs)
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timer,
          kind: 'ping',
        })
        try {
          handle!.postMessage({ type: 'ping', id } satisfies HostWorkerParentMessage)
        } catch (err) {
          clearTimeout(timer)
          pending.delete(id)
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
    },

    async requestGate(
      token: string,
      args?: Record<string, unknown>,
    ): Promise<CapabilityObservation> {
      if (status !== 'running' || !handle) {
        return {
          ok: false,
          denialCode: 'host_worker_unavailable',
          auditId: randomUUID(),
          message: 'host worker not running',
        }
      }
      const id = randomUUID()
      const safeArgs = args ?? {}
      return new Promise<CapabilityObservation>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`host worker gate timeout after ${timeoutMs}ms`))
        }, timeoutMs)
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timer,
          kind: 'gate',
        })
        try {
          handle!.postMessage({
            type: 'request_gate',
            id,
            token,
            args: safeArgs,
          } satisfies HostWorkerParentMessage)
        } catch (err) {
          clearTimeout(timer)
          pending.delete(id)
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
    },

    async loadExtension(
      extensionId: string,
      source: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      if (status !== 'running' || !handle) {
        return { ok: false, error: 'host worker not running' }
      }
      const id = randomUUID()
      const loadTimeout = Math.max(timeoutMs, DEFAULT_LOAD_TIMEOUT_MS)
      return new Promise<{ ok: true } | { ok: false; error: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          resolve({
            ok: false,
            error: `host worker load timeout after ${loadTimeout}ms`,
          })
        }, loadTimeout)
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timer,
          kind: 'load',
        })
        try {
          handle!.postMessage({
            type: 'load_extension',
            id,
            extensionId,
            source,
          } satisfies HostWorkerParentMessage)
        } catch (err) {
          clearTimeout(timer)
          pending.delete(id)
          resolve({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })
    },

    async simulateCrash(): Promise<void> {
      if (!handle) {
        status = 'crashed'
        return
      }
      intentionalStop = false
      try {
        handle.postMessage({ type: 'simulate_crash' } satisfies HostWorkerParentMessage)
      } catch {
        markCrashed()
      }
    },
  }
}
