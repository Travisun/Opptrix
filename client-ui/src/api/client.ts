import type { ApiResponse } from '../types/schemas'
import type { ChatProgressEvent } from '../types/chatProgress'
import type { ChatDisplayMessage, EphemeralAskTurn, SessionContextRef, SessionMeta, AvailableModel } from '../types/chat'
import type { ExportDestination, ExportPackageResult } from '../platform/saveMarketPackage'
import {
  formatExportResultMessage,
  pickExportDestination,
  saveMarketPackageBlob,
} from '../platform/saveMarketPackage'

/** Vite dev/preview proxies /api → backend (default :8711). */
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const REQUEST_TIMEOUT = 10000 // 10s — quick reads / mutations
/** Agent chat: multiple LLM + tool rounds (server LLM timeout up to 120s per round). */
const CHAT_REQUEST_TIMEOUT = 300_000

async function fetchWithTimeout(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const external = init?.signal
  const onExternalAbort = () => controller.abort()
  external?.addEventListener('abort', onExternalAbort)
  try {
    const { signal: _ignored, ...rest } = init ?? {}
    return await fetch(path, { ...rest, signal: controller.signal })
  } catch (e) {
    if (timedOut && e instanceof Error && e.name === 'AbortError') {
      throw new Error('请求超时')
    }
    throw e
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', onExternalAbort)
  }
}

async function jsonFetch<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT): Promise<T> {
  const resp = await fetchWithTimeout(`${API_BASE}${path}`, init, timeoutMs)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `API error: ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

export async function apiCall<T>(
  feature: string,
  params: Record<string, any> = {},
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT,
): Promise<ApiResponse<T>> {
  const resp = await fetchWithTimeout(`${API_BASE}/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature, params }),
    ...init,
  }, timeoutMs)
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  return resp.json()
}

// ─── Typed convenience wrappers ───
import type {
  StockDiagnosisData, InstitutionRatingData,
  ScreeningData, StrategySignalData, StrategyVerifyData, TrendBriefData,
  PortfolioAnalysisData, IndustryMiningData, IndustryStatItem, IndustryStockItem, MarketReportData,
  SearchStocksData, BacktestResultData, LatestEvalData, ReportTextData,
} from '../types/schemas'

export const research = {
  diagnose:      (code: string) =>
    apiCall<StockDiagnosisData>('stock_diagnosis', { code }),

  institutionRating: (code: string, groups?: string[], signal?: AbortSignal) =>
    apiCall<InstitutionRatingData>('institution_rating', { code, groups }, { signal }, 20000),

  screen: (conditions: any[], scorecard = '综合评估', topN = 20, signal?: AbortSignal) =>
    apiCall<ScreeningData>('screening', { conditions, scorecard, top_n: topN }, { signal }, 120000),

  marketDbStatus: () =>
    apiCall<import('../types/market').MarketDbStatusData>('market_db_status'),

  marketDbSync: (mode: 'auto' | 'full' | 'incremental' | 'resume' = 'auto', background = true, force = false) =>
    apiCall<{ started: boolean; running: boolean; mode: string }>(
      'market_db_sync',
      { mode, background, force },
      undefined,
      background ? 15000 : 600000,
    ),

  strategySignals: (code: string, signal?: AbortSignal) =>
    apiCall<StrategySignalData>('strategy_signal', { code }, { signal }, 30000),

  trendBrief: (code: string, holdingCost?: number | null, signal?: AbortSignal) =>
    apiCall<TrendBriefData>(
      'trend_brief',
      {
        code,
        ...(holdingCost != null && holdingCost > 0 ? { holding_cost: holdingCost } : {}),
      },
      { signal },
      30000,
    ),

  strategyVerify: (code: string, checkpoints = 30, forwardDays = 5) =>
    apiCall<StrategyVerifyData>('strategy_verify', { code, checkpoints, forward_days: forwardDays }),

  portfolioAnalysis: (holdings: [string, number][]) =>
    apiCall<PortfolioAnalysisData>('portfolio_analysis', { holdings }),

  industryMining: (industry: string) =>
    apiCall<IndustryMiningData>('industry_mining', { industry }),

  marketIndustryStats: (tradeDate?: string) =>
    apiCall<{ items: IndustryStatItem[]; trade_date: string | null; quote_date: string | null }>(
      'market_industry_stats',
      tradeDate ? { trade_date: tradeDate } : {},
    ),

  industryStocks: (industry: string, limit = 120) =>
    apiCall<{ trade_date: string; quote_date: string | null; industry: string; items: IndustryStockItem[] }>(
      'market_industry_stocks',
      { industry, limit },
    ),

  marketReport: (type: 'morning' | 'closing') =>
    apiCall<MarketReportData>('market_report', { type }),

  searchStocks: (keyword: string) =>
    apiCall<SearchStocksData>('search_stocks', { keyword }),

  stockQuotes: (codes: string[]) =>
    apiCall<import('../types/market').StockQuotesData>('stock_quotes', { codes }),

  watchlistRadar: (codes: string[], signal?: AbortSignal) =>
    apiCall<import('../types/schemas').WatchlistRadarData>('watchlist_radar', { codes }, { signal }, 15000),

  stockKline: (code: string, count = 90) =>
    apiCall<import('../types/market').StockKlineData>('stock_kline', { code, count }),

  stockChart: (
    code: string,
    period: import('../types/market').ChartPeriod,
    count?: number,
    signal?: AbortSignal,
    before?: string,
    tail?: number,
  ) =>
    apiCall<import('../types/market').StockChartData>(
      'stock_chart',
      { code, period, count, before, tail },
      { signal },
    ),

  stockCyq: (code: string, signal?: AbortSignal) =>
    apiCall<{ code: string; rows: import('../types/market').ChipDistributionPoint[]; latest: import('../types/market').ChipDistributionPoint }>(
      'stock_cyq',
      { code },
      { signal },
      15000,
    ),

  stockDetail: (code: string) =>
    apiCall<import('../types/market').StockDetailData>('stock_detail', { code }),

  backtest: (codes: string[], scorecard = '综合评估', periods = 5) =>
    apiCall<BacktestResultData>('backtest', { codes, scorecard, periods }),

  latestEval: (code: string, signal?: AbortSignal) =>
    apiCall<LatestEvalData>('latest_evaluation', { code }, { signal }, 30000),

  strategyReport: (code: string) =>
    apiCall<ReportTextData>('strategy_report', { code }),

  portfolioTrades: (code = '') =>
    apiCall<import('../types/schemas').PortfolioLedgerData>('portfolio_trades', { code }),

  portfolioSummary: () =>
    apiCall<import('../types/schemas').PortfolioSummaryData>('portfolio_summary', {}),
}

export async function fetchWatchlist() {
  const resp = await jsonFetch<{
    success: boolean
    data?: { items: import('../types/market').WatchlistItem[]; count: number }
  }>('/watchlist')
  return resp.data ?? { items: [], count: 0 }
}

export async function saveWatchlist(items: import('../types/market').WatchlistItem[]) {
  const resp = await jsonFetch<{
    success: boolean
    data?: { items: import('../types/market').WatchlistItem[]; count: number }
  }>('/watchlist', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  return resp.data ?? { items, count: items.length }
}

export async function getMarketDataSyncState() {
  const resp = await jsonFetch<{ success: boolean; data: import('../types/market').MarketDataSyncState }>(
    '/market-data/sync-state',
  )
  if (!resp.data) throw new Error('无法获取同步状态')
  return resp.data
}

export async function startMarketDataSync(options: { force?: boolean } = {}) {
  return jsonFetch<{ success: boolean; message?: string }>('/market-data/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'auto',
      background: true,
      force: options.force ?? false,
    }),
  })
}

export interface MarketDataPackageMetadata {
  app: string
  kind: string
  format_version: number
  exported_at: string
  schema_version: number
  pack_signature: string
  compatible: {
    min_format_version: number
    max_format_version: number
    min_schema_version: number
    max_schema_version: number
  }
  snapshot: {
    stock_count: number
    latest_trade_date: string | null
    latest_factor_date: string | null
    is_ready: boolean
    bootstrap: import('../types/market').MarketDataSyncState['db_status']['bootstrap']
  }
}

export interface MarketDataPackageInspectResult {
  valid: boolean
  error?: string
  metadata?: MarketDataPackageMetadata
  compressed_bytes?: number
  sqlite_bytes?: number
}

export type { ExportDestination, ExportPackageResult }

const MARKET_PACKAGE_TIMEOUT = 300_000

async function fetchMarketDataPackageBlob(): Promise<{ blob: Blob; filename: string }> {
  const resp = await fetchWithTimeout(`${API_BASE}/market-data/export`, {}, MARKET_PACKAGE_TIMEOUT)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `导出失败（${resp.status}）`)
  }
  const blob = await resp.blob()
  const cd = resp.headers.get('Content-Disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(cd)
  const filename = match?.[1] ?? 'opptrix-market.opmd'
  return { blob, filename }
}

export async function exportMarketDataPackageFile(
  destination: ExportDestination,
): Promise<ExportPackageResult> {
  const { blob, filename } = await fetchMarketDataPackageBlob()
  return saveMarketPackageBlob(blob, filename, destination)
}

export { pickExportDestination, formatExportResultMessage }

export async function inspectMarketDataPackageFile(file: File): Promise<MarketDataPackageInspectResult> {
  const buffer = await file.arrayBuffer()
  const resp = await fetchWithTimeout(`${API_BASE}/market-data/package/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buffer,
  }, MARKET_PACKAGE_TIMEOUT)
  const json = await resp.json().catch(() => ({})) as {
    success?: boolean
    error?: string
    data?: MarketDataPackageInspectResult
  }
  if (!resp.ok) {
    throw new Error(json.error || `无法读取数据包（${resp.status}）`)
  }
  return json.data ?? { valid: false, error: '无效响应' }
}

export async function importMarketDataPackageFile(file: File) {
  const buffer = await file.arrayBuffer()
  return jsonFetch<{
    success: boolean
    message?: string
    data?: { metadata: MarketDataPackageMetadata; status: import('../types/market').MarketDataSyncState['db_status'] }
    error?: string
  }>('/market-data/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buffer,
  }, MARKET_PACKAGE_TIMEOUT)
}

export async function listDiscoverJobs() {
  return jsonFetch<{ jobs: import('../types/schemas').DiscoverJobSnapshot[] }>('/discover/jobs')
}

export async function fetchCustomDiscoverStrategies() {
  return jsonFetch<{ strategies: import('../types/schemas').CustomDiscoverStrategy[] }>('/discover/custom-strategies')
}

export async function saveCustomDiscoverStrategies(
  strategies: import('../types/schemas').CustomDiscoverStrategy[],
) {
  return jsonFetch<{ strategies: import('../types/schemas').CustomDiscoverStrategy[] }>('/discover/custom-strategies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategies }),
  })
}

export async function getUserPreference<T>(key: string) {
  return jsonFetch<{ key: string; value: T | null }>(`/preferences/${encodeURIComponent(key)}`)
}

export async function setUserPreference<T>(key: string, value: T) {
  return jsonFetch<{ key: string; value: T }>(`/preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
}

export async function listDiscoverStrategies() {
  return jsonFetch<{ strategies: import('../types/schemas').DiscoverStrategyPublic[] }>('/discover/strategies')
}

export async function getDiscoverStrategyDetail(id: string) {
  return jsonFetch<{ strategy: import('../types/schemas').DiscoverStrategyDetail }>(`/discover/strategies/${encodeURIComponent(id)}`)
}

export async function startDiscoverRun(
  opts: { strategy_id: string } | { custom_prompt: string; custom_name?: string; custom_id?: string },
  model?: string,
) {
  const body = 'strategy_id' in opts
    ? { strategy_id: opts.strategy_id, model }
    : {
      custom_prompt: opts.custom_prompt,
      custom_name: opts.custom_name,
      custom_id: opts.custom_id,
      model,
    }
  const resp = await fetchWithTimeout(`${API_BASE}/discover/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 30000)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `API error: ${resp.status}`)
  }
  return resp.json() as Promise<{
    job_id: string
    status: string
    phase: string
    message: string
  }>
}

export async function getDiscoverJob(jobId: string) {
  return jsonFetch<{ job: import('../types/schemas').DiscoverJobSnapshot }>(`/discover/jobs/${jobId}`)
}

export async function cancelDiscoverJob(jobId: string) {
  return jsonFetch<{ cancelled: boolean }>(`/discover/jobs/${jobId}/cancel`, { method: 'POST' })
}

export async function deleteDiscoverJob(jobId: string) {
  return jsonFetch<{ deleted: boolean }>(`/discover/jobs/${jobId}`, { method: 'DELETE' })
}

export interface StockPrepStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  message: string | null
}

export interface StockPrepSnapshot {
  code: string
  status: 'idle' | 'running' | 'done' | 'error'
  steps: StockPrepStep[]
  percent: number
  message: string | null
  started_at: string | null
  updated_at: string
  error: string | null
}

export async function startStockPrep(code: string, force = false) {
  return jsonFetch<{ prep: StockPrepSnapshot }>(`/stock/${encodeURIComponent(code)}/prep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(force ? { force: true } : {}),
  })
}

export async function getStockPrep(code: string) {
  return jsonFetch<{ prep: StockPrepSnapshot }>(`/stock/${encodeURIComponent(code)}/prep`)
}

export interface TusharePublicConfig {
  enabled: boolean
  token: string
  token_configured: boolean
  token_preview: string
  config_path: string
}

export async function getTushareConfig() {
  const resp = await jsonFetch<{ success: boolean; data: TusharePublicConfig }>('/tushare/config')
  if (!resp.data) throw new Error('无法读取 Tushare 配置')
  return resp.data
}

export async function saveTushareConfig(payload: { enabled: boolean; token?: string }) {
  return jsonFetch<{ success: boolean; data: TusharePublicConfig; message?: string }>('/tushare/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function testTushareConfig(token?: string) {
  return jsonFetch<{ success: boolean; data: { ok: boolean; message: string }; message?: string }>('/tushare/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(token ? { token } : {}),
  })
}

export async function portfolioTrade(payload: {
  code: string; shares: number; price: number; side?: 'buy' | 'sell'; date?: string
}) {
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error('trade failed')
  return resp.json()
}

export async function portfolioDeleteTrade(id: number) {
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/trade/${id}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error('delete trade failed')
  return resp.json() as Promise<{ success: boolean }>
}

export async function getHealth() {
  const resp = await fetchWithTimeout(`${API_BASE}/health`)
  if (!resp.ok) throw new Error(`Health check failed: ${resp.status}`)
  return resp.json() as Promise<{
    status: string
    version: string
    llm_configured: boolean
    model: string | null
    available_models?: number
    scorecard: string
  }>
}

export interface PublicProvider {
  id: string
  name: string
  base_url: string
  models: string[]
  api_key_configured: boolean
}

export interface ProviderPreset {
  id: string
  name: string
  base_url: string
}

export interface AppConfig {
  providers: PublicProvider[]
  available_models: AvailableModel[]
  default_model?: string
  default_scorecard: string
  default_top_n: number
  llm_configured: boolean
}

export async function getConfig() {
  const resp = await fetchWithTimeout(`${API_BASE}/config`)
  if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`)
  return resp.json() as Promise<AppConfig>
}

export async function patchConfig(payload: {
  default_scorecard?: string
  default_top_n?: number
  default_model?: string
}) {
  return jsonFetch<{ status: string; config: AppConfig }>('/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getProviderPresets() {
  return jsonFetch<{ presets: ProviderPreset[] }>('/providers/presets')
}

export async function discoverModels(base_url: string, api_key: string) {
  return jsonFetch<{ models: string[] }>('/providers/discover-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url, api_key }),
  })
}

export async function createProvider(payload: {
  name: string
  base_url: string
  api_key: string
  models: string[]
}) {
  return jsonFetch<{ status: string; provider: PublicProvider }>('/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateProvider(id: string, payload: Partial<{
  name: string
  base_url: string
  api_key: string
  models: string[]
}>) {
  return jsonFetch<{ status: string; provider: PublicProvider }>(`/providers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteProvider(id: string) {
  return jsonFetch<{ status: string }>(`/providers/${id}`, { method: 'DELETE' })
}

export async function listAvailableModels() {
  return jsonFetch<{ models: AvailableModel[]; default_model: string | null }>('/models/available')
}

export async function listSessions() {
  return jsonFetch<{ sessions: SessionMeta[] }>('/sessions')
}

export async function createSession(title?: string) {
  return jsonFetch<{ session: SessionMeta }>('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(title ? { title } : {}),
  })
}

export async function getSession(id: string) {
  return jsonFetch<{
    session: SessionMeta
    messages: ChatDisplayMessage[]
    contextRef: SessionContextRef | null
  }>(`/sessions/${id}`)
}

export async function renameSession(id: string, title: string) {
  return jsonFetch<{ session: Pick<SessionMeta, 'id' | 'title' | 'updatedAt'> }>(`/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function setSessionModel(id: string, model: string | null) {
  return jsonFetch<{ session: Pick<SessionMeta, 'id' | 'title' | 'model' | 'updatedAt'> }>(`/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
}

export async function deleteSession(id: string) {
  return jsonFetch<{ status: string }>(`/sessions/${id}`, { method: 'DELETE' })
}

export async function forkSession(sessionId: string, messageIndex: number) {
  return jsonFetch<{
    session: SessionMeta
    messages: ChatDisplayMessage[]
    contextRef: SessionContextRef | null
  }>(`/sessions/${sessionId}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message_index: messageIndex }),
  })
}

export async function clearSessionContext(sessionId: string) {
  return jsonFetch<{
    session: SessionMeta
    contextRef: null
  }>(`/sessions/${sessionId}/context`, {
    method: 'DELETE',
  })
}

export async function setSessionContext(sessionId: string, contextRef: SessionContextRef) {
  return jsonFetch<{
    session: SessionMeta
    contextRef: SessionContextRef | null
  }>(`/sessions/${sessionId}/context`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextRef }),
  })
}

export async function ephemeralAsk(
  sessionId: string,
  message: string,
  selectedText: string,
  model?: string,
  history?: EphemeralAskTurn[],
) {
  return jsonFetch<{ reply: string }>(`/sessions/${sessionId}/ephemeral-ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      selected_text: selectedText,
      ...(model ? { model } : {}),
      ...(history?.length ? { history } : {}),
    }),
  }, CHAT_REQUEST_TIMEOUT)
}

export async function sendSessionChat(
  sessionId: string,
  message: string,
  model?: string,
) {
  return jsonFetch<{
    reply: string
    tools_used?: string[]
    session_id: string
    title?: string
  }>(`/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      ...(model ? { model } : {}),
    }),
  }, CHAT_REQUEST_TIMEOUT)
}

export async function cancelSessionChat(sessionId: string) {
  return jsonFetch<{ cancelled: boolean }>(`/sessions/${sessionId}/chat/cancel`, {
    method: 'POST',
  })
}

export async function streamSessionChat(
  sessionId: string,
  message: string,
  onEvent: (event: ChatProgressEvent) => void,
  model?: string,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetchWithTimeout(`${API_BASE}/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message,
      ...(model ? { model } : {}),
    }),
    signal,
  }, CHAT_REQUEST_TIMEOUT)

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `API error: ${resp.status}`)
  }
  if (!resp.body) throw new Error('流式响应不可用')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find(row => row.startsWith('data: '))
      if (!line) continue
      try {
        onEvent(JSON.parse(line.slice(6)) as ChatProgressEvent)
      } catch {
        /* ignore malformed chunk */
      }
    }
  }

  if (buffer.trim()) {
    const line = buffer.split('\n').find(row => row.startsWith('data: '))
    if (line) {
      onEvent(JSON.parse(line.slice(6)) as ChatProgressEvent)
    }
  }
}
