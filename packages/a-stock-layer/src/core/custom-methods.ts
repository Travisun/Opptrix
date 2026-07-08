/**
 * Provider custom methods registry — declares non-standard API methods
 * that providers expose beyond the base Capability set.
 *
 * Each entry describes one callable method: name, description, parameters,
 * and which provider implements it. The MCP layer exposes two tools:
 *   1. list_provider_custom_methods — discover what's available
 *   2. invoke_provider_custom_method — call any declared method
 */

import { resolveProviderAlias } from '../providers/common/provider-aliases.js'

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
  /** Provider 唯一标识（如 "baostock"、"zzshare"） */
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

const TICKFLOW_CUSTOM: CustomMethodDef[] = [
  {
    method: 'fetchDepth',
    description: 'TickFlow 五档盘口深度',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
    ],
  },
  {
    method: 'tfDepthBatch',
    description: 'TickFlow 批量五档盘口',
    params: [
      { name: 'codes', type: 'string', description: '股票代码数组（invoke 时传 JSON 数组）', required: true },
    ],
  },
  {
    method: 'tfListUniverses',
    description: 'TickFlow 标的池列表',
    params: [],
  },
  {
    method: 'tfUniverseBatch',
    description: 'TickFlow 批量标的池详情',
    params: [
      { name: 'ids', type: 'string', description: '标的池 ID 数组', required: true },
    ],
  },
  {
    method: 'tfExFactors',
    description: 'TickFlow 除权因子',
    params: [
      { name: 'code', type: 'string', description: '股票代码', required: true },
    ],
  },
  {
    method: 'tfIntradayBatch',
    description: 'TickFlow 批量当日分钟 K',
    params: [
      { name: 'codes', type: 'string', description: '股票代码数组', required: true },
    ],
  },
]

const TENCENT_CUSTOM: CustomMethodDef[] = [
  {
    method: 'tencentStockPlates',
    description: '查询个股行业/概念/地域标签（腾讯 plateNew）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
    example: '{"provider":"tencent","method":"tencentStockPlates","args":["300308"]}',
  },
  {
    method: 'tencentRelatedPlates',
    description: '查询个股关联板块列表',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'tencentIndustryRank',
    description: '查询个股行业内估值排名（PE/市值/每股收益）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'tencentInstitutionRating',
    description: '查询机构评级汇总与近期研报标题',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'tencentStockSearch',
    description: '股票搜索（腾讯 smartbox）',
    params: [
      { name: 'query', type: 'string', description: '代码或名称关键词', required: true },
    ],
  },
  {
    method: 'tencentTradeDetails',
    description: '逐笔成交明细（盘中有效，收盘后常为空）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
]

const SINA_CUSTOM: CustomMethodDef[] = [
  {
    method: 'sinaCorpInfo',
    description: '公司完整资料（简介、行业、概念，来源 F10 HTML）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaExecutives',
    description: '公司高管 / 董事会成员列表',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaMajorShareholders',
    description: '主要股东持股明细',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaFundHoldings',
    description: '基金持股明细（含多期截止日）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaConceptPlates',
    description: '所属概念板块（含行情中心 node）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaRelatedSecurities',
    description: '相关证券（可转债、同公司品种等）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaIndexMembership',
    description: '所属指数成分历史',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaCirculateShareholders',
    description: '流通股东持股明细',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaDividends',
    description: '分红送配历史（F10 发行分配）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaFinancialPivot',
    description: '财务三表 / 指标 / 杜邦透视（guide|profit|balance|cashflow|dupont）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
      { name: 'sheet', type: 'string', description: 'guide|profit|balance|cashflow|dupont', required: false },
    ],
  },
  {
    method: 'sinaStockStructure',
    description: '股本结构变动历史',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaCorpRule',
    description: '公司章程正文',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaAnnualBulletins',
    description: '年度报告公告列表',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaShareUnlock',
    description: '限售解禁计划',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaMarginTrading',
    description: '融资融券快照（自全市场页筛选）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaDragonTigerStock',
    description: '个股单日龙虎榜记录',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
      { name: 'date', type: 'string', description: '交易日 YYYY-MM-DD', required: false },
    ],
  },
  {
    method: 'sinaPriceDistribution',
    description: '分价统计（当日价位成交分布）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaLargeOrders',
    description: '大单成交追踪明细',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaPerfForecast',
    description: '业绩预告（F10 vFD_AchievementNotice）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaBulletins',
    description: '定期报告公告列表（ndbg 年报 / zqbg 半年报 / yjdbg 一季报 / sjdbg 三季报）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
      { name: 'pageType', type: 'string', description: 'ndbg|zqbg|yjdbg|sjdbg', required: false },
    ],
  },
  {
    method: 'sinaAllBulletins',
    description: '公司公告全量列表（分页；返回日期、标题、链接）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
      { name: 'page', type: 'number', description: '页码，从 1 开始', required: false },
    ],
  },
  {
    method: 'sinaBulletinDetail',
    description: '公告详情正文（有 PDF 附件则提取 PDF 文本，否则提取网页正文）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
      { name: 'bulletinId', type: 'string', description: '公告 id（列表 link 中的 id 参数）', required: true },
    ],
  },
  {
    method: 'sinaInsiderTrades',
    description: '内部交易（董监高持股变动）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
      { name: 'bdate', type: 'string', description: '起始日期 YYYY-MM-DD', required: false },
      { name: 'edate', type: 'string', description: '结束日期 YYYY-MM-DD', required: false },
    ],
  },
  {
    method: 'sinaStockComment',
    description: '千股千评（综合评价与行情快照）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaPriceHistory',
    description: '持仓分析 / 历史分价分布（默认近 7 日）',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
      { name: 'startDate', type: 'string', description: '起始日期 YYYY-MM-DD', required: false },
      { name: 'endDate', type: 'string', description: '结束日期 YYYY-MM-DD', required: false },
    ],
  },
  {
    method: 'sinaIpoInfo',
    description: '新股发行（IPO）资料',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaAddStockHistory',
    description: '增发情况历史',
    params: [
      { name: 'code', type: 'string', description: '6 位股票代码', required: true },
    ],
  },
  {
    method: 'sinaEtfList',
    description: 'ETF 基金列表（场内行情，支持翻页；含最新价、涨跌幅等）',
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始', required: false },
      { name: 'pageSize', type: 'number', description: '每页条数，默认 40，最大 100', required: false },
    ],
  },
  {
    method: 'sinaFundQuote',
    description: '基金详情页行情（单位/累计净值、场内价格、折溢价）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码，如 159937', required: true },
    ],
  },
  {
    method: 'sinaFundProfile',
    description: '基金基本信息（概况 tab）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundNav',
    description: '历史净值（分页）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
      { name: 'page', type: 'number', description: '页码', required: false },
      { name: 'pageSize', type: 'number', description: '每页条数，默认 20', required: false },
    ],
  },
  {
    method: 'sinaFundFees',
    description: '费率与交易规则（管理费/托管费/申购赎回规则）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundDistributions',
    description: '分红与份额折算记录',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundAnnouncements',
    description: '基金公告列表（分页，20 条/页）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
      { name: 'page', type: 'number', description: '页码', required: false },
      { name: 'type', type: 'string', description: '公告类型筛选（可选）', required: false },
    ],
  },
  {
    method: 'sinaFundDocuments',
    description: '法律文件（基金合同、招募说明书等）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundShareChange',
    description: '申购赎回份额变动（按报告期）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundAgencies',
    description: '销售机构（直销/代销）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundDividends',
    description: '历史现金分红（不含份额折算）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundTopHolders',
    description: '十大持有人（可按报告期筛选）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
      { name: 'date', type: 'string', description: '报告期 YYYY-MM-DD（可选，默认最新）', required: false },
    ],
  },
  {
    method: 'sinaFundHolderStructure',
    description: '持有人结构（机构/个人占比等）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
      { name: 'date', type: 'string', description: '报告期 YYYY-MM-DD（可选）', required: false },
    ],
  },
  {
    method: 'sinaFundHolderStructureHistory',
    description: '持有人结构历史变动（机构/个人份额与占比）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundFinancialIndicators',
    description: '财务指标（本期利润、净收益、期末净值等，多期）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundIncomeStatement',
    description: '利润表（收入/费用/净利润等，多期）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
  {
    method: 'sinaFundBalanceSheet',
    description: '基金负债表（资产/负债/权益，多期）',
    params: [
      { name: 'code', type: 'string', description: '6 位基金代码', required: true },
    ],
  },
]

const SINAFINANCE_CUSTOM = SINA_CUSTOM

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

const ALL_CUSTOM_METHODS: ProviderCustomMethods[] = [
  { providerId: 'baostock', methods: BAOSTOCK_CUSTOM },
  { providerId: 'tickflow', methods: TICKFLOW_CUSTOM },
  { providerId: 'zzshare', methods: ZZSHARE_CUSTOM },
  { providerId: 'tencent', methods: TENCENT_CUSTOM },
  { providerId: 'sinafinance', methods: SINAFINANCE_CUSTOM },
]

export function listProviderCustomMethods(providerId?: string): ProviderCustomMethods[] {
  if (providerId) {
    const resolved = resolveProviderAlias(providerId)
    return ALL_CUSTOM_METHODS.filter(p => p.providerId === resolved)
  }
  return ALL_CUSTOM_METHODS
}

export function findCustomMethod(
  providerId: string,
  methodName: string,
): CustomMethodDef | undefined {
  const resolved = resolveProviderAlias(providerId)
  const provider = ALL_CUSTOM_METHODS.find(p => p.providerId === resolved)
  return provider?.methods.find(m => m.method === methodName)
}

