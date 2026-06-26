import type { ResearchHub } from '@inno-a-stock/research-hub'
import { createProvider, isConfigured, type ChatMessage, type LlmConfig } from './llm/provider.js'
import { ToolRegistry } from './tools.js'

export interface AgentSettings {
  llm: LlmConfig
  defaultScorecard: string
  defaultTopN: number
}

export interface ChatResult {
  reply: string
  toolsUsed: string[]
}

const MAX_TOOL_ROUNDS = 8
const TRUNCATE = 12_000

export class AgentEngine {
  readonly tools: ToolRegistry
  private llm
  private history: ChatMessage[] = []

  constructor(
    private hub: ResearchHub,
    private settings: AgentSettings,
  ) {
    this.tools = new ToolRegistry(hub)
    this.llm = createProvider(this.settings.llm)
  }

  get llmConfigured() { return isConfigured(this.settings.llm) }

  setLlmConfig(cfg: Partial<LlmConfig>) {
    Object.assign(this.settings.llm, cfg)
    this.llm = createProvider(this.settings.llm)
  }

  resetHistory() {
    this.history = []
  }

  async chat(message: string): Promise<ChatResult> {
    const text = message.trim()
    if (!text) return { reply: '请输入问题。', toolsUsed: [] }

    if (text === '/clear' || text === '/reset') {
      this.resetHistory()
      return { reply: '对话已清空。', toolsUsed: [] }
    }

    this.history.push({ role: 'user', content: text })

    if (!this.llmConfigured) {
      const reply = '⚠️ LLM 未配置。请在设置页或环境变量 LLM_API_KEY 中配置 API Key。'
      this.history.push({ role: 'assistant', content: reply })
      return { reply, toolsUsed: [] }
    }

    const toolsUsed: string[] = []
    const openAiTools = this.tools.openAiTools()

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const messages: ChatMessage[] = [
        { role: 'system', content: this.tools.systemPrompt() },
        ...this.history.slice(-20),
      ]

      const turn = await this.llm.chat(messages, openAiTools)

      if (turn.finishReason === 'error') {
        const reply = turn.message.content ?? turn.error ?? '请求失败'
        this.history.push({ role: 'assistant', content: reply })
        return { reply, toolsUsed }
      }

      if (turn.finishReason === 'tool_calls' && turn.message.tool_calls?.length) {
        this.history.push({
          role: 'assistant',
          content: turn.message.content ?? null,
          tool_calls: turn.message.tool_calls,
        })

        for (const tc of turn.message.tool_calls) {
          const fn = tc.function.name
          toolsUsed.push(fn)
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
          } catch { /* empty args */ }

          const result = await this.tools.call(fn, args)
          const payload = truncateJson(result)

          this.history.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: fn,
            content: payload,
          })
        }
        continue
      }

      const reply = turn.message.content?.trim() || '（无回复内容）'
      this.history.push({ role: 'assistant', content: reply })
      return { reply, toolsUsed }
    }

    const reply = '⚠️ 工具调用轮次过多，请简化问题后重试。'
    this.history.push({ role: 'assistant', content: reply })
    return { reply, toolsUsed }
  }
}

function truncateJson(value: unknown): string {
  const s = JSON.stringify(value, null, 0)
  if (s.length <= TRUNCATE) return s
  return s.slice(0, TRUNCATE) + '…[truncated]'
}
