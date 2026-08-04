/**
 * 解析质量指标：弱文本判定（升阶 L0→L1→L2 的输入）。
 */
import type { ParseRunResult } from './types.js'

export type ParseQualityMetrics = {
  charCount: number
  pageCount: number
  /** 空页占比 0..1 */
  emptyPageRatio: number
}

/** 低于此字数视为几乎无文本（与 service MIN_USEFUL_CHARS 对齐量级） */
export const WEAK_ABS_CHAR_COUNT = 80

/** 每页平均字数低于此值视为弱文本层 */
export const WEAK_CHARS_PER_PAGE = 40

/** 空页占比 ≥ 此值视为弱文本 */
export const WEAK_EMPTY_PAGE_RATIO = 0.4

export function estimateEmptyPageRatio(result: ParseRunResult): number {
  if (typeof result.emptyPageRatio === 'number' && Number.isFinite(result.emptyPageRatio)) {
    return Math.min(1, Math.max(0, result.emptyPageRatio))
  }

  const pageCount = Math.max(result.pageCount, 0)
  if (pageCount <= 0) return 1

  const pageRe = /<!--\s*page:(\d+)\s*-->/g
  const starts: number[] = []
  let m: RegExpExecArray | null
  const md = result.markdown ?? ''
  while ((m = pageRe.exec(md)) !== null) {
    starts.push(m.index)
  }

  if (starts.length === 0) {
    // 无分页标记：用 charCount 粗估
    return result.charCount < WEAK_CHARS_PER_PAGE ? 1 : 0
  }

  let empty = 0
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!
    const end = starts[i + 1] ?? md.length
    const body = md.slice(start, end).replace(/<!--\s*page:\d+\s*-->/g, '').trim()
    if (body.length < 8) empty += 1
  }
  return empty / Math.max(starts.length, 1)
}

export function metricsFromParseResult(result: ParseRunResult): ParseQualityMetrics {
  const pageCount = Math.max(result.pageCount, 0)
  return {
    charCount: result.charCount,
    pageCount,
    emptyPageRatio: estimateEmptyPageRatio(result),
  }
}

/** 弱文本：字数偏低或空页过多 → 应尝试升阶 */
export function isWeakText(metrics: ParseQualityMetrics): boolean {
  if (metrics.pageCount <= 0) return true
  if (metrics.charCount < WEAK_ABS_CHAR_COUNT) return true
  const perPage = metrics.charCount / Math.max(metrics.pageCount, 1)
  if (perPage < WEAK_CHARS_PER_PAGE) return true
  if (metrics.emptyPageRatio >= WEAK_EMPTY_PAGE_RATIO) return true
  return false
}

/** 比较两个结果，返回更优者（字数优先，其次空页更少） */
export function pickBetterResult(a: ParseRunResult, b: ParseRunResult): ParseRunResult {
  const ma = metricsFromParseResult(a)
  const mb = metricsFromParseResult(b)
  if (mb.charCount !== ma.charCount) {
    return mb.charCount > ma.charCount ? b : a
  }
  return mb.emptyPageRatio < ma.emptyPageRatio ? b : a
}
