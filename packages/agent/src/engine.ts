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
  AgentSkillSessionStore,
  MAX_ACTIVATED_AGENT_SKILLS,
} from './mcp/agent-skill-session.js'
import {
  buildSkillCatalogPrompt,
  buildActivatedSkillsPrompt,
  getSkill,
  resolveSkillDependencies,
} from '@opptrix/agent-skills'
import {
  resolveToolRoutePlan,
  buildRoundRoutePlaybook,
  orderToolsByPreference,
  type ToolRoutePlan,
} from './mcp/tool-route-plan.js'
import { buildSessionClockPlaybook, parseNamespacedMcpTool } from '@opptrix/shared'
import {
  logChatDebugAbort,
  logChatDebugEmptyReply,
  logChatDebugRoundEnd,
  logChatDebugRoundStart,
} from './chat-debug-log.js'
import {
  applySessionLanAskChoice,
  getWorkspaceService,
} from '@opptrix/agent-workspace'
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
import { SessionStore, sessionToMeta, type SessionRecord, type SessionContextRef, type CreateSessionOptions, type ReasoningEffort } from './sessions.js'
import { getExpertCatalogService } from './experts/catalog-service.js'
import {
  resolveInitialRolePersona,
  sanitizeExpertPersona,
} from './experts/prompt-assembler.js'
import {
  bindWorkspaceToolBridge,
  unbindWorkspaceToolBridge,
  type WorkspaceToolBridge,
} from './mcp/workspace-tools.js'
import { runInToolSession } from './mcp/tool-session-context.js'
import {
  CONTEXT_COMPACT_HINT,
  ensureContextBudget,
  assembleModelView,
  estimateModelViewTokens,
  isContextOverflowError,
  KEEP_RECENT_DEFAULT,
} from './context/compact.js'
import { resolveModelContextTokensAsync, resolveModelMediaCapabilitiesAsync } from './llm/models-dev-context.js'
import { estimateToolsTokens, estimateTextTokens } from './context/token-estimate.js'
import {
  accumulateChatUsage,
  createEmptyChatUsage,
  resolveTurnUsage,
} from './llm/usage-estimate.js'
import { mergeTokenUsage, emptyTokenUsage, type TokenUsage } from './llm/token-usage.js'
import {
  isLibraryExtractReady,
  isTranscriptExtractReady,
  readAttachmentMeta,
  validateAttachmentAgainstCapabilities,
  waitForAttachmentExtractReady,
} from './chat-attachments.js'
import type { ChatAttachmentMeta } from './media-types.js'
import { isLibraryIngestKind, isTranscriptExtractKind } from './media-types.js'
import { buildUserContentParts, chatMessageContentToText } from './content-parts.js'

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
  private readonly agentSkillSessions = new AgentSkillSessionStore()
  /** 当前 chat 回合解析出的 active pack ids（供 list_tool_packs / 可观测性） */
  private lastRoundPackIds: import('@opptrix/shared').ToolPackId[] = []
  /** 当前 chat 用户消息（播种用） */
  private lastChatSeedMessage = ''
  /** 本轮路由计划（首选工具 + 选型卡） */
  private lastRoutePlan: ToolRoutePlan | null = null
  private readonly expertPacksSeeded = new Set<string>()
  readonly userPromptBridge = new UserPromptBridge()
  private readonly workspaceService = getWorkspaceService()
  /** 会话上下文用量估算缓存（内存；切会话命中则不再 rebuildRoundTools） */
  private readonly contextUsageCache = new Map<string, SessionContextUsage>()
  /** 附件 GET 与 content parts 本地 URL 前缀 */
  private apiBaseUrl = 'http://127.0.0.1:8711/api'

  setApiBaseUrl(url: string) {
    const trimmed = url.trim().replace(/\/$/, '')
    if (trimmed) this.apiBaseUrl = trimmed
  }

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
    const activatedSkills = this.agentSkillSessions.getActivated(sessionId)
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
      agentSkillCatalog: buildSkillCatalogPrompt(),
      activatedAgentSkills: buildActivatedSkillsPrompt(activatedSkills),
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

  private bindWorkspaceBridge(sessionId: string, emit: (event: ChatProgressEvent) => void, signal?: AbortSignal): number {
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
      askUser: async (payload) => {
        const promptId = createUserPromptId()
        emit({
          type: 'user_prompt',
          prompt: {
            id: promptId,
            title: payload.title,
            prompt: payload.prompt,
            options: payload.options,
            allowMultiple: payload.allowMultiple,
            kind: 'choice',
          },
        })
        return this.userPromptBridge.waitForAnswer(sessionId, promptId, signal)
      },
      askSecret: async (payload) => {
        const promptId = createUserPromptId()
        emit({
          type: 'user_prompt',
          prompt: {
            id: promptId,
            title: payload.title,
            prompt: payload.prompt,
            options: [{ id: 'cancel', label: '取消' }],
            kind: 'secret',
            name: payload.name,
            inject_hosts: payload.inject_hosts,
          },
        })
        return this.userPromptBridge.waitForAnswer(sessionId, promptId, signal)
      },
    }
    return bindWorkspaceToolBridge(bridge)
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

  private bindPackBridge(sessionId: string): number {
    return this.tools.bindPackSession({
      sessionId,
      listPacks: () => listToolPacksPayload(this.lastRoundPackIds),
      activatePacks: (packIds: string[]) => {
        const { activated, skipped } = this.toolPackSessions.activate(sessionId, packIds)
        this.lastRoundPackIds = this.resolveRoundPackIds(sessionId)
        this.invalidateContextUsage(sessionId)
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

  private bindSkillBridge(sessionId: string): number {
    return this.tools.bindSkillSession({
      sessionId,
      getActivated: () => this.agentSkillSessions.getActivated(sessionId),
      activateSkills: (skillNames: string[]) => {
        const existing = new Set(skillNames.map(n => n.trim()).filter(Boolean))
        const skippedUnknown: string[] = []
        const valid: string[] = []
        for (const name of existing) {
          if (!getSkill(name)) skippedUnknown.push(name)
          else valid.push(name)
        }
        const { activated, skipped, active, depNotes } = this.agentSkillSessions.activate(
          sessionId,
          valid,
          { resolveDeps: (n) => resolveSkillDependencies(n) },
        )
        const allSkipped = [...skipped, ...skippedUnknown]
        this.invalidateContextUsage(sessionId)
        const hintParts = [allSkipped.length
          ? `部分技能未激活：${allSkipped.join(', ')}（可能不存在或已达上限 ${MAX_ACTIVATED_AGENT_SKILLS}）`
          : '已激活；完整步骤已注入本会话']
        if (depNotes.length) hintParts.push(...depNotes)
        return {
          ok: true,
          activated,
          skipped: allSkipped,
          active_skills: active,
          max_activated: MAX_ACTIVATED_AGENT_SKILLS,
          dep_notes: depNotes,
          hint: hintParts.join('；'),
        }
      },
    })
  }

  setProviders(providers: ProviderProfile[], defaultModel?: string) {
    this.registry.setProviders(providers, defaultModel)
    this.settings.defaultModel = defaultModel
    this.settings.providers = providers
    this.contextUsageCache.clear()
  }

  listAvailableModels(): AvailableModel[] {
    return this.registry.listAvailable()
  }

  async listAvailableModelsAsync(): Promise<AvailableModel[]> {
    return this.registry.listAvailableAsync()
  }

  /** 仅读缓存；miss 时返回 null，不触发估算（供 getSession 非阻塞） */
  getCachedSessionContextUsage(sessionId: string): SessionContextUsage | null {
    return this.contextUsageCache.get(sessionId) ?? null
  }

  private invalidateContextUsage(sessionId: string) {
    this.contextUsageCache.delete(sessionId)
  }

  async getSessionContextUsage(
    sessionId: string,
    opts?: { force?: boolean },
  ): Promise<SessionContextUsage | null> {
    if (opts?.force !== true) {
      const cached = this.contextUsageCache.get(sessionId)
      if (cached) return cached
    }

    const record = this.sessions.get(sessionId)
    if (!record) {
      this.invalidateContextUsage(sessionId)
      return null
    }

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

    const usage: SessionContextUsage = {
      usedTokens,
      limitTokens,
      remainingTokens: Math.max(0, limitTokens - usedTokens),
      modelRef,
      estimated: true,
    }
    this.contextUsageCache.set(sessionId, usage)
    return usage
  }

  async setSessionModel(sessionId: string, modelRef: string | null): Promise<{
    session: SessionRecord
    contextHint?: string
  } | null> {
    const record = this.sessions.get(sessionId)
    if (!record) return null
    record.model = modelRef?.trim() || undefined
    this.sessions.save(record)
    this.invalidateContextUsage(sessionId)

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
    // UI 会 refreshContextUsage；此处不 force，避免 setModel 路径额外阻塞
    return { session: record, contextHint: budget.hint }
  }

  setSessionLlmParams(
    sessionId: string,
    patch: {
      temperature?: number
      maxTokens?: number
      reasoningEffort?: ReasoningEffort | null
    },
  ): SessionRecord | null {
    return this.sessions.updateLlmParams(sessionId, patch)
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
      this.invalidateContextUsage(record.id)
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
    const model = opts?.model?.trim() || this.settings.defaultModel?.trim() || undefined
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
        model,
      })
    }
    return this.sessions.create({
      title: opts?.title?.trim() || '新对话',
      rolePersona: resolveInitialRolePersona(null),
      model,
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
    const updated = this.sessions.updateRolePersona(id, sanitized)
    this.invalidateContextUsage(id)
    return updated
  }

  sessionMeta(record: SessionRecord) {
    return sessionToMeta(record)
  }

  deleteSession(id: string) {
    this.userPromptBridge.cancelSession(id)
    this.toolPackSessions.clear(id)
    this.agentSkillSessions.clear(id)
    this.workspaceService.clearSession(id)
    this.sessions.delete(id)
    this.invalidateContextUsage(id)
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

  /** 截断会话至指定 user display turn 之前（编辑重发前调用） */
  truncateSession(sessionId: string, messageIndex: number) {
    this.userPromptBridge.cancelSession(sessionId)
    const updated = this.sessions.truncateFromDisplayIndex(sessionId, messageIndex)
    this.invalidateContextUsage(sessionId)
    return updated
  }

  getSessionContextRef(sessionId: string): SessionContextRef | null {
    const record = this.sessions.get(sessionId)
    return record?.contextRef ?? null
  }

  clearSessionContextRef(sessionId: string) {
    const updated = this.sessions.clearContextRef(sessionId)
    this.invalidateContextUsage(sessionId)
    return updated
  }

  setSessionContextRef(sessionId: string, contextRef: SessionContextRef | null) {
    const updated = this.sessions.setContextRef(sessionId, contextRef)
    this.invalidateContextUsage(sessionId)
    return updated
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

    const turn = await llm.chat(messages, undefined, undefined, {
      temperature: record.llmParams?.temperature,
      maxTokens: record.llmParams?.maxTokens,
      reasoningEffort: record.llmParams?.reasoningEffort,
    })
    if (turn.finishReason === 'error') {
      return { reply: chatMessageContentToText(turn.message.content) || turn.error || '请求失败' }
    }
    return { reply: chatMessageContentToText(turn.message.content).trim() || '（无回复内容）' }
  }

  resolveUserPrompt(sessionId: string, promptId: string, answer: UserPromptAnswer) {
    return this.userPromptBridge.submit(sessionId, promptId, answer)
  }

  async chat(
    sessionId: string,
    message: string,
    modelRef?: string,
    progress?: ChatProgressOptions,
    attachmentIds?: string[],
  ): Promise<ChatResult> {
    const text = message.trim()
    let record = this.sessions.get(sessionId)
    if (!record) {
      record = this.sessions.create('新对话')
      sessionId = record.id
    }

    const attachmentMetas: ChatAttachmentMeta[] = []
    for (const id of attachmentIds ?? []) {
      const trimmed = id.trim()
      if (!trimmed) continue
      const meta = readAttachmentMeta(sessionId, trimmed)
      if (meta) attachmentMetas.push(meta)
    }

    if (!text && !attachmentMetas.length) {
      return { reply: '请输入问题。', toolsUsed: [], sessionId }
    }

    const activeModel = modelRef?.trim() || record.model

    // 研报库 / 音视频附件：发送前短等整理或转写；ready 后以文本过校验
    const resolvedAttachments: ChatAttachmentMeta[] = []
    for (const meta of attachmentMetas) {
      const needsExtractWait =
        isLibraryIngestKind(meta.kind) || isTranscriptExtractKind(meta.kind)
      if (!needsExtractWait) {
        resolvedAttachments.push(meta)
        continue
      }
      if (isTranscriptExtractKind(meta.kind)) {
        progress?.onProgress?.({
          type: 'thinking',
          round: 0,
          label: meta.extract?.message?.trim() || '正在转写音视频…',
        })
      }
      const waited = await waitForAttachmentExtractReady(
        sessionId,
        meta.id,
        undefined,
        isTranscriptExtractKind(meta.kind)
          ? {
              onPending: (pendingMeta) => {
                const label = pendingMeta.extract?.message?.trim() || '正在转写音视频…'
                progress?.onProgress?.({
                  type: 'thinking',
                  round: 0,
                  label,
                })
              },
            }
          : undefined,
      )
      if (!waited.ok) {
        return {
          reply: waited.message,
          toolsUsed: [],
          sessionId,
          title: record.title,
        }
      }
      resolvedAttachments.push(waited.meta)
    }

    let mediaCaps: Awaited<ReturnType<typeof resolveModelMediaCapabilitiesAsync>> | undefined
    if (resolvedAttachments.length) {
      const resolvedModel = this.registry.resolve(activeModel)
      const modelId = resolvedModel?.model
        ?? activeModel?.replace(/^[^:]+:/, '')
        ?? 'default'
      const providerId = providerIdFromModelRef(activeModel)
      mediaCaps = await resolveModelMediaCapabilitiesAsync(modelId, providerId)
      let count = 0
      let total = 0
      for (const meta of resolvedAttachments) {
        // 已整理的研报库 / 已转写音视频不占原生多模态能力；
        // 图片 OCR ready 亦不强制 vision（image_url 由 mediaCaps 门控）
        if (
          isLibraryExtractReady(meta)
          || isTranscriptExtractReady(meta)
        ) {
          count += 1
          total += meta.size
          continue
        }
        const validation = validateAttachmentAgainstCapabilities(
          meta.kind,
          meta.size,
          mediaCaps,
          count,
          total,
        )
        if (!validation.ok) {
          return {
            reply: validation.error,
            toolsUsed: [],
            sessionId,
            title: record.title,
          }
        }
        count += 1
        total += meta.size
      }
    }

    const llm = this.registry.createLlm(activeModel)
    if (modelRef?.trim()) {
      record.model = modelRef.trim()
    }

    const userContent = resolvedAttachments.length
      ? buildUserContentParts(
        text,
        sessionId,
        resolvedAttachments,
        this.apiBaseUrl,
        mediaCaps,
      )
      : text

    record.messages.push({ role: 'user', content: userContent })
    if (!record.turns) record.turns = []
    const turnsBeforeAssistant = record.turns.length
    record.turns.push({
      role: 'user',
      content: text || '（附件）',
      attachments: resolvedAttachments.length ? resolvedAttachments : undefined,
      at: new Date().toISOString(),
    })
    const messagesBeforeAssistant = record.messages.length
    if (record.title === '新对话' || record.messages.filter(m => m.role === 'user').length === 1) {
      const titleSeed = text || resolvedAttachments[0]?.name || '新对话'
      record.title = titleSeed.slice(0, 28) + (titleSeed.length > 28 ? '…' : '')
    }
    this.sessions.save(record)
    this.invalidateContextUsage(sessionId)

    const emit = (event: ChatProgressEvent) => {
      progress?.onProgress?.(event)
    }

    const signal = progress?.signal

    const toolsUsed: string[] = []
    const toolSteps: ChatToolStep[] = []
    const createdAttachments: ChatAttachmentMeta[] = []
    let chatUsage = createEmptyChatUsage()

    const mergeAssistantAttachments = (
      outputAttachments?: ChatAttachmentMeta[],
    ): ChatAttachmentMeta[] | undefined => {
      const byId = new Map<string, ChatAttachmentMeta>()
      for (const a of [...(outputAttachments ?? []), ...createdAttachments]) {
        if (a?.id) byId.set(a.id, a)
      }
      const list = [...byId.values()]
      return list.length ? list : undefined
    }

    const emitDone = async (payload: {
      reply: string
      partialTools?: string[]
      partialSteps?: ChatToolStep[]
      cancelled?: boolean
    }) => {
      const contextUsage = await this.getSessionContextUsage(sessionId, { force: true })
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
      attachments?: ChatAttachmentMeta[],
    ) => {
      this.pushAssistant(record!, reply, used, steps, usage, usageEstimated, attachments)
    }

    const finalizeCancelled = (partialTools: string[], partialSteps: ChatToolStep[]): ChatResult => {
      logChatDebugAbort(sessionId, { reason: 'cancelled' })
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
    const packBridgeGen = this.bindPackBridge(sessionId)
    const skillBridgeGen = this.bindSkillBridge(sessionId)
    const workspaceBridgeGen = this.bindWorkspaceBridge(sessionId, emit, signal)
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

      logChatDebugRoundStart(sessionId, { round: round + 1, model: activeModel || modelId })

      let overflowRetried = false
      let lastRoundEstimatedTokens: number | undefined
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
        let accumulated = ''
        let stopTokenProgress = false
        let lastEmitAt = 0
        let lastTokens = -1
        let pendingTokens: number | null = null
        const TOKEN_PROGRESS_THROTTLE_MS = 80
        const emitTokenProgress = (n: number) => {
          lastEmitAt = Date.now()
          lastTokens = n
          pendingTokens = null
          emit({ type: 'reply', estimatedTokens: n })
        }
        const turn = await llm.chat(budgeted.modelView, openAiTools, signal, {
          sessionId,
          temperature: record.llmParams?.temperature,
          maxTokens: record.llmParams?.maxTokens,
          reasoningEffort: record.llmParams?.reasoningEffort,
          onDelta: (delta) => {
            if (delta.hasToolCalls) {
              stopTokenProgress = true
              pendingTokens = null
              return
            }
            if (stopTokenProgress || !delta.text) return
            accumulated += delta.text
            const n = estimateTextTokens(accumulated)
            if (n === lastTokens) return
            const now = Date.now()
            if (lastEmitAt > 0 && now - lastEmitAt < TOKEN_PROGRESS_THROTTLE_MS) {
              pendingTokens = n
              return
            }
            emitTokenProgress(n)
          },
        })
        // 流结束：flush pending，并保证有一次最终 estimatedTokens
        if (!stopTokenProgress && accumulated) {
          const n = estimateTextTokens(accumulated)
          emitTokenProgress(n)
          lastRoundEstimatedTokens = n
        } else {
          lastRoundEstimatedTokens = undefined
        }
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
        && (turn.contextOverflow || isContextOverflowError(turn.error, chatMessageContentToText(turn.message.content)))
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

      const turnContentText = chatMessageContentToText(turn.message.content)
      logChatDebugRoundEnd(sessionId, {
        finishReason: turn.finishReason,
        contentLen: turnContentText.length,
        toolCallNames: turn.message.tool_calls?.map(tc => tc.function.name).filter(Boolean),
        usage: turn.usage
          ? {
              promptTokens: turn.usage.promptTokens,
              completionTokens: turn.usage.completionTokens,
              totalTokens: turn.usage.totalTokens,
            }
          : undefined,
      })

      if (turn.finishReason === 'error') {
        if (turn.error === 'cancelled' || signal?.aborted) {
          return finalizeCancelled(toolsUsed, toolSteps)
        }
        const overflow = turn.contextOverflow || isContextOverflowError(turn.error, turnContentText)
        const reply = overflow
          ? '对话内容过多，整理后仍无法继续。请新开对话，或换用更大上下文窗口的模型。'
          : (turnContentText || turn.error || '请求失败')
        pushAssistant(reply, toolsUsed, toolSteps, chatUsage.usage.totalTokens > 0 ? chatUsage.usage : undefined, chatUsage.estimated)
        emit({
          type: 'error',
          message: reply,
        })
        void emitDone({ reply })
        return { reply, toolsUsed, sessionId, title: record.title }
      }

      if (turn.finishReason === 'tool_calls' && turn.message.tool_calls?.length) {
        const thinkingSnippet = turnContentText.trim()
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
          content: turnContentText || null,
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
                const resultPayload: Record<string, unknown> = { ok: true, ...answer }
                if (answer.selected_ids.includes('allow_lan_session')) {
                  applySessionLanAskChoice(sessionId, answer.selected_ids)
                  resultPayload.lan_granted = true
                  resultPayload.lan_note = '本对话已允许局域网；具体域名仍可能需出站确认'
                }
                result = resultPayload
              }
            } else if (!activeSet.has(fn) && !parseNamespacedMcpTool(fn)) {
              result = { error: unloadedToolHint(fn) }
            } else {
              result = await runInToolSession(sessionId, () => broker.call(fn, args, { signal }))
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

          if (result && typeof result === 'object' && !Array.isArray(result)) {
            const att = (result as Record<string, unknown>).attachment
            if (
              att
              && typeof att === 'object'
              && typeof (att as ChatAttachmentMeta).id === 'string'
              && typeof (att as ChatAttachmentMeta).kind === 'string'
            ) {
              createdAttachments.push(att as ChatAttachmentMeta)
            }
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

      const replyRaw = turnContentText.trim()
      const isEmptyReply = !replyRaw || replyRaw === '（无回复内容）'
      const reply = replyRaw || '（无回复内容）'
      if (isEmptyReply) {
        logChatDebugEmptyReply(sessionId, { round: round + 1 })
      }
      const outputAttachments = turn.outputAttachments
      emit({
        type: 'reply',
        content: reply,
        ...(lastRoundEstimatedTokens != null ? { estimatedTokens: lastRoundEstimatedTokens } : {}),
      })
      pushAssistant(
        reply,
        toolsUsed,
        toolSteps,
        chatUsage.usage.totalTokens > 0 ? chatUsage.usage : undefined,
        chatUsage.estimated,
        mergeAssistantAttachments(outputAttachments),
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
      mergeAssistantAttachments(),
    )
    void emitDone({ reply })
    return { reply, toolsUsed, sessionId, title: record.title }
    } finally {
      await broker.close().catch(() => {})
      this.tools.clearPackSession(sessionId, packBridgeGen)
      this.tools.clearSkillSession(sessionId, skillBridgeGen)
      unbindWorkspaceToolBridge(sessionId, workspaceBridgeGen)
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
    attachments?: ChatAttachmentMeta[],
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
      attachments: attachments?.length ? attachments : undefined,
    })
    if (usage) {
      record.usageTotals = mergeTokenUsage(record.usageTotals ?? emptyTokenUsage(), usage)
    }
    this.sessions.save(record)
    this.invalidateContextUsage(record.id)
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
