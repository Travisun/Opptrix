/** 会话级「允许运行命令」sticky — 内存存储，会话结束即失效 */
export class ShellRunStickyStore {
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

export const SHELL_RUN_CONFIRM_OPTIONS = [
  { id: 'allow_once', label: '仅此一次' },
  { id: 'allow_session', label: '本对话一律允许' },
  { id: 'cancel', label: '取消' },
] as const

export type ShellRunConfirmChoice = 'allow_once' | 'allow_session' | 'cancel'

export function parseShellRunConfirmChoice(
  selectedIds: readonly string[],
): ShellRunConfirmChoice {
  const id = selectedIds[0] ?? 'cancel'
  if (id === 'allow_once' || id === 'allow_session' || id === 'cancel') return id
  return 'cancel'
}

/** 将 argv 拼成用户可见的命令摘要（截断） */
export function summarizeShellArgv(argv: readonly string[], maxLen = 120): string {
  const joined = argv.join(' ').trim()
  if (!joined) return '（空命令）'
  return joined.length <= maxLen ? joined : `${joined.slice(0, maxLen)}…`
}
