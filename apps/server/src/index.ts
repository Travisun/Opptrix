import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { AgentEngine } from '@inno-a-stock/agent'
import { ResearchHub } from '@inno-a-stock/research-hub'
import { listTemplates, REGISTRY } from '@inno-a-stock/stock-eval'
import { loadConfig, saveConfig, publicConfig } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST = path.resolve(__dirname, '../../../client-ui/dist')
const PORT = Number(process.env.STOCK_RESEARCH_PORT ?? 8711)
const HOST = process.env.STOCK_RESEARCH_HOST ?? '127.0.0.1'

const hub = new ResearchHub()
let cfg = loadConfig()
let agent = new AgentEngine(hub, {
  llm: {
    provider: cfg.llm.provider,
    apiKey: cfg.llm.api_key,
    model: cfg.llm.model,
    baseUrl: cfg.llm.base_url.includes('/v1') ? cfg.llm.base_url : `${cfg.llm.base_url}/v1`,
  },
  defaultScorecard: cfg.default_scorecard,
  defaultTopN: cfg.default_top_n,
})

const app = Fastify({ logger: true })

app.get('/api/health', async () => ({
  status: 'ok',
  version: '0.6.0',
  runtime: 'node',
  llm_configured: agent.llmConfigured,
  model: cfg.llm.model,
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

app.post<{ Body: Record<string, unknown> }>('/api/config', async (req) => {
  const b = req.body ?? {}
  cfg = saveConfig({
    default_scorecard: b.scorecard as string | undefined,
    default_top_n: b.default_top_n as number | undefined,
    llm: {
      provider: (b.provider as string) ?? cfg.llm.provider,
      model: (b.model as string) ?? cfg.llm.model,
      api_key: (b.api_key as string) ?? cfg.llm.api_key,
      base_url: (b.base_url as string) ?? cfg.llm.base_url,
    },
  })
  agent.setLlmConfig({
    provider: cfg.llm.provider,
    apiKey: cfg.llm.api_key,
    model: cfg.llm.model,
    baseUrl: cfg.llm.base_url.includes('/v1') ? cfg.llm.base_url : `${cfg.llm.base_url}/v1`,
  })
  return { status: 'saved', config: publicConfig(cfg) }
})

app.get('/api/templates', async () => ({ templates: listTemplates() }))

app.post<{ Body: { message: string } }>('/api/chat', async (req) => {
  const { reply, toolsUsed } = await agent.chat(req.body?.message ?? '')
  return { reply, tools_used: toolsUsed }
})

app.post('/api/chat/reset', async () => {
  agent.resetHistory()
  return { status: 'ok' }
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

await app.register(fastifyStatic, { root: CLIENT_DIST, prefix: '/', wildcard: false })

app.setNotFoundHandler(async (req, reply) => {
  if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' })
  return reply.sendFile('index.html')
})

app.listen({ port: PORT, host: HOST }).then(() => {
  console.log(`\n  innoAStock → http://${HOST}:${PORT}/`)
  console.log(`  API: /api/research · Agent: /api/chat · Web UI (no Electron)\n`)
})
