/** 会话级「允许联网安装」sticky — 内存存储，会话结束即失效 */
export class NetworkInstallStickyStore {
  private readonly sessions = new Set<string>()

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  grant(sessionId: string): void {
    this.sessions.add(sessionId)
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}

export const NETWORK_INSTALL_CONFIRM_OPTIONS = [
  { id: 'once', label: '仅此一次允许联网安装' },
  { id: 'sticky', label: '本对话一律允许联网安装' },
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
