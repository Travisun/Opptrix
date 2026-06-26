import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import { AgentEngine, fetchOpenAiModelList } from '@inno-a-stock/agent'
import { ResearchHub } from '@inno-a-stock/research-hub'
import { listTemplates, REGISTRY } from '@inno-a-stock/stock-eval'
import {
  loadConfig, saveConfig, publicConfig, toAgentProviders,
  PROVIDER_PRESETS, type StoredProvider,
} from './config.js'

const PORT = Number(process.env.STOCK_RESEARCH_PORT ?? 8711)
const HOST = process.env.STOCK_RESEARCH_HOST ?? '127.0.0.1'

const hub = new ResearchHub()
let cfg = loadConfig()

function syncAgentProviders() {
  agent.setProviders(toAgentProviders(cfg), cfg.default_model)
}

let agent = new AgentEngine(hub, {
  providers: toAgentProviders(cfg),
  defaultModel: cfg.default_model,
  defaultScorecard: cfg.default_scorecard,
  defaultTopN: cfg.default_top_n,
})

const app = Fastify({ logger: true })

app.get('/api/health', async () => ({
  status: 'ok',
  version: '0.6.0',
  runtime: 'node',
  llm_configured: agent.llmConfigured,
  model: cfg.default_model ?? null,
  available_models: agent.listAvailableModels().length,
  scorecard: cfg.default_scorecard,
  tools: agent.tools.list().length,
  factors: REGISTRY.count(),
}))

app.post<{ Body: { feature: string; params?: Record<string, unknown> } }>(
  '/api/research',
  async (req, reply) => {
    const { feature, params = {} } = req.body ?? {}
    if (!feature) return reply.code(400).send({ error: 'feature required' })
    const result = await hub.dispatch(feature, params)
    return { success: result.success, feature, data: result.data, message: result.message, elapsed: result.elapsed }
  },
)

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

app.get('/api/agent/skills', async () => ({ categories: agent.listSkills() }))

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

app.post<{ Params: { id: string }; Body: { message: string; model?: string } }>(
  '/api/sessions/:id/chat',
  async (req, reply) => {
    if (!req.body?.message?.trim()) return reply.code(400).send({ error: 'message required' })
    const result = await agent.chat(req.params.id, req.body.message, req.body.model)
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

// Stock writer — article data collection
app.post<{ Body: { code: string; type?: string } }>('/api/writer/fetch', async (req, reply) => {
  const { code, type = 'value' } = req.body ?? {}
  if (!code) return reply.code(400).send({ error: 'code required' })
  const r = await hub.dispatch('writer_fetch', { code, type })
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

app.get('/api/writer/types', async () => {
  const r = await hub.dispatch('writer_types', {})
  return r.data
})

app.get('/api/writer/personas', async () => {
  const r = await hub.dispatch('writer_personas', {})
  return r.data
})

app.post<{ Body: { code: string; type?: string; persona?: string } }>('/api/writer/prompt', async (req, reply) => {
  const { code, type = 'value', persona } = req.body ?? {}
  if (!code) return reply.code(400).send({ error: 'code required' })
  const r = await hub.dispatch('writer_prompt', { code, type, persona })
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

app.post<{ Body: { markdown: string; theme?: string } }>('/api/writer/format', async (req, reply) => {
  const { markdown, theme } = req.body ?? {}
  if (!markdown) return reply.code(400).send({ error: 'markdown required' })
  const r = await hub.dispatch('writer_format', { markdown, theme })
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

app.post<{ Body: Record<string, unknown> }>('/api/writer/publish', async (req, reply) => {
  const body = req.body ?? {}
  if (!body.markdown) return reply.code(400).send({ error: 'markdown required' })
  const r = await hub.dispatch('writer_publish', body)
  if (!r.success) return reply.code(400).send({ error: r.message })
  return r.data
})

app.get('/api/writer/config', async () => {
  const r = await hub.dispatch('writer_config', {})
  const cfg = r.data as Record<string, unknown>
  const wechat = cfg.wechat as Record<string, unknown> | undefined
  return {
    theme: cfg.theme,
    skip_publish: cfg.skip_publish,
    wechat_configured: !!(wechat?.appid && wechat?.secret),
    author: wechat?.author ?? '',
  }
})

app.post<{ Body: Record<string, unknown> }>('/api/writer/config', async (req) => {
  const b = req.body ?? {}
  const r = await hub.dispatch('writer_config_save', {
    theme: b.theme,
    skip_publish: b.skip_publish,
    appid: b.appid,
    secret: b.secret,
    author: b.author,
  })
  return { status: 'saved', config: r.data }
})

app.get('/api/writer/history', async (req) => {
  const limit = Number((req.query as { limit?: string }).limit ?? 20)
  const r = await hub.dispatch('writer_history', { limit })
  return r.data
})

app.get('/api/writer/themes', async () => {
  const r = await hub.dispatch('writer_themes', {})
  return r.data
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

app.setNotFoundHandler(async (_req, reply) => {
  reply.code(404).send({ error: 'not found' })
})

app.listen({ port: PORT, host: HOST }).then(() => {
  console.log(`\n  innoAStock API → http://${HOST}:${PORT}/api/health`)
  console.log(`  Web UI → npm run dev → http://127.0.0.1:5173\n`)
})
