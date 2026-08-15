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

/** OpenCode once/always 风格用户向文案；id 与 sticky 语义不变 */
export const CONFIRM_OPTIONS = {
  overwrite: [
    { id: 'once', label: '仅此一次' },
    { id: 'sticky', label: '本对话同类操作都允许' },
    { id: 'cancel', label: '取消' },
  ],
  delete: [
    { id: 'once', label: '仅此一次' },
    { id: 'sticky', label: '本对话同类操作都允许' },
    { id: 'cancel', label: '取消' },
  ],
} as const

/** 预留：doom_loop 确认文案（后端未接前勿挂交互） */
export const DOOM_LOOP_CONFIRM_OPTIONS = [
  { id: 'once', label: '仅此一次' },
  { id: 'always', label: '本对话同类操作都允许' },
  { id: 'cancel', label: '取消' },
] as const

export type ConfirmChoice = 'once' | 'sticky' | 'cancel'

export function parseConfirmChoice(
  selectedIds: readonly string[],
): ConfirmChoice {
  const id = selectedIds[0] ?? 'cancel'
  if (id === 'once' || id === 'sticky' || id === 'cancel') return id
  return 'cancel'
}
