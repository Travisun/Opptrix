import type { OpenAiTool } from '../tools.js'
import { formatOutboundFetchError, outboundFetch } from './outbound-fetch.js'
import { parseOpenAiUsage, type TokenUsage } from './token-usage.js'
import { parseAssistantResponseContent } from '../content-parts.js'

export interface LlmConfig {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  temperature?: number
  maxTokens?: number
  timeout?: number
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface TextContentPart {
  type: 'text'
  text: string
}

export interface ImageUrlContentPart {
  type: 'image_url'
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' }
}

export interface FileContentPart {
  type: 'file'
  file: { filename: string; file_data: string }
}

export interface InputAudioContentPart {
  type: 'input_audio'
  input_audio: { data: string; format: string }
}

export type ContentPart =
  | TextContentPart
  | ImageUrlContentPart
  | FileContentPart
  | InputAudioContentPart

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null | ContentPart[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface LlmTurn {
  message: ChatMessage
  finishReason: 'stop' | 'tool_calls' | 'error'
  error?: string
  /** 上游响应表明上下文超限 */
  contextOverflow?: boolean
  usage?: TokenUsage
  /** 从模型原生 content parts 解析出的输出媒体 */
  outputAttachments?: import('./../media-types.js').ChatAttachmentMeta[]
}

export type LlmChatDelta = { text?: string; hasToolCalls?: boolean }

export interface LlmChatOpts {
  sessionId?: string
  /** 传入时走 SSE 流式；文本增量与 tool_calls 发现会回调 */
  onDelta?: (delta: LlmChatDelta) => void
  /** 本轮覆盖；未设则回退 LlmConfig / 默认 1 */
  temperature?: number
  /** 本轮覆盖；未设则回退 LlmConfig / 默认 4096 */
  maxTokens?: number
  /** 有值时写入 body.reasoning_effort */
  reasoningEffort?: 'low' | 'medium' | 'high'
}

export interface LlmProvider {
  chat(
    messages: ChatMessage[],
    tools?: OpenAiTool[],
    signal?: AbortSignal,
    opts?: LlmChatOpts,
  ): Promise<LlmTurn>
  listModels(): Promise<string[]>
}

export function isConfigured(cfg: LlmConfig) {
  return Boolean(cfg.apiKey && cfg.baseUrl)
}

export function createProvider(cfg: LlmConfig): LlmProvider {
  return new OpenAiCompatibleProvider(cfg)
}

function isContextLengthHttpError(status: number, body: string): boolean {
  const text = body.toLowerCase()
  if (
    text.includes('context_length_exceeded')
    || text.includes('context length')
    || text.includes('maximum context')
    || text.includes('too many tokens')
    || text.includes('prompt is too long')
    || text.includes('token limit')
    || (text.includes('context window') && text.includes('exceed'))
  ) {
    return true
  }
  // 部分网关用 400/413 表示超限
  if ((status === 400 || status === 413) && (
    text.includes('token') || text.includes('context') || text.includes('length')
  )) {
    return /exceed|too (?:long|large|many)|maximum|limit/i.test(text)
  }
  return false
}

function serializeMessageContent(content: ChatMessage['content']): string | ContentPart[] | null {
  if (content == null) return null
  if (typeof content === 'string') return content
  return content
}

function serializeMessage(m: ChatMessage): Record<string, unknown> {
  const content = serializeMessageContent(m.content)
  return {
    role: m.role,
    ...(m.role === 'assistant' && m.tool_calls
      ? { content: content ?? null }
      : { content: content ?? '' }),
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    ...(m.name ? { name: m.name } : {}),
  }
}

function httpErrorTurn(status: number, bodyText: string): LlmTurn {
  const overflow = isContextLengthHttpError(status, bodyText)
  const msg = status === 401
    ? '⚠️ API Key 无效'
    : status === 429
      ? '⚠️ 请求过于频繁'
      : overflow
        ? '对话内容过多，正在整理后重试…'
        : `⚠️ HTTP ${status}: ${bodyText}`
  return {
    message: { role: 'assistant', content: msg },
    finishReason: 'error',
    error: overflow ? 'context_length_exceeded' : msg,
    contextOverflow: overflow,
  }
}

function extractDeltaText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((p): p is { type: 'text'; text: string } =>
      typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text'
      && typeof (p as { text?: unknown }).text === 'string')
    .map(p => p.text)
    .join('')
}

function turnFromAssistantMessage(
  raw: {
    content?: string | null | unknown[]
    tool_calls?: ToolCall[]
  },
  usage: TokenUsage | undefined,
  sessionId?: string,
): LlmTurn {
  if (raw.tool_calls?.length) {
    return {
      message: {
        role: 'assistant',
        content: typeof raw.content === 'string' ? raw.content : null,
        tool_calls: raw.tool_calls,
      },
      finishReason: 'tool_calls',
      usage,
    }
  }

  if (sessionId && Array.isArray(raw.content)) {
    const parsed = parseAssistantResponseContent(sessionId, raw.content)
    return {
      message: { role: 'assistant', content: parsed.text || '（无回复内容）' },
      finishReason: 'stop',
      usage,
      outputAttachments: parsed.attachments.length ? parsed.attachments : undefined,
    }
  }

  const textContent = typeof raw.content === 'string'
    ? raw.content
    : Array.isArray(raw.content)
      ? raw.content
        .filter((p): p is { type: 'text'; text: string } =>
          typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text'
          && typeof (p as { text?: unknown }).text === 'string')
        .map(p => p.text)
        .join('\n')
      : ''

  return {
    message: { role: 'assistant', content: textContent ?? '' },
    finishReason: 'stop',
    usage,
  }
}

async function consumeChatCompletionSse(
  resp: Response,
  opts: LlmChatOpts | undefined,
): Promise<LlmTurn> {
  const onDelta = opts?.onDelta
  const body = resp.body
  if (!body) {
    throw new Error('empty_stream_body')
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let finishReason: string | undefined
  let usage: TokenUsage | undefined
  let sawToolCalls = false
  const toolCallsByIndex = new Map<number, ToolCall>()

  const mergeToolCallDelta = (delta: {
    index?: number
    id?: string
    type?: string
    function?: { name?: string; arguments?: string }
  }) => {
    const index = typeof delta.index === 'number' ? delta.index : 0
    let current = toolCallsByIndex.get(index)
    if (!current) {
      current = {
        id: '',
        type: 'function',
        function: { name: '', arguments: '' },
      }
      toolCallsByIndex.set(index, current)
    }
    if (delta.id) current.id = delta.id
    if (delta.function?.name) current.function.name += delta.function.name
    if (delta.function?.arguments) current.function.arguments += delta.function.arguments
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        if (payload === '[DONE]') continue

        let parsed: {
          usage?: unknown
          choices?: Array<{
            finish_reason?: string | null
            delta?: {
              content?: string | null | unknown[]
              tool_calls?: Array<{
                index?: number
                id?: string
                type?: string
                function?: { name?: string; arguments?: string }
              }>
            }
          }>
        }
        try {
          parsed = JSON.parse(payload) as typeof parsed
        } catch {
          continue
        }

        const chunkUsage = parseOpenAiUsage(parsed.usage)
        if (chunkUsage) usage = chunkUsage

        const choice = parsed.choices?.[0]
        if (!choice) continue
        if (choice.finish_reason) finishReason = choice.finish_reason

        const delta = choice.delta
        if (!delta) continue

        const text = extractDeltaText(delta.content)
        if (text) {
          content += text
          onDelta?.({ text })
        }

        if (delta.tool_calls?.length) {
          if (!sawToolCalls) {
            sawToolCalls = true
            onDelta?.({ hasToolCalls: true })
          }
          for (const tc of delta.tool_calls) {
            mergeToolCallDelta(tc)
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, tc]) => tc)
    .filter(tc => tc.id || tc.function.name)

  if (toolCalls.length || finishReason === 'tool_calls') {
    return {
      message: {
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls,
      },
      finishReason: 'tool_calls',
      usage,
    }
  }

  return turnFromAssistantMessage(
    { content },
    usage,
    opts?.sessionId,
  )
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private cfg: LlmConfig) {}

  async chat(
    messages: ChatMessage[],
    tools?: OpenAiTool[],
    signal?: AbortSignal,
    opts?: LlmChatOpts,
  ): Promise<LlmTurn> {
    if (!isConfigured(this.cfg)) {
      return {
        message: { role: 'assistant', content: '[LLM 未配置] 请在设置或环境变量中填入 API Key' },
        finishReason: 'error',
        error: 'not_configured',
      }
    }
    const url = joinOpenAiCompatibleUrl(this.cfg.baseUrl, 'chat/completions')
    const buildBody = (stream: boolean): Record<string, unknown> => {
      const body: Record<string, unknown> = {
        model: this.cfg.model,
        messages: messages.map(serializeMessage),
        temperature: opts?.temperature ?? this.cfg.temperature ?? 1,
        max_tokens: opts?.maxTokens ?? this.cfg.maxTokens ?? 4096,
      }
      if (opts?.reasoningEffort) {
        body.reasoning_effort = opts.reasoningEffort
      }
      if (tools?.length) {
        body.tools = tools
        body.tool_choice = 'auto'
      }
      if (stream) body.stream = true
      return body
    }

    const timeoutSignal = AbortSignal.timeout(this.cfg.timeout ?? 120_000)
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal

    const post = (stream: boolean) => outboundFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildBody(stream)),
      signal: requestSignal,
    })

    const parseJsonTurn = async (resp: Response): Promise<LlmTurn> => {
      const data = await resp.json() as {
        usage?: unknown
        choices?: {
          finish_reason?: string
          message?: {
            content?: string | null | unknown[]
            tool_calls?: ToolCall[]
          }
        }[]
      }
      const raw = data.choices?.[0]?.message
      const usage = parseOpenAiUsage(data.usage)
      if (!raw) {
        return {
          message: { role: 'assistant', content: '⚠️ API 返回格式异常' },
          finishReason: 'error',
          error: 'bad_response',
        }
      }
      return turnFromAssistantMessage(raw, usage, opts?.sessionId)
    }

    try {
      if (opts?.onDelta) {
        let streamConsumeStarted = false
        try {
          const streamResp = await post(true)
          if (!streamResp.ok) {
            const text = (await streamResp.text()).slice(0, 300)
            // 部分上游不支持 stream：回退非流式
            if (streamResp.status === 400 || streamResp.status === 422) {
              const fallback = await post(false)
              if (!fallback.ok) {
                return httpErrorTurn(fallback.status, (await fallback.text()).slice(0, 300))
              }
              return await parseJsonTurn(fallback)
            }
            return httpErrorTurn(streamResp.status, text)
          }
          if (!streamResp.body) {
            const fallback = await post(false)
            if (!fallback.ok) {
              return httpErrorTurn(fallback.status, (await fallback.text()).slice(0, 300))
            }
            return await parseJsonTurn(fallback)
          }
          streamConsumeStarted = true
          return await consumeChatCompletionSse(streamResp, opts)
        } catch (streamErr) {
          if (signal?.aborted) {
            const msg = '已取消'
            return { message: { role: 'assistant', content: msg }, finishReason: 'error', error: 'cancelled' }
          }
          // 尚未开始读流时回退非流式；中途失败不再重放整轮
          if (!streamConsumeStarted) {
            const fallback = await post(false)
            if (!fallback.ok) {
              return httpErrorTurn(fallback.status, (await fallback.text()).slice(0, 300))
            }
            return await parseJsonTurn(fallback)
          }
          throw streamErr
        }
      }

      const resp = await post(false)
      if (!resp.ok) {
        return httpErrorTurn(resp.status, (await resp.text()).slice(0, 300))
      }
      return await parseJsonTurn(resp)
    } catch (e) {
      if (signal?.aborted) {
        const msg = '已取消'
        return { message: { role: 'assistant', content: msg }, finishReason: 'error', error: 'cancelled' }
      }
      const msg = `⚠️ ${formatOutboundFetchError(e)}`
      return { message: { role: 'assistant', content: msg }, finishReason: 'error', error: msg }
    }
  }

  async listModels() {
    return fetchOpenAiModelList(this.cfg.baseUrl, this.cfg.apiKey).catch(() => [])
  }
}

/**
 * 将用户/预置给出的 OpenAI 兼容根地址与相对资源路径拼接。
 *
 * 契约（硬性）：
 * - baseUrl **原样**使用（仅 trim、去尾斜杠），**不**自动补 `/v1`，**不**剥任何路径段
 * - 路径因提供商而异（`/v1`、`/paas/v4`、`/compatible-mode/v1`、`/openai`、无版本后缀等），由配置方填写完整根
 * - relativePath 如 `models`、`chat/completions`；若 base 已以该相对路径结尾则不再重复拼接
 */
export function joinOpenAiCompatibleUrl(baseUrl: string, relativePath: string): string {
  const root = baseUrl.trim().replace(/\/+$/, '')
  const path = relativePath.trim().replace(/^\/+/, '')
  if (!path) return root
  if (!root) return `/${path}`
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`/${escaped}$`, 'i').test(root)) return root
  return `${root}/${path}`
}

/** OpenAI 兼容 GET {baseUrl}/models — 见 {@link joinOpenAiCompatibleUrl}。 */
export async function fetchOpenAiModelList(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = joinOpenAiCompatibleUrl(baseUrl, 'models')
  const resp = await outboundFetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!resp.ok) {
    const text = (await resp.text()).slice(0, 200)
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  const data = await resp.json() as { data?: { id: string }[] }
  const ids = (data.data ?? []).map(m => m.id).filter(Boolean)
  return [...new Set(ids)].sort()
}
