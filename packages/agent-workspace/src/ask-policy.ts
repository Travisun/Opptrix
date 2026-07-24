export type StickyOperation = 'overwrite' | 'delete'

/** 会话级 sticky 策略 — 内存存储，deleteSession 后失效 */
export class StickyPolicyStore {
  private readonly sticky = new Map<string, Set<string>>()

  private key(sessionId: string, rootId: string, operation: StickyOperation): string {
    return `${rootId}:${operation}`
  }

  has(sessionId: string, rootId: string, operation: StickyOperation): boolean {
    const set = this.sticky.get(sessionId)
    if (!set) return false
    return set.has(this.key(sessionId, rootId, operation))
  }

  grant(sessionId: string, rootId: string, operation: StickyOperation): void {
    const set = this.sticky.get(sessionId) ?? new Set<string>()
    set.add(this.key(sessionId, rootId, operation))
    this.sticky.set(sessionId, set)
  }

  clearSession(sessionId: string): void {
    this.sticky.delete(sessionId)
  }
}

export const CONFIRM_OPTIONS = {
  overwrite: [
    { id: 'once', label: '仅此一次覆盖' },
    { id: 'sticky', label: '本对话此目录一律允许覆盖' },
    { id: 'cancel', label: '取消' },
  ],
  delete: [
    { id: 'once', label: '仅此一次删除' },
    { id: 'sticky', label: '本对话此目录一律允许删除' },
    { id: 'cancel', label: '取消' },
  ],
} as const

export type ConfirmChoice = 'once' | 'sticky' | 'cancel'

export function parseConfirmChoice(
  selectedIds: readonly string[],
): ConfirmChoice {
  const id = selectedIds[0] ?? 'cancel'
  if (id === 'once' || id === 'sticky' || id === 'cancel') return id
  return 'cancel'
}
