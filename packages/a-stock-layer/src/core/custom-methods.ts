/**
 * Provider custom methods registry — declares non-standard API methods
 * that providers expose beyond the base Capability set.
 *
 * Each entry describes one callable method: name, description, parameters,
 * and which provider implements it. The MCP layer exposes two tools:
 *   1. list_provider_custom_methods — discover what's available
 *   2. invoke_provider_custom_method — call any declared method
 */

/**
 * Provider 自定义方法参数定义 — 描述单个参数的名称、类型、描述和默认值。
 *
 * 用途：MCP 工具层自动生成参数 Schema，供 LLM 理解参数含义。
 */
export interface CustomMethodParam {
  /** 参数名称（如 "code"、"date"、"startDate"） */
  name: string
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean'
  /** 参数描述（如"股票代码"、"日期 YYYY-MM-DD"） */
  description: string
  /** 是否必填，默认 false */
  required?: boolean
  /** 默认值 */
  default?: unknown
}

/**
 * Provider 自定义方法定义 — 描述一个可在 Provider 上调用的非标准方法。
 *
 * 用途：
 *   1. MCP 层自动生成 list_provider_custom_methods 和 invoke_provider_custom_method 工具
 *   2. Agent 可发现和调用 Provider 暴露的扩展 API
 */
export interface CustomMethodDef {
  /** Provider driver 上的方法名（如 "bsStockConcept"、"zzSentimentMarketTopN"） */
  method: string
  /** 人类可读的功能描述（如"查询股票所属概念板块"） */
  description: string
  /** 方法参数 Schema 列表 */
  params: CustomMethodParam[]
  /** 示例调用 JSON（如 '{"provider":"baostock","method":"bsStockConcept","args":["600519"]}'） */
  example?: string
}

/**
 * Provider 自定义方法集合 — 某个 Provider 暴露的所有自定义方法。
 *
 * 用途：MCP 层按 providerId 分组展示可用方法。
 */
export interface ProviderCustomMethods {
  /** Provider 唯一标识（如 "baostock"、"zzshare"、"akshare"） */
  providerId: string
  /** 该 Provider 的自定义方法列表 */
  methods: CustomMethodDef[]
}

// ── Built-in declarations ──

const BAOSTOCK_CUSTOM: CustomMethodDef[] = [
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

const AKSHARE_CUSTOM: CustomMethodDef[] = [
  {
    method: 'stockALgPe',
    description: 'A股等权重市盈率历史（乐咕）',
    params: [],
  },
  {
    method: 'stockALgPb',
    description: 'A股等权重市净率历史（乐咕）',
    params: [],
  },
  {
    method: 'stockBuffettIndex',
    description: '巴菲特指标（A股总市值/GDP）',
    params: [],
  },
  {
    method: 'sseSummary',
    description: '上交所市场总貌（市值、市盈率、上市公司数）',
    params: [],
  },
  {
    method: 'szseSummary',
    description: '深交所市场总貌',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYYMMDD' },
    ],
  },
  {
    method: 'sseDealDaily',
    description: '上交所每日概况（挂牌数、市值、成交额）',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYYMMDD' },
    ],
  },
  {
    method: 'bondSpotQuote',
    description: '银行间债券做市报价',
    params: [],
  },
  {
    method: 'bondSpotDeal',
    description: '银行间债券现券成交行情',
    params: [],
  },
  {
    method: 'bondChinaYield',
    description: '国债收益率曲线',
    params: [
      { name: 'startDate', type: 'string', description: '起始日期 YYYY-MM-DD', required: true },
      { name: 'endDate', type: 'string', description: '结束日期 YYYY-MM-DD', required: true },
    ],
  },
  {
    method: 'bondZhCov',
    description: '可转债列表',
    params: [],
  },
  {
    method: 'bondCbJsl',
    description: '集思录可转债列表',
    params: [],
  },
  {
    method: 'amacMemberInfo',
    description: '私募基金协会会员机构',
    params: [],
  },
  {
    method: 'amacManagerInfo',
    description: '私募基金管理人信息',
    params: [],
  },
  {
    method: 'amacFundInfo',
    description: '私募基金产品信息',
    params: [
      { name: 'startPage', type: 'number', description: '起始页码', required: true },
      { name: 'endPage', type: 'number', description: '结束页码', required: true },
    ],
  },
  {
    method: 'futuresSettle',
    description: '期货结算价',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD', required: true },
      { name: 'market', type: 'string', description: '交易所代码', required: true },
    ],
  },
  {
    method: 'futuresZhDailySina',
    description: '期货日K线（新浪）',
    params: [
      { name: 'symbol', type: 'string', description: '合约代码', required: true },
    ],
  },
  {
    method: 'currencyLatest',
    description: '实时汇率',
    params: [
      { name: 'base', type: 'string', description: '基准货币', default: 'USD' },
    ],
  },
  {
    method: 'currencyConvert',
    description: '货币兑换',
    params: [
      { name: 'from', type: 'string', description: '源货币', default: 'USD' },
      { name: 'to', type: 'string', description: '目标货币', default: 'CNY' },
      { name: 'amount', type: 'number', description: '金额', default: 10000 },
    ],
  },
  {
    method: 'movieBoxofficeRealtime',
    description: '实时票房',
    params: [],
  },
  {
    method: 'newsCctv',
    description: '央视新闻联播文字稿',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD', required: true },
    ],
  },
]

const ALL_CUSTOM_METHODS: ProviderCustomMethods[] = [
  { providerId: 'baostock', methods: BAOSTOCK_CUSTOM },
  { providerId: 'zzshare', methods: ZZSHARE_CUSTOM },
  { providerId: 'akshare', methods: AKSHARE_CUSTOM },
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

