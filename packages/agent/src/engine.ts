import type { ResearchHub } from '@inno-a-stock/research-hub'
import { type ChatMessage } from './llm/provider.js'
import { ProviderRegistry, type ProviderProfile, type AvailableModel } from './llm/providers.js'
import { ToolRegistry } from './tools.js'
import { SessionStore, type SessionRecord, type SessionContextRef } from './sessions.js'

export interface AgentSettings {
  providers?: ProviderProfile[]
  defaultModel?: string
  defaultScorecard: string
  defaultTopN: number
  /** @deprecated single llm */
  llm?: import('./llm/provider.js').LlmConfig
}

export interface ChatResult {
  reply: string
  toolsUsed: string[]
  sessionId: string
  title?: string
}

export interface SkillInfo {
  name: string
  description: string
  category: string
  examplePrompt: string
}

const MAX_TOOL_ROUNDS = 8
const TRUNCATE = 12_000

export class AgentEngine {
  readonly tools: ToolRegistry
  readonly sessions = new SessionStore()
  private registry = new ProviderRegistry()
  private settings: AgentSettings

  constructor(
    private hub: ResearchHub,
    settings: AgentSettings,
  ) {
    this.settings = settings
    this.tools = new ToolRegistry(hub)
    if (settings.providers?.length) {
      this.registry.setProviders(settings.providers, settings.defaultModel)
    }
  }

  get llmConfigured() { return this.registry.configured }

  setProviders(providers: ProviderProfile[], defaultModel?: string) {
    this.registry.setProviders(providers, defaultModel)
    this.settings.defaultModel = defaultModel
    this.settings.providers = providers
  }

  listAvailableModels(): AvailableModel[] {
    return this.registry.listAvailable()
  }

  setSessionModel(sessionId: string, modelRef: string | null) {
    const record = this.sessions.get(sessionId)
    if (!record) return null
    record.model = modelRef?.trim() || undefined
    this.sessions.save(record)
    return record
  }

  listSkills(): { category: string; skills: SkillInfo[] }[] {
    const byCat = new Map<string, SkillInfo[]>()
    for (const t of this.tools.list()) {
      const list = byCat.get(t.category) ?? []
      list.push({
        name: t.name,
        description: t.description,
        category: t.category,
        examplePrompt: examplePromptFor(t.name, t.description),
      })
      byCat.set(t.category, list)
    }
    return [...byCat.entries()].map(([category, skills]) => ({ category, skills }))
  }

  createSession(title?: string) {
    return this.sessions.create(title)
  }

  listSessions() {
    return this.sessions.list()
  }

  getSession(id: string) {
    return this.sessions.get(id)
  }

  deleteSession(id: string) {
    this.sessions.delete(id)
  }

  renameSession(id: string, title: string) {
    return this.sessions.rename(id, title)
  }

  getDisplayMessages(sessionId: string) {
    const record = this.sessions.get(sessionId)
    if (!record) return []
    return this.sessions.toDisplayMessages(record)
  }

  forkSession(sessionId: string, messageIndex: number) {
    const source = this.sessions.get(sessionId)
    if (!source) return null
    return this.sessions.fork(source, messageIndex)
  }

  getSessionContextRef(sessionId: string): SessionContextRef | null {
    const record = this.sessions.get(sessionId)
    return record?.contextRef ?? null
  }

  clearSessionContextRef(sessionId: string) {
    return this.sessions.clearContextRef(sessionId)
  }

  setSessionContextRef(sessionId: string, contextRef: SessionContextRef | null) {
    return this.sessions.setContextRef(sessionId, contextRef)
  }

  async ephemeralAsk(
    sessionId: string,
    message: string,
    selectedText: string,
    modelRef?: string,
    priorTurns?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ reply: string }> {
    const text = message.trim()
    const quote = selectedText.trim()
    if (!text) return { reply: '请输入问题。' }

    const record = this.sessions.get(sessionId)
    if (!record) return { reply: '对话不存在。' }

    const activeModel = modelRef?.trim() || record.model
    const llm = this.registry.createLlm(activeModel)
    if (!llm) {
      return { reply: '⚠️ LLM 未配置。请在设置中添加模型提供商并启用模型。' }
    }

    const contextMessages = contextRefToChatMessages(record.contextRef)
    const history = record.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-24)
      .map(m => ({ role: m.role, content: m.content ?? '' } as ChatMessage))

    const ephemeralHistory = (priorTurns ?? [])
      .filter(t => t.role === 'user' || t.role === 'assistant')
      .map(t => ({ role: t.role, content: t.content ?? '' } as ChatMessage))

    const isFollowUp = ephemeralHistory.length > 0
    const prompt = isFollowUp
      ? text
      : quote
        ? `用户划选了以下内容：\n"""${quote}"""\n\n请结合当前对话上下文，回答用户的问题：\n${text}`
        : text

    const messages: ChatMessage[] = [
      { role: 'system', content: this.tools.systemPrompt() },
      ...contextMessages,
      ...history,
      ...ephemeralHistory,
      { role: 'user', content: prompt },
    ]

    const turn = await llm.chat(messages)
    if (turn.finishReason === 'error') {
      return { reply: turn.message.content ?? turn.error ?? '请求失败' }
    }
    return { reply: turn.message.content?.trim() || '（无回复内容）' }
  }

  async chat(sessionId: string, message: string, modelRef?: string): Promise<ChatResult> {
    const text = message.trim()
    let record = this.sessions.get(sessionId)
    if (!record) {
      record = this.sessions.create('新对话')
      sessionId = record.id
    }

    if (!text) return { reply: '请输入问题。', toolsUsed: [], sessionId }

    const activeModel = modelRef?.trim() || record.model
    const llm = this.registry.createLlm(activeModel)
    if (modelRef?.trim()) {
      record.model = modelRef.trim()
    }

    record.messages.push({ role: 'user', content: text })
    if (!record.turns) record.turns = []
    record.turns.push({ role: 'user', content: text, at: new Date().toISOString() })
    if (record.title === '新对话' || record.messages.filter(m => m.role === 'user').length === 1) {
      record.title = text.slice(0, 28) + (text.length > 28 ? '…' : '')
    }
    this.sessions.save(record)

    const pushAssistant = (reply: string, used: string[]) => {
      if (this.sessions.shouldMaterializeContext(record!)) {
        this.sessions.materializeContextRef(record!)
      }
      record!.messages.push({ role: 'assistant', content: reply })
      record!.turns!.push({
        role: 'assistant',
        content: reply,
        toolsUsed: used.length ? used : undefined,
        at: new Date().toISOString(),
      })
      this.sessions.save(record!)
    }

    if (!llm) {
      const reply = '⚠️ LLM 未配置。请在设置中添加模型提供商并启用模型。'
      pushAssistant(reply, [])
      return { reply, toolsUsed: [], sessionId, title: record.title }
    }

    const toolsUsed: string[] = []
    const openAiTools = this.tools.openAiTools()
    const systemPrompt = this.tools.systemPrompt()

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const contextMessages = contextRefToChatMessages(record.contextRef)
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...contextMessages,
        ...record.messages.slice(-24),
      ]

      const turn = await llm.chat(messages, openAiTools)

      if (turn.finishReason === 'error') {
        const reply = turn.message.content ?? turn.error ?? '请求失败'
        pushAssistant(reply, toolsUsed)
        return { reply, toolsUsed, sessionId, title: record.title }
      }

      if (turn.finishReason === 'tool_calls' && turn.message.tool_calls?.length) {
        record.messages.push({
          role: 'assistant',
          content: turn.message.content ?? null,
          tool_calls: turn.message.tool_calls,
        })
        this.sessions.save(record)

        for (const tc of turn.message.tool_calls) {
          const fn = tc.function.name
          toolsUsed.push(fn)
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
          } catch { /* empty */ }

          const result = await this.tools.call(fn, args)
          record.messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: fn,
            content: truncateJson(result),
          })
        }
        this.sessions.save(record)
        continue
      }

      const reply = turn.message.content?.trim() || '（无回复内容）'
      pushAssistant(reply, toolsUsed)
      return { reply, toolsUsed, sessionId, title: record.title }
    }

    const reply = '⚠️ 工具调用轮次过多，请简化问题后重试。'
    pushAssistant(reply, toolsUsed)
    return { reply, toolsUsed, sessionId, title: record.title }
  }
}

function truncateJson(value: unknown): string {
  const s = JSON.stringify(value, null, 0)
  if (s.length <= TRUNCATE) return s
  return s.slice(0, TRUNCATE) + '…[truncated]'
}

function contextRefToChatMessages(ref: SessionContextRef | null | undefined): ChatMessage[] {
  if (!ref) return []
  if (ref.kind === 'selection') {
    return [{
      role: 'user',
      content: `[引用内容]\n${ref.selectedText}`,
    }]
  }
  return ref.turns
    .filter(t => t.role === 'assistant' && t.content)
    .map(t => ({ role: 'assistant', content: t.content }))
}

function examplePromptFor(name: string, desc: string): string {
  const map: Record<string, string> = {
    evaluate_stock: '帮我全面诊断贵州茅台(600519)的因子评分',
    screen_stocks: '筛选 ROE>15 且负债率<50 的股票，取前20',
    analyze_portfolio: '分析我的组合：600519占50%，000858占50%',
    search_stocks: '搜索比亚迪相关股票',
    get_strategy_signal: '600519 的策略信号怎么看？',
    institution_rating: '600519 的机构群评共识是什么？',
    get_closing_report: '生成今日 A 股收盘市场报告',
    get_morning_brief: '生成今日开盘早报',
    run_backtest: '对600519、000858做因子IC回测',
    strategy_verify: '验证600519策略历史信号胜率',
    strategy_report: '出一份600519的策略综合分析报告',
    institution_report: '600519 机构评级详细报告',
    industry_mining: '半导体产业链有哪些代表公司？',
    industry_mermaid: '生成半导体产业链 Mermaid 导图',
    portfolio_summary: '我的交易账本盈亏汇总',
    portfolio_trades: '查看最近交易记录',
    writer_prepare: '为600519准备一篇价值投资风格投研文章 Prompt',
  }
  return map[name] ?? `请使用「${desc}」`
}
