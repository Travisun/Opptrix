import { AsyncLocalStorage } from 'node:async_hooks'

/** 工具调用期间的会话上下文（避免全局 bridge 在并发/打断重发时串台） */
const toolSessionAls = new AsyncLocalStorage<string>()

export function runInToolSession<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  return toolSessionAls.run(sessionId, fn)
}

export function currentToolSessionId(): string | undefined {
  return toolSessionAls.getStore()
}
