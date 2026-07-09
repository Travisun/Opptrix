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
}

/** 用户作答结果 — 回传给 Agent 工具输出 */
export interface UserPromptAnswer {
  kind: 'option' | 'custom'
  selected_ids: string[]
  selected_labels: string[]
  custom_text?: string
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
 * 进程内问答桥 — Agent 调用 ask_user 时挂起，待客户端 POST 作答后恢复。
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

export function normalizeUserPromptOptions(raw: unknown): UserPromptOption[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 5) return null
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

  const options = normalizeUserPromptOptions(args.options)
  if (!options) {
    return { error: 'options 须为 2–5 个对象数组，每项含 id 与 label' }
  }

  const titleRaw = args.title
  const title = titleRaw == null ? undefined : String(titleRaw).trim() || undefined

  return {
    payload: {
      prompt,
      title,
      options,
      allowMultiple: Boolean(args.allow_multiple ?? args.allowMultiple),
    },
  }
}
