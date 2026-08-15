import type { OpenAiTool } from '../tools.js'
import { formatOutboundFetchError, outboundFetch } from './outbound-fetch.js'
import {
  parseOpenAiUsage,
  promptCacheKeyForSession,
  type TokenUsage,
} from './token-usage.js'
import {
  parseAssistantResponseContent,
  sanitizeMessagesForModelMedia,
} from '../content-parts.js'
import { resolveModelMediaCapabilitiesAsync } from './models-dev-context.js'
import {
  createSseChunkSampler,
  logChatDebugAbort,
  logChatDebugHttpError,
  truncateForChatDebug,
} from '../chat-debug-log.js'
import {
  LEGACY_DEFAULT_MAX_TOKENS,
  resolveRequestMaxTokens,
} from './output-budget.js'
import {
  formatLlmHttpUserMessage,
  logLlmHttpError,
  type LlmErrorCfgHint,
} from './llm-error-message.js'
import {
  contentLooksLikeDsmlToolMarkup,
  stripDsmlToolMarkup,
  tryParseDsmlToolCalls,
} from './dsml-tool-markup.js'

export {
  LEGACY_DEFAULT_MAX_TOKENS,
  LEGACY_ORDINARY_OUTPUT_TOKENS,
  ORDINARY_OUTPUT_TOKENS,
  REASONING_OUTPUT_TOKENS,
  HIGH_REASONING_OUTPUT_TOKENS,
  OUTPUT_TOKENS_64K,
  OUTPUT_TOKENS_128K,
  OUTPUT_TOKENS_384K,
  MAX_OUTPUT_TOKENS_PRESETS,
  autoOutputBudget,
  looksLikeReasoningModel,
  resolveRequestMaxTokens,
} from './output-budget.js'

/** 空正文但有思考或输出打满时的用户可见说明（无技术黑话） */
export const EMPTY_REPLY_REASONING_HINT =
  '思考过程占用了本轮输出上限，正文未能写出。请提高本会话的最大输出，或换用更适合长思考的模型。'

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
  /**
   * DeepSeek 等思考链；仅当本字段 !== undefined 时序列化为 `reasoning_content`
   *（含空串，供 tool 轮「丢思考也要带 key」）。
   */
  reasoningContent?: string
}

export interface LlmTurn {
  message: ChatMessage
  finishReason: 'stop' | 'tool_calls' | 'error' | 'length'
  error?: string
  /** 上游响应表明上下文超限 */
  contextOverflow?: boolean
  usage?: TokenUsage
  /** DeepSeek 等推理模型的 thinking 累积（不进 message.content） */
  reasoningContent?: string
  /** 本轮实际请求的 max_tokens（含 ladder） */
  requestedMaxTokens?: number
  /** 从模型原生 content parts 解析出的输出媒体 */
  outputAttachments?: import('./../media-types.js').ChatAttachmentMeta[]
}

export type LlmChatDelta = {
  text?: string
  /** 推理增量（可选；不破坏仅读 text 的旧回调） */
  reasoningText?: string
  hasToolCalls?: boolean
}

/** OpenAI-compatible tool_choice；上游不支持时 provider 会降级为 auto / 省略 */
export type LlmToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } }

export interface LlmChatOpts {
  sessionId?: string
  /** 传入时走 SSE 流式；文本增量与 tool_calls 发现会回调 */
  onDelta?: (delta: LlmChatDelta) => void
  /** 本轮覆盖；未设则回退 LlmConfig / 默认 ladder */
  temperature?: number
  /** 本轮覆盖；未设则回退 LlmConfig / 自动 ladder */
  maxTokens?: number
  /** 有值时写入 body.reasoning_effort */
  reasoningEffort?: 'low' | 'medium' | 'high'
  /**
   * 有 tools 时写入 body.tool_choice；默认 auto。
   * 上游 400/422 时对该字段 fallback（改 auto 或去掉），勿整轮失败。
   */
  toolChoice?: LlmToolChoice
}

/** 供测试与 buildBody 共用：有 tools 时解析 tool_choice 字段 */
export function resolveBodyToolChoice(
  toolsLength: number,
  toolChoice?: LlmToolChoice,
): LlmToolChoice | undefined {
  if (toolsLength <= 0) return undefined
  return toolChoice ?? 'auto'
}

function toolChoiceNeedsFallback(toolChoice: LlmToolChoice | undefined): boolean {
  if (toolChoice == null || toolChoice === 'auto') return false
  return true
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
    // undefined 不写；空串仍写出（tool 轮续写 DeepSeek thinking）
    ...(m.reasoningContent !== undefined
      ? { reasoning_content: m.reasoningContent }
      : {}),
  }
}

function httpErrorTurn(
  status: number,
  bodyText: string,
  cfg?: LlmErrorCfgHint,
): LlmTurn {
  const hint: LlmErrorCfgHint | undefined = cfg
    ? { provider: cfg.provider, model: cfg.model }
    : undefined
  logLlmHttpError(status, bodyText, hint)
  const { userMessage, contextOverflow } = formatLlmHttpUserMessage(status, bodyText, hint)
  return {
    message: { role: 'assistant', content: userMessage },
    finishReason: 'error',
    error: contextOverflow ? 'context_length_exceeded' : userMessage,
    contextOverflow,
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

function extractReasoningContent(raw: {
  reasoning_content?: unknown
  reasoningContent?: unknown
}): string {
  const a = raw.reasoning_content
  const b = raw.reasoningContent
  if (typeof a === 'string' && a) return a
  if (typeof b === 'string' && b) return b
  return ''
}

function mapFinishReason(
  raw: string | undefined | null,
  hasToolCalls: boolean,
): LlmTurn['finishReason'] {
  if (hasToolCalls || raw === 'tool_calls') return 'tool_calls'
  if (raw === 'length') return 'length'
  return 'stop'
}

function emptyContentPlaceholder(
  text: string,
  reasoning: string,
  usage: TokenUsage | undefined,
  finishReason: LlmTurn['finishReason'],
  requestedMaxTokens?: number,
): string {
  const trimmed = text.trim()
  if (trimmed) return trimmed
  const hitLength = finishReason === 'length'
    || (
      requestedMaxTokens != null
      && usage?.completionTokens != null
      && usage.completionTokens >= requestedMaxTokens
    )
  if (reasoning.trim() || hitLength) return EMPTY_REPLY_REASONING_HINT
  return '（无回复内容）'
}

function turnFromAssistantMessage(
  raw: {
    content?: string | null | unknown[]
    tool_calls?: ToolCall[]
    reasoning_content?: unknown
    reasoningContent?: unknown
  },
  usage: TokenUsage | undefined,
  sessionId?: string,
  meta?: {
    finishReason?: string | null
    requestedMaxTokens?: number
    reasoningContent?: string
  },
): LlmTurn {
  const reasoning = (meta?.reasoningContent ?? extractReasoningContent(raw)).trim()
  const requestedMaxTokens = meta?.requestedMaxTokens
  const structuredCalls = raw.tool_calls?.length ? raw.tool_calls : undefined

  if (structuredCalls) {
    const rawContent = typeof raw.content === 'string' ? raw.content : null
    const content = typeof rawContent === 'string' && contentLooksLikeDsmlToolMarkup(rawContent)
      ? stripDsmlToolMarkup(rawContent) || null
      : rawContent
    return {
      message: {
        role: 'assistant',
        content,
        tool_calls: structuredCalls,
      },
      finishReason: 'tool_calls',
      usage,
      reasoningContent: reasoning || undefined,
      requestedMaxTokens,
    }
  }

  if (sessionId && Array.isArray(raw.content)) {
    const parsed = parseAssistantResponseContent(sessionId, raw.content)
    const fromDsml = tryParseDsmlToolCalls(parsed.text)
    if (fromDsml.toolCalls.length) {
      return {
        message: {
          role: 'assistant',
          content: fromDsml.text || null,
          tool_calls: fromDsml.toolCalls,
        },
        finishReason: 'tool_calls',
        usage,
        reasoningContent: reasoning || undefined,
        requestedMaxTokens,
        outputAttachments: parsed.attachments.length ? parsed.attachments : undefined,
      }
    }
    const finishReason = mapFinishReason(meta?.finishReason, false)
    const content = emptyContentPlaceholder(
      fromDsml.text,
      reasoning,
      usage,
      finishReason === 'tool_calls' ? 'stop' : finishReason,
      requestedMaxTokens,
    )
    return {
      message: { role: 'assistant', content },
      finishReason: finishReason === 'tool_calls' ? 'stop' : finishReason,
      usage,
      reasoningContent: reasoning || undefined,
      requestedMaxTokens,
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

  const fromDsml = tryParseDsmlToolCalls(textContent ?? '')
  if (fromDsml.toolCalls.length) {
    return {
      message: {
        role: 'assistant',
        content: fromDsml.text || null,
        tool_calls: fromDsml.toolCalls,
      },
      finishReason: 'tool_calls',
      usage,
      reasoningContent: reasoning || undefined,
      requestedMaxTokens,
    }
  }

  const finishReason = mapFinishReason(meta?.finishReason, false)
  const content = emptyContentPlaceholder(
    fromDsml.text,
    reasoning,
    usage,
    finishReason === 'tool_calls' ? 'stop' : finishReason,
    requestedMaxTokens,
  )

  return {
    message: { role: 'assistant', content },
    finishReason: finishReason === 'tool_calls' ? 'stop' : finishReason,
    usage,
    reasoningContent: reasoning || undefined,
    requestedMaxTokens,
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
  let reasoningContent = ''
  let finishReason: string | undefined
  let usage: TokenUsage | undefined
  let sawToolCalls = false
  const toolCallsByIndex = new Map<number, ToolCall>()
  const sseSampler = createSseChunkSampler(opts?.sessionId)
  const requestedMaxTokens = opts?.maxTokens

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

        sseSampler.onDataPayload(payload, content.length)

        let parsed: {
          usage?: unknown
          choices?: Array<{
            finish_reason?: string | null
            delta?: {
              content?: string | null | unknown[]
              reasoning_content?: string | null
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

        const reasoningText = typeof delta.reasoning_content === 'string'
          ? delta.reasoning_content
          : ''
        if (reasoningText) {
          reasoningContent += reasoningText
          onDelta?.({ reasoningText })
        }

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

  // 统一经 turnFromAssistantMessage：剥离 content 内 DSML，或无结构化 calls 时解析为 tool_calls
  return turnFromAssistantMessage(
    {
      content,
      tool_calls: toolCalls.length ? toolCalls : undefined,
      reasoning_content: reasoningContent,
    },
    usage,
    opts?.sessionId,
    {
      finishReason: toolCalls.length ? 'tool_calls' : finishReason,
      requestedMaxTokens,
      reasoningContent,
    },
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
    // 出站净化：text-only 模型剥离历史中的 image_url / file / audio，避免 schema 反序列化失败
    const mediaCaps = await resolveModelMediaCapabilitiesAsync(
      this.cfg.model,
      this.cfg.provider,
    )
    const outboundMessages = sanitizeMessagesForModelMedia(messages, mediaCaps)
    const requestedMaxTokens = resolveRequestMaxTokens({
      explicitMaxTokens: opts?.maxTokens ?? this.cfg.maxTokens,
      reasoningEffort: opts?.reasoningEffort,
      model: this.cfg.model,
    })
    const chatOpts: LlmChatOpts = {
      ...opts,
      maxTokens: requestedMaxTokens,
    }
    let toolChoiceFallback: 'auto' | 'omit' | null = null
    const effectiveToolChoice = (): LlmToolChoice | undefined => {
      const resolved = resolveBodyToolChoice(tools?.length ?? 0, opts?.toolChoice)
      if (toolChoiceFallback === 'omit') return undefined
      if (toolChoiceFallback === 'auto') return 'auto'
      return resolved
    }

    const buildBody = (stream: boolean): Record<string, unknown> => {
      const body: Record<string, unknown> = {
        model: this.cfg.model,
        messages: outboundMessages.map(serializeMessage),
        temperature: opts?.temperature ?? this.cfg.temperature ?? 1,
        max_tokens: requestedMaxTokens,
      }
      if (opts?.reasoningEffort) {
        body.reasoning_effort = opts.reasoningEffort
      }
      // 观测用：稳定 session 级 prompt cache key；不因 warm/cold 改写 messages
      const sessionId = opts?.sessionId?.trim()
      if (sessionId) {
        body.prompt_cache_key = promptCacheKeyForSession(sessionId)
      }
      if (tools?.length) {
        body.tools = tools
        const tc = effectiveToolChoice()
        if (tc !== undefined) body.tool_choice = tc
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

    /** 上游拒收 tool_choice 时：先改 auto，再省略该字段后重试 */
    const postWithToolChoiceFallback = async (stream: boolean): Promise<Response> => {
      const resp = await post(stream)
      if (resp.ok) return resp
      if (resp.status !== 400 && resp.status !== 422) return resp
      if (!tools?.length || !toolChoiceNeedsFallback(opts?.toolChoice)) return resp
      if (toolChoiceFallback == null) {
        await resp.text().catch(() => '')
        toolChoiceFallback = 'auto'
        const retryAuto = await post(stream)
        if (retryAuto.ok) return retryAuto
        if (retryAuto.status !== 400 && retryAuto.status !== 422) return retryAuto
        await retryAuto.text().catch(() => '')
        toolChoiceFallback = 'omit'
        return post(stream)
      }
      if (toolChoiceFallback === 'auto') {
        await resp.text().catch(() => '')
        toolChoiceFallback = 'omit'
        return post(stream)
      }
      return resp
    }

    const parseJsonTurn = async (resp: Response): Promise<LlmTurn> => {
      const data = await resp.json() as {
        usage?: unknown
        choices?: {
          finish_reason?: string
          message?: {
            content?: string | null | unknown[]
            tool_calls?: ToolCall[]
            reasoning_content?: unknown
            reasoningContent?: unknown
          }
        }[]
      }
      const choice = data.choices?.[0]
      const raw = choice?.message
      const usage = parseOpenAiUsage(data.usage)
      if (!raw) {
        return {
          message: { role: 'assistant', content: '⚠️ API 返回格式异常' },
          finishReason: 'error',
          error: 'bad_response',
          requestedMaxTokens,
        }
      }
      return turnFromAssistantMessage(raw, usage, opts?.sessionId, {
        finishReason: choice?.finish_reason,
        requestedMaxTokens,
      })
    }

    const noteHttpError = (status: number, bodyText: string) => {
      if (opts?.sessionId) {
        logChatDebugHttpError(opts.sessionId, {
          status,
          bodyTruncated: truncateForChatDebug(bodyText),
        })
      }
    }

    const noteAbort = () => {
      if (opts?.sessionId) {
        logChatDebugAbort(opts.sessionId, { reason: 'cancelled' })
      }
    }

    try {
      if (opts?.onDelta) {
        let streamConsumeStarted = false
        try {
          const streamResp = await postWithToolChoiceFallback(true)
          if (!streamResp.ok) {
            const text = (await streamResp.text()).slice(0, 300)
            // 部分上游不支持 stream：回退非流式（保留已生效的 tool_choice fallback）
            if (streamResp.status === 400 || streamResp.status === 422) {
              const fallback = await postWithToolChoiceFallback(false)
              if (!fallback.ok) {
                const fbText = (await fallback.text()).slice(0, 300)
                noteHttpError(fallback.status, fbText)
                return httpErrorTurn(fallback.status, fbText, this.cfg)
              }
              return await parseJsonTurn(fallback)
            }
            noteHttpError(streamResp.status, text)
            return httpErrorTurn(streamResp.status, text, this.cfg)
          }
          if (!streamResp.body) {
            const fallback = await postWithToolChoiceFallback(false)
            if (!fallback.ok) {
              const fbText = (await fallback.text()).slice(0, 300)
              noteHttpError(fallback.status, fbText)
              return httpErrorTurn(fallback.status, fbText, this.cfg)
            }
            return await parseJsonTurn(fallback)
          }
          streamConsumeStarted = true
          return await consumeChatCompletionSse(streamResp, chatOpts)
        } catch (streamErr) {
          if (signal?.aborted) {
            noteAbort()
            const msg = '已取消'
            return { message: { role: 'assistant', content: msg }, finishReason: 'error', error: 'cancelled' }
          }
          // 尚未开始读流时回退非流式；中途失败不再重放整轮
          if (!streamConsumeStarted) {
            const fallback = await postWithToolChoiceFallback(false)
            if (!fallback.ok) {
              const fbText = (await fallback.text()).slice(0, 300)
              noteHttpError(fallback.status, fbText)
              return httpErrorTurn(fallback.status, fbText, this.cfg)
            }
            return await parseJsonTurn(fallback)
          }
          throw streamErr
        }
      }

      const resp = await postWithToolChoiceFallback(false)
      if (!resp.ok) {
        const text = (await resp.text()).slice(0, 300)
        noteHttpError(resp.status, text)
        return httpErrorTurn(resp.status, text, this.cfg)
      }
      return await parseJsonTurn(resp)
    } catch (e) {
      if (signal?.aborted) {
        noteAbort()
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
