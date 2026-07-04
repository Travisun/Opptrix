/**
 * Provider custom methods registry — declares non-standard API methods
 * that providers expose beyond the base Capability set.
 *
 * Each entry describes one callable method: name, description, parameters,
 * and which provider implements it. The MCP layer exposes two tools:
 *   1. list_provider_custom_methods — discover what's available
 *   2. invoke_provider_custom_method — call any declared method
 */

export interface CustomMethodParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean
  default?: unknown
}

export interface CustomMethodDef {
  /** Method name on the provider driver */
  method: string
  /** Human-readable description for the agent */
  description: string
  /** Parameter schema */
  params: CustomMethodParam[]
  /** Example usage (for prompt hints) */
  example?: string
}

export interface ProviderCustomMethods {
  providerId: string
  methods: CustomMethodDef[]
}

// ── Built-in declarations ──

const EASTMONEY_CUSTOM: CustomMethodDef[] = [
  {
    method: 'bsStockConcept',
    description: '查询股票所属概念板块（如 "锂电池"、"人工智能"）',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD，默认最新' },
    ],
    example: '{"provider":"baostock","method":"bsStockConcept","args":["600519"]}',
  },
  {
    method: 'bsStockArea',
    description: '查询股票所属地域板块',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD，默认最新' },
    ],
    example: '{"provider":"baostock","method":"bsStockArea","args":["600519"]}',
  },
  {
    method: 'bsMacroCpi',
    description: '查询中国 CPI 宏观经济数据',
    params: [
      { name: 'startDate', type: 'string', description: '起始日期 YYYY-MM-DD' },
      { name: 'endDate', type: 'string', description: '结束日期 YYYY-MM-DD' },
    ],
    example: '{"provider":"baostock","method":"bsMacroCpi","args":["2024-01-01","2024-12-31"]}',
  },
  {
    method: 'bsMacroPpi',
    description: '查询中国 PPI 宏观经济数据',
    params: [
      { name: 'startDate', type: 'string', description: '起始日期 YYYY-MM-DD' },
      { name: 'endDate', type: 'string', description: '结束日期 YYYY-MM-DD' },
    ],
  },
  {
    method: 'bsMacroPmi',
    description: '查询中国 PMI 宏观经济数据',
    params: [
      { name: 'startDate', type: 'string', description: '起始日期 YYYY-MM-DD' },
      { name: 'endDate', type: 'string', description: '结束日期 YYYY-MM-DD' },
    ],
  },
  {
    method: 'bsGemStocks',
    description: '查询创业板股票列表',
    params: [
      { name: 'day', type: 'string', description: '日期 YYYY-MM-DD，默认最新' },
    ],
  },
  {
    method: 'bsStarStStocks',
    description: '查询科创板 ST 股票列表',
    params: [
      { name: 'day', type: 'string', description: '日期 YYYY-MM-DD，默认最新' },
    ],
  },
  {
    method: 'bsStStocks',
    description: '查询 ST 股票列表',
    params: [
      { name: 'day', type: 'string', description: '日期 YYYY-MM-DD，默认最新' },
    ],
  },
  {
    method: 'bsSuspendedStocks',
    description: '查询停牌股票列表',
    params: [
      { name: 'day', type: 'string', description: '日期 YYYY-MM-DD，默认最新' },
    ],
  },
  {
    method: 'bsTerminatedStocks',
    description: '查询退市股票列表',
    params: [
      { name: 'day', type: 'string', description: '日期 YYYY-MM-DD，默认最新' },
    ],
  },
  {
    method: 'bsStocksInRisk',
    description: '查询风险警示股票列表',
    params: [
      { name: 'day', type: 'string', description: '日期 YYYY-MM-DD，默认最新' },
    ],
  },
  {
    method: 'bsAdjustFactor',
    description: '查询股票复权因子',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
      { name: 'startDate', type: 'string', description: '起始日期' },
      { name: 'endDate', type: 'string', description: '结束日期' },
    ],
  },
]

const ZZSHARE_CUSTOM: CustomMethodDef[] = [
  {
    method: 'zzSentimentMarketTopN',
    description: '自在量化市场情绪 Top N 概览',
    params: [
      { name: 'n', type: 'number', description: '返回条数，默认 10' },
    ],
  },
  {
    method: 'zzUplimitHot',
    description: '涨停热度追踪（连板、首板统计）',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD' },
    ],
  },
  {
    method: 'zzLhbDetail',
    description: '龙虎榜明细（营业部买卖详情）',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD' },
    ],
  },
  {
    method: 'zzAiReports',
    description: '自在量化 AI 研报摘要',
    params: [
      { name: 'code', type: 'string', description: '股票代码，为空返回全市场' },
    ],
  },
  {
    method: 'zzPlatesRank',
    description: '板块排行榜',
    params: [
      { name: 'plateType', type: 'string', description: '板块类型：行业/概念/地域' },
    ],
  },
  {
    method: 'zzTopicTables',
    description: '题材表格（热点主题归类）',
    params: [],
  },
  {
    method: 'zzMacroSentiment',
    description: '宏观情绪指标',
    params: [],
  },
]

const ALL_CUSTOM_METHODS: ProviderCustomMethods[] = [
  { providerId: 'baostock', methods: EASTMONEY_CUSTOM },
  { providerId: 'zzshare', methods: ZZSHARE_CUSTOM },
]

export function listProviderCustomMethods(providerId?: string): ProviderCustomMethods[] {
  if (providerId) {
    return ALL_CUSTOM_METHODS.filter(p => p.providerId === providerId)
  }
  return ALL_CUSTOM_METHODS
}

export function findCustomMethod(
  providerId: string,
  methodName: string,
): CustomMethodDef | undefined {
  const provider = ALL_CUSTOM_METHODS.find(p => p.providerId === providerId)
  return provider?.methods.find(m => m.method === methodName)
}
