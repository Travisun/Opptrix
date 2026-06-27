import type { ApiResponse } from '../types/schemas'
import type { ChatDisplayMessage, EphemeralAskTurn, SessionContextRef, SessionMeta, SkillCategory, AvailableModel } from '../types/chat'

/** Vite dev/preview proxies /api → backend (default :8711). */
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, init)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `API error: ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

export async function apiCall<T>(
  feature: string,
  params: Record<string, any> = {},
): Promise<ApiResponse<T>> {
  const resp = await fetch(`${API_BASE}/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature, params }),
  })
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  return resp.json()
}

// ─── Typed convenience wrappers ───
import type {
  StockDiagnosisData, InstitutionRatingData,
  ScreeningData, StrategySignalData, StrategyVerifyData,
  PortfolioAnalysisData, IndustryMiningData, MarketReportData,
  SearchStocksData, BacktestResultData, LatestEvalData, ReportTextData,
} from '../types/schemas'

export const research = {
  diagnose:      (code: string) =>
    apiCall<StockDiagnosisData>('stock_diagnosis', { code }),

  institutionRating: (code: string, groups?: string[]) =>
    apiCall<InstitutionRatingData>('institution_rating', { code, groups }),

  screen: (conditions: any[], scorecard = '综合评估', topN = 20) =>
    apiCall<ScreeningData>('screening', { conditions, scorecard, top_n: topN }),

  strategySignals: (code: string) =>
    apiCall<StrategySignalData>('strategy_signal', { code }),

  strategyVerify: (code: string, checkpoints = 30, forwardDays = 5) =>
    apiCall<StrategyVerifyData>('strategy_verify', { code, checkpoints, forward_days: forwardDays }),

  portfolioAnalysis: (holdings: [string, number][]) =>
    apiCall<PortfolioAnalysisData>('portfolio_analysis', { holdings }),

  industryMining: (industry: string) =>
    apiCall<IndustryMiningData>('industry_mining', { industry }),

  marketReport: (type: 'morning' | 'closing') =>
    apiCall<MarketReportData>('market_report', { type }),

  searchStocks: (keyword: string) =>
    apiCall<SearchStocksData>('search_stocks', { keyword }),

  backtest: (codes: string[], scorecard = '综合评估', periods = 5) =>
    apiCall<BacktestResultData>('backtest', { codes, scorecard, periods }),

  latestEval: (code: string) =>
    apiCall<LatestEvalData>('latest_evaluation', { code }),

  strategyReport: (code: string) =>
    apiCall<ReportTextData>('strategy_report', { code }),

  writerPrompt: (code: string, type = 'value', persona?: string) =>
    apiCall<import('../types/schemas').WriterPromptData>('writer_prompt', { code, type, persona }),

  writerFormat: (markdown: string, theme?: string) =>
    apiCall<import('../types/schemas').WriterFormatData>('writer_format', { markdown, theme }),

  writerPublish: (payload: Record<string, unknown>) =>
    apiCall<import('../types/schemas').WriterPublishData>('writer_publish', payload),

  portfolioTrades: (code = '') =>
    apiCall<import('../types/schemas').PortfolioLedgerData>('portfolio_trades', { code }),

  portfolioSummary: () =>
    apiCall<import('../types/schemas').PortfolioSummaryData>('portfolio_summary', {}),
}

export async function writerTypes() {
  const resp = await fetch(`${API_BASE}/writer/types`)
  if (!resp.ok) throw new Error('writer types failed')
  return resp.json() as Promise<{ types: { type: string; name: string }[] }>
}

export async function writerPersonas() {
  const resp = await fetch(`${API_BASE}/writer/personas`)
  if (!resp.ok) throw new Error('writer personas failed')
  return resp.json() as Promise<{ personas: string[] }>
}

export async function portfolioTrade(payload: {
  code: string; shares: number; price: number; side?: 'buy' | 'sell'; date?: string
}) {
  const resp = await fetch(`${API_BASE}/portfolio/trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error('trade failed')
  return resp.json()
}

export async function getHealth() {
  const resp = await fetch(`${API_BASE}/health`)
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
  const resp = await fetch(`${API_BASE}/config`)
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
  })
}

export async function sendSessionChat(sessionId: string, message: string, model?: string) {
  return jsonFetch<{
    reply: string
    tools_used?: string[]
    session_id: string
    title?: string
  }>(`/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, ...(model ? { model } : {}) }),
  })
}

export async function listSkills() {
  return jsonFetch<{ categories: SkillCategory[] }>('/agent/skills')
}
