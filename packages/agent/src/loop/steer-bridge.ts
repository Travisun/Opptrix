/**
 * Soft steer — 运行中注入补充说明，不 abort。
 * 按 session 排队；下一 runLlmRound 前 consume。
 */
export class SteerBridge {
  private readonly pending = new Map<string, string[]>()

  enqueue(sessionId: string, message: string): void {
    const text = message.trim()
    if (!text) return
    const list = this.pending.get(sessionId) ?? []
    list.push(text)
    this.pending.set(sessionId, list)
  }

  /** 取出并清空该会话全部 pending */
  consume(sessionId: string): string[] {
    const list = this.pending.get(sessionId) ?? []
    this.pending.delete(sessionId)
    return list
  }

  peek(sessionId: string): readonly string[] {
    return this.pending.get(sessionId) ?? []
  }

  clear(sessionId: string): void {
    this.pending.delete(sessionId)
  }

  hasPending(sessionId: string): boolean {
    return (this.pending.get(sessionId)?.length ?? 0) > 0
  }
}

export function formatSteerUserMessage(message: string): string {
  const text = message.trim()
  return text.startsWith('（补充）') ? text : `（补充）${text}`
}
