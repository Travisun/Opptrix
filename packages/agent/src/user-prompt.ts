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

/** ask_user 交互模式：确认授权 / 选择题 / 开放填空 */
export type UserPromptMode = 'confirm' | 'choice' | 'text'

/** 推送给客户端的问答面板载荷 */
export interface UserPromptPayload {
  id: string
  title?: string
  prompt: string
  /** 选择题预置选项；confirm/text 模式为空数组 */
  options: UserPromptOption[]
  allowMultiple?: boolean
  /**
   * 交互模式（解析层始终写出，便于 UI 只读 mode）。
   * confirm=拒绝/确认；choice=选项列表；text=仅开放填空。
   */
  mode?: UserPromptMode
  /** choice=普通选项；secret=保险箱密码录入 */
  kind?: 'choice' | 'secret'
  /** kind=secret 时的保险箱条目名 */
  name?: string
  /** kind=secret 时建议的 inject_hosts */
  inject_hosts?: string[]
  /** confirm 模式拒绝按钮文案，默认「拒绝」；回传 id 固定为 reject */
  reject_label?: string
  /** confirm 模式确认按钮文案，默认「确认」；回传 id 固定为 confirm */
  confirm_label?: string
  /**
   * 是否显示「其它，自行输入」。
   * confirm 默认 false；choice 默认 true；text 固定 true。
   */
  allow_custom?: boolean
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

function parseOptionalLabel(raw: unknown, field: string): { label?: string; error?: string } {
  if (raw == null) return {}
  const label = String(raw).trim()
  if (!label) return { error: `${field} 不能为空字符串` }
  return { label }
}

function parseAllowCustom(raw: unknown, defaultValue: boolean): boolean {
  if (raw == null) return defaultValue
  if (typeof raw === 'boolean') return raw
  if (raw === 'true' || raw === 1 || raw === '1') return true
  if (raw === 'false' || raw === 0 || raw === '0') return false
  return Boolean(raw)
}

/** 解析 mode（亦接受参数别名 interaction） */
function parseUserPromptMode(raw: unknown): UserPromptMode | undefined {
  if (raw == null) return undefined
  const s = String(raw).trim().toLowerCase()
  if (s === 'confirm' || s === 'choice' || s === 'text') return s
  if (s === 'yesno' || s === 'yes_no' || s === 'authorization') return 'confirm'
  if (s === 'select' || s === 'options') return 'choice'
  if (s === 'input' || s === 'open' || s === 'freeform') return 'text'
  return undefined
}

export function parseAskUserArgs(args: Record<string, unknown>): {
  payload?: Omit<UserPromptPayload, 'id'>
  error?: string
} {
  const prompt = String(args.prompt ?? args.question ?? '').trim()
  if (!prompt) return { error: 'prompt 不能为空' }

  const titleRaw = args.title
  const title = titleRaw == null ? undefined : String(titleRaw).trim() || undefined
  const explicitMode = parseUserPromptMode(args.mode ?? args.interaction)

  const rawOptions = args.options
  const omitOrEmpty = rawOptions == null
    || (Array.isArray(rawOptions) && rawOptions.length === 0)

  // 无 options：confirm（默认/兼容）或 text（开放填空）
  if (omitOrEmpty) {
    if (explicitMode === 'choice') {
      return {
        error: `choice 模式须提供 ${USER_PROMPT_OPTIONS_MIN}–${USER_PROMPT_OPTIONS_MAX} 个 options`,
      }
    }

    const allowCustom = parseAllowCustom(args.allow_custom ?? args.allowCustom, false)
    // text：显式 mode=text，或空 options 且 allow_custom=true（且未强制 confirm）
    const isText = explicitMode === 'text'
      || (explicitMode !== 'confirm' && allowCustom)

    if (isText) {
      return {
        payload: {
          kind: 'choice',
          mode: 'text',
          prompt,
          title,
          options: [],
          allowMultiple: false,
          allow_custom: true,
        },
      }
    }

    const rejectParsed = parseOptionalLabel(args.reject_label ?? args.rejectLabel, 'reject_label')
    if (rejectParsed.error) return { error: rejectParsed.error }
    const confirmParsed = parseOptionalLabel(args.confirm_label ?? args.confirmLabel, 'confirm_label')
    if (confirmParsed.error) return { error: confirmParsed.error }

    return {
      payload: {
        kind: 'choice',
        mode: 'confirm',
        prompt,
        title,
        options: [],
        allowMultiple: false,
        reject_label: rejectParsed.label,
        confirm_label: confirmParsed.label,
        allow_custom: allowCustom,
      },
    }
  }

  if (!Array.isArray(rawOptions)) {
    return {
      error: `options 须为数组：省略/空数组为 confirm 或 text，或 ${USER_PROMPT_OPTIONS_MIN}–${USER_PROMPT_OPTIONS_MAX} 个选项对象`,
    }
  }
  if (rawOptions.length > USER_PROMPT_OPTIONS_MAX) {
    return { error: `选项过多（最多 ${USER_PROMPT_OPTIONS_MAX} 个），请精简后再试` }
  }
  if (rawOptions.length < USER_PROMPT_OPTIONS_MIN) {
    return {
      error: `选择题请提供至少 ${USER_PROMPT_OPTIONS_MIN} 个选项，或省略 options 使用 confirm/text 模式`,
    }
  }

  const options = normalizeUserPromptOptions(rawOptions)
  if (!options) {
    return {
      error: `options 须为 ${USER_PROMPT_OPTIONS_MIN}–${USER_PROMPT_OPTIONS_MAX} 个对象数组，每项含唯一 id 与非空 label`,
    }
  }

  return {
    payload: {
      kind: 'choice',
      mode: 'choice',
      prompt,
      title,
      options,
      allowMultiple: Boolean(args.allow_multiple ?? args.allowMultiple),
      allow_custom: parseAllowCustom(args.allow_custom ?? args.allowCustom, true),
    },
  }
}

/** 规范化保险箱条目名（建议大写蛇形） */
export function normalizeVaultSecretName(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
}
