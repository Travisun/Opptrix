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
import { TENCENT_CUSTOM } from '../providers/tencent/custom-method-docs.js'
import { STOCKINDEX_CUSTOM } from '../providers/stockindex/custom-method-docs.js'
import { SINA_CUSTOM } from '../providers/sinafinance/custom-method-docs.js'
import { AKSHARE_CUSTOM } from '../providers/akshare/custom-method-docs.js'

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
  /** 上游数据接口 URL（维护对照用） */
  sourceUrl?: string
  /** 产品页面入口 URL */
  pageUrl?: string
  /** 返回值结构说明 */
  returns?: string
  /** 引擎调用方式说明 */
  usage?: string
  /** 维护备注（Referer、分页、延迟行情等） */
  notes?: string
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

// Tencent / sinafinance 自定义方法完整文档见：
// - providers/tencent/custom-method-docs.ts
// - providers/sinafinance/custom-method-docs.ts

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
  { providerId: 'stockindex', methods: STOCKINDEX_CUSTOM },
  { providerId: 'sinafinance', methods: SINAFINANCE_CUSTOM },
  { providerId: 'akshare', methods: AKSHARE_CUSTOM },
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

/** 按 provider + 方法名查找完整 API 文档（含 sourceUrl、returns、usage） */
export function findCustomMethodDoc(
  providerId: string,
  methodName: string,
): CustomMethodDef | undefined {
  return findCustomMethod(providerId, methodName)
}

