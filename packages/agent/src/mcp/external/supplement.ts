/**
 * 外部 MCP 与本地数据合并策略 — 保障投研数据完备性。
 *
 * 三种策略：
 * - merge: 按唯一键去重合并，外部优先，同 key 外部字段覆盖本地，缺失字段补上本地
 * - extend: 外部为基础，本地补外部缺失的 key，扩展列表长度
 * - replace: 本地完全替换外部（外部仅做探测）
 *
 * 每种策略都保留 _meta 标记，告知 LLM 数据来源和合并情况。
 */

/** 按工具定义合并主键（用于列表去重） */
const MERGE_KEY_MAP: Record<string, string> = {
  // 财务数据：按报告期合并
  get_instrument_financials: 'reportDate',
  get_instrument_balance_sheet: 'reportDate',
  get_instrument_cash_flow: 'reportDate',
  get_instrument_income_statement: 'reportDate',
  get_instrument_financial_indicators: 'reportDate',
  // ETF 净值：按日期合并
  get_etf_nav: 'navDate',
  get_etf_holdings: 'symbol',
  // 技术指标 / K 线
  get_instrument_indicators: 'date',
  get_instrument_chart: 'date',
  // 资讯
  list_news_articles: 'id',
  get_instrument_notices: 'id',
  get_news_article: 'id',
  // 板块成分
  get_sector_constituents: 'code',
  get_index_constituents: 'code',
  // 公告
  get_notice_content: 'id',
  // 标的快照
  get_instrument_snapshot: 'symbol',
  get_instrument_quotes: 'symbol',
  // 宏观序列
  get_macro_series: 'date',
  // 龙虎榜 / 涨跌停
  get_dragon_tiger: 'code',
  get_limit_updown: 'code',
  // 行业
  get_sector_list: 'key',
  // 组合持仓
  get_portfolio_holdings: 'code',
  // 关注列表
  get_watchlist: 'code',
  // 基本面
  get_instrument_profile: 'symbol',
  // 资金流向
  get_instrument_money_flow: 'date',
  // 大宗交易
  get_instrument_block_trades: 'date',
  // 股东
  get_instrument_shareholders: 'reportDate',
  get_institution_holdings: 'reportDate',
  get_instrument_dividend: 'year',
}

/** 默认合并键 */
const DEFAULT_MERGE_KEY = 'id'

/** 获取合并键 */
function getMergeKey(toolName: string): string {
  return MERGE_KEY_MAP[toolName] ?? DEFAULT_MERGE_KEY
}

/** 判断是否为对象（非数组） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

/** 展平一层嵌套（支持 {data:[...]} 包装） */
function unwrap(result: unknown): unknown {
  if (isPlainObject(result)) {
    if (result.data !== undefined) return result.data
    if (result.items !== undefined) return result.items
    if (result.list !== undefined) return result.list
  }
  return result
}

/** 深度合并两个对象（source 覆盖 target） */
function deepMerge(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) return source
  const result: Record<string, unknown> = { ...target }
  for (const [k, v] of Object.entries(source)) {
    if (isPlainObject(v) && isPlainObject((target as Record<string, unknown>)[k])) {
      result[k] = deepMerge((target as Record<string, unknown>)[k], v)
    } else {
      result[k] = v
    }
  }
  return result
}

/** 构建合并元数据 */
function buildMergeMeta(
  toolName: string,
  externalCount: number,
  localCount: number,
  mergedCount: number,
  conflicts: number,
): Record<string, unknown> {
  return {
    _merge: {
      strategy: 'merge',
      toolName,
      externalCount,
      localCount,
      mergedCount,
      conflicts,
      externalPriority: true,
      supplementedAt: new Date().toISOString(),
    },
  }
}

/** 构建扩展元数据 */
function buildExtendMeta(
  toolName: string,
  externalCount: number,
  localCount: number,
  extendedCount: number,
): Record<string, unknown> {
  return {
    _merge: {
      strategy: 'extend',
      toolName,
      externalCount,
      localCount,
      extendedCount,
      externalPriority: true,
      supplementedAt: new Date().toISOString(),
    },
  }
}

/** 构建替换元数据 */
function buildReplaceMeta(toolName: string, replaced: boolean): Record<string, unknown> {
  return {
    _merge: {
      strategy: 'replace',
      toolName,
      replaced,
      supplementedAt: new Date().toISOString(),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* 公共合并函数                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 合并外部 + 本地结果，返回带 _meta 标记的合并结果。
 * 自动检测输入类型（列表 / 对象 / 标量），选择合适合并策略。
 */
export function mergeResults(
  toolName: string,
  external: unknown,
  local: unknown,
): unknown {
  const ext = unwrap(external)
  const loc = unwrap(local)

  // 两者都为数组 → 列表去重合并
  if (Array.isArray(ext) && Array.isArray(loc)) {
    return mergeArrays(toolName, ext, loc)
  }

  // 仅外部为数组 → 包装 local 后合并
  if (Array.isArray(ext)) {
    return mergeArrays(toolName, ext, [loc])
  }

  // 仅本地为数组 → 包装 external 后合并
  if (Array.isArray(loc)) {
    return mergeArrays(toolName, [ext], loc)
  }

  // 两者都为对象 → 深度合并
  if (isPlainObject(ext) && isPlainObject(loc)) {
    const merged = deepMerge(loc, ext) as Record<string, unknown>
    return {
      ...merged,
      ...buildMergeMeta(toolName, countLeaves(ext), countLeaves(loc), 1, 0),
    }
  }

  // 标量或混合：优先返回外部，标记冲突
  if (ext !== undefined && loc !== undefined && ext !== loc) {
    return {
      value: ext,
      _meta: {
        ...buildMergeMeta(toolName, 1, 1, 1, 1),
        localValue: loc,
        conflict: true,
      },
    }
  }

  return ext !== undefined ? ext : loc
}

/**
 * 扩展：以外部为基础，本地补缺失的 key（不覆盖已有）。
 */
export function extendResults(
  toolName: string,
  external: unknown,
  local: unknown,
): unknown {
  const ext = unwrap(external)
  const loc = unwrap(local)

  if (Array.isArray(ext) && Array.isArray(loc)) {
    return extendArrays(toolName, ext, loc)
  }

  if (isPlainObject(ext) && isPlainObject(loc)) {
    const merged = { ...ext }
    let extended = 0
    for (const [k, v] of Object.entries(loc)) {
      if ((merged as Record<string, unknown>)[k] === undefined) {
        merged[k] = v
        extended++
      }
    }
    return {
      ...merged,
      ...buildExtendMeta(toolName, countLeaves(ext), countLeaves(loc), extended),
    }
  }

  return ext !== undefined ? ext : loc
}

/**
 * 替换：本地完全替换外部。
 */
export function replaceResults(
  toolName: string,
  _external: unknown,
  local: unknown,
): unknown {
  return {
    ...(isPlainObject(local) ? local : { value: local }),
    ...buildReplaceMeta(toolName, true),
  }
}

/* -------------------------------------------------------------------------- */
/* 内部实现                                                                */
/* -------------------------------------------------------------------------- */

/** 按合并键去重合并两个数组（外部优先） */
function mergeArrays(
  toolName: string,
  ext: unknown[],
  loc: unknown[],
): unknown[] {
  const key = getMergeKey(toolName)
  const map = new Map<unknown, Record<string, unknown>>()
  let conflicts = 0

  // 先用本地填充（作为 fallback）
  for (const item of loc) {
    if (isPlainObject(item)) {
      const k = item[key] ?? item.id ?? item.symbol ?? item.code
      if (k !== undefined) map.set(k, item)
    }
  }

  // 再覆盖外部（外部优先）
  for (const item of ext) {
    if (isPlainObject(item)) {
      const k = item[key] ?? item.id ?? item.symbol ?? item.code
      if (k !== undefined) {
        const existing = map.get(k)
        if (existing) {
          // 有冲突：统计冲突数，外部字段覆盖本地
          conflicts++
          map.set(k, { ...existing, ...item, [key]: k })
        } else {
          map.set(k, item)
        }
      } else {
        map.set(k, item)
      }
    } else {
      // 非对象元素直接追加（去重）
      if (!map.has(item)) map.set(item, { value: item, [key]: item })
    }
  }

  const merged = [...map.values()]
  return merged.map((item, i) => {
    if (i === 0) {
      // 只在第一个元素上附加完整元数据，避免重复
      return {
        ...item,
        ...buildMergeMeta(toolName, ext.length, loc.length, merged.length, conflicts),
      }
    }
    return item
  })
}

/** 扩展数组：外部 + 本地独有的 key */
function extendArrays(
  toolName: string,
  ext: unknown[],
  loc: unknown[],
): unknown[] {
  const key = getMergeKey(toolName)
  const extKeys = new Set(
    ext.filter(isPlainObject).map(it => it[key] ?? it.id ?? it.symbol ?? it.code).filter(Boolean),
  )
  const additions = loc.filter(item => {
    if (!isPlainObject(item)) return true
    const k = item[key] ?? item.id ?? item.symbol ?? item.code
    return k !== undefined && !extKeys.has(k)
  })
  const result = [...ext, ...additions]
  return result.map((item, i) => {
    if (i === 0) {
      return isPlainObject(item)
        ? { ...item, ...buildExtendMeta(toolName, ext.length, additions.length, result.length) }
        : item
    }
    return item
  })
}

/** 粗略估算对象叶子节点数 */
function countLeaves(v: unknown): number {
  if (Array.isArray(v)) return v.length
  if (isPlainObject(v)) return Object.keys(v).length
  return v !== undefined ? 1 : 0
}
