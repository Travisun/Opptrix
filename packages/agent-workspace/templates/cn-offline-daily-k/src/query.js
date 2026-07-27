/**
 * 离线日 K 查询 API（内存行 / Parquet）。
 * @module query
 */

import { loadBarsFromParquet, normalizeBarRows } from './parquet.js'

/**
 * @typedef {import('./parquet.js').DailyBar} DailyBar
 */

/**
 * 按代码取日 K（按日期升序）。
 *
 * @param {DailyBar[]|string} source 行数组，或 parquet 绝对路径
 * @param {string} code 6 位代码
 * @param {{ start?: string, end?: string, limit?: number }} [opts]
 * @returns {Promise<DailyBar[]>}
 * @example
 * const bars = await getDailyBars(allBars, '600519', { start: '2024-01-01', limit: 60 })
 */
export async function getDailyBars(source, code, opts = {}) {
  const bars = await resolveBars(source)
  const bare = String(code).replace(/\.(SH|SZ|BJ)$/i, '').trim()
  let rows = bars.filter(b => b.code === bare)
  if (opts.start) rows = rows.filter(b => b.date >= opts.start)
  if (opts.end) rows = rows.filter(b => b.date <= opts.end)
  rows.sort((a, b) => a.date.localeCompare(b.date))
  if (opts.limit != null && opts.limit > 0) {
    rows = rows.slice(-opts.limit)
  }
  return rows
}

/**
 * 列出覆盖范围内的交易日（升序去重）。
 *
 * @param {DailyBar[]|string} source
 * @param {{ start?: string, end?: string }} [opts]
 * @returns {Promise<string[]>}
 * @example
 * const dates = await listTradeDates(bars, { start: '2024-01-01' })
 */
export async function listTradeDates(source, opts = {}) {
  const bars = await resolveBars(source)
  const set = new Set()
  for (const b of bars) {
    if (opts.start && b.date < opts.start) continue
    if (opts.end && b.date > opts.end) continue
    set.add(b.date)
  }
  return [...set].sort()
}

/**
 * 取某一交易日截面（全部或指定代码）。
 *
 * @param {DailyBar[]|string} source
 * @param {string} date YYYY-MM-DD
 * @param {{ codes?: string[] }} [opts]
 * @returns {Promise<DailyBar[]>}
 * @example
 * const xs = await crossSection(bars, '2024-06-28', { codes: ['600519', '000001'] })
 */
export async function crossSection(source, date, opts = {}) {
  const bars = await resolveBars(source)
  const day = String(date).trim()
  let rows = bars.filter(b => b.date === day)
  if (opts.codes?.length) {
    const want = new Set(opts.codes.map(c => String(c).replace(/\.(SH|SZ|BJ)$/i, '').trim()))
    rows = rows.filter(b => want.has(b.code))
  }
  return rows
}

/**
 * 覆盖摘要：标的数、交易日区间、行数。
 *
 * @param {DailyBar[]|string} source
 * @returns {Promise<{ symbols: number, rows: number, minDate: string|null, maxDate: string|null }>}
 * @example
 * const cov = await coverage(bars)
 * // { symbols: 5000, rows: 1e7, minDate: '2014-01-02', maxDate: '2024-06-28' }
 */
export async function coverage(source) {
  const bars = await resolveBars(source)
  const symbols = new Set()
  let minDate = null
  let maxDate = null
  for (const b of bars) {
    symbols.add(b.code)
    if (!minDate || b.date < minDate) minDate = b.date
    if (!maxDate || b.date > maxDate) maxDate = b.date
  }
  return {
    symbols: symbols.size,
    rows: bars.length,
    minDate,
    maxDate,
  }
}

/**
 * @param {DailyBar[]|string} source
 * @returns {Promise<DailyBar[]>}
 */
async function resolveBars(source) {
  if (typeof source === 'string') {
    return loadBarsFromParquet(source)
  }
  if (Array.isArray(source)) {
    // 已是 DailyBar 则直接用；否则尝试规范化
    if (source.length && source[0] && typeof source[0].close === 'number' && source[0].code) {
      return /** @type {DailyBar[]} */ (source)
    }
    return normalizeBarRows(source)
  }
  return []
}
