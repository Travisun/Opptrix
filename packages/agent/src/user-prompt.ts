import { randomUUID } from 'node:crypto'

export class UserPromptCancelledError extends Error {
  constructor() {
    super('已取消')
    this.name = 'UserPromptCancelledError'
  }
}

/** 问答题选项 — Agent ask_user 工具预置选项 */
export interface UserPromptOption {
  id: string
  label: string
}

/** 推送给客户端的问答面板载荷 */
export interface UserPromptPayload {
  id: string
  title?: string
  prompt: string
  options: UserPromptOption[]
  allowMultiple?: boolean
  /** choice=普通选项；secret=保险箱密码录入 */
  kind?: 'choice' | 'secret'
  /** kind=secret 时的保险箱条目名 */
  name?: string
  /** kind=secret 时建议的 inject_hosts */
  inject_hosts?: string[]
}

/** 用户作答结果 — 回传给 Agent 工具输出（secret 永不含明文） */
export interface UserPromptAnswer {
  kind: 'option' | 'custom' | 'secret'
  selected_ids: string[]
  selected_labels: string[]
  custom_text?: string
  /** kind=secret：保险箱条目名 */
  name?: string
  /** kind=secret：是否已写入保险箱 */
  saved?: boolean
  /** kind=secret：是否已授予本会话 */
  session_granted?: boolean
  /** kind=secret：用户取消 */
  cancelled?: boolean
}

interface PendingPrompt {
  resolve: (answer: UserPromptAnswer) => void
  reject: (err: Error) => void
  abortCleanup?: () => void
}

function sessionPrefix(sessionId: string) {
  return `${sessionId}:`
}

/**
 * 进程内问答桥 — Agent 调用 ask_user / request_secret 时挂起，待客户端 POST 作答后恢复。
 * 每个 AgentEngine 实例持有一个 bridge；按 sessionId + promptId 匹配 pending。
 */
export class UserPromptBridge {
  private readonly pending = new Map<string, PendingPrompt>()

  waitForAnswer(
    sessionId: string,
    promptId: string,
    signal?: AbortSignal,
  ): Promise<UserPromptAnswer> {
    const key = `${sessionId}:${promptId}`
    if (this.pending.has(key)) {
      return Promise.reject(new Error('duplicate user prompt id'))
    }

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(key)
        reject(new UserPromptCancelledError())
      }
      if (signal) {
        if (signal.aborted) {
          reject(new UserPromptCancelledError())
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      this.pending.set(key, {
        resolve: (answer) => {
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve(answer)
        },
        reject: (err) => {
          if (signal) signal.removeEventListener('abort', onAbort)
          reject(err)
        },
        abortCleanup: signal ? () => signal.removeEventListener('abort', onAbort) : undefined,
      })
    })
  }

  submit(sessionId: string, promptId: string, answer: UserPromptAnswer): boolean {
    const key = `${sessionId}:${promptId}`
    const entry = this.pending.get(key)
    if (!entry) return false
    this.pending.delete(key)
    entry.resolve(answer)
    return true
  }

  cancelSession(sessionId: string) {
    const prefix = sessionPrefix(sessionId)
    for (const [key, entry] of this.pending) {
      if (!key.startsWith(prefix)) continue
      entry.abortCleanup?.()
      entry.reject(new UserPromptCancelledError())
      this.pending.delete(key)
    }
  }
}

export function createUserPromptId() {
  return randomUUID()
}

/** 预置选项下限（单选体验需要至少两项） */
export const USER_PROMPT_OPTIONS_MIN = 2
/** 预置选项软上限（防滥用；超过拒绝） */
export const USER_PROMPT_OPTIONS_MAX = 50

export function normalizeUserPromptOptions(raw: unknown): UserPromptOption[] | null {
  if (!Array.isArray(raw) || raw.length < USER_PROMPT_OPTIONS_MIN || raw.length > USER_PROMPT_OPTIONS_MAX) {
    return null
  }
  const options: UserPromptOption[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const id = String((item as { id?: unknown }).id ?? '').trim()
    const label = String((item as { label?: unknown }).label ?? '').trim()
    if (!id || !label) return null
    options.push({ id, label })
  }
  const ids = new Set(options.map(o => o.id))
  if (ids.size !== options.length) return null
  return options
}

export function parseAskUserArgs(args: Record<string, unknown>): {
  payload?: Omit<UserPromptPayload, 'id'>
  error?: string
} {
  const prompt = String(args.prompt ?? args.question ?? '').trim()
  if (!prompt) return { error: 'prompt 不能为空' }

  const rawOptions = args.options
  if (!Array.isArray(rawOptions)) {
    return { error: `options 须为 ${USER_PROMPT_OPTIONS_MIN}–${USER_PROMPT_OPTIONS_MAX} 个对象数组，每项含 id 与 label` }
  }
  if (rawOptions.length > USER_PROMPT_OPTIONS_MAX) {
    return { error: `选项过多（最多 ${USER_PROMPT_OPTIONS_MAX} 个），请精简后再试` }
  }
  if (rawOptions.length < USER_PROMPT_OPTIONS_MIN) {
    return { error: `请至少提供 ${USER_PROMPT_OPTIONS_MIN} 个选项` }
  }

  const options = normalizeUserPromptOptions(rawOptions)
  if (!options) {
    return { error: `options 须为 ${USER_PROMPT_OPTIONS_MIN}–${USER_PROMPT_OPTIONS_MAX} 个对象数组，每项含唯一 id 与非空 label` }
  }

  const titleRaw = args.title
  const title = titleRaw == null ? undefined : String(titleRaw).trim() || undefined

  return {
    payload: {
      kind: 'choice',
      prompt,
      title,
      options,
      allowMultiple: Boolean(args.allow_multiple ?? args.allowMultiple),
    },
  }
}

/** 规范化保险箱条目名（建议大写蛇形） */
export function normalizeVaultSecretName(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
}
