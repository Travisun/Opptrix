import type { ApiResponse } from '../types/schemas'

/** Dev: Vite proxies /api → :8711. Prod: Fastify serves SPA + API on same origin. */
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

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
    scorecard: string
  }>
}

export async function getConfig() {
  const resp = await fetch(`${API_BASE}/config`)
  if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`)
  return resp.json()
}

export async function saveConfig(payload: {
  api_key?: string
  model?: string
  provider?: string
  scorecard?: string
  base_url?: string
}) {
  const resp = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`Config save failed: ${resp.status}`)
  return resp.json()
}
