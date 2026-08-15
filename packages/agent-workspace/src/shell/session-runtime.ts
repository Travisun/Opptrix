/**
 * 会话级 SRT 句柄 — 同 configHash 复用；仅 initialize/reset 全局串行。
 * spawn 不进本互斥。
 */
import { createHash } from 'node:crypto'
import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from '@anthropic-ai/sandbox-runtime'

export type ShellIsolation = 'full' | 'basic'

type SandboxAskCallback = (params: {
  host: string
  port: number | undefined
}) => Promise<boolean>

export interface SessionSrtAcquireResult {
  configHash: string
  isolation: 'full'
}

type GlobalSrtState = {
  configHash: string
  /** 可变：每 run 更新，避免同 hash 复用时 confirm 句柄过期 */
  askCallbackRef: { current?: SandboxAskCallback }
  refSessions: Set<string>
}

let srtChain: Promise<unknown> = Promise.resolve()

function withSrtMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = srtChain.then(fn, fn)
  srtChain = run.then(() => undefined, () => undefined)
  return run
}

let globalSrt: GlobalSrtState | null = null

export function hashSandboxConfig(config: SandboxRuntimeConfig): string {
  return createHash('sha256')
    .update(JSON.stringify(config))
    .digest('hex')
    .slice(0, 24)
}

interface SessionEntry {
  configHash: string | null
  lastUsedAt: number
}

/**
 * 进程内会话 → SRT 引用。clearSession / disposeAll 必须回收。
 */
export class SessionShellRuntime {
  private readonly sessions = new Map<string, SessionEntry>()

  private getOrCreate(sessionId: string): SessionEntry {
    let entry = this.sessions.get(sessionId)
    if (!entry) {
      entry = { configHash: null, lastUsedAt: Date.now() }
      this.sessions.set(sessionId, entry)
    }
    return entry
  }

  /**
   * 确保完整隔离 SRT 已按 config 初始化。
   * 同 hash：跳过 initialize；异 hash：串行 reset + initialize。
   */
  async acquireFullSrt(
    sessionId: string,
    config: SandboxRuntimeConfig,
    askCallback?: SandboxAskCallback,
  ): Promise<SessionSrtAcquireResult> {
    const configHash = hashSandboxConfig(config)
    const entry = this.getOrCreate(sessionId)

    await withSrtMutex(async () => {
      if (globalSrt?.configHash === configHash) {
        globalSrt.askCallbackRef.current = askCallback
        globalSrt.refSessions.add(sessionId)
        entry.configHash = configHash
        entry.lastUsedAt = Date.now()
        return
      }

      if (globalSrt) {
        try {
          await SandboxManager.reset()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[agent-workspace] SRT reset before rebuild failed: ${msg}`)
        }
        globalSrt = null
      }

      const askCallbackRef: { current?: SandboxAskCallback } = { current: askCallback }
      const wrappedAsk: SandboxAskCallback | undefined = askCallback
        ? async (params) => {
          const fn = askCallbackRef.current
          if (!fn) return false
          return fn(params)
        }
        : undefined

      await SandboxManager.initialize(config, wrappedAsk)
      globalSrt = {
        configHash,
        askCallbackRef,
        refSessions: new Set([sessionId]),
      }
      entry.configHash = configHash
      entry.lastUsedAt = Date.now()
    })

    return { configHash, isolation: 'full' }
  }

  /** 幂等：清会话引用；若无私有引用则 reset 全局 SRT */
  async disposeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
    await withSrtMutex(async () => {
      if (!globalSrt) return
      globalSrt.refSessions.delete(sessionId)
      if (globalSrt.refSessions.size > 0) return
      try {
        await SandboxManager.reset()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[agent-workspace] SRT reset on dispose failed: ${msg}`)
      }
      globalSrt = null
    })
  }

  async disposeAll(): Promise<void> {
    this.sessions.clear()
    await withSrtMutex(async () => {
      if (!globalSrt) return
      try {
        await SandboxManager.reset()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[agent-workspace] SRT reset on disposeAll failed: ${msg}`)
      }
      globalSrt = null
    })
  }

  /** 测试：当前全局 SRT hash（无则 null） */
  getActiveConfigHashForTests(): string | null {
    return globalSrt?.configHash ?? null
  }

  hasSessionForTests(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }
}

let singleton: SessionShellRuntime | null = null

export function getSessionShellRuntime(): SessionShellRuntime {
  if (!singleton) singleton = new SessionShellRuntime()
  return singleton
}

/** 测试隔离：重置单例与全局 SRT 状态引用（不保证已 reset 引擎） */
export async function resetSessionShellRuntimeForTests(): Promise<void> {
  if (singleton) {
    await singleton.disposeAll()
  }
  singleton = null
  globalSrt = null
}
