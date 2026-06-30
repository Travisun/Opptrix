import type { OpenAiTool } from '../tools.js'

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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface LlmTurn {
  message: ChatMessage
  finishReason: 'stop' | 'tool_calls' | 'error'
  error?: string
}

export interface LlmProvider {
  chat(messages: ChatMessage[], tools?: OpenAiTool[], signal?: AbortSignal): Promise<LlmTurn>
  listModels(): Promise<string[]>
}

export function isConfigured(cfg: LlmConfig) {
  return Boolean(cfg.apiKey && cfg.baseUrl)
}

export function createProvider(cfg: LlmConfig): LlmProvider {
  return new OpenAiCompatibleProvider(cfg)
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private cfg: LlmConfig) {}

  async chat(messages: ChatMessage[], tools?: OpenAiTool[], signal?: AbortSignal): Promise<LlmTurn> {
    if (!isConfigured(this.cfg)) {
      return {
        message: { role: 'assistant', content: '[LLM 未配置] 请在设置或环境变量中填入 API Key' },
        finishReason: 'error',
        error: 'not_configured',
      }
    }
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`
    try {
      const body: Record<string, unknown> = {
        model: this.cfg.model,
        messages: messages.map(m => ({
          role: m.role,
          ...(m.role === 'assistant' && m.tool_calls
            ? { content: m.content ?? null }
            : { content: m.content ?? '' }),
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          ...(m.name ? { name: m.name } : {}),
        })),
        temperature: this.cfg.temperature ?? 0.3,
        max_tokens: this.cfg.maxTokens ?? 4096,
      }
      if (tools?.length) {
        body.tools = tools
        body.tool_choice = 'auto'
      }

      const timeoutSignal = AbortSignal.timeout(this.cfg.timeout ?? 120_000)
      const requestSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: requestSignal,
      })

      if (!resp.ok) {
        const text = (await resp.text()).slice(0, 300)
        const msg = resp.status === 401
          ? '⚠️ API Key 无效'
          : resp.status === 429
            ? '⚠️ 请求过于频繁'
            : `⚠️ HTTP ${resp.status}: ${text}`
        return { message: { role: 'assistant', content: msg }, finishReason: 'error', error: msg }
      }

      const data = await resp.json() as {
        choices?: {
          finish_reason?: string
          message?: {
            content?: string | null
            tool_calls?: ToolCall[]
          }
        }[]
      }
      const choice = data.choices?.[0]
      const raw = choice?.message
      if (!raw) {
        return {
          message: { role: 'assistant', content: '⚠️ API 返回格式异常' },
          finishReason: 'error',
          error: 'bad_response',
        }
      }

      if (raw.tool_calls?.length) {
        return {
          message: { role: 'assistant', content: raw.content ?? null, tool_calls: raw.tool_calls },
          finishReason: 'tool_calls',
        }
      }

      return {
        message: { role: 'assistant', content: raw.content ?? '' },
        finishReason: 'stop',
      }
    } catch (e) {
      if (signal?.aborted) {
        const msg = '已取消'
        return { message: { role: 'assistant', content: msg }, finishReason: 'error', error: 'cancelled' }
      }
      const msg = `⚠️ 请求失败: ${e}`
      return { message: { role: 'assistant', content: msg }, finishReason: 'error', error: msg }
    }
  }

  async listModels() {
    return fetchOpenAiModelList(this.cfg.baseUrl, this.cfg.apiKey).catch(() => [])
  }
}

/** OpenAI-compatible GET /v1/models */
export async function fetchOpenAiModelList(baseUrl: string, apiKey: string): Promise<string[]> {
  const root = baseUrl.trim().replace(/\/$/, '').replace(/\/v1$/, '')
  const url = `${root}/v1/models`
  const resp = await fetch(url, {
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
