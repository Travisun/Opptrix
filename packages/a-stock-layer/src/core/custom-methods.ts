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
  /** Provider 唯一标识（如 "baostock"、"zzshare"、"eastmoney"） */
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

const EASTMONEY_EXTRA_CUSTOM: CustomMethodDef[] = [
  {
    method: 'boardConceptList',
    description: '概念板块列表（含涨跌幅、领涨股）',
    params: [],
    example: '{"provider":"eastmoney","method":"boardConceptList","args":[]}',
  },
  {
    method: 'boardIndustryList',
    description: '行业板块列表（含涨跌幅、领涨股）',
    params: [],
  },
  {
    method: 'boardRegionList',
    description: '地域板块列表',
    params: [],
  },
  {
    method: 'boardConceptCons',
    description: '概念板块成分股',
    params: [
      { name: 'boardCode', type: 'string', description: '板块代码，如 BK0818', required: true },
    ],
  },
  {
    method: 'ztPool',
    description: '涨停股池（当日涨停股票列表）',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYYMMDD，默认今日' },
    ],
  },
  {
    method: 'hsgtNorthFlow',
    description: '沪深港通北向资金净流入（近30日）',
    params: [],
  },
  {
    method: 'hotRank',
    description: '东财个股热搜排名 Top100',
    params: [],
  },
]

const MISC_DATA_CUSTOM: CustomMethodDef[] = [
  {
    method: 'lhbDetail',
    description: '龙虎榜详情（营业部买卖明细）',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD' },
    ],
    example: '{"provider":"misc-data","method":"lhbDetail","args":["2026-07-04"]}',
  },
  {
    method: 'lhbJgStatistic',
    description: '龙虎榜机构席位统计',
    params: [],
  },
  {
    method: 'lhbStockStatistic',
    description: '个股龙虎榜历史统计',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
    ],
  },
  {
    method: 'gdfxHoldingCount',
    description: '股东户数变动 Top100（散户筹码集中度）',
    params: [],
  },
  {
    method: 'gdfxHoldingDetail',
    description: '个股股东户数历史详情',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
    ],
  },
  {
    method: 'marketValuation',
    description: '全市场估值指标（PE/PB/股息率）',
    params: [],
  },
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
    method: 'profitForecast',
    description: '个股盈利预测（EPS/营收/净利润）',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
    ],
  },
  {
    method: 'institutionRecommend',
    description: '机构推荐汇总（买入/增持/中性/减持）',
    params: [],
  },
  {
    method: 'ipoApply',
    description: '新股申购与中签',
    params: [],
  },
  {
    method: 'marginDetailSse',
    description: '沪市融资融券明细',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD' },
    ],
  },
  {
    method: 'dividendDetail',
    description: '个股分红配送历史',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
    ],
  },
  {
    method: 'lockupExpiry',
    description: '限售解禁（近期可解禁股票）',
    params: [
      { name: 'code', type: 'string', description: '可选股票代码' },
    ],
  },
  {
    method: 'buyback',
    description: '股票回购数据',
    params: [],
  },
  {
    method: 'blockTradeDetail',
    description: '大宗交易每日明细',
    params: [
      { name: 'date', type: 'string', description: '日期 YYYY-MM-DD' },
    ],
  },
  {
    method: 'shareStructure',
    description: '个股股本结构',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
    ],
  },
]

const ALL_CUSTOM_METHODS: ProviderCustomMethods[] = [
  { providerId: 'baostock', methods: BAOSTOCK_CUSTOM },
  { providerId: 'zzshare', methods: ZZSHARE_CUSTOM },
  { providerId: 'eastmoney', methods: EASTMONEY_EXTRA_CUSTOM },
  { providerId: 'misc-data', methods: MISC_DATA_CUSTOM },
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
