import type { AshareEngine } from '@ni-k/a-stock-layer'
import type { ArticleType } from './templates.js'
import { DATA_TEMPLATES } from './templates.js'

export interface DimensionResult {
  success: boolean
  source?: string
  cached?: boolean
  data?: unknown[]
  error?: string
}

type EngineLike = AshareEngine & Record<string, (...args: unknown[]) => Promise<{ success: boolean; source?: string; cached?: boolean; data?: unknown[]; error?: string }>>

const GLOBAL_DIMS = ['market_breadth', 'global_index', 'exchange_rate'] as const

async function queryDimension(engine: AshareEngine, code: string, dim: string): Promise<DimensionResult> {
  const e = engine as EngineLike
  const start = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)

  const handlers: Record<string, () => Promise<DimensionResult>> = {
    realtime: async () => wrap(await e.realtime(code)),
    kline: async () => wrap(await e.kline(code, 'daily', start)),
    profile: async () => wrap(await e.profile(code)),
    financials: async () => wrap(await e.financials(code)),
    income_statement: async () => wrap(await e.incomeStatement(code)),
    balance_sheet: async () => wrap(await e.balanceSheet(code)),
    cash_flow: async () => wrap(await e.cashFlow(code)),
    money_flow: async () => wrap(await e.moneyFlow(code)),
    main_business: async () => wrap(await e.mainBusiness(code)),
    dividend: async () => wrap(await e.dividend(code)),
    news: async () => wrap(await e.news(code)),
    sentiment: async () => wrap(await e.sentiment(code)),
    shareholders: async () => wrap(await e.shareholders(code)),
    inst_holding: async () => wrap(await e.instHolding(code)),
    insider_trade: async () => wrap(await e.insiderTrade(code)),
    lockup_expiry: async () => wrap(await e.lockupExpiry(code)),
    share_pledge: async () => wrap(await e.sharePledge(code)),
    peer_companies: async () => wrap(await e.peerCompanies(code)),
    perf_forecast: async () => wrap(await e.perfForecast(code)),
    tech_indicator: async () => wrap(await e.techIndicator(code, 'daily', 120)),
    rd_investment: async () => wrap(await e.rdInvestment(code)),
    actual_controller: async () => wrap(await e.actualController(code)),
    subsidiaries: async () => wrap(await e.subsidiaries(code)),
    related_party: async () => wrap(await e.relatedPartyTrades(code)),
    top_customer: async () => wrap(await e.topCustomerSupplier(code, 'customer')),
    top_supplier: async () => wrap(await e.topCustomerSupplier(code, 'supplier')),
    intraday_tick: async () => wrap(await e.intradayTick(code)),
    dragon_tiger: async () => wrap(await e.dragonTiger()),
    market_breadth: async () => wrap(await e.marketBreadth()),
    sector_money_flow: async () => wrap(await e.sectorMoneyFlow('industry')),
    global_index: async () => wrap(await e.globalIndex('dji')),
    exchange_rate: async () => wrap(await e.exchangeRate('USDCNY')),
    macro_indicator: async () => wrap(await e.macroIndicator('CPI')),
    portfolio_trades: async () => ({
      success: true,
      source: 'portfolio',
      data: e.portfolio.trades(code) as unknown[],
    }),
  }

  if (!handlers[dim]) return { success: false, error: `未知数据维度: ${dim}` }
  try {
    return await handlers[dim]()
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

function wrap(r: { success: boolean; source?: string; cached?: boolean; data?: unknown[]; error?: string }): DimensionResult {
  if (!r.success) return { success: false, error: r.error ?? 'query failed' }
  return { success: true, source: r.source, cached: r.cached, data: r.data ?? [] }
}

export interface FetchResult {
  code: string
  name: string
  articleType: ArticleType
  templateName: string
  dimensions: Record<string, DimensionResult>
  global: Record<string, DimensionResult>
  summary: {
    requiredOk: number
    requiredTotal: number
    recommendedOk: number
    recommendedTotal: number
  }
}

export async function fetchArticleData(
  engine: AshareEngine,
  code: string,
  articleType: ArticleType = 'value',
): Promise<FetchResult> {
  const template = DATA_TEMPLATES[articleType]
  const rt = await engine.realtime(code)
  if (!rt.success || !rt.data?.[0]) {
    throw new Error(`无法获取 ${code} 实时数据`)
  }
  const name = rt.data[0].name ?? code

  const dimensions: Record<string, DimensionResult> = {}
  const allDims = [...new Set([...template.required, ...template.recommended])]
  for (const dim of allDims) {
    dimensions[dim] = await queryDimension(engine, code, dim)
  }

  const global: Record<string, DimensionResult> = {}
  for (const dim of GLOBAL_DIMS) {
    global[dim] = await queryDimension(engine, code, dim)
  }

  return {
    code,
    name,
    articleType,
    templateName: template.name,
    dimensions,
    global,
    summary: {
      requiredOk: template.required.filter(d => dimensions[d]?.success).length,
      requiredTotal: template.required.length,
      recommendedOk: template.recommended.filter(d => dimensions[d]?.success).length,
      recommendedTotal: template.recommended.length,
    },
  }
}
