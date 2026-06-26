export interface LlmConfig {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  temperature?: number
  maxTokens?: number
  timeout?: number
}

export interface LlmProvider {
  chat(messages: { role: string; content: string }[]): Promise<string>
  listModels(): Promise<string[]>
}

export function isConfigured(cfg: LlmConfig) {
  return Boolean(cfg.apiKey && cfg.baseUrl)
}

export function createProvider(cfg: LlmConfig): LlmProvider {
  const p = cfg.provider.toLowerCase()
  if (p === 'deepseek' || p === 'openai') {
    return new OpenAiCompatibleProvider(cfg)
  }
  return new OpenAiCompatibleProvider(cfg)
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private cfg: LlmConfig) {}

  async chat(messages: { role: string; content: string }[]) {
    if (!isConfigured(this.cfg)) return '[LLM 未配置] 请在设置中填入 API Key'
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.cfg.model,
          messages,
          temperature: this.cfg.temperature ?? 0.7,
          max_tokens: this.cfg.maxTokens ?? 2048,
        }),
        signal: AbortSignal.timeout(this.cfg.timeout ?? 60_000),
      })
      if (!resp.ok) {
        if (resp.status === 401) return '⚠️ API Key 无效，请在设置中重新配置'
        if (resp.status === 429) return '⚠️ 请求过于频繁，请稍后再试'
        return `⚠️ HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`
      }
      const data = await resp.json() as { choices?: { message?: { content?: string } }[] }
      return data.choices?.[0]?.message?.content ?? '⚠️ API 返回格式异常'
    } catch (e) {
      return `⚠️ 请求失败: ${e}`
    }
  }

  async listModels() {
    return ['deepseek-chat', 'deepseek-reasoner', 'gpt-4o-mini']
  }
}
