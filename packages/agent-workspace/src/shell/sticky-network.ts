/** 会话级「允许联网安装」sticky — 内存存储，会话结束即失效 */
export class NetworkInstallStickyStore {
  private readonly sessions = new Set<string>()
  /** 预授权 once：下次 requireNetworkInstallConfirmation 时 consume 并跳过弹窗 */
  private readonly preflight = new Set<string>()

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  grant(sessionId: string): void {
    this.sessions.add(sessionId)
    this.preflight.delete(sessionId)
  }

  /** 预唤起确认选「仅此一次」→ 下一次安装联网确认跳过（消费式） */
  grantPreflight(sessionId: string): void {
    if (this.sessions.has(sessionId)) return
    this.preflight.add(sessionId)
  }

  hasPreflight(sessionId: string): boolean {
    return this.preflight.has(sessionId)
  }

  /** 若有 preflight once 则消费并返回 true（调用方应跳过弹窗） */
  consumePreflight(sessionId: string): boolean {
    if (!this.preflight.has(sessionId)) return false
    this.preflight.delete(sessionId)
    return true
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.preflight.delete(sessionId)
  }
}

export const NETWORK_INSTALL_CONFIRM_OPTIONS = [
  { id: 'once', label: '仅此一次' },
  { id: 'sticky', label: '本对话同类操作都允许' },
  { id: 'cancel', label: '取消' },
] as const

export type NetworkInstallConfirmChoice = 'once' | 'sticky' | 'cancel'

export function parseNetworkInstallChoice(
  selectedIds: readonly string[],
): NetworkInstallConfirmChoice {
  const id = selectedIds[0] ?? 'cancel'
  if (id === 'once' || id === 'sticky' || id === 'cancel') return id
  return 'cancel'
}
