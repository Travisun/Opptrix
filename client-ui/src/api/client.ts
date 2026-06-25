import type { ApiResponse } from '../types/schemas'

const API_BASE = 'http://localhost:8080/api'

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
}
