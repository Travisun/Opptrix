import type { ResearchHub } from '@opptrix/research-hub'
import type { AgentAppContext } from './app-context.js'
import { type ChatMessage } from './llm/provider.js'
import { tailMessagesForLlm } from './llm/messages.js'
import { ProviderRegistry, type ProviderProfile, type AvailableModel } from './llm/providers.js'
import { DiscoverRunner } from './discover.js'
import { ToolRegistry } from './tools.js'
import { McpToolBroker } from './mcp/broker.js'
import {
  type ChatProgressEvent,
  type ChatProgressOptions,
  type ChatToolStep,
  enrichStepFromResult,
  formatArgsPreview,
  formatToolLabel,
} from './chat-progress.js'
import {
  UserPromptBridge,
  createUserPromptId,
  parseAskUserArgs,
  type UserPromptAnswer,
  UserPromptCancelledError,
} from './user-prompt.js'
import { SessionStore, type SessionRecord, type SessionContextRef } from './sessions.js'

export interface AgentSettings {
  providers?: ProviderProfile[]
  defaultModel?: string
  defaultScorecard: string
  defaultTopN: number
  appContext?: AgentAppContext
  /** @deprecated single llm */
  llm?: import('./llm/provider.js').LlmConfig
}

export interface ChatResult {
  reply: string
  toolsUsed: string[]
  sessionId: string
  title?: string
}

const MAX_TOOL_ROUNDS = 8
const TRUNCATE = 12_000

export class ChatCancelledError extends Error {
  constructor() {
    super('已取消')
    this.name = 'ChatCancelledError'
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new ChatCancelledError()
}

export class AgentEngine {
  readonly tools: ToolRegistry
  readonly discover: DiscoverRunner
  readonly sessions = new SessionStore()
  private registry = new ProviderRegistry()
  private settings: AgentSettings
  private mcpBrokerPromise: Promise<McpToolBroker> | null = null
  readonly userPromptBridge = new UserPromptBridge()

  constructor(
    private hub: ResearchHub,
    settings: AgentSettings,
  ) {
    this.settings = settings
    this.tools = new ToolRegistry(hub, settings.appContext)
    this.discover = new DiscoverRunner(hub, this.registry, this.tools)
    if (settings.providers?.length) {
      this.registry.setProviders(settings.providers, settings.defaultModel)
    }
  }

  get llmConfigured() { return this.registry.configured }

  /** 投研 MCP 工具经进程内 broker 暴露 */
  private mcpBroker() {
    if (!this.mcpBrokerPromise) {
      this.mcpBrokerPromise = McpToolBroker.create(this.tools, this.tools.chatToolNames())
    }
    return this.mcpBrokerPromise
  }

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

  createSession(title?: string) {
    return this.sessions.create(title)
  }

  listSessions() {
    return this.sessions.listActive()
  }

  listAllSessions() {
    return this.sessions.listAll()
  }

  listArchivedSessionsGrouped() {
    return this.sessions.listArchivedGrouped()
  }

  listAllArchivedByFolder() {
    return this.sessions.listArchivedByFolderAll()
  }

  listSessionArchiveFolders() {
    return this.sessions.listArchiveFolders()
  }

  createSessionArchiveFolder(title: string) {
    return this.sessions.createArchiveFolder(title)
  }

  renameSessionArchiveFolder(id: string, title: string) {
    return this.sessions.renameArchiveFolder(id, title)
  }

  deleteSessionArchiveFolder(id: string) {
    return this.sessions.deleteArchiveFolder(id)
  }

  clearSessionArchiveFolder(id: string) {
    return this.sessions.clearArchiveFolder(id)
  }

  archiveSession(id: string, folderId: string) {
    return this.sessions.archive(id, folderId)
  }

  unarchiveSession(id: string) {
    return this.sessions.unarchive(id)
  }

  getSession(id: string) {
    return this.sessions.get(id)
  }

  deleteSession(id: string) {
    this.userPromptBridge.cancelSession(id)
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

  resolveUserPrompt(sessionId: string, promptId: string, answer: UserPromptAnswer) {
    return this.userPromptBridge.submit(sessionId, promptId, answer)
  }

  async chat(
    sessionId: string,
    message: string,
    modelRef?: string,
    progress?: ChatProgressOptions,
  ): Promise<ChatResult> {
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
    const turnsBeforeAssistant = record.turns.length
    record.turns.push({ role: 'user', content: text, at: new Date().toISOString() })
    const messagesBeforeAssistant = record.messages.length
    if (record.title === '新对话' || record.messages.filter(m => m.role === 'user').length === 1) {
      record.title = text.slice(0, 28) + (text.length > 28 ? '…' : '')
    }
    this.sessions.save(record)

    const emit = (event: ChatProgressEvent) => {
      progress?.onProgress?.(event)
    }

    const signal = progress?.signal

    const finalizeCancelled = (partialTools: string[], partialSteps: ChatToolStep[]): ChatResult => {
      this.userPromptBridge.cancelSession(sessionId)
      record!.messages = record!.messages.slice(0, messagesBeforeAssistant)
      if (record!.turns) {
        record!.turns = record!.turns.slice(0, turnsBeforeAssistant + 1)
      }
      const reply = '（已停止）'
      pushAssistant(reply, partialTools, partialSteps)
      emit({ type: 'error', message: '已取消' })
      emit({
        type: 'done',
        reply,
        tools_used: partialTools,
        session_id: sessionId,
        title: record!.title,
        tool_steps: partialSteps,
        cancelled: true,
      })
      return { reply, toolsUsed: partialTools, sessionId, title: record!.title }
    }

    const pushAssistant = (reply: string, used: string[], steps: ChatToolStep[]) => {
      this.pushAssistant(record!, reply, used, steps)
    }

    const toolsUsed: string[] = []
    const toolSteps: ChatToolStep[] = []

    try {
    if (!llm) {
      const reply = '⚠️ LLM 未配置。请在设置中添加模型提供商并启用模型。'
      pushAssistant(reply, [], [])
      emit({
        type: 'done',
        reply,
        tools_used: [],
        session_id: sessionId,
        title: record.title,
        tool_steps: [],
      })
      return { reply, toolsUsed: [], sessionId, title: record.title }
    }

    const broker = await this.mcpBroker()
    const openAiTools = await broker.openAiTools()
    const systemPrompt = this.tools.systemPrompt()

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      throwIfAborted(signal)
      const contextMessages = contextRefToChatMessages(record.contextRef)
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...contextMessages,
        ...tailMessagesForLlm(record.messages),
      ]

      emit({
        type: 'thinking',
        round: round + 1,
        label: round === 0 ? '模型正在思考…' : '模型正在整理结果…',
      })

      const turn = await llm.chat(messages, openAiTools, signal)
      throwIfAborted(signal)

      if (turn.finishReason === 'error') {
        if (turn.error === 'cancelled' || signal?.aborted) {
          return finalizeCancelled(toolsUsed, toolSteps)
        }
        const reply = turn.message.content ?? turn.error ?? '请求失败'
        pushAssistant(reply, toolsUsed, toolSteps)
        emit({
          type: 'error',
          message: reply,
        })
        emit({
          type: 'done',
          reply,
          tools_used: toolsUsed,
          session_id: sessionId,
          title: record.title,
          tool_steps: toolSteps,
        })
        return { reply, toolsUsed, sessionId, title: record.title }
      }

      if (turn.finishReason === 'tool_calls' && turn.message.tool_calls?.length) {
        const thinkingSnippet = turn.message.content?.trim()
        if (thinkingSnippet) {
          emit({
            type: 'thinking',
            round: round + 1,
            label: '模型分析思路',
            snippet: thinkingSnippet,
          })
        }

        record.messages.push({
          role: 'assistant',
          content: turn.message.content ?? null,
          tool_calls: turn.message.tool_calls,
        })
        this.sessions.save(record)

        for (const tc of turn.message.tool_calls) {
          throwIfAborted(signal)
          const fn = tc.function.name
          toolsUsed.push(fn)
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
          } catch { /* empty */ }

          const runningStep: ChatToolStep = {
            id: tc.id,
            tool: fn,
            label: formatToolLabel(fn, args),
            status: 'running',
            argsPreview: formatArgsPreview(args),
            thinking: thinkingSnippet || undefined,
            startedAt: new Date().toISOString(),
          }
          toolSteps.push(runningStep)
          emit({ type: 'tool_start', step: runningStep })

          let result: unknown
          try {
            if (fn === 'ask_user') {
              const parsed = parseAskUserArgs(args)
              if (parsed.error || !parsed.payload) {
                result = { error: parsed.error ?? 'ask_user 参数无效' }
              } else {
                const promptId = createUserPromptId()
                const answerPromise = this.userPromptBridge.waitForAnswer(sessionId, promptId, signal)
                emit({
                  type: 'user_prompt',
                  prompt: { id: promptId, ...parsed.payload },
                })
                const answer = await answerPromise
                result = { ok: true, ...answer }
              }
            } else {
              result = await broker.call(fn, args, { signal })
            }
          } catch (e) {
            if (
              e instanceof ChatCancelledError
              || e instanceof UserPromptCancelledError
              || signal?.aborted
              || (e instanceof DOMException && e.name === 'AbortError')
            ) {
              throw new ChatCancelledError()
            }
            result = { error: e instanceof Error ? e.message : String(e) }
          }

          const doneStep = enrichStepFromResult(runningStep, result)
          toolSteps[toolSteps.length - 1] = doneStep
          emit({ type: 'tool_done', step: doneStep })

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
      emit({ type: 'reply', content: reply })
      pushAssistant(reply, toolsUsed, toolSteps)
      emit({
        type: 'done',
        reply,
        tools_used: toolsUsed,
        session_id: sessionId,
        title: record.title,
        tool_steps: toolSteps,
      })
      return { reply, toolsUsed, sessionId, title: record.title }
    }

    const reply = '⚠️ 工具调用轮次过多，请简化问题后重试。'
    pushAssistant(reply, toolsUsed, toolSteps)
    emit({
      type: 'done',
      reply,
      tools_used: toolsUsed,
      session_id: sessionId,
      title: record.title,
      tool_steps: toolSteps,
    })
    return { reply, toolsUsed, sessionId, title: record.title }
    } catch (e) {
      if (
        e instanceof ChatCancelledError
        || signal?.aborted
        || (e instanceof DOMException && e.name === 'AbortError')
      ) {
        return finalizeCancelled(toolsUsed, toolSteps)
      }
      throw e
    }
  }

  private pushAssistant(
    record: SessionRecord,
    reply: string,
    toolsUsed: string[],
    toolSteps: ChatToolStep[] = [],
  ) {
    if (this.sessions.shouldMaterializeContext(record)) {
      this.sessions.materializeContextRef(record)
    }
    record.messages.push({ role: 'assistant', content: reply })
    if (!record.turns) record.turns = []
    record.turns.push({
      role: 'assistant',
      content: reply,
      toolsUsed: toolsUsed.length ? toolsUsed : undefined,
      toolSteps: toolSteps.length ? toolSteps : undefined,
      at: new Date().toISOString(),
    })
    this.sessions.save(record)
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
  if (ref.kind === 'article') {
    const lines = [
      '[引用资讯]',
      `标题：${ref.title}`,
      `来源：${ref.sourceTitle}`,
      ref.link ? `链接：${ref.link}` : '',
      '',
      ref.bodyText.trim() || ref.title,
    ].filter(Boolean)
    return [{ role: 'user', content: lines.join('\n') }]
  }
  return ref.turns
    .filter(t => t.role === 'assistant' && t.content)
    .map(t => ({ role: 'assistant', content: t.content }))
}
