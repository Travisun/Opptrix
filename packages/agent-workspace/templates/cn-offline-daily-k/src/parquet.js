/**
 * Parquet / 行加载适配 — 优先 hyparquet；也可直接喂行数组。
 * @module parquet
 */

/**
 * @typedef {object} DailyBar
 * @property {string} code 6 位代码或带市场后缀
 * @property {string} date YYYY-MM-DD
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} [volume]
 * @property {number} [amount]
 * @property {string} [sector] 可选板块名（截面/挖掘用）
 */

/**
 * 将任意行对象规范为 DailyBar；字段名兼容常见扶摇列。
 *
 * @param {Record<string, unknown>} row
 * @returns {DailyBar|null}
 * @example
 * normalizeBarRow({ ts_code: '600519.SH', trade_date: '20240102', close: 1600 })
 */
export function normalizeBarRow(row) {
  if (!row || typeof row !== 'object') return null
  const codeRaw = row.code ?? row.symbol ?? row.ts_code ?? row.thscode ?? ''
  const dateRaw = row.date ?? row.trade_date ?? row.tradeDate ?? ''
  const code = String(codeRaw).replace(/\.(SH|SZ|BJ)$/i, '').trim()
  let date = String(dateRaw).trim()
  if (/^\d{8}$/.test(date)) {
    date = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
  }
  const close = num(row.close ?? row.Close)
  if (!code || !date || close == null) return null
  /** @type {DailyBar} */
  const bar = {
    code,
    date,
    open: num(row.open ?? row.Open) ?? close,
    high: num(row.high ?? row.High) ?? close,
    low: num(row.low ?? row.Low) ?? close,
    close,
  }
  const volume = num(row.volume ?? row.vol ?? row.Volume)
  if (volume != null) bar.volume = volume
  const amount = num(row.amount ?? row.Amount)
  if (amount != null) bar.amount = amount
  if (row.sector != null || row.industry != null) {
    bar.sector = String(row.sector ?? row.industry)
  }
  return bar
}

/**
 * 批量规范化行。
 * @param {unknown[]} rows
 * @returns {DailyBar[]}
 * @example
 * const bars = normalizeBarRows(rawRows)
 */
export function normalizeBarRows(rows) {
  if (!Array.isArray(rows)) return []
  /** @type {DailyBar[]} */
  const out = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const bar = normalizeBarRow(/** @type {Record<string, unknown>} */ (row))
    if (bar) out.push(bar)
  }
  return out
}

/**
 * 从 Parquet 文件加载日 K 行（需已安装 hyparquet）。
 *
 * @param {string} parquetPath 绝对路径
 * @returns {Promise<DailyBar[]>}
 * @example
 * const bars = await loadBarsFromParquet('/…/cn-daily-k-full.parquet')
 */
export async function loadBarsFromParquet(parquetPath) {
  let hyparquet
  try {
    hyparquet = await import('hyparquet')
  } catch {
    throw new Error(
      '未安装 hyparquet：请先 shell_install({ manager: "npm", packages: ["hyparquet"] })，或改用已解析行数组 + normalizeBarRows',
    )
  }
  const { asyncBufferFromFile, parquetReadObjects } = hyparquet
  if (typeof asyncBufferFromFile !== 'function' || typeof parquetReadObjects !== 'function') {
    throw new Error('hyparquet API 不可用，请升级依赖或改用行数组输入')
  }
  const file = await asyncBufferFromFile(parquetPath)
  const rows = await parquetReadObjects({ file })
  return normalizeBarRows(rows)
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}
