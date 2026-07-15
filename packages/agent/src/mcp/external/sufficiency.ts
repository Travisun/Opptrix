/**
 * 工具数据充分性校验 — 检查外部 MCP 返回是否满足投研所需的最小数据维度。
 *
 * 设计原则：
 * - 按工具逐一声明必填字段、最小记录数、新鲜度阈值
 * - 外部数据不足时触发本地补充（merge / extend / replace）
 * - 校验失败不阻断，返回标记供 LLM 感知
 */

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

/** 按工具名查找规格（精确前缀匹配） */
function specForTool(
  specs: Record<string, ToolSufficiencySpec>,
  toolName: string,
): ToolSufficiencySpec | undefined {
  const exact = specs[toolName]
  if (exact) return exact
  // 前缀匹配：get_instrument_financials → get_instrument
  const prefix = toolName.split('_').slice(0, 3).join('_')
  return specs[`${prefix}_*`]
}

/** 从嵌套对象按点号路径取值 */
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

/** 判断是否为空值（null / undefined / 空字符串 / 空数组） */
function isEmpty(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string' && v.trim() === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  if (typeof v === 'number' && Number.isNaN(v)) return true
  return false
}

/** 尝试解析时间戳（支持 ISO 字符串 / Unix 秒） */
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

/** 提取结果中的列表（支持 {data:[...]} 和 直接数组） */
function extractItems(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>
    if (Array.isArray(obj.data)) return obj.data
    if (Array.isArray(obj.items)) return obj.items
    if (Array.isArray(obj.list)) return obj.list
  }
  return []
}

export class SufficiencyChecker {
  constructor(private specs: Record<string, ToolSufficiencySpec>) {}

  /**
   * 校验工具返回数据的充分性。
   * 始终返回结果（不抛出），供调用方决定是否补充。
   */
  check(toolName: string, result: unknown): SufficiencyCheckResult {
    const spec = specForTool(this.specs, toolName)
    if (!spec) {
      return {
        sufficient: true,
        missingFields: [],
        stale: false,
        reason: '无充分性规格，默认充分',
        shouldSupplement: false,
      }
    }

    // 展开嵌套结果（支持 {data:{...}} 包装）
    const unwrapped = result && typeof result === 'object'
      ? (result as Record<string, unknown>).data ?? result
      : result

    // 1. 必填字段检查
    const missingFields = spec.requiredFields.filter(f => isEmpty(getByPath(unwrapped, f)))

    // 2. 记录数检查
    const items = extractItems(unwrapped)
    const actualRecords = items.length
    const expectedRecords = spec.minRecords
    const recordsInsufficient = expectedRecords != null && actualRecords < expectedRecords

    // 3. 新鲜度检查
    let stale = false
    if (spec.maxAgeSeconds && spec.timestampField && items.length > 0) {
      const now = Date.now()
      stale = items.every(item => {
        const ts = tryParseTimestamp(getByPath(item, spec.timestampField!))
        return ts != null && (now - ts) > spec.maxAgeSeconds! * 1000
      })
    }

    const sufficient = missingFields.length === 0 && !recordsInsufficient && !stale

    const reasonParts: string[] = []
    if (missingFields.length) reasonParts.push(`缺字段: ${missingFields.join(', ')}`)
    if (recordsInsufficient) reasonParts.push(`记录不足: ${actualRecords}/${expectedRecords}`)
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

export const TOOL_SUFFICIENCY_SPECS: Record<string, ToolSufficiencySpec> = {
  /* ---- 标的快照 / 行情 ---- */
  get_instrument_snapshot: {
    requiredFields: ['symbol', 'name'],
    supplementStrategy: 'merge',
    supplementNote: '快照缺失字段由本地补充',
  },
  get_instrument_quotes: {
    requiredFields: ['symbol', 'price'],
    maxAgeSeconds: 300,
    timestampField: 'updatedAt',
    supplementStrategy: 'merge',
  },

  /* ---- 财务数据 ---- */
  get_instrument_financials: {
    requiredFields: ['symbol', 'reportDate'],
    minRecords: 4,
    supplementStrategy: 'merge',
    supplementNote: '财务摘要可能缺报告日期，本地补充',
  },
  get_instrument_balance_sheet: {
    requiredFields: ['symbol', 'reportDate'],
    minRecords: 2,
    supplementStrategy: 'merge',
  },
  get_instrument_cash_flow: {
    requiredFields: ['symbol', 'reportDate'],
    minRecords: 2,
    supplementStrategy: 'merge',
  },
  get_instrument_income_statement: {
    requiredFields: ['symbol', 'reportDate'],
    minRecords: 2,
    supplementStrategy: 'merge',
  },
  get_instrument_financial_indicators: {
    requiredFields: ['symbol'],
    supplementStrategy: 'merge',
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
    supplementStrategy: 'merge',
  },
  get_etf_profile: {
    requiredFields: ['symbol', 'name'],
    supplementStrategy: 'merge',
  },

  /* ---- 宏观 / 市场 ---- */
  get_macro_series: {
    requiredFields: ['data'],
    minRecords: 1,
    supplementStrategy: 'merge',
  },
  get_market_dynamics: {
    requiredFields: [],
    supplementStrategy: 'merge',
  },

  /* ---- 产业链 / 行业 ---- */
  industry_mining: {
    requiredFields: ['industry'],
    supplementStrategy: 'replace',
    supplementNote: '产业链叙事由外部提供，本地仅做替换',
  },
  get_sector_constituents: {
    requiredFields: ['data'],
    minRecords: 1,
    supplementStrategy: 'merge',
  },

  /* ---- 资讯 / 公告 ---- */
  list_news_articles: {
    requiredFields: [],
    minRecords: 1,
    maxAgeSeconds: 3600,
    timestampField: 'publishedAt',
    supplementStrategy: 'merge',
  },
  get_instrument_notices: {
    requiredFields: [],
    minRecords: 1,
    supplementStrategy: 'merge',
  },

  /* ---- 通用前缀匹配 ---- */
  'get_instrument_*': {
    requiredFields: ['symbol'],
    supplementStrategy: 'merge',
  },
}
