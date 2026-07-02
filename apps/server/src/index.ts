import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import { AgentEngine, fetchOpenAiModelList, getDataLayerPaths, resolveProjectRoot, type ChatProgressEvent, type SessionContextRef } from '@opptrix/agent'
import { ResearchHub } from '@opptrix/research-hub'
import { listTemplates, REGISTRY } from '@opptrix/stock-eval'
import {
  loadConfig, saveConfig, publicConfig, toAgentProviders,
  PROVIDER_PRESETS, type StoredProvider,
} from './config.js'
import { getMarketDataService, suggestPackageFilename } from '@opptrix/market-data'
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
import { getStockPrep, startStockPrep } from './stock-prep-jobs.js'
import { listDiscoverStrategiesPublic, getDiscoverStrategy, mcpToolCatalog } from '@opptrix/agent'
import { registerNewsRoutes } from './news-routes.js'
import { registerEnrichmentRoutes } from './enrichment-routes.js'
import { registerSearchRoutes } from './search-routes.js'
import { startNewsFeedScheduler } from '@opptrix/news-feed'
import { startEnrichmentScheduler } from '@opptrix/article-enrichment'
import { setSessionPersistHooks } from '@opptrix/agent'
import { setNewsArticlePersistHook, getArticle } from '@opptrix/news-feed'
import { getEnrichmentStore, setEnrichmentPersistHook } from '@opptrix/article-enrichment'
import { removeSessionSearchIndex, syncNewsSearchIndex, syncSessionSearchIndex } from '@opptrix/search-hub'

const PORT = Number(process.env.STOCK_RESEARCH_PORT ?? 8711)
const HOST = process.env.STOCK_RESEARCH_HOST ?? '127.0.0.1'

const hub = new ResearchHub()
hub.initMarketDataAutoSync()
let cfg = loadConfig()

function syncAgentProviders() {
  agent.setProviders(toAgentProviders(cfg), cfg.default_model)
}

let agent!: AgentEngine
const serverAppContext = {
  getAppSettings: async () => publicConfig(cfg),
  getProjectInfo: async () => ({
    app: 'Opptrix',
    version: '0.6.0',
    runtime: process.env.OPPTRIX_DESKTOP === '1' ? 'desktop' : 'node',
    desktop: process.env.OPPTRIX_DESKTOP === '1',
    project_root: resolveProjectRoot(),
    server: { host: HOST, port: PORT },
    paths: getDataLayerPaths(),
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

setSessionPersistHooks({
  onPersist: syncSessionSearchIndex,
  onDelete: removeSessionSearchIndex,
})

setNewsArticlePersistHook(article => {
  syncNewsSearchIndex(article, getEnrichmentStore().get(article.id))
})

setEnrichmentPersistHook(doc => {
  const article = getArticle(doc.article_id)
  if (article) syncNewsSearchIndex(article, doc)
})

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 })

const MARKET_PACKAGE_BODY_LIMIT = 512 * 1024 * 1024

app.addContentTypeParser(
  'application/octet-stream',
  { parseAs: 'buffer', bodyLimit: MARKET_PACKAGE_BODY_LIMIT },
  (_req, body, done) => {
    done(null, body)
  },
)

app.addContentTypeParser(
  'application/vnd.opptrix.market-data+opmd',
  { parseAs: 'buffer', bodyLimit: MARKET_PACKAGE_BODY_LIMIT },
  (_req, body, done) => {
    done(null, body)
  },
)

app.post<{ Params: { code: string }; Body: { force?: boolean } }>('/api/stock/:code/prep', async (req) => {
  const prep = startStockPrep(hub, req.params.code, { force: Boolean(req.body?.force) })
  return { prep }
})

app.get<{ Params: { code: string } }>('/api/stock/:code/prep', async (req) => {
  return { prep: getStockPrep(req.params.code) }
})

app.get('/api/health', async () => ({
  status: 'ok',
  version: '0.6.0',
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

app.get('/api/market-data/status', async () => {
  const result = await hub.dispatch('market_db_status', {})
  return { success: result.success, data: result.data, message: result.message }
})

app.get('/api/market-data/sync-state', async () => {
  const result = await hub.dispatch('market_db_sync_state', {})
  return { success: result.success, data: result.data, message: result.message }
})

app.get('/api/discover/jobs', async () => {
  return { jobs: listDiscoverJobs(40) }
})

app.get('/api/discover/strategies', async () => {
  return { strategies: listDiscoverStrategiesPublic() }
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
    const saved = upsertCustomDiscoverStrategy(req.body ?? { name: '', prompt: '' })
    if (!saved) return reply.code(400).send({ error: 'name and prompt required' })
    return { strategy: saved, strategies: listCustomDiscoverStrategies() }
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
      source: 'builtin' as const,
    },
  }
})

app.post<{ Body: { strategy_id?: string; custom_prompt?: string; custom_name?: string; custom_id?: string; model?: string } }>(
  '/api/discover/run',
  async (req, reply) => {
    if (!agent.llmConfigured) return reply.code(503).send({ error: 'LLM 未配置' })
    const strategyId = req.body?.strategy_id?.trim()
    const customPrompt = req.body?.custom_prompt?.trim()
    const model = req.body?.model
    try {
      if (strategyId) {
        const job = startDiscoverJob(agent, strategyId, model)
        return { job_id: job.id, status: job.status, phase: job.phase, message: job.message }
      }
      if (customPrompt) {
        const customId = req.body?.custom_id?.trim() || `custom_${Date.now()}`
        const customName = req.body?.custom_name?.trim() || '自建策略'
        const job = startDiscoverCustomJob(agent, customPrompt, customName, customId, model)
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

app.post<{ Body: { mode?: string; max_stocks?: number; jobs?: string[]; background?: boolean; force?: boolean; profile?: string } }>(
  '/api/market-data/sync',
  async (req) => {
    const body = req.body ?? {}
    const result = await hub.dispatch('market_db_sync', {
      mode: body.mode,
      max_stocks: body.max_stocks,
      jobs: body.jobs,
      background: body.background,
      force: body.force,
      profile: body.profile,
    })
    return { success: result.success, data: result.data, message: result.message, elapsed: result.elapsed }
  },
)

app.get('/api/market-data/export', async (_req, reply) => {
  try {
    const svc = getMarketDataService()
    const buffer = await svc.exportPackage()
    const inspect = svc.inspectPackage(buffer)
    const filename = suggestPackageFilename(inspect.metadata)
    return reply
      .header('Content-Type', 'application/vnd.opptrix.market-data+opmd')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('X-Opptrix-Package-Format', '1')
      .send(buffer)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return reply.code(409).send({ error: msg })
  }
})

app.post<{ Body: Buffer }>(
  '/api/market-data/package/inspect',
  { bodyLimit: MARKET_PACKAGE_BODY_LIMIT },
  async (req, reply) => {
    const body = req.body
    if (!body?.length) return reply.code(400).send({ error: 'empty body' })
    const result = getMarketDataService().inspectPackage(body)
    if (!result.valid) {
      return reply.code(400).send({ success: false, error: result.error ?? 'invalid package' })
    }
    return { success: true, data: result }
  },
)

app.post<{ Body: Buffer }>(
  '/api/market-data/import',
  { bodyLimit: MARKET_PACKAGE_BODY_LIMIT },
  async (req, reply) => {
    const body = req.body
    if (!body?.length) return reply.code(400).send({ error: 'empty body' })
    try {
      const metadata = getMarketDataService().importPackage(body)
      const status = hub.marketData.status()
      return {
        success: true,
        message: '基础数据已导入',
        data: { metadata, status },
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return reply.code(400).send({ success: false, error: msg })
    }
  },
)

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

app.get('/api/config', async () => publicConfig(cfg))

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

app.get('/api/providers/presets', async () => ({ presets: PROVIDER_PRESETS }))

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

app.get('/api/models/available', async () => ({
  models: agent.listAvailableModels(),
  default_model: cfg.default_model ?? null,
}))

app.get('/api/templates', async () => ({ templates: listTemplates() }))

app.get('/api/sessions', async () => ({ sessions: agent.listSessions() }))

app.post<{ Body: { title?: string } }>('/api/sessions', async (req) => {
  const session = agent.createSession(req.body?.title)
  return { session: { id: session.id, title: session.title, createdAt: session.createdAt, updatedAt: session.updatedAt } }
})

app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
  const session = agent.getSession(req.params.id)
  if (!session) return reply.code(404).send({ error: 'session not found' })
  return {
    session: {
      id: session.id,
      title: session.title,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    messages: agent.getDisplayMessages(req.params.id),
    contextRef: session.contextRef ?? null,
  }
})

app.patch<{ Params: { id: string }; Body: { title?: string; model?: string | null } }>(
  '/api/sessions/:id',
  async (req, reply) => {
    const { title, model } = req.body ?? {}
    if (title !== undefined) {
      const updated = agent.renameSession(req.params.id, title)
      if (!updated) return reply.code(404).send({ error: 'session not found' })
      return {
        session: {
          id: updated.id,
          title: updated.title,
          model: updated.model,
          updatedAt: updated.updatedAt,
        },
      }
    }
    if (model !== undefined) {
      const updated = agent.setSessionModel(req.params.id, model)
      if (!updated) return reply.code(404).send({ error: 'session not found' })
      return {
        session: {
          id: updated.id,
          title: updated.title,
          model: updated.model,
          updatedAt: updated.updatedAt,
        },
      }
    }
    return reply.code(400).send({ error: 'title or model required' })
  },
)

app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
  if (!agent.getSession(req.params.id)) return reply.code(404).send({ error: 'session not found' })
  agent.deleteSession(req.params.id)
  return { status: 'deleted' }
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
      session: {
        id: forked.id,
        title: forked.title,
        model: forked.model,
        createdAt: forked.createdAt,
        updatedAt: forked.updatedAt,
      },
      messages: agent.getDisplayMessages(forked.id),
      contextRef: forked.contextRef ?? null,
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
      session: {
        id: updated.id,
        title: updated.title,
        model: updated.model,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
      contextRef: updated.contextRef ?? null,
    }
  },
)

app.delete<{ Params: { id: string } }>('/api/sessions/:id/context', async (req, reply) => {
  const updated = agent.clearSessionContextRef(req.params.id)
  if (!updated) return reply.code(404).send({ error: 'session not found' })
  return {
    session: {
      id: updated.id,
      title: updated.title,
      model: updated.model,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
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
  return { cancelled: true }
})

app.post<{ Params: { id: string }; Body: { message: string; model?: string } }>(
  '/api/sessions/:id/chat/stream',
  async (req, reply) => {
    if (!req.body?.message?.trim()) return reply.code(400).send({ error: 'message required' })

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
    req.raw.on('close', () => {
      if (!reply.raw.writableEnded) ac.abort()
    })

    try {
      await agent.chat(
        req.params.id,
        req.body.message,
        req.body.model,
        { onProgress: write, signal: ac.signal },
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

app.post<{ Params: { id: string }; Body: { message: string; model?: string } }>(
  '/api/sessions/:id/chat',
  async (req, reply) => {
    if (!req.body?.message?.trim()) return reply.code(400).send({ error: 'message required' })
    const result = await agent.chat(
      req.params.id,
      req.body.message,
      req.body.model,
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
  const id = sessions[0]?.id ?? agent.createSession().id
  const result = await agent.chat(id, req.body?.message ?? '')
  return { reply: result.reply, tools_used: result.toolsUsed, session_id: result.sessionId }
})

// REST endpoints aligned with research-hub features
app.post<{ Body: { code: string; scorecard?: string } }>('/api/evaluate', async (req, reply) => {
  const r = await hub.dispatch('stock_diagnosis', { code: req.body.code, scorecard: req.body.scorecard })
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

app.post<{ Body: { conditions: unknown[]; scorecard?: string; top_n?: number } }>('/api/screen', async (req, reply) => {
  const r = await hub.dispatch('screening', req.body)
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
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

app.post<{ Body: { industry: string } }>('/api/industry/mermaid', async (req, reply) => {
  const { industry } = req.body ?? {}
  if (!industry) return reply.code(400).send({ error: 'industry required' })
  const r = await hub.dispatch('industry_mermaid', { industry })
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

// Portfolio trade ledger (buy/sell records)
app.get('/api/portfolio/trades', async (req) => {
  const code = (req.query as { code?: string }).code ?? ''
  const r = await hub.dispatch('portfolio_trades', { code })
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

app.post<{ Body: { code: string; shares: number; price: number; side?: string; date?: string } }>(
  '/api/portfolio/trade',
  async (req, reply) => {
    const { code, shares, price, side = 'buy', date } = req.body ?? {}
    if (!code || !shares || !price) return reply.code(400).send({ error: 'code, shares, price required' })
    const pm = hub.de.portfolio
    const result = side === 'sell'
      ? await pm.sell(code, shares, price, date)
      : await pm.buy(code, shares, price, date)
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

let serveUi = false

async function bootstrap() {
  await registerNewsRoutes(app)
  await registerEnrichmentRoutes(app)
  registerSearchRoutes(app, hub, agent)
  startNewsFeedScheduler()
  startEnrichmentScheduler(90_000, resolveProjectRoot())
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

  await app.listen({ port: PORT, host: HOST })
  console.log(`\n  Opptrix API → http://${HOST}:${PORT}/api/health`)
  if (serveUi) {
    console.log(`  Desktop UI → http://${HOST}:${PORT}\n`)
  } else {
    console.log(`  Web UI → npm run dev → http://127.0.0.1:5173\n`)
  }
}

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info(`received ${signal}, shutting down`)
  try {
    await app.close()
    getMarketDataService().store.close()
  } catch (err) {
    app.log.error({ err }, 'shutdown error')
  } finally {
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
