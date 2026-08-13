import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Fastify from 'fastify'
import { createBrowserSessionManager, registerBrowserShutdownHooks } from '@opptrix/agent-browser'
import { AgentEngine, buildAgentSafeProjectInfo, fetchOpenAiModelList, getModelsDevCatalog, initOutboundNetwork, type ChatProgressEvent, type SessionContextRef } from '@opptrix/agent'
import { getWorkspaceService, assertAllowedShellArgv, getSessionSecretAccessStore, PathEscapeError, DenyPathError, WorkspaceError } from '@opptrix/agent-workspace'
import { getUserDataStore } from '@opptrix/user-store'
import { ResearchHub } from '@opptrix/research-hub'
import { listTemplates, REGISTRY } from '@opptrix/stock-eval'
import {
  loadConfig, saveConfig, publicConfig, toAgentProviders,
  resolveProviderPresets, type StoredProvider,
} from './config.js'
import { closeMarketDuckRuntime, getMarketDataService } from '@opptrix/market-data-store'
import { registerStaticUi, shouldServeUi, isApiPath, resolveUiDist } from './static-ui.js'
import { cancelDiscoverJob, deleteDiscoverJob, getDiscoverJob, listDiscoverJobs, startDiscoverCustomJob, startDiscoverJob } from './discover-jobs.js'
import { cancelSessionChat, clearSessionChat, registerSessionChat } from './session-chat-runs.js'
import {
  deleteCustomDiscoverStrategy,
  listCustomDiscoverStrategies,
  replaceCustomDiscoverStrategies,
  upsertCustomDiscoverStrategy,
} from './custom-discover-strategies.js'
import { getUserPreference, setUserPreference } from './user-preferences.js'
import {
  getLatestStockAnalysis,
  parseStockAnalysisBody,
  saveStockAnalysis,
} from './stock-analysis-store.js'
import { getStockPrep, startStockPrep } from './stock-prep-jobs.js'
import { listDiscoverStrategiesPublic, getDiscoverStrategy, mcpToolCatalog } from '@opptrix/agent'
import { isDiscoverStrategyProfile, listDiscoverProfileMeta, resolveOpptrixAppVersion, resolveProjectRoot, type DiscoverStrategyProfile } from '@opptrix/shared'
import { registerNewsRoutes } from './news-routes.js'
import { registerSandboxSettingsRoutes } from './sandbox-settings-routes.js'
import { registerScheduleRoutes } from './schedule-routes.js'
import { registerPythonSettingsRoutes } from './python-settings-routes.js'
import { registerDocLibrarySettingsRoutes } from './doc-library-settings-routes.js'
import { registerEnrichmentRoutes } from './enrichment-routes.js'
import { registerSearchRoutes } from './search-routes.js'
import {
  ATTACHMENT_UPLOAD_BODY_LIMIT,
  registerSessionAttachmentRoutes,
} from './session-attachment-routes.js'
import { registerMcpServerRoutes } from './mcp-server-routes.js'
import { registerAgentSkillRoutes } from './agent-skill-routes.js'
import { registerSpeechRoutes } from './speech-routes.js'
import { ensureMediaTranscriptBridge } from './media-transcript-bridge.js'
import {
  startNewsFeedScheduler,
  getNewsSettings,
  setNewsArticlePersistHook,
  setNewsArticleDeleteHook,
  getArticle,
} from '@opptrix/news-feed'
import { maybeBootstrapTranslationModel } from '@opptrix/local-inference'
import { startEnrichmentScheduler, getEnrichmentStore, setEnrichmentPersistHook } from '@opptrix/article-enrichment'
import { setSessionPersistHooks } from '@opptrix/agent'
import { createJobExecutor, getScheduleService, type ScheduleJobNotificationEvent } from '@opptrix/schedule'
import {
  removeNewsSearchIndex,
  removeSessionSearchIndex,
  syncNewsSearchIndex,
  syncSessionSearchIndex,
} from '@opptrix/search-hub'
import { fetchUserAgreementHtml } from './legal-document.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { cleanupStaleApiListeners } = require('../../desktop/electron/resolve-ports.cjs') as {
  cleanupStaleApiListeners: (port: number, opts?: { aggressive?: boolean }) => Promise<boolean>
}

const PORT = Number(process.env.STOCK_RESEARCH_PORT ?? 8711)
const HOST = process.env.STOCK_RESEARCH_HOST ?? '127.0.0.1'
const APP_VERSION = resolveOpptrixAppVersion()

const hub = new ResearchHub()
let cfg = loadConfig()

function syncAgentProviders() {
  agent.setProviders(toAgentProviders(cfg), cfg.default_model)
}

let agent!: AgentEngine
const serverAppContext = {
  getAppSettings: async () => publicConfig(cfg),
  getProjectInfo: async () => buildAgentSafeProjectInfo({
    app: 'Opptrix',
    version: APP_VERSION,
    runtime: process.env.OPPTRIX_DESKTOP === '1' ? 'desktop' : 'node',
    desktop: process.env.OPPTRIX_DESKTOP === '1',
    server: { host: HOST, port: PORT },
    tool_count: agent.tools.list().length,
    mining_tool_count: agent.tools.miningTools().length,
  }),
}

agent = new AgentEngine(hub, {
  providers: toAgentProviders(cfg),
  defaultModel: cfg.default_model,
  defaultScorecard: cfg.default_scorecard,
  defaultTopN: cfg.default_top_n,
  appContext: serverAppContext,
})
agent.setApiBaseUrl(`http://${HOST}:${PORT}/api`)

setSessionPersistHooks({
  onPersist: syncSessionSearchIndex,
  onDelete: removeSessionSearchIndex,
})

setNewsArticlePersistHook(article => {
  // 资讯仅写入 user-store FTS（统一搜索 + Agent search_library）；不再双写 doc-library
  syncNewsSearchIndex(article, getEnrichmentStore().get(article.id))
})
setNewsArticleDeleteHook(removeNewsSearchIndex)

setEnrichmentPersistHook(doc => {
  const article = getArticle(doc.article_id)
  if (article) syncNewsSearchIndex(article, doc)
})

const app = Fastify({ logger: true, bodyLimit: ATTACHMENT_UPLOAD_BODY_LIMIT })

const scheduleService = getScheduleService()
const workspaceService = getWorkspaceService()
scheduleService.setExecutor(createJobExecutor({
  agent: {
    createSession: opts => agent.createSession(opts),
    chat: (sessionId, message, modelRef, opts) =>
      agent.chat(sessionId, message, modelRef, {
        unattended: opts?.unattended === true,
      }),
    llmConfigured: agent.llmConfigured,
  },
  shell: {
    run: (params, confirm) => workspaceService.shellRun(params, confirm),
  },
  getSettings: () => scheduleService.getSettings(),
  assertShellArgv: assertAllowedShellArgv,
  persistAgentSessionId: (jobId, sessionId) => {
    const job = scheduleService.getJob(jobId)
    if (!job || job.kind !== 'agent_prompt') return
    scheduleService.updateJob(jobId, {
      payload: { ...(job.payload as { prompt: string; session_id?: string }), session_id: sessionId },
    })
  },
  // 桌面通知由 Electron 主进程处理；server 侧留 hook 供后续 IPC 桥接
  onComplete: (event: ScheduleJobNotificationEvent) => {
    app.log.info({
      scheduleJobId: event.job.id,
      scheduleJobTitle: event.job.title,
      status: event.status,
    }, 'schedule job finished')
  },
}))

app.post<{ Params: { code: string }; Body: { force?: boolean } }>('/api/stock/:code/prep', async (req) => {
  const prep = startStockPrep(hub, req.params.code, { force: Boolean(req.body?.force) })
  return { prep }
})

app.get<{ Params: { code: string } }>('/api/stock/:code/prep', async (req) => {
  return { prep: getStockPrep(req.params.code) }
})

app.get('/api/health', async () => ({
  status: 'ok',
  version: APP_VERSION,
  runtime: process.env.OPPTRIX_DESKTOP === '1' ? 'desktop' : 'node',
  desktop: process.env.OPPTRIX_DESKTOP === '1',
  llm_configured: agent.llmConfigured,
  model: cfg.default_model ?? null,
  available_models: agent.listAvailableModels().length,
  scorecard: cfg.default_scorecard,
  tools: agent.tools.list().length,
  mcp_tools: agent.tools.mcpTools().length,
  mining_tools: agent.tools.miningTools().length,
  factors: REGISTRY.count(),
}))

app.get('/api/legal/user-agreement', async (_req, reply) => {
  try {
    return await fetchUserAgreementHtml()
  } catch (e) {
    const message = e instanceof Error ? e.message : '协议页面加载失败'
    return reply.code(502).send({ error: message })
  }
})

app.get<{ Querystring: { mining?: string } }>('/api/mcp/tools', async (req) => {
  const miningOnly = req.query.mining === '1' || req.query.mining === 'true'
  const catalog = mcpToolCatalog(agent.tools)
  return {
    tools: miningOnly ? catalog.filter(t => t.mining_eligible) : catalog,
    mining_count: catalog.filter(t => t.mining_eligible).length,
    total: catalog.length,
  }
})

app.post<{ Body: { feature: string; params?: Record<string, unknown> } }>(
  '/api/research',
  async (req, reply) => {
    const { feature, params = {} } = req.body ?? {}
    if (!feature) return reply.code(400).send({ error: 'feature required' })
    const result = await hub.dispatch(feature, params)
    return { success: result.success, feature, data: result.data, message: result.message, elapsed: result.elapsed }
  },
)

app.get('/api/discover/jobs', async () => {
  return { jobs: listDiscoverJobs(40) }
})

app.get<{ Querystring: { profile?: string } }>('/api/discover/readiness', async (req, reply) => {
  const raw = req.query.profile?.trim()
  if (raw && !isDiscoverStrategyProfile(raw)) {
    return reply.code(400).send({ error: 'invalid profile' })
  }
  const result = await hub.dispatch('discover_profile_readiness', {
    profile: raw ?? undefined,
  })
  if (!result.success) {
    return reply.code(500).send({ error: result.message || 'readiness check failed' })
  }
  return { success: true, data: result.data }
})

app.get('/api/discover/profiles', async () => {
  return { profiles: listDiscoverProfileMeta() }
})

app.get<{ Querystring: { profile: string } }>('/api/discover/scorecards', async (req, reply) => {
  const profile = req.query.profile?.trim()
  if (!profile || !isDiscoverStrategyProfile(profile)) {
    return reply.code(400).send({ error: 'invalid profile' })
  }
  const result = await hub.dispatch('discover_scorecards', { profile })
  if (!result.success) {
    return reply.code(500).send({ error: result.message || 'scorecards failed' })
  }
  return { success: true, data: result.data }
})

app.get<{ Querystring: { profile?: string } }>('/api/discover/strategies', async (req, reply) => {
  const raw = req.query.profile?.trim()
  if (raw && !isDiscoverStrategyProfile(raw)) {
    return reply.code(400).send({ error: 'invalid profile' })
  }
  const profile = raw as DiscoverStrategyProfile | undefined
  return { strategies: listDiscoverStrategiesPublic(profile) }
})

app.get('/api/discover/custom-strategies', async () => {
  return { strategies: listCustomDiscoverStrategies() }
})

app.put<{ Body: { strategies?: unknown[] } }>('/api/discover/custom-strategies', async (req, reply) => {
  const strategies = Array.isArray(req.body?.strategies) ? req.body.strategies : []
  replaceCustomDiscoverStrategies(strategies as ReturnType<typeof listCustomDiscoverStrategies>)
  return { strategies: listCustomDiscoverStrategies() }
})

app.post<{ Body: Partial<ReturnType<typeof listCustomDiscoverStrategies>[number]> & { name: string; prompt: string } }>(
  '/api/discover/custom-strategies/item',
  async (req, reply) => {
    try {
      const saved = upsertCustomDiscoverStrategy(req.body ?? { name: '', prompt: '' })
      if (!saved) return reply.code(400).send({ error: 'name and prompt required' })
      return { strategy: saved, strategies: listCustomDiscoverStrategies() }
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法保存自建策略'
      return reply.code(400).send({ error: message })
    }
  },
)

app.delete<{ Params: { id: string } }>('/api/discover/custom-strategies/:id', async (req) => {
  return { deleted: deleteCustomDiscoverStrategy(req.params.id), strategies: listCustomDiscoverStrategies() }
})

app.get<{ Params: { key: string } }>('/api/preferences/:key', async (req) => {
  return { key: req.params.key, value: getUserPreference(req.params.key, null) }
})

app.put<{ Params: { key: string }; Body: { value?: unknown } }>('/api/preferences/:key', async (req) => {
  const value = setUserPreference(req.params.key, req.body?.value ?? null)
  return { key: req.params.key, value }
})

/** 个股分析最近一次报告 — documents namespace `stock_analysis`，id = instrumentKey */
app.get<{ Params: { instrumentKey: string } }>('/api/stock-analysis/:instrumentKey', async (req) => {
  const instrumentKey = decodeURIComponent(req.params.instrumentKey)
  const data = getLatestStockAnalysis(instrumentKey)
  return { success: true, data }
})

app.put<{ Params: { instrumentKey: string }; Body: unknown }>(
  '/api/stock-analysis/:instrumentKey',
  async (req, reply) => {
    const instrumentKey = decodeURIComponent(req.params.instrumentKey)
    const parsed = parseStockAnalysisBody(instrumentKey, req.body)
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error })
    const data = saveStockAnalysis(parsed.record)
    return { success: true, data }
  },
)

app.get<{ Params: { id: string } }>('/api/discover/strategies/:id', async (req, reply) => {
  const strategy = getDiscoverStrategy(req.params.id)
  if (!strategy) return reply.code(404).send({ error: 'strategy not found' })
  return {
    strategy: {
      id: strategy.id,
      name: strategy.name,
      category: strategy.category,
      tagline: strategy.tagline,
      methodology: strategy.methodology,
      description: strategy.description,
      scorecard: strategy.scorecard,
      prescreen_top_n: strategy.prescreen_top_n,
      final_top_n: strategy.final_top_n,
      conditions: strategy.conditions,
      refinement_notes: strategy.refinement_notes,
      profile: strategy.applicableProfiles[0],
      applicable_profiles: strategy.applicableProfiles,
      requires_pack: strategy.requiresPack,
      source: 'builtin' as const,
    },
  }
})

app.post<{ Body: { strategy_id?: string; custom_prompt?: string; custom_name?: string; custom_id?: string; profile?: string; model?: string } }>(
  '/api/discover/run',
  async (req, reply) => {
    if (!agent.llmConfigured) return reply.code(503).send({ error: 'LLM 未配置' })
    const strategyId = req.body?.strategy_id?.trim()
    const customPrompt = req.body?.custom_prompt?.trim()
    const model = req.body?.model
    const rawProfile = req.body?.profile?.trim()
    const profile = rawProfile && isDiscoverStrategyProfile(rawProfile)
      ? rawProfile
      : undefined
    try {
      if (strategyId) {
        const job = startDiscoverJob(agent, strategyId, model)
        return { job_id: job.id, status: job.status, phase: job.phase, message: job.message }
      }
      if (customPrompt) {
        const customId = req.body?.custom_id?.trim() || `custom_${Date.now()}`
        const customName = req.body?.custom_name?.trim() || '自建策略'
        const job = startDiscoverCustomJob(agent, customPrompt, customName, customId, model, profile)
        return { job_id: job.id, status: job.status, phase: job.phase, message: job.message }
      }
      return reply.code(400).send({ error: 'strategy_id or custom_prompt required' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return reply.code(400).send({ error: msg })
    }
  },
)

app.get<{ Params: { id: string } }>('/api/discover/jobs/:id', async (req, reply) => {
  const job = getDiscoverJob(req.params.id)
  if (!job) return reply.code(404).send({ error: 'job not found' })
  return { job }
})

app.post<{ Params: { id: string } }>('/api/discover/jobs/:id/cancel', async (req, reply) => {
  const cancelled = cancelDiscoverJob(req.params.id)
  if (!cancelled) return reply.code(404).send({ error: 'job not found or not running' })
  return { cancelled: true }
})

app.delete<{ Params: { id: string } }>('/api/discover/jobs/:id', async (req, reply) => {
  const deleted = deleteDiscoverJob(req.params.id)
  if (!deleted) return reply.code(404).send({ error: 'job not found' })
  return { deleted: true }
})

app.get('/api/tushare/config', async () => {
  const r = await hub.dispatch('tushare_config', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: { enabled?: boolean; token?: string } }>('/api/tushare/config', async (req) => {
  const body = req.body ?? {}
  const r = await hub.dispatch('tushare_config_save', {
    enabled: body.enabled,
    token: body.token,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: { token?: string } }>('/api/tushare/test', async (req) => {
  const r = await hub.dispatch('tushare_test', { token: req.body?.token })
  return { success: r.success, data: r.data, message: r.message }
})

app.get('/api/data/providers', async () => {
  const r = await hub.dispatch('provider_list', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.get('/api/data/providers/installed', async () => {
  const r = await hub.dispatch('provider_installed_list', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post('/api/data/providers/rescan', async () => {
  const r = await hub.dispatch('provider_rescan', {})
  return { success: r.success, data: r.data, message: r.message }
})

/** 静态路径须在 /:id/* 之前注册，避免被参数路由吞掉 */
app.put<{
  Body: {
    provider_ids: string[]
  }
}>('/api/data/providers/order', async (req) => {
  const body = req.body ?? { provider_ids: [] }
  const r = await hub.dispatch('provider_order_save', {
    provider_ids: body.provider_ids,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.delete<{ Params: { id: string } }>('/api/data/providers/installed/:id', async (req, reply) => {
  const r = await hub.dispatch('provider_uninstall', { provider_id: req.params.id })
  if (!r.success) return reply.code(404).send({ success: false, message: r.message })
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Params: { id: string } }>('/api/data/providers/installed/:id/reload', async (req, reply) => {
  const r = await hub.dispatch('provider_reload', { provider_id: req.params.id })
  if (!r.success) return reply.code(400).send({ success: false, message: r.message })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { id: string } }>('/api/data/providers/:id/config', async (req) => {
  const r = await hub.dispatch('provider_config', { provider_id: req.params.id })
  return { success: r.success, data: r.data, message: r.message }
})

app.put<{
  Params: { id: string }
  Body: {
    enabled?: boolean
    priority_mode?: 'manifest' | 'custom'
    priority?: number | null
    sort_order?: number | null
    extra?: Record<string, unknown>
  }
}>('/api/data/providers/:id/config', async (req) => {
  const body = req.body ?? {}
  const r = await hub.dispatch('provider_config_save', {
    provider_id: req.params.id,
    enabled: body.enabled,
    priority_mode: body.priority_mode,
    priority: body.priority,
    sort_order: body.sort_order,
    extra: body.extra,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { id: string } }>('/api/data/providers/:id/bindings', async (req) => {
  const r = await hub.dispatch('provider_binding_overrides', { provider_id: req.params.id })
  return { success: r.success, data: r.data, message: r.message }
})

app.put<{
  Params: { id: string }
  Body: {
    market: string
    asset_class: string
    capability: string
    enabled?: boolean | null
    priority?: number | null
  }
}>('/api/data/providers/:id/bindings', async (req) => {
  const body = req.body ?? {}
  const r = await hub.dispatch('provider_binding_override_save', {
    provider_id: req.params.id,
    market: body.market,
    asset_class: body.asset_class,
    capability: body.capability,
    enabled: body.enabled,
    priority: body.priority,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{
  Params: { id: string }
  Body: Record<string, unknown>
}>('/api/data/providers/:id/test', async (req) => {
  const r = await hub.dispatch('provider_test', {
    provider_id: req.params.id,
    ...req.body,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Querystring: { code?: string; limit?: string } }>('/api/etf/list', async (req) => {
  const r = await hub.dispatch('local_etf_list', {
    code: req.query.code,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { code: string } }>('/api/etf/:code/snapshot', async (req) => {
  const r = await hub.dispatch('etf_snapshot', { code: req.params.code })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { code: string }; Querystring: { limit?: string } }>('/api/etf/:code/nav', async (req) => {
  const r = await hub.dispatch('local_etf_nav', {
    code: req.params.code,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { code: string }; Querystring: { limit?: string } }>('/api/etf/:code/holdings', async (req) => {
  const r = await hub.dispatch('local_etf_holdings', {
    code: req.params.code,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Querystring: { q?: string; keyword?: string; limit?: string } }>('/api/etf/search', async (req) => {
  const r = await hub.dispatch('search_etfs', {
    keyword: req.query.keyword ?? req.query.q,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get('/api/etf/screen/schema', async () => {
  const r = await hub.dispatch('local_etf_screen_schema', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/etf/screen', async (req) => {
  const r = await hub.dispatch('local_etf_screen', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { code: string } }>('/api/etf/:code/scorecard', async (req) => {
  const r = await hub.dispatch('etf_scorecard', { code: req.params.code })
  return { success: r.success, data: r.data, message: r.message }
})

app.get('/api/etf/scorecard/schema', async () => {
  const r = await hub.dispatch('etf_scorecard_schema', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Querystring: { q?: string; keyword?: string; limit?: string; markets?: string } }>(
  '/api/instruments/search',
  async (req) => {
    const markets = req.query.markets
      ? req.query.markets.split(',').map(s => s.trim()).filter(Boolean)
      : undefined
    const r = await hub.dispatch('instrument_search', {
      keyword: req.query.keyword ?? req.query.q,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
      markets,
    })
    return { success: r.success, data: r.data, message: r.message }
  },
)

app.get('/api/instruments/summary', async () => {
  const r = await hub.dispatch('local_instruments_summary', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/snapshot', async (req) => {
  const r = await hub.dispatch('instrument_snapshot', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/quotes', async (req) => {
  const r = await hub.dispatch('instrument_quotes', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/chart', async (req) => {
  const r = await hub.dispatch('instrument_chart', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/capabilities', async (req) => {
  const r = await hub.dispatch('instrument_capabilities', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/cyq', async (req) => {
  const r = await hub.dispatch('instrument_cyq', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/institution-rating', async (req) => {
  const r = await hub.dispatch('instrument_institution_rating', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/institution-report', async (req) => {
  const r = await hub.dispatch('instrument_institution_report', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/batch-snapshots', async (req) => {
  const r = await hub.dispatch('instrument_batch_snapshots', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/evaluation', async (req) => {
  const r = await hub.dispatch('instrument_evaluation', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/strategy-signal', async (req) => {
  const r = await hub.dispatch('instrument_strategy_signal', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/indicators', async (req) => {
  const r = await hub.dispatch('instrument_indicators', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/strategy-verify', async (req) => {
  const r = await hub.dispatch('instrument_strategy_verify', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/instruments/latest-evaluation', async (req) => {
  const r = await hub.dispatch('latest_evaluation', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

function markDeprecatedInstrumentRoute(reply: { header: (name: string, value: string) => void }, successorPath: string) {
  reply.header('Deprecation', 'true')
  reply.header('Link', `<${successorPath}>; rel="successor-version"`)
}

app.get('/api/us/screen/schema', async () => {
  const r = await hub.dispatch('local_us_screen_schema', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/us/screen', async (req) => {
  const r = await hub.dispatch('local_us_screen', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Querystring: { keyword?: string; limit?: string } }>('/api/us/list', async (req) => {
  const r = await hub.dispatch('local_us_list', {
    keyword: req.query.keyword,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { symbol: string } }>('/api/us/:symbol/snapshot', async (req, reply) => {
  markDeprecatedInstrumentRoute(reply, '/api/instruments/snapshot')
  const r = await hub.dispatch('instrument_snapshot', {
    instrument: { market: 'US', assetClass: 'EQUITY', symbol: req.params.symbol },
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { symbol: string } }>('/api/us/:symbol/quote', async (req, reply) => {
  markDeprecatedInstrumentRoute(reply, '/api/instruments/quotes')
  const r = await hub.dispatch('instrument_quotes', {
    instruments: [{ market: 'US', assetClass: 'EQUITY', symbol: req.params.symbol }],
  })
  const quotes = r.data && typeof r.data === 'object'
    ? (r.data as { quotes?: unknown[] }).quotes
    : undefined
  return { success: r.success, data: quotes?.[0] ?? null, message: r.message }
})

app.get<{ Params: { symbol: string }; Querystring: { count?: string } }>('/api/us/:symbol/kline', async (req, reply) => {
  markDeprecatedInstrumentRoute(reply, '/api/instruments/chart')
  const r = await hub.dispatch('instrument_chart', {
    instrument: { market: 'US', assetClass: 'EQUITY', symbol: req.params.symbol },
    period: 'daily',
    count: req.query.count != null ? Number(req.query.count) : 120,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { symbol: string } }>('/api/us/:symbol/profile', async (req) => {
  const r = await hub.dispatch('us_profile', { symbol: req.params.symbol })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { symbol: string }; Querystring: { report_type?: string; report_date?: string } }>(
  '/api/us/:symbol/financials',
  async (req) => {
    const r = await hub.dispatch('us_financials', {
      symbol: req.params.symbol,
      report_type: req.query.report_type,
      report_date: req.query.report_date,
    })
    return { success: r.success, data: r.data, message: r.message }
  },
)

app.get<{ Querystring: { q?: string; keyword?: string; limit?: string } }>('/api/us/search', async (req, reply) => {
  markDeprecatedInstrumentRoute(reply, '/api/instruments/search')
  const r = await hub.dispatch('instrument_search', {
    keyword: req.query.keyword ?? req.query.q,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
    markets: ['US'],
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get('/api/crypto/screen/schema', async () => {
  const r = await hub.dispatch('local_crypto_screen_schema', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: Record<string, unknown> }>('/api/crypto/screen', async (req) => {
  const r = await hub.dispatch('local_crypto_screen', req.body ?? {})
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Querystring: { keyword?: string; limit?: string } }>('/api/crypto/list', async (req) => {
  const r = await hub.dispatch('local_crypto_list', {
    keyword: req.query.keyword,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { pair: string } }>('/api/crypto/:pair/snapshot', async (req, reply) => {
  markDeprecatedInstrumentRoute(reply, '/api/instruments/snapshot')
  const pair = decodeURIComponent(req.params.pair)
  const r = await hub.dispatch('instrument_snapshot', { market: 'CRYPTO', pair })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Params: { pair: string } }>('/api/crypto/:pair/quote', async (req, reply) => {
  markDeprecatedInstrumentRoute(reply, '/api/instruments/quotes')
  const pair = decodeURIComponent(req.params.pair)
  const r = await hub.dispatch('instrument_quotes', {
    instruments: [{ market: 'CRYPTO', pair }],
  })
  const quotes = r.data && typeof r.data === 'object'
    ? (r.data as { quotes?: unknown[] }).quotes
    : undefined
  return { success: r.success, data: quotes?.[0] ?? null, message: r.message }
})

app.get<{ Params: { pair: string }; Querystring: { count?: string } }>('/api/crypto/:pair/kline', async (req, reply) => {
  markDeprecatedInstrumentRoute(reply, '/api/instruments/chart')
  const pair = decodeURIComponent(req.params.pair)
  const r = await hub.dispatch('instrument_chart', {
    market: 'CRYPTO',
    pair,
    period: 'daily',
    count: req.query.count != null ? Number(req.query.count) : 120,
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get<{ Querystring: { q?: string; keyword?: string; limit?: string } }>('/api/crypto/search', async (req, reply) => {
  markDeprecatedInstrumentRoute(reply, '/api/instruments/search')
  const r = await hub.dispatch('instrument_search', {
    keyword: req.query.keyword ?? req.query.q,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
    markets: ['CRYPTO'],
  })
  return { success: r.success, data: r.data, message: r.message }
})

app.get('/api/config', async () => publicConfig(cfg))

app.post('/api/market-data/ui-ready', async () => {
  hub.notifyMarketDataUiReady()
  return { ok: true }
})

app.patch<{ Body: { default_scorecard?: string; default_top_n?: number; default_model?: string } }>(
  '/api/config',
  async (req) => {
    const b = req.body ?? {}
    cfg = saveConfig({
      default_scorecard: b.default_scorecard,
      default_top_n: b.default_top_n,
      default_model: b.default_model,
    })
    syncAgentProviders()
    return { status: 'saved', config: publicConfig(cfg) }
  },
)

app.get('/api/providers/presets', async () => ({ presets: await resolveProviderPresets() }))

app.post<{ Body: { base_url: string; api_key: string } }>(
  '/api/providers/discover-models',
  async (req, reply) => {
    const { base_url, api_key } = req.body ?? {}
    if (!base_url?.trim() || !api_key?.trim()) {
      return reply.code(400).send({ error: 'base_url and api_key required' })
    }
    try {
      const models = await fetchOpenAiModelList(base_url.trim(), api_key.trim())
      return { models }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'fetch models failed'
      return reply.code(400).send({ error: msg })
    }
  },
)

app.post<{ Body: { name: string; base_url: string; api_key: string; models: string[] } }>(
  '/api/providers',
  async (req, reply) => {
    const { name, base_url, api_key, models } = req.body ?? {}
    if (!name?.trim() || !base_url?.trim() || !api_key?.trim()) {
      return reply.code(400).send({ error: 'name, base_url and api_key required' })
    }
    if (!models?.length) return reply.code(400).send({ error: '至少启用一个模型' })
    const provider: StoredProvider = {
      id: randomUUID(),
      name: name.trim(),
      base_url: base_url.trim(),
      api_key: api_key.trim(),
      models: [...new Set(models.map(m => m.trim()).filter(Boolean))],
    }
    cfg = saveConfig({ providers: [...cfg.providers, provider] })
    if (!cfg.default_model) {
      cfg = saveConfig({ default_model: `${provider.id}:${provider.models[0]}` })
    }
    syncAgentProviders()
    return { status: 'created', provider: publicConfig(cfg).providers.find(p => p.id === provider.id) }
  },
)

app.patch<{ Params: { id: string }; Body: Partial<StoredProvider> }>(
  '/api/providers/:id',
  async (req, reply) => {
    const idx = cfg.providers.findIndex(p => p.id === req.params.id)
    if (idx < 0) return reply.code(404).send({ error: 'provider not found' })
    const b = req.body ?? {}
    const current = cfg.providers[idx]
    const next: StoredProvider = {
      ...current,
      name: b.name?.trim() || current.name,
      base_url: b.base_url?.trim() || current.base_url,
      api_key: b.api_key?.trim() || current.api_key,
      models: b.models?.length
        ? [...new Set(b.models.map(m => m.trim()).filter(Boolean))]
        : current.models,
    }
    if (!next.models.length) return reply.code(400).send({ error: '至少启用一个模型' })
    const providers = [...cfg.providers]
    providers[idx] = next
    cfg = saveConfig({ providers })
    syncAgentProviders()
    return { status: 'updated', provider: publicConfig(cfg).providers.find(p => p.id === next.id) }
  },
)

app.delete<{ Params: { id: string } }>('/api/providers/:id', async (req, reply) => {
  const idx = cfg.providers.findIndex(p => p.id === req.params.id)
  if (idx < 0) return reply.code(404).send({ error: 'provider not found' })
  const removed = cfg.providers[idx]
  const providers = cfg.providers.filter(p => p.id !== req.params.id)
  let default_model = cfg.default_model
  if (default_model?.startsWith(`${removed.id}:`)) {
    const first = providers[0]
    default_model = first ? `${first.id}:${first.models[0]}` : undefined
  }
  cfg = saveConfig({ providers, default_model })
  syncAgentProviders()
  return { status: 'deleted' }
})

/**
 * 聊天选模型列表：同步列表即可选；models.dev 富化（context/media）仅在缓存已热时附带。
 * 禁止冷启动阻塞拉 models.dev（否则客户端 10s 超时清空下拉，表现为「要先进设置才可选」）。
 */
app.get('/api/models/available', async () => {
  const sync = agent.listAvailableModels()
  const default_model = cfg.default_model ?? null
  try {
    const enriched = await Promise.race([
      agent.listAvailableModelsAsync(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 400)
      }),
    ])
    return { models: enriched ?? sync, default_model }
  } catch {
    return { models: sync, default_model }
  }
})

app.get('/api/templates', async () => ({ templates: listTemplates() }))

app.get('/api/sessions', async () => ({ sessions: agent.listSessions() }))

app.get<{ Querystring: { q?: string; tag?: string; limit?: string; cursor?: string; scope?: string } }>(
  '/api/experts',
  async (req) => {
    const limitRaw = req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined
    const scopeRaw = req.query.scope?.trim()
    const scope = scopeRaw === 'public' || scopeRaw === 'personal' || scopeRaw === 'all'
      ? scopeRaw
      : undefined
    const catalog = await agent.listExperts({
      q: req.query.q,
      tag: req.query.tag,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      cursor: req.query.cursor,
      scope,
    })
    return catalog
  },
)

app.get<{ Params: { id: string } }>('/api/experts/:id', async (req, reply) => {
  const expert = await agent.getExpert(req.params.id)
  if (!expert) return reply.code(404).send({ error: 'expert not found' })
  return { expert }
})

app.post<{
  Body: {
    title?: string
    summary?: string
    persona?: string
    tags?: string[]
    starterPrompts?: unknown
  }
}>('/api/experts', async (req, reply) => {
  const title = String(req.body?.title ?? '').trim()
  const summary = String(req.body?.summary ?? '').trim()
  const persona = String(req.body?.persona ?? '').trim()
  if (!title) return reply.code(400).send({ error: '请填写专家名称' })
  if (!summary) return reply.code(400).send({ error: '请填写专家简介' })
  if (!persona) return reply.code(400).send({ error: '请填写角色设定' })
  const tags = Array.isArray(req.body?.tags)
    ? req.body.tags.map(t => String(t).trim()).filter(Boolean)
    : undefined
  const starterPrompts = Array.isArray(req.body?.starterPrompts)
    ? req.body.starterPrompts as import('@opptrix/shared').ExpertStarterPrompt[]
    : undefined
  try {
    const expert = agent.createExpert({ title, summary, persona, tags, starterPrompts })
    return reply.code(201).send({ expert })
  } catch (e) {
    const message = e instanceof Error ? e.message : '创建专家失败'
    return reply.code(400).send({ error: message })
  }
})

app.patch<{
  Params: { id: string }
  Body: {
    title?: string
    summary?: string
    persona?: string
    tags?: string[]
    starterPrompts?: unknown
  }
}>('/api/experts/:id', async (req, reply) => {
  const existing = await agent.getExpert(req.params.id)
  if (!existing) return reply.code(404).send({ error: 'expert not found' })
  if (existing.source !== 'local') {
    return reply.code(403).send({ error: '内置专家不可编辑' })
  }
  const patch: import('@opptrix/shared').ExpertPatchInput = {}
  if (req.body?.title !== undefined) patch.title = String(req.body.title)
  if (req.body?.summary !== undefined) patch.summary = String(req.body.summary)
  if (req.body?.persona !== undefined) patch.persona = String(req.body.persona)
  if (req.body?.tags !== undefined) {
    patch.tags = Array.isArray(req.body.tags)
      ? req.body.tags.map(t => String(t).trim()).filter(Boolean)
      : []
  }
  if (req.body?.starterPrompts !== undefined) {
    patch.starterPrompts = Array.isArray(req.body.starterPrompts)
      ? req.body.starterPrompts as import('@opptrix/shared').ExpertStarterPrompt[]
      : []
  }
  try {
    const expert = agent.updateExpert(req.params.id, patch)
    return { expert }
  } catch (e) {
    const message = e instanceof Error ? e.message : '更新专家失败'
    return reply.code(400).send({ error: message })
  }
})

app.delete<{ Params: { id: string } }>('/api/experts/:id', async (req, reply) => {
  const existing = await agent.getExpert(req.params.id)
  if (!existing) return reply.code(404).send({ error: 'expert not found' })
  if (existing.source !== 'local' && existing.official) {
    return reply.code(403).send({ error: '内置专家不可删除' })
  }
  const deleted = agent.deleteExpert(req.params.id)
  if (!deleted) return reply.code(403).send({ error: '内置专家不可删除' })
  return { ok: true, deleted: req.params.id }
})

app.post<{ Body: { title?: string; expertId?: string } }>('/api/sessions', async (req, reply) => {
  try {
    const session = await agent.createSession({
      title: req.body?.title,
      expertId: req.body?.expertId,
    })
    return { session: agent.sessionMeta(session) }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'create session failed'
    if (message.includes('未知专家')) return reply.code(400).send({ error: message })
    throw e
  }
})

app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
  const session = agent.getSession(req.params.id)
  if (!session) return reply.code(404).send({ error: 'session not found' })
  // 仅读缓存；miss 不阻塞（UI 再异步拉 /context-usage）
  const contextUsage = agent.getCachedSessionContextUsage(req.params.id)
  return {
    session: agent.sessionMeta(session),
    messages: agent.getDisplayMessages(req.params.id),
    contextRef: session.contextRef ?? null,
    contextUsage,
  }
})

app.get<{ Params: { id: string } }>('/api/sessions/:id/context-usage', async (req, reply) => {
  const contextUsage = await agent.getSessionContextUsage(req.params.id)
  if (!contextUsage) return reply.code(404).send({ error: 'session not found' })
  return { contextUsage }
})

app.get<{ Params: { id: string } }>('/api/sessions/:id/role-persona', async (req, reply) => {
  try {
    const result = agent.getSessionRolePersona(req.params.id)
    if (!result) return reply.code(404).send({ error: 'session not found' })
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : 'load role persona failed'
    return reply.code(400).send({ error: message })
  }
})

app.put<{ Params: { id: string }; Body: { rolePersona?: string } }>(
  '/api/sessions/:id/role-persona',
  async (req, reply) => {
    const raw = req.body?.rolePersona
    if (typeof raw !== 'string') {
      return reply.code(400).send({ error: '请填写技能专长' })
    }
    try {
      const updated = agent.setSessionRolePersona(req.params.id, raw)
      if (!updated) return reply.code(404).send({ error: 'session not found' })
      return {
        rolePersona: updated.rolePersona,
        expertId: updated.expertId ?? null,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '技能专长无效，请修改后重试'
      return reply.code(400).send({ error: message })
    }
  },
)
app.patch<{
  Params: { id: string }
  Body: {
    title?: string
    model?: string | null
    llmParams?: {
      temperature?: number
      maxTokens?: number
      reasoningEffort?: 'low' | 'medium' | 'high' | null
    }
  }
}>(
  '/api/sessions/:id',
  async (req, reply) => {
    const { title, model, llmParams } = req.body ?? {}
    if (title !== undefined) {
      const updated = agent.renameSession(req.params.id, title)
      if (!updated) return reply.code(404).send({ error: 'session not found' })
      return { session: agent.sessionMeta(updated) }
    }
    if (model !== undefined) {
      const updated = await agent.setSessionModel(req.params.id, model)
      if (!updated) return reply.code(404).send({ error: 'session not found' })
      const trimmed = typeof model === 'string' ? model.trim() : ''
      if (trimmed) {
        cfg = saveConfig({ default_model: trimmed })
        syncAgentProviders()
      }
      return {
        session: agent.sessionMeta(updated.session),
        contextHint: updated.contextHint,
      }
    }
    if (llmParams !== undefined) {
      if (!llmParams || typeof llmParams !== 'object') {
        return reply.code(400).send({ error: 'llmParams invalid' })
      }
      const updated = agent.setSessionLlmParams(req.params.id, llmParams)
      if (!updated) return reply.code(404).send({ error: 'session not found' })
      return { session: agent.sessionMeta(updated) }
    }
    return reply.code(400).send({ error: 'title, model or llmParams required' })
  },
)

app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
  if (!agent.getSession(req.params.id)) return reply.code(404).send({ error: 'session not found' })
  agent.deleteSession(req.params.id)
  return { status: 'deleted' }
})

app.get<{ Params: { id: string } }>('/api/sessions/:id/workspace/grants', async (req, reply) => {
  if (!agent.getSession(req.params.id)) return reply.code(404).send({ error: 'session not found' })
  const grants = await agent.listWorkspaceGrants(req.params.id)
  return { grants }
})

app.post<{
  Params: { id: string }
  Body: { path?: string; mode?: string; label?: string }
}>('/api/sessions/:id/workspace/grants', async (req, reply) => {
  if (!agent.getSession(req.params.id)) return reply.code(404).send({ error: 'session not found' })
  const absPath = String(req.body?.path ?? '').trim()
  if (!absPath) return reply.code(400).send({ error: 'path required' })
  const modeRaw = String(req.body?.mode ?? 'ro').trim()
  const mode = modeRaw === 'rw' ? 'rw' : 'ro'
  try {
    const grant = agent.addWorkspaceGrant(
      req.params.id,
      absPath,
      mode,
      req.body?.label != null ? String(req.body.label) : undefined,
    )
    if (!grant) return reply.code(404).send({ error: 'session not found' })
    return { grant }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return reply.code(400).send({ error: message })
  }
})

app.delete<{ Params: { id: string; grantId: string } }>(
  '/api/sessions/:id/workspace/grants/:grantId',
  async (req, reply) => {
    if (!agent.getSession(req.params.id)) return reply.code(404).send({ error: 'session not found' })
    const removed = agent.removeWorkspaceGrant(req.params.id, req.params.grantId)
    if (!removed) return reply.code(404).send({ error: 'grant not found or cannot remove default' })
    return { status: 'removed' }
  },
)

app.get<{
  Params: { id: string }
  Querystring: { root_id?: string; path?: string }
}>('/api/sessions/:id/workspace/file', async (req, reply) => {
  if (!agent.getSession(req.params.id)) {
    return reply.code(404).send({ error: '对话不存在' })
  }
  const rootId = String(req.query.root_id ?? '').trim()
  const relPath = String(req.query.path ?? '').trim()
  if (!rootId) return reply.code(400).send({ error: '请指定工作区' })
  if (!relPath) return reply.code(400).send({ error: '请指定文件路径' })

  try {
    const file = await getWorkspaceService().openReadableFile(req.params.id, rootId, relPath)
    reply.header('Content-Type', file.mime)
    reply.header('Content-Length', String(file.size))
    reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(file.basename)}"`)
    return reply.send(fs.createReadStream(file.abs))
  } catch (e) {
    if (e instanceof PathEscapeError) {
      return reply.code(403).send({ error: '无法访问该路径' })
    }
    if (e instanceof DenyPathError) {
      return reply.code(403).send({ error: '该路径受保护，无法打开' })
    }
    if (e instanceof WorkspaceError) {
      const message = e.message
      if (message.includes('未知 root_id')) {
        return reply.code(403).send({ error: '未授权访问该工作区' })
      }
      if (message.includes('不存在') || message.includes('不是文件')) {
        return reply.code(404).send({ error: '文件不存在' })
      }
      if (message.includes('绝对路径') || message.includes('穿越')) {
        return reply.code(403).send({ error: '无法访问该路径' })
      }
      return reply.code(400).send({ error: '无法打开文件' })
    }
    return reply.code(400).send({ error: '无法打开文件' })
  }
})

app.post<{ Params: { id: string }; Body: { message_index: number } }>(
  '/api/sessions/:id/fork',
  async (req, reply) => {
    const messageIndex = req.body?.message_index
    if (typeof messageIndex !== 'number' || !Number.isInteger(messageIndex) || messageIndex < 0) {
      return reply.code(400).send({ error: 'message_index required' })
    }
    const forked = agent.forkSession(req.params.id, messageIndex)
    if (!forked) return reply.code(404).send({ error: 'session or message not found' })
    return {
      session: agent.sessionMeta(forked),
      messages: agent.getDisplayMessages(forked.id),
      contextRef: forked.contextRef ?? null,
    }
  },
)

app.post<{ Params: { id: string }; Body: { message_index: number } }>(
  '/api/sessions/:id/truncate',
  async (req, reply) => {
    const messageIndex = req.body?.message_index
    if (typeof messageIndex !== 'number' || !Number.isInteger(messageIndex) || messageIndex < 0) {
      return reply.code(400).send({ error: 'message_index required' })
    }
    const updated = agent.truncateSession(req.params.id, messageIndex)
    if (!updated) {
      return reply.code(404).send({ error: 'session or message not found' })
    }
    return {
      session: agent.sessionMeta(updated),
      messages: agent.getDisplayMessages(updated.id),
      contextRef: updated.contextRef ?? null,
    }
  },
)

app.patch<{ Params: { id: string }; Body: { contextRef: SessionContextRef | null } }>(
  '/api/sessions/:id/context',
  async (req, reply) => {
    if (!('contextRef' in (req.body ?? {}))) {
      return reply.code(400).send({ error: 'contextRef required' })
    }
    const updated = agent.setSessionContextRef(req.params.id, req.body?.contextRef ?? null)
    if (!updated) return reply.code(404).send({ error: 'session not found' })
    return {
      session: agent.sessionMeta(updated),
      contextRef: updated.contextRef ?? null,
    }
  },
)

app.delete<{ Params: { id: string } }>('/api/sessions/:id/context', async (req, reply) => {
  const updated = agent.clearSessionContextRef(req.params.id)
  if (!updated) return reply.code(404).send({ error: 'session not found' })
  return {
    session: agent.sessionMeta(updated),
    contextRef: null,
  }
})

app.post<{ Params: { id: string }; Body: { message: string; selected_text: string; model?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> } }>(
  '/api/sessions/:id/ephemeral-ask',
  async (req, reply) => {
    if (!req.body?.message?.trim()) return reply.code(400).send({ error: 'message required' })
    const result = await agent.ephemeralAsk(
      req.params.id,
      req.body.message,
      req.body.selected_text ?? '',
      req.body.model,
      req.body.history,
    )
    return { reply: result.reply }
  },
)

app.post<{ Params: { id: string } }>('/api/sessions/:id/chat/cancel', async (req, reply) => {
  const cancelled = cancelSessionChat(req.params.id)
  if (!cancelled) return reply.code(404).send({ error: 'no active chat' })
  agent.userPromptBridge.cancelSession(req.params.id)
  return { cancelled: true }
})

app.post<{
  Params: { id: string }
  Body: {
    prompt_id: string
    kind: 'option' | 'custom' | 'secret'
    selected_ids?: string[]
    selected_labels?: string[]
    custom_text?: string
    name?: string
    secret_value?: string
    inject_hosts?: string[]
  }
}>(
  '/api/sessions/:id/chat/user-prompt',
  async (req, reply) => {
    const promptId = req.body?.prompt_id?.trim()
    if (!promptId) return reply.code(400).send({ error: 'prompt_id required' })

    const kind = req.body?.kind
    if (kind !== 'option' && kind !== 'custom' && kind !== 'secret') {
      return reply.code(400).send({ error: 'kind must be option, custom, or secret' })
    }

    if (kind === 'secret') {
      const name = String(req.body?.name ?? '').trim()
      if (!name) return reply.code(400).send({ error: 'name required for kind=secret' })

      const cancelled = Array.isArray(req.body.selected_ids)
        && req.body.selected_ids.map(id => String(id)).includes('cancel')
      const secretValue = typeof req.body.secret_value === 'string' ? req.body.secret_value : ''

      if (cancelled || !secretValue) {
        const ok = agent.resolveUserPrompt(req.params.id, promptId, {
          kind: 'secret',
          selected_ids: ['cancel'],
          selected_labels: ['取消'],
          name,
          cancelled: true,
          saved: false,
          session_granted: false,
        })
        if (!ok) return { ok: true, stale: true }
        return { ok: true }
      }

      const injectHosts = Array.isArray(req.body.inject_hosts)
        ? req.body.inject_hosts.map(h => String(h ?? '').trim()).filter(Boolean)
        : undefined

      try {
        getUserDataStore().agentVault.put(name, secretValue, {
          overwrite: true,
          injectHosts,
        })
        getSessionSecretAccessStore().grant(req.params.id, name)
      } catch (err) {
        const message = err instanceof Error ? err.message : '保存密钥失败'
        return reply.code(500).send({ error: message })
      }

      // 回传给 Agent 的答案永不含 secret_value
      const ok = agent.resolveUserPrompt(req.params.id, promptId, {
        kind: 'secret',
        selected_ids: [],
        selected_labels: [],
        name,
        saved: true,
        session_granted: true,
      })
      if (!ok) return { ok: true, stale: true }
      return { ok: true }
    }

    const selectedIds = Array.isArray(req.body.selected_ids)
      ? req.body.selected_ids.map(id => String(id).trim()).filter(Boolean)
      : []
    const selectedLabels = Array.isArray(req.body.selected_labels)
      ? req.body.selected_labels.map(label => String(label).trim()).filter(Boolean)
      : []
    const customText = typeof req.body.custom_text === 'string'
      ? req.body.custom_text.trim()
      : ''

    if (kind === 'custom') {
      if (!customText) return reply.code(400).send({ error: 'custom_text required for kind=custom' })
    } else if (!selectedIds.length || !selectedLabels.length) {
      return reply.code(400).send({ error: 'selected_ids and selected_labels required for kind=option' })
    }

    const ok = agent.resolveUserPrompt(req.params.id, promptId, {
      kind,
      selected_ids: selectedIds,
      selected_labels: selectedLabels,
      custom_text: kind === 'custom' ? customText : undefined,
    })
    if (!ok) return { ok: true, stale: true }
    return { ok: true }
  },
)

app.post<{ Params: { id: string }; Body: { message: string; model?: string; attachments?: string[] } }>(
  '/api/sessions/:id/chat/stream',
  async (req, reply) => {
    const hasAttachments = Array.isArray(req.body?.attachments) && req.body.attachments.length > 0
    if (!req.body?.message?.trim() && !hasAttachments) {
      return reply.code(400).send({ error: 'message required' })
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const write = (event: ChatProgressEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    const ac = registerSessionChat(req.params.id)
    req.raw.on('aborted', () => {
      if (!reply.raw.writableEnded) ac.abort()
    })
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) ac.abort()
    })

    try {
      await agent.chat(
        req.params.id,
        req.body.message ?? '',
        req.body.model,
        { onProgress: write, signal: ac.signal },
        req.body.attachments,
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (message !== '已取消' && !ac.signal.aborted) {
        write({ type: 'error', message })
        write({
          type: 'done',
          reply: message,
          tools_used: [],
          session_id: req.params.id,
          tool_steps: [],
        })
      }
    } finally {
      clearSessionChat(req.params.id, ac)
      reply.raw.end()
    }
  },
)

app.post<{ Params: { id: string }; Body: { message: string; model?: string; attachments?: string[] } }>(
  '/api/sessions/:id/chat',
  async (req, reply) => {
    const hasAttachments = Array.isArray(req.body?.attachments) && req.body.attachments.length > 0
    if (!req.body?.message?.trim() && !hasAttachments) {
      return reply.code(400).send({ error: 'message required' })
    }
    const result = await agent.chat(
      req.params.id,
      req.body.message ?? '',
      req.body.model,
      undefined,
      req.body.attachments,
    )
    return {
      reply: result.reply,
      tools_used: result.toolsUsed,
      session_id: result.sessionId,
      title: result.title,
    }
  },
)

/** @deprecated use POST /api/sessions/:id/chat */
app.post<{ Body: { message: string } }>('/api/chat', async (req) => {
  const sessions = agent.listSessions()
  const id = sessions[0]?.id ?? (await agent.createSession()).id
  const result = await agent.chat(id, req.body?.message ?? '')
  return { reply: result.reply, tools_used: result.toolsUsed, session_id: result.sessionId }
})

// REST endpoints aligned with research-hub features
app.post<{ Body: { code: string; scorecard?: string } }>('/api/evaluate', async (req, reply) => {
  const r = await hub.dispatch('stock_diagnosis', { code: req.body.code, scorecard: req.body.scorecard })
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

app.post<{ Body: { conditions: unknown[]; scorecard?: string; top_n?: number } }>('/api/screen', async (_req, reply) => {
  return reply.code(410).send({ error: '本地筛选已移除，请使用 instrument_search、instrument_evaluation 等在线能力' })
})

app.post<{ Body: { holdings: [string, number][]; scorecard?: string } }>('/api/portfolio', async (req, reply) => {
  const r = await hub.dispatch('portfolio_analysis', req.body)
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

app.post<{ Body: { keyword: string } }>('/api/search', async (req) => {
  const r = await hub.dispatch('search_stocks', { keyword: req.body.keyword })
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: { code: string } }>('/api/signal', async (req) => {
  const r = await hub.dispatch('strategy_signal', { code: req.body.code })
  return { success: r.success, data: r.data, message: r.message }
})

app.post<{ Body: { code: string } }>('/api/strategy/report', async (req, reply) => {
  const { code } = req.body ?? {}
  if (!code) return reply.code(400).send({ error: 'code required' })
  const r = await hub.dispatch('strategy_report', { code })
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

// Portfolio trade ledger (buy/sell records)
app.get('/api/portfolio/trades', async (req) => {
  const q = req.query as { code?: string; market?: string }
  const code = q.code ?? ''
  const market = q.market?.trim() || undefined
  const r = await hub.dispatch('portfolio_trades', { code, market })
  return { success: r.success, data: r.data, message: r.message }
})

app.get('/api/portfolio/summary', async () => {
  const r = await hub.dispatch('portfolio_summary', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.get('/api/watchlist', async () => {
  const r = await hub.dispatch('watchlist_list', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.put<{ Body: { items: Array<{ code: string; name: string; industry?: string; note?: string; addedAt?: string; addedPrice?: number | null }> } }>(
  '/api/watchlist',
  async (req, reply) => {
    const items = req.body?.items
    if (!Array.isArray(items)) return reply.code(400).send({ error: 'items array required' })
    const r = await hub.dispatch('watchlist_save', { items })
    if (!r.success) return reply.code(400).send({ error: r.message })
    return { success: true, data: r.data, message: r.message }
  },
)

app.get('/api/watchlist/groups', async () => {
  const r = await hub.dispatch('watchlist_groups_get', {})
  return { success: r.success, data: r.data, message: r.message }
})

app.put<{ Body: { groups?: Array<{ id: string; title: string; sortOrder: number; createdAt?: string }>; membership?: Record<string, string[]> } }>(
  '/api/watchlist/groups',
  async (req, reply) => {
    const { groups, membership } = req.body ?? {}
    if (groups != null && !Array.isArray(groups)) {
      return reply.code(400).send({ error: 'groups must be an array when provided' })
    }
    if (membership != null && (typeof membership !== 'object' || Array.isArray(membership))) {
      return reply.code(400).send({ error: 'membership must be an object when provided' })
    }
    const r = await hub.dispatch('watchlist_groups_save', { groups: groups ?? [], membership: membership ?? {} })
    if (!r.success) return reply.code(400).send({ error: r.message })
    return { success: true, data: r.data, message: r.message }
  },
)

app.post<{ Body: { code: string; shares: number; price: number; side?: string; date?: string; market?: string } }>(
  '/api/portfolio/trade',
  async (req, reply) => {
    const { code, shares, price, side = 'buy', date, market } = req.body ?? {}
    if (!code || !shares || !price) return reply.code(400).send({ error: 'code, shares, price required' })
    const pm = hub.de.portfolio
    const m = market?.trim() || undefined
    const result = side === 'sell'
      ? await pm.sell(code, shares, price, date, '', m as import('@opptrix/shared').Market | undefined)
      : await pm.buy(code, shares, price, date, '', m as import('@opptrix/shared').Market | undefined)
    return { success: true, trade: result }
  },
)

app.delete<{ Params: { id: string } }>('/api/portfolio/trade/:id', async (req, reply) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'invalid trade id' })
  const ok = hub.de.portfolio.removeTrade(id)
  if (!ok) return reply.code(404).send({ error: 'trade not found' })
  return { success: true }
})

app.delete<{ Querystring: { code?: string; market?: string } }>('/api/portfolio/instrument', async (req, reply) => {
  const code = String(req.query?.code ?? '').trim()
  if (!code) return reply.code(400).send({ error: 'code required' })
  const market = req.query?.market?.trim() || undefined
  const { removed } = hub.de.portfolio.clearInstrument(code, market as import('@opptrix/shared').Market | undefined)
  return { success: true, removed }
})

let serveUi = false

async function listenWithStaleCleanup(): Promise<void> {
  try {
    await app.listen({ port: PORT, host: HOST })
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    if (code !== 'EADDRINUSE') throw err
    console.warn(`[server] 端口 ${PORT} 被占用，尝试清理残留 Opptrix sidecar…`)
    await cleanupStaleApiListeners(PORT, { aggressive: true })
    try {
      await app.listen({ port: PORT, host: HOST })
      console.warn(`[server] 已清理残留进程并成功绑定 :${PORT}`)
      return
    } catch (retryErr) {
      console.error(
        `\n  无法绑定 http://${HOST}:${PORT}/ — 端口仍被占用。\n`
        + `  手动清理：lsof -ti :${PORT} -sTCP:LISTEN | xargs kill -9\n`
        + `  或设置环境变量 STOCK_RESEARCH_PORT 使用其他端口。\n`,
      )
      throw retryErr
    }
  }
}

async function bootstrap() {
  await initOutboundNetwork()
  console.log('  Outbound network → IPv4-first, v6 fallback on connect failure')

  // 后台预热 models.dev，避免首屏聊天下拉被富化请求拖死
  void getModelsDevCatalog().catch(() => {})

  await registerNewsRoutes(app)
  registerSandboxSettingsRoutes(app)
  registerScheduleRoutes(app, scheduleService)
  registerPythonSettingsRoutes(app)
  await registerDocLibrarySettingsRoutes(app)
  await registerEnrichmentRoutes(app)
  await registerMcpServerRoutes(app)
  await registerAgentSkillRoutes(app)
  registerSearchRoutes(app, hub, agent)
  registerSessionAttachmentRoutes(app, agent)
  ensureMediaTranscriptBridge()
  await registerSpeechRoutes(app)
  startNewsFeedScheduler()
  startEnrichmentScheduler(90_000, resolveProjectRoot())
  // e5 就绪时回填未嵌入文档（无图 Hybrid RAG）
  void import('@opptrix/doc-library').then(async (mod) => {
    try {
      const embedding = mod.getEmbeddingService()
      const ready = embedding.isReady() || await embedding.tryEnableDefaultBackend()
      if (!ready) return
      const svc = mod.getDocLibraryService()
      svc.setEmbeddingService(embedding)
      await svc.embedPendingDocuments()
    } catch {
      /* background */
    }
  }).catch(() => {})
  scheduleService.start()
  void maybeBootstrapTranslationModel(getNewsSettings().translation).catch(() => {})
  serveUi = shouldServeUi()
  if (serveUi) {
    serveUi = await registerStaticUi(app)
  }

  app.setNotFoundHandler(async (req, reply) => {
    if (serveUi && !isApiPath(req.url)) {
      return reply.sendFile('index.html', resolveUiDist())
    }
    return reply.code(404).send({ error: 'not found' })
  })

  await listenWithStaleCleanup()
  console.log(`\n  Opptrix API → http://${HOST}:${PORT}/api/health`)
  if (serveUi) {
    console.log(`  Desktop UI → http://${HOST}:${PORT}\n`)
  } else {
    console.log(`  Web UI → npm run dev → http://127.0.0.1:5173\n`)
  }

  // 桌面/有内置资源时后台启用语义检索并尽量准备 L1/L2（失败不崩）
  void import('@opptrix/doc-library')
    .then(async (mod) => {
      const r = await mod.ensureBundledRagRuntime()
      console.log(
        `  RAG runtime: embedding=${r.embedding ? 'ready' : 'skip'} layout=${r.layout ? 'ready' : 'skip'} deep=${r.deep ? 'ready' : 'skip'}`,
      )
    })
    .catch(() => {
      console.log('  RAG runtime: skip (prepare deferred)')
    })

  // UI 就绪后再启动 L0 自动同步；无 UI 时立即触发；桌面端 60s 兜底
  const isDesktopUi = process.env.OPPTRIX_DESKTOP === '1' && serveUi
  if (!isDesktopUi) {
    hub.notifyMarketDataUiReady()
  } else {
    setTimeout(() => {
      hub.ensureMarketDataUiReadyFallback()
    }, 60_000)
  }
}

let shuttingDown = false

const browserSessionManager = createBrowserSessionManager()
registerBrowserShutdownHooks(browserSessionManager)

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info(`received ${signal}, shutting down`)
  const forceExit = setTimeout(() => {
    app.log.warn('shutdown timeout — forcing exit (sync/import may have blocked the event loop)')
    process.exit(signal === 'uncaughtException' ? 1 : 0)
  }, 8_000)
  try {
    await browserSessionManager.closeAll()
    scheduleService.stop()
    await app.close()
    // 原生模块（lancedb / onnx / duckdb）须在 process.exit 前显式关闭，否则 macOS 上
    // __cxa_finalize 可能 SIGABRT，表现为「Opptrix 意外退出」。
    try {
      const docLib = await import('@opptrix/doc-library')
      await docLib.closeDocLibraryService()
      await docLib.closeEmbeddingService()
    } catch (err) {
      app.log.warn({ err }, 'doc-library / embedding shutdown failed')
    }
    try {
      await closeMarketDuckRuntime()
    } catch (err) {
      app.log.warn({ err }, 'market duck runtime shutdown failed')
    }
    try {
      getMarketDataService().store.close()
    } catch (err) {
      app.log.warn({ err }, 'market store close failed')
    }
  } catch (err) {
    app.log.error({ err }, 'shutdown error')
  } finally {
    clearTimeout(forceExit)
    process.exit(0)
  }
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('unhandledRejection', err => {
  app.log.error({ err }, 'unhandledRejection')
})
process.on('uncaughtException', err => {
  app.log.error({ err }, 'uncaughtException')
  void shutdown('uncaughtException')
})

bootstrap().catch(err => {
  console.error(err)
  process.exit(1)
})
