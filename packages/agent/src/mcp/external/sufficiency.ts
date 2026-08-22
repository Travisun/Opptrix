/**
 * 工具数据充分性校验 — 检查外部 MCP 返回是否满足投研所需的最小数据维度。
 *
 * 设计原则：
 * - 按工具逐一声明必填字段、最小记录数、新鲜度阈值
 * - 外部数据不足时触发本地补充（merge / extend / replace）
 * - 校验失败不阻断，返回标记供 LLM 感知
 * - 充分性按通用表/列表形状判定，不按外部厂商分家
 */

import { parseNamespacedMcpTool } from '@opptrix/shared'

/** 补充策略 */
export type SupplementStrategy = 'merge' | 'extend' | 'replace'

/** 工具充分性规格 */
export interface ToolSufficiencySpec {
  /** 必填字段路径（支持嵌套点号路径，如 "data.reportDate"） */
  requiredFields: string[]
  /** 最小记录数（列表类工具） */
  minRecords?: number
  /** 数据新鲜度阈值（秒），超过视为陈旧 */
  maxAgeSeconds?: number
  /** 时间戳字段路径（用于新鲜度判断） */
  timestampField?: string
  /** 补充策略 */
  supplementStrategy: SupplementStrategy
  /** 补充说明（告知 LLM 为何补充） */
  supplementNote?: string
}

export interface SufficiencyCheckResult {
  /** 是否充分 */
  sufficient: boolean
  /** 缺失字段列表 */
  missingFields: string[]
  /** 是否陈旧 */
  stale: boolean
  /** 实际记录数 */
  actualRecords?: number
  /** 期望最小记录数 */
  expectedRecords?: number
  /** 原因说明 */
  reason: string
  /** 建议补充本地 */
  shouldSupplement: boolean
}

export type TabularExtract = {
  found: boolean
  items: unknown[]
}

/** 通用表/列表列名；新 MCP 只要用这些键即可被识别，无需改编排 */
const TABULAR_KEYS = ['data', 'items', 'list', 'datas', 'rows'] as const

/** 包装层里再挂一张表时继续往下看，避免只认顶层 */
const NEST_OBJECT_KEYS = ['result', 'payload', 'content', 'output', 'body'] as const

const IDENTITY_REQUIRED_FIELDS = new Set(['symbol', 'code', 'name'])

/** 标的身份：本地字段名或常见中文列均可 */
const IDENTITY_VALUE_KEYS = [
  'symbol',
  'code',
  'name',
  '股票代码',
  '证券代码',
  '股票简称',
  '证券名称',
  '简称',
  '代码',
  '名称',
] as const

const MAX_TABULAR_DEPTH = 3

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function bareForSpec(toolName: string): string {
  const parsed = parseNamespacedMcpTool(toolName)
  return parsed ? parsed.toolName : toolName
}

/**
 * 精确名优先，再递缩短前缀匹配 `foo_bar_*`。
 * 取前 3 段会让 get_instrument_cyq 去查 get_instrument_cyq_*，永远打不中 get_instrument_*。
 */
function specForTool(
  specs: Record<string, ToolSufficiencySpec>,
  toolName: string,
): ToolSufficiencySpec | undefined {
  const exact = specs[toolName]
  if (exact) return exact
  const bare = bareForSpec(toolName)
  if (specs[bare]) return specs[bare]
  const parts = bare.split('_').filter(part => part.length > 0)
  for (let n = parts.length - 1; n >= 1; n -= 1) {
    const wildcard = `${parts.slice(0, n).join('_')}_*`
    const spec = specs[wildcard]
    if (spec) return spec
  }
  return undefined
}

function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string' && v.trim() === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  if (typeof v === 'number' && Number.isNaN(v)) return true
  return false
}

function tryParseTimestamp(v: unknown): number | null {
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000
  if (typeof v === 'string') {
    const ts = Date.parse(v)
    if (!Number.isNaN(ts)) return ts
    const n = Number(v)
    if (!Number.isNaN(n)) return n > 1e12 ? n : n * 1000
  }
  return null
}

function arrayFromKnownKeys(obj: Record<string, unknown>): TabularExtract | null {
  for (const key of TABULAR_KEYS) {
    const v = obj[key]
    if (Array.isArray(v)) return { found: true, items: v }
  }
  return null
}

/**
 * 识别通用表/列表（含一层包装与已知键嵌套）。
 * 新 MCP 无需改此函数，只要返回常见形状即可。
 */
export function extractTabular(result: unknown, depth = 0): TabularExtract {
  if (Array.isArray(result)) return { found: true, items: result }
  if (!isPlainObject(result) || depth > MAX_TABULAR_DEPTH) {
    return { found: false, items: [] }
  }

  const direct = arrayFromKnownKeys(result)
  if (direct) return direct

  for (const key of TABULAR_KEYS) {
    const nested = result[key]
    if (isPlainObject(nested)) {
      const inner = extractTabular(nested, depth + 1)
      if (inner.found) return inner
    }
  }
  for (const key of NEST_OBJECT_KEYS) {
    const nested = result[key]
    if (Array.isArray(nested) || isPlainObject(nested)) {
      const inner = extractTabular(nested, depth + 1)
      if (inner.found) return inner
    }
  }
  return { found: false, items: [] }
}

function hasIdentityValue(obj: unknown): boolean {
  if (!isPlainObject(obj)) return false
  return IDENTITY_VALUE_KEYS.some(key => !isEmpty(obj[key]))
}

function isRequiredMissing(unwrapped: unknown, field: string): boolean {
  if (!field.includes('.') && IDENTITY_REQUIRED_FIELDS.has(field)) {
    return !hasIdentityValue(unwrapped)
  }
  return isEmpty(getByPath(unwrapped, field))
}

function unwrapDataObject(result: unknown): unknown {
  if (!isPlainObject(result)) return result
  const data = result.data
  if (isPlainObject(data)) return data
  return result
}

function rowsStale(spec: ToolSufficiencySpec, items: unknown[]): boolean {
  const maxAge = spec.maxAgeSeconds
  const tsField = spec.timestampField
  if (!maxAge || !tsField || items.length === 0) return false
  const now = Date.now()
  return items.every((item) => {
    const ts = tryParseTimestamp(getByPath(item, tsField))
    return ts != null && (now - ts) > maxAge * 1000
  })
}

function emptyTableResult(actual: number): SufficiencyCheckResult {
  return {
    sufficient: false,
    missingFields: [],
    stale: false,
    actualRecords: actual,
    expectedRecords: 1,
    reason: `记录不足: ${actual}/1`,
    shouldSupplement: true,
  }
}

function packResult(
  missingFields: string[],
  recordsInsufficient: boolean,
  stale: boolean,
  actualRecords: number | undefined,
  expectedRecords: number | undefined,
): SufficiencyCheckResult {
  const sufficient = missingFields.length === 0 && !recordsInsufficient && !stale
  const reasonParts: string[] = []
  if (missingFields.length) reasonParts.push(`缺字段: ${missingFields.join(', ')}`)
  if (recordsInsufficient) reasonParts.push(`记录不足: ${actualRecords ?? 0}/${expectedRecords}`)
  if (stale) reasonParts.push('数据陈旧')
  return {
    sufficient,
    missingFields,
    stale,
    actualRecords,
    expectedRecords,
    reason: reasonParts.length ? reasonParts.join('; ') : '充分',
    shouldSupplement: !sufficient,
  }
}

export class SufficiencyChecker {
  constructor(private specs: Record<string, ToolSufficiencySpec>) {}

  /**
   * 校验工具返回数据的充分性。
   * 始终返回结果（不抛出），供调用方决定是否补充。
   */
  check(toolName: string, result: unknown): SufficiencyCheckResult {
    const spec = specForTool(this.specs, toolName)
    const tabular = extractTabular(result)

    // 空表/空列表无论有无规格都不充分，否则会跳过本地补充
    if (tabular.found && tabular.items.length === 0) {
      return emptyTableResult(0)
    }

    if (!spec) {
      return {
        sufficient: true,
        missingFields: [],
        stale: false,
        reason: '无充分性规格，默认充分',
        shouldSupplement: false,
      }
    }

    // 有行的通用表：不按本地对象的 symbol/name 形状卡死
    if (tabular.found && tabular.items.length > 0) {
      const stale = rowsStale(spec, tabular.items)
      return packResult([], false, stale, tabular.items.length, spec.minRecords ?? 1)
    }

    const unwrapped = unwrapDataObject(result)
    const missingFields = spec.requiredFields.filter(f => isRequiredMissing(unwrapped, f))
    const inner = extractTabular(unwrapped)
    if (inner.found && inner.items.length === 0) {
      return emptyTableResult(0)
    }
    const expectedRecords = spec.minRecords
    // 非表对象无法数行；minRecords 只约束已识别的表，避免筹码/K 线对象被空列表规则误伤
    const recordsInsufficient = inner.found
      && expectedRecords != null
      && inner.items.length < expectedRecords
    const stale = inner.found ? rowsStale(spec, inner.items) : false

    return packResult(
      missingFields,
      recordsInsufficient,
      stale,
      inner.found ? inner.items.length : undefined,
      expectedRecords,
    )
  }

  /** 获取工具的补充策略 */
  strategyFor(toolName: string): SupplementStrategy | undefined {
    const spec = specForTool(this.specs, toolName)
    return spec?.supplementStrategy
  }

  /** 获取工具的补充说明 */
  noteFor(toolName: string): string | undefined {
    const spec = specForTool(this.specs, toolName)
    return spec?.supplementNote
  }
}

/* -------------------------------------------------------------------------- */
/* 按工具逐一配置充分性规格                                                      */
/* -------------------------------------------------------------------------- */

const DEFAULT_STRATEGY: SupplementStrategy = 'merge'

const LIST_MIN_ONE: ToolSufficiencySpec = {
  requiredFields: [],
  minRecords: 1,
  supplementStrategy: DEFAULT_STRATEGY,
}

export const TOOL_SUFFICIENCY_SPECS: Record<string, ToolSufficiencySpec> = {
  /* ---- 标的快照 / 行情 ---- */
  get_instrument_snapshot: {
    requiredFields: ['symbol', 'name'],
    supplementStrategy: DEFAULT_STRATEGY,
    supplementNote: '快照缺失字段由本地补充',
  },
  get_instrument_quotes: {
    requiredFields: ['symbol', 'price'],
    maxAgeSeconds: 300,
    timestampField: 'updatedAt',
    supplementStrategy: DEFAULT_STRATEGY,
  },

  /* ---- 财务数据 ---- */
  get_instrument_financials: {
    requiredFields: ['symbol', 'reportDate'],
    minRecords: 4,
    supplementStrategy: DEFAULT_STRATEGY,
    supplementNote: '财务摘要可能缺报告日期，本地补充',
  },
  get_instrument_balance_sheet: {
    requiredFields: ['symbol', 'reportDate'],
    minRecords: 2,
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_instrument_cash_flow: {
    requiredFields: ['symbol', 'reportDate'],
    minRecords: 2,
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_instrument_income_statement: {
    requiredFields: ['symbol', 'reportDate'],
    minRecords: 2,
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_instrument_financial_indicators: {
    requiredFields: ['symbol'],
    supplementStrategy: DEFAULT_STRATEGY,
  },

  /* ---- ETF 相关 ---- */
  get_etf_nav: {
    requiredFields: ['symbol', 'nav'],
    supplementStrategy: 'extend',
    supplementNote: 'ETF 净值历史序列，外部缺失时本地补全',
  },
  get_etf_holdings: {
    requiredFields: ['symbol'],
    minRecords: 1,
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_etf_profile: {
    requiredFields: ['symbol', 'name'],
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_fund_nav: {
    requiredFields: ['symbol', 'nav'],
    supplementStrategy: 'extend',
    supplementNote: '公募基金净值历史序列，外部缺失时本地补全',
  },
  get_fund_holdings: {
    requiredFields: ['symbol'],
    minRecords: 1,
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_fund_profile: {
    requiredFields: ['symbol', 'name'],
    supplementStrategy: DEFAULT_STRATEGY,
  },

  /* ---- 宏观 / 市场 ---- */
  get_macro_series: {
    requiredFields: ['data'],
    minRecords: 1,
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_market_dynamics: {
    requiredFields: [],
    minRecords: 1,
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_limit_updown: { ...LIST_MIN_ONE },
  get_dragon_tiger: { ...LIST_MIN_ONE },
  get_cn_market_special: { ...LIST_MIN_ONE },
  get_trade_calendar: { ...LIST_MIN_ONE },
  get_market_session: { ...LIST_MIN_ONE },
  get_market_sentiment: { ...LIST_MIN_ONE },
  get_market_regime: { ...LIST_MIN_ONE },

  /* ---- 产业链 / 行业 ---- */
  get_sector_constituents: {
    requiredFields: ['data'],
    minRecords: 1,
    supplementStrategy: DEFAULT_STRATEGY,
  },

  /* ---- 资讯 / 公告 ---- */
  list_news_articles: {
    requiredFields: [],
    minRecords: 1,
    maxAgeSeconds: 3600,
    timestampField: 'publishedAt',
    supplementStrategy: DEFAULT_STRATEGY,
  },
  get_instrument_notices: {
    requiredFields: [],
    minRecords: 1,
    supplementStrategy: DEFAULT_STRATEGY,
  },

  get_instrument_cyq: { ...LIST_MIN_ONE },

  /* ---- 通用前缀匹配（get_instrument_cyq 等未单独列出的 get_instrument_*） ---- */
  'get_instrument_*': { ...LIST_MIN_ONE },
}
