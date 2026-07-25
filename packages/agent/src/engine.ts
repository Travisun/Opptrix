import type { ResearchHub } from '@opptrix/research-hub'
import type { AgentAppContext } from './app-context.js'
import { getCurrentTime } from './app-context.js'
import { type ChatMessage } from './llm/provider.js'
import { ProviderRegistry, type ProviderProfile, type AvailableModel } from './llm/providers.js'
import { DiscoverRunner } from './discover.js'
import { ToolRegistry } from './tools.js'
import { McpToolBroker } from './mcp/broker.js'
import { AggregatingToolBroker } from './mcp/external/index.js'
import { getExternalMcpRegistry } from './mcp/external/registry.js'
import {
  ToolPackSessionStore,
  listToolPacksPayload,
  resolveActivePackIds,
  toolNamesForPacks,
  unloadedToolHint,
} from './mcp/tool-pack-session.js'
import {
  resolveToolRoutePlan,
  buildRoundRoutePlaybook,
  orderToolsByPreference,
  type ToolRoutePlan,
} from './mcp/tool-route-plan.js'
import { buildSessionClockPlaybook, parseNamespacedMcpTool } from '@opptrix/shared'
import {
  type ChatProgressEvent,
  type ChatProgressOptions,
  type ChatToolStep,
  enrichStepFromResult,
  formatArgsPreview,
  formatArgsDetail,
  formatToolLabel,
} from './chat-progress.js'
import {
  UserPromptBridge,
  createUserPromptId,
  parseAskUserArgs,
  type UserPromptAnswer,
  type UserPromptOption,
  UserPromptCancelledError,
} from './user-prompt.js'
import { SessionStore, sessionToMeta, type SessionRecord, type SessionContextRef, type CreateSessionOptions } from './sessions.js'
import { getExpertCatalogService } from './experts/catalog-service.js'
import {
  resolveInitialRolePersona,
  sanitizeExpertPersona,
} from './experts/prompt-assembler.js'
import { getWorkspaceService } from '@opptrix/agent-workspace'
import {
  bindWorkspaceToolBridge,
  type WorkspaceToolBridge,
} from './mcp/workspace-tools.js'
import {
  CONTEXT_COMPACT_HINT,
  ensureContextBudget,
  assembleModelView,
  estimateModelViewTokens,
  isContextOverflowError,
  KEEP_RECENT_DEFAULT,
} from './context/compact.js'
import { resolveModelContextTokensAsync } from './llm/models-dev-context.js'
import { estimateToolsTokens } from './context/token-estimate.js'
import {
  accumulateChatUsage,
  createEmptyChatUsage,
  resolveTurnUsage,
} from './llm/usage-estimate.js'
import { mergeTokenUsage, emptyTokenUsage, type TokenUsage } from './llm/token-usage.js'

export interface SessionContextUsage {
  usedTokens: number
  limitTokens: number
  remainingTokens: number
  modelRef: string
  estimated: true
}

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

// No hard limit on rounds — let the LLM naturally converge to a text response.
// Safety: if 50 rounds reached without convergence, force stop.
const MAX_SAFETY_ROUNDS = 50
const TRUNCATE = 12_000

function providerIdFromModelRef(modelRef?: string): string | undefined {
  if (!modelRef) return undefined
  const colonIdx = modelRef.indexOf(':')
  return colonIdx > 0 ? modelRef.slice(0, colonIdx) : undefined
}

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
  private readonly toolPackSessions = new ToolPackSessionStore()
  /** 当前 chat 回合解析出的 active pack ids（供 list_tool_packs / 可观测性） */
  private lastRoundPackIds: import('@opptrix/shared').ToolPackId[] = []
  /** 当前 chat 用户消息（播种用） */
  private lastChatSeedMessage = ''
  /** 本轮路由计划（首选工具 + 选型卡） */
  private lastRoutePlan: ToolRoutePlan | null = null
  private readonly expertPacksSeeded = new Set<string>()
  readonly userPromptBridge = new UserPromptBridge()
  private readonly workspaceService = getWorkspaceService()

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

  /** 按本轮 active tool names 创建聚合 MCP broker（本地 + 外部优先级链） */
  private async createRoundBroker(activeNames: readonly string[]) {
    return AggregatingToolBroker.create(
      () => McpToolBroker.create(this.tools, activeNames),
      getExternalMcpRegistry(),
    )
  }

  private resolveRoundPackIds(sessionId: string) {
    return resolveActivePackIds(this.toolPackSessions, sessionId, {
      message: this.lastChatSeedMessage,
      contextRef: this.sessions.get(sessionId)?.contextRef,
    })
  }

  /** 构建数据源优先级策略说明（注入 system prompt） */
  private buildDataSourcingPolicy(plan: ToolRoutePlan | null): string {
    const tier = plan?.researchTier ?? 'standard'
    const lines = [
      '【数据源优先级策略 — 必须严格遵守】',
      '0. 三级优先，不可倒置：远程 MCP 工具（命名空间 server__tool）= 最高优先，永远先用；本地工具 = 最低优先，仅作兜底。工具列表中远程工具已排在最前，同名能力优先取远程。',
      '1. 数据获取一律先调远程 MCP：同一能力若远程可用，禁止绕过远程直接调本地工具。',
      '2. 充分性自检：若远程返回缺字段、缺记录或数据陈旧，系统会自动补充本地数据后合并返回，无需你手动重复调用。',
      '3. 结果已标注 _mcp.source 和 _mcp.sufficient，据此判断可信度：',
      '   - source="external" + sufficient=true → 远程数据已完备，直接采用，勿重复调用',
      '   - source="external+local" + supplemented=true → 远程不足已补本地，合并后完备，可采用',
      '   - source="local" + degraded=true → 远程不可用，本地兜底降级，结果可能不完整：须在答复中提示该维度为降级数据、可信度受限，并在其它远程工具可用时尝试交叉补全',
      '4. 投研答复引用数据时体现数据源：远程权威源优于本地缓存；降级数据须显式标注不确定性。',
    ]
    // 高研究档位强调交叉验证
    if (tier === 'L3') {
      lines.push(`5. 当前为 ${tier} 档位：对重要标的/事件，即使远程已返回结果，也可主动补充本地交叉验证 — 但须在结果中注明来源与差异。`)
    }
    return lines.join('\n')
  }

  private buildRoundSystemPrompt(sessionId: string, activeNames: readonly string[]) {
    const record = this.ensureSessionRolePersona(sessionId)
    const expert = record?.expertId
      ? getExpertCatalogService().getDefinitionSync(record.expertId)
      : null
    const plan = this.lastRoutePlan ?? resolveToolRoutePlan({
      message: this.lastChatSeedMessage,
      contextRef: record?.contextRef ?? null,
    })
    const clock = getCurrentTime()
    return this.tools.systemPrompt({
      expert,
      sessionRolePersona: record?.rolePersona ?? null,
      roleLabel: expert?.title ?? null,
      activePacks: this.lastRoundPackIds,
      activeToolNames: activeNames,
      researchTier: expert?.defaultResearchTier ?? plan.researchTier,
      routePlaybook: buildRoundRoutePlaybook(plan, activeNames),
      sessionClock: buildSessionClockPlaybook(clock),
      dataSourcingPolicy: this.buildDataSourcingPolicy(plan),
    })
  }

  /** 旧会话 rolePersona 为空时惰性回填并持久化 */
  private ensureSessionRolePersona(sessionId: string): SessionRecord | null {
    const record = this.sessions.get(sessionId)
    if (!record) return null
    if (record.rolePersona?.trim()) return record
    let seed: string | null = null
    if (record.expertId) {
      const expert = getExpertCatalogService().getDefinitionSync(record.expertId)
      seed = expert?.persona ?? null
    }
    record.rolePersona = resolveInitialRolePersona(seed)
    this.sessions.save(record)
    return record
  }

  private seedExpertDefaultPacks(sessionId: string, record: SessionRecord) {
    if (!record.expertId) return
    const seedKey = `${sessionId}:${record.expertId}`
    if (this.expertPacksSeeded.has(seedKey)) return
    const expert = getExpertCatalogService().getDefinitionSync(record.expertId)
    if (!expert?.defaultPacks?.length) {
      this.expertPacksSeeded.add(seedKey)
      return
    }
    this.toolPackSessions.activate(sessionId, expert.defaultPacks)
    this.expertPacksSeeded.add(seedKey)
  }

  private async rebuildRoundTools(activeNames: readonly string[]) {
    const broker = await this.createRoundBroker(activeNames)
    const rawTools = await broker.openAiTools()
    const preferred = this.lastRoutePlan?.preferredTools ?? []
    // 远程 MCP 工具整体优先于本地兜底工具；preferred 排序仅在各自分组内生效。
    const openAiTools = orderToolsByPreference(rawTools, preferred, { remoteFirst: true })
    return { broker, openAiTools }
  }

  private bindWorkspaceBridge(sessionId: string, emit: (event: ChatProgressEvent) => void, signal?: AbortSignal) {
    const bridge: WorkspaceToolBridge = {
      sessionId,
      signal,
      confirm: async (payload: {
        title: string
        prompt: string
        options: Array<{ id: string; label: string }>
        operation: 'overwrite' | 'delete'
        root_id: string
        path: string
      }) => {
        const promptId = createUserPromptId()
        emit({
          type: 'user_prompt',
          prompt: {
            id: promptId,
            title: payload.title,
            prompt: payload.prompt,
            options: payload.options as UserPromptOption[],
          },
        })
        const answer = await this.userPromptBridge.waitForAnswer(sessionId, promptId, signal)
        return { selected_ids: answer.selected_ids }
      },
    }
    bindWorkspaceToolBridge(bridge)
  }

  listWorkspaceGrants(sessionId: string) {
    return this.workspaceService.listGrants(sessionId)
  }

  addWorkspaceGrant(
    sessionId: string,
    absPath: string,
    mode: 'ro' | 'rw',
    label?: string,
  ) {
    if (!this.sessions.get(sessionId)) return null
    return this.workspaceService.addGrant(sessionId, absPath, mode, label)
  }

  removeWorkspaceGrant(sessionId: string, grantId: string) {
    if (!this.sessions.get(sessionId)) return false
    return this.workspaceService.removeGrant(sessionId, grantId)
  }

  private bindPackBridge(sessionId: string) {
    this.tools.bindPackSession({
      sessionId,
      listPacks: () => listToolPacksPayload(this.lastRoundPackIds),
      activatePacks: (packIds: string[]) => {
        const { activated, skipped } = this.toolPackSessions.activate(sessionId, packIds)
        this.lastRoundPackIds = this.resolveRoundPackIds(sessionId)
        return {
          ok: true,
          activated,
          skipped,
          active_packs: this.lastRoundPackIds,
          tools_available: toolNamesForPacks(this.lastRoundPackIds).length,
          hint: skipped.length
            ? `部分 id 无效：${skipped.join(', ')}`
            : '已激活；本轮工具列表将立即刷新',
        }
      },
    })
  }

  setProviders(providers: ProviderProfile[], defaultModel?: string) {
    this.registry.setProviders(providers, defaultModel)
    this.settings.defaultModel = defaultModel
    this.settings.providers = providers
  }

  listAvailableModels(): AvailableModel[] {
    return this.registry.listAvailable()
  }

  async listAvailableModelsAsync(): Promise<AvailableModel[]> {
    return this.registry.listAvailableAsync()
  }

  async getSessionContextUsage(sessionId: string): Promise<SessionContextUsage | null> {
    const record = this.sessions.get(sessionId)
    if (!record) return null

    const modelRef = record.model?.trim()
      || this.settings.defaultModel
      || this.registry.listAvailable()[0]?.ref
      || ''
    const colonIdx = modelRef.indexOf(':')
    const providerId = colonIdx > 0 ? modelRef.slice(0, colonIdx) : undefined
    const resolved = this.registry.resolve(modelRef)
    const modelId = resolved?.model ?? modelRef.replace(/^[^:]+:/, '') ?? 'default'
    const limitTokens = await resolveModelContextTokensAsync(modelId, providerId)

    const activeNames = toolNamesForPacks(this.resolveRoundPackIds(sessionId))
    const systemPrompt = this.buildRoundSystemPrompt(sessionId, activeNames)
    const contextMessages = contextRefToChatMessages(record.contextRef)
    const modelView = assembleModelView({
      systemPrompt,
      sessionMemory: record.sessionMemory,
      messages: record.messages,
      contextPrefix: contextMessages,
      keepRecent: KEEP_RECENT_DEFAULT,
    })
    let toolsTokens = activeNames.length * 120
    try {
      const { broker, openAiTools } = await this.rebuildRoundTools(activeNames)
      try {
        toolsTokens = estimateToolsTokens(openAiTools)
      } finally {
        await broker.close().catch(() => {})
      }
    } catch {
      /* 无完整 schema 时沿用 activeNames 粗估 */
    }
    // modelView 已含 system + memory + 近端；tools 为 API 侧单独字段，另加固定开销
    const usedTokens = estimateModelViewTokens(modelView) + toolsTokens + 512

    return {
      usedTokens,
      limitTokens,
      remainingTokens: Math.max(0, limitTokens - usedTokens),
      modelRef,
      estimated: true,
    }
  }

  async setSessionModel(sessionId: string, modelRef: string | null): Promise<{
    session: SessionRecord
    contextHint?: string
  } | null> {
    const record = this.sessions.get(sessionId)
    if (!record) return null
    record.model = modelRef?.trim() || undefined
    this.sessions.save(record)

    const activeModel = record.model
    const llm = this.registry.createLlm(activeModel)
    const resolved = this.registry.resolve(activeModel)
    const modelId = resolved?.model ?? activeModel?.replace(/^[^:]+:/, '') ?? 'default'
    const providerId = providerIdFromModelRef(activeModel)
    const activeNames = toolNamesForPacks(this.resolveRoundPackIds(sessionId))
    const systemPrompt = this.buildRoundSystemPrompt(sessionId, activeNames)
    const budget = await this.applyContextBudget(record, {
      modelId,
      providerId,
      systemPrompt,
      tools: undefined,
      llm,
      emit: undefined,
      aggressive: false,
    })
    return { session: record, contextHint: budget.hint }
  }

  /** 按模型窗预算压缩；返回用户可见轻提示文案（无变更则 undefined） */
  private async applyContextBudget(
    record: SessionRecord,
    opts: {
      modelId: string
      providerId?: string
      systemPrompt: string
      tools?: import('./tools.js').OpenAiTool[]
      llm: ReturnType<ProviderRegistry['createLlm']>
      emit?: (event: ChatProgressEvent) => void
      aggressive?: boolean
      contextPrefix?: ChatMessage[]
      signal?: AbortSignal
    },
  ): Promise<{
    hint?: string
    modelView: ChatMessage[]
    compactUsage?: TokenUsage
    compactUsageEstimated?: boolean
  }> {
    const result = await ensureContextBudget({
      modelId: opts.modelId,
      providerId: opts.providerId,
      systemPrompt: opts.systemPrompt,
      tools: opts.tools,
      state: {
        messages: record.messages,
        sessionMemory: record.sessionMemory,
      },
      contextPrefix: opts.contextPrefix,
      llm: opts.llm,
      signal: opts.signal,
      aggressive: opts.aggressive,
    })

    if (result.results.some(r => r.changed)) {
      record.messages = result.state.messages
      record.sessionMemory = result.state.sessionMemory ?? null
      this.sessions.save(record)
      for (const r of result.results) {
        if (!r.changed) continue
        opts.emit?.({
          type: 'context_compact',
          level: r.level,
          message: r.message,
          usageRatio: r.usageRatio,
          contextTokens: r.contextTokens,
        })
      }
      return {
        hint: CONTEXT_COMPACT_HINT,
        modelView: result.modelView,
        compactUsage: result.compactUsage,
        compactUsageEstimated: result.compactUsageEstimated,
      }
    }
    return {
      modelView: result.modelView,
      compactUsage: result.compactUsage,
      compactUsageEstimated: result.compactUsageEstimated,
    }
  }

  async createSession(opts?: CreateSessionOptions) {
    if (opts?.expertId) {
      const expert = await getExpertCatalogService().getDefinition(opts.expertId)
      if (!expert) {
        throw new Error(`未知专家：${opts.expertId}`)
      }
      return this.sessions.create({
        title: opts.title?.trim() || expert.defaultSessionTitle || expert.title,
        expertId: expert.id,
        expertIcon: expert.icon,
        rolePersona: resolveInitialRolePersona(expert.persona),
      })
    }
    return this.sessions.create({
      title: opts?.title?.trim() || '新对话',
      rolePersona: resolveInitialRolePersona(null),
    })
  }

  listExperts(query?: import('@opptrix/shared').ExpertListQuery) {
    return getExpertCatalogService().listExperts(query)
  }

  getExpert(id: string) {
    return getExpertCatalogService().getDefinition(id)
  }

  createExpert(input: import('@opptrix/shared').ExpertCreateInput) {
    return getExpertCatalogService().createExpert(input)
  }

  updateExpert(id: string, patch: import('@opptrix/shared').ExpertPatchInput) {
    return getExpertCatalogService().updateExpert(id, patch)
  }

  deleteExpert(id: string) {
    return getExpertCatalogService().deleteExpert(id)
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

  getSessionRolePersona(id: string): { rolePersona: string; expertId: string | null } | null {
    const record = this.ensureSessionRolePersona(id)
    if (!record) return null
    return {
      rolePersona: record.rolePersona ?? resolveInitialRolePersona(null),
      expertId: record.expertId ?? null,
    }
  }

  setSessionRolePersona(id: string, raw: string): SessionRecord | null {
    if (!this.sessions.get(id)) return null
    const sanitized = sanitizeExpertPersona(raw)
    if (!sanitized) {
      throw new Error('技能专长无效，请修改后重试')
    }
    return this.sessions.updateRolePersona(id, sanitized)
  }

  sessionMeta(record: SessionRecord) {
    return sessionToMeta(record)
  }

  deleteSession(id: string) {
    this.userPromptBridge.cancelSession(id)
    this.toolPackSessions.clear(id)
    this.workspaceService.clearSession(id)
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
    const source = this.ensureSessionRolePersona(sessionId)
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
      {
        role: 'system',
        content: this.tools.systemPrompt({
          sessionClock: buildSessionClockPlaybook(getCurrentTime()),
          researchTier: 'L2',
        }),
      },
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

    const toolsUsed: string[] = []
    const toolSteps: ChatToolStep[] = []
    let chatUsage = createEmptyChatUsage()

    const emitDone = async (payload: {
      reply: string
      partialTools?: string[]
      partialSteps?: ChatToolStep[]
      cancelled?: boolean
    }) => {
      const contextUsage = await this.getSessionContextUsage(sessionId)
      emit({
        type: 'done',
        reply: payload.reply,
        tools_used: payload.partialTools ?? toolsUsed,
        session_id: sessionId,
        title: record!.title,
        tool_steps: payload.partialSteps ?? toolSteps,
        cancelled: payload.cancelled,
        turn_usage: chatUsage.usage.totalTokens > 0 ? {
          ...chatUsage.usage,
          estimated: chatUsage.estimated || undefined,
        } : undefined,
        context_usage: contextUsage ?? undefined,
      })
    }

    const pushAssistant = (
      reply: string,
      used: string[],
      steps: ChatToolStep[],
      usage?: TokenUsage,
      usageEstimated?: boolean,
    ) => {
      this.pushAssistant(record!, reply, used, steps, usage, usageEstimated)
    }

    const finalizeCancelled = (partialTools: string[], partialSteps: ChatToolStep[]): ChatResult => {
      this.userPromptBridge.cancelSession(sessionId)
      record!.messages = record!.messages.slice(0, messagesBeforeAssistant)
      if (record!.turns) {
        record!.turns = record!.turns.slice(0, turnsBeforeAssistant + 1)
      }
      const reply = '（已停止）'
      pushAssistant(
        reply,
        partialTools,
        partialSteps,
        chatUsage.usage.totalTokens > 0 ? chatUsage.usage : undefined,
        chatUsage.estimated,
      )
      emit({ type: 'error', message: '已取消' })
      void emitDone({ reply, partialTools, partialSteps, cancelled: true })
      return { reply, toolsUsed: partialTools, sessionId, title: record!.title }
    }

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

    this.lastChatSeedMessage = text
    this.lastRoutePlan = resolveToolRoutePlan({
      message: text,
      contextRef: record.contextRef,
    })
    this.seedExpertDefaultPacks(sessionId, record)
    this.bindPackBridge(sessionId)
    this.bindWorkspaceBridge(sessionId, emit, signal)
    this.lastRoundPackIds = this.resolveRoundPackIds(sessionId)
    let activeNames = toolNamesForPacks(this.lastRoundPackIds)
    let { broker, openAiTools } = await this.rebuildRoundTools(activeNames)

    try {
    for (let round = 0; round < MAX_SAFETY_ROUNDS; round++) {
      throwIfAborted(signal)
      // 每轮刷新会话时钟，保证长工具链下「截至」仍准确
      const systemPrompt = this.buildRoundSystemPrompt(sessionId, activeNames)
      const contextMessages = contextRefToChatMessages(record.contextRef)
      const resolvedModel = this.registry.resolve(activeModel)
      const modelId = resolvedModel?.model
        ?? activeModel?.replace(/^[^:]+:/, '')
        ?? 'default'
      const providerId = providerIdFromModelRef(activeModel)

      let overflowRetried = false
      const runLlmRound = async (aggressive: boolean) => {
        const budgeted = await this.applyContextBudget(record, {
          modelId,
          providerId,
          systemPrompt,
          tools: openAiTools,
          llm,
          emit,
          aggressive,
          contextPrefix: contextMessages,
          signal,
        })
        if (budgeted.compactUsage) {
          chatUsage = accumulateChatUsage(chatUsage, {
            usage: budgeted.compactUsage,
            estimated: budgeted.compactUsageEstimated ?? true,
          })
        }
        const turn = await llm.chat(budgeted.modelView, openAiTools, signal)
        chatUsage = accumulateChatUsage(chatUsage, resolveTurnUsage(turn, budgeted.modelView))
        return turn
      }

      emit({
        type: 'thinking',
        round: round + 1,
        label: round === 0 ? '模型正在思考…' : '模型正在整理结果…',
        active_packs: this.lastRoundPackIds,
        tools_exposed_count: activeNames.length,
        preferred_tools: this.lastRoutePlan?.preferredTools,
        route_intent: this.lastRoutePlan?.intent,
        research_tier: this.lastRoutePlan?.researchTier,
      })

      let turn = await runLlmRound(false)
      throwIfAborted(signal)

      if (
        turn.finishReason === 'error'
        && !overflowRetried
        && (turn.contextOverflow || isContextOverflowError(turn.error, turn.message.content))
      ) {
        overflowRetried = true
        emit({
          type: 'context_compact',
          level: 'overflow_retry',
          message: CONTEXT_COMPACT_HINT,
        })
        turn = await runLlmRound(true)
        throwIfAborted(signal)
      }

      if (turn.finishReason === 'error') {
        if (turn.error === 'cancelled' || signal?.aborted) {
          return finalizeCancelled(toolsUsed, toolSteps)
        }
        const overflow = turn.contextOverflow || isContextOverflowError(turn.error, turn.message.content)
        const reply = overflow
          ? '对话内容过多，整理后仍无法继续。请新开对话，或换用更大上下文窗口的模型。'
          : (turn.message.content ?? turn.error ?? '请求失败')
        pushAssistant(reply, toolsUsed, toolSteps, chatUsage.usage.totalTokens > 0 ? chatUsage.usage : undefined, chatUsage.estimated)
        emit({
          type: 'error',
          message: reply,
        })
        void emitDone({ reply })
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
            active_packs: this.lastRoundPackIds,
            tools_exposed_count: activeNames.length,
          })
        }

        record.messages.push({
          role: 'assistant',
          content: turn.message.content ?? null,
          tool_calls: turn.message.tool_calls,
        })
        this.sessions.save(record)

        let refreshTools = false
        const activeSet = new Set(activeNames)

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
            argsDetail: formatArgsDetail(args),
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
            } else if (!activeSet.has(fn) && !parseNamespacedMcpTool(fn)) {
              result = { error: unloadedToolHint(fn) }
            } else {
              result = await broker.call(fn, args, { signal })
              if (
                fn === 'activate_tool_pack'
                || fn === 'enable_mcp_server'
                || fn === 'disable_mcp_server'
                || fn === 'edit_mcp_server'
                || fn === 'install_mcp_server'
                || fn === 'uninstall_mcp_server'
                || fn === 'reorder_mcp_servers'
              ) {
                refreshTools = true
              }
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

        if (refreshTools) {
          await broker.close()
          this.lastRoundPackIds = this.resolveRoundPackIds(sessionId)
          activeNames = toolNamesForPacks(this.lastRoundPackIds)
          ;({ broker, openAiTools } = await this.rebuildRoundTools(activeNames))
        }
        continue
      }

      const reply = turn.message.content?.trim() || '（无回复内容）'
      emit({ type: 'reply', content: reply })
      pushAssistant(
        reply,
        toolsUsed,
        toolSteps,
        chatUsage.usage.totalTokens > 0 ? chatUsage.usage : undefined,
        chatUsage.estimated,
      )
      void emitDone({ reply })
      return { reply, toolsUsed, sessionId, title: record.title }
    }

    const reply = '⚠️ 分析轮次过多，请简化问题或明确分析方向后重试。'
    pushAssistant(
      reply,
      toolsUsed,
      toolSteps,
      chatUsage.usage.totalTokens > 0 ? chatUsage.usage : undefined,
      chatUsage.estimated,
    )
    void emitDone({ reply })
    return { reply, toolsUsed, sessionId, title: record.title }
    } finally {
      await broker.close().catch(() => {})
      this.tools.clearPackSession()
      bindWorkspaceToolBridge(null)
    }
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
    usage?: TokenUsage,
    usageEstimated?: boolean,
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
      usage,
      usageEstimated,
    })
    if (usage) {
      record.usageTotals = mergeTokenUsage(record.usageTotals ?? emptyTokenUsage(), usage)
    }
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
