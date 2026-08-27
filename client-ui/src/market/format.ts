import { portfolioHoldingsStorageKey } from '@opptrix/shared/portfolio-fees'
import {
  buildOpptrixInstrumentId,
  tryParseInstrumentInput,
  normalizeInstrumentRefLocal,
} from './instrument'
import type { InstrumentRef } from '../types/instrument'

export function formatPrice(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

/** 涨跌额（元），带正负号 */
export function formatChangeAmt(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}

/** 金额千分位（组合市值 / 浮动盈亏等）；股价请继续用 formatPrice */
export function formatMoney(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** 市场本币符号：A 股 ¥、美股 $、港股 HK$ */
export function marketCurrencySymbol(market?: string): string {
  if (market === 'US') return '$'
  if (market === 'HK') return 'HK$'
  return '¥'
}

/** 带本币符号的价格（关注列表最新价 / 成本价等） */
export function formatPriceWithCurrency(
  market: string | undefined,
  value: number | null | undefined,
  digits?: number,
): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${marketCurrencySymbol(market)}${formatPriceForMarket(market, value, digits)}`
}

/** 带本币符号的金额（组合单只市值等） */
export function formatMoneyWithCurrency(
  market: string | undefined,
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${marketCurrencySymbol(market)}${formatMoney(value, digits)}`
}

/** 人民币口径汇总（跨市场分组 strip 等） */
export function formatCnyMoney(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `¥${formatMoney(value, digits)}`
}

/** 按市场格式化价格 — CN 保留小数；US/JP/KR/HK 同；Crypto 低价多小数位 */
export function formatPriceForMarket(
  market: string | undefined,
  value: number | null | undefined,
  digits?: number,
): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (market === 'CRYPTO') {
    const d = digits ?? (Math.abs(value) < 1 ? 4 : 2)
    return value.toFixed(d)
  }
  if (market === 'JP' && Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: digits ?? 0 })
  }
  return value.toFixed(digits ?? 2)
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)}万`
  return value.toFixed(2)
}

/** 按市场格式化大数 — 中文万/亿 vs 英文 K/M/B */
export function formatCompactNumberForMarket(
  market: string | undefined,
  value: number | null | undefined,
): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  const useWestern = market === 'US' || market === 'HK' || market === 'JP' || market === 'KR' || market === 'CRYPTO'
  if (useWestern) {
    if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`
    return value.toFixed(2)
  }
  return formatCompactNumber(value)
}

export function pctTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value == null || Number.isNaN(value) || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}

export function normalizeCode(code: string): string {
  return code.trim().padStart(6, '0')
}

/**
 * 持仓 map 主键 — 与 shared `portfolioHoldingsStorageKey` 对齐（CN 个股/指数为短码）。
 * Opptrix ID / 命名空间输入会归一到同一 storageKey，便于与旧裸码账本互查。
 * UI 副标题可继续用本函数展示短码；权威对外 ID 用 `buildOpptrixInstrumentId`。
 */
export function portfolioHoldingsKey(code: string, market?: string, assetClass?: InstrumentRef['assetClass']): string {
  const trimmed = code.trim()
  const parsed = tryParseInstrumentInput(trimmed)
  if (parsed) {
    const ref = normalizeInstrumentRefLocal(
      assetClass ? { ...parsed, assetClass } : parsed,
    )
    return portfolioHoldingsStorageKey(ref)
  }
  if (market && market !== 'CN') return trimmed
  if (/^\d{6}$/.test(trimmed)) return normalizeCode(trimmed)
  return trimmed
}

/** 持仓 lookup 候选键（storageKey + Opptrix + 原串），供 map 多键命中 */
export function portfolioHoldingsLookupKeys(
  code: string,
  market?: string,
  assetClass?: InstrumentRef['assetClass'],
): string[] {
  const trimmed = code.trim()
  const keys: string[] = []
  const push = (k: string | undefined) => {
    if (k && !keys.includes(k)) keys.push(k)
  }
  push(portfolioHoldingsKey(trimmed, market, assetClass))
  push(trimmed)
  const parsed = tryParseInstrumentInput(trimmed)
  if (parsed) {
    const ref = normalizeInstrumentRefLocal(
      assetClass ? { ...parsed, assetClass } : parsed,
    )
    push(buildOpptrixInstrumentId(ref))
  }
  return keys
}

/** 无 exchange 时可安全判为上证指数的常见代码（不含 000001） */
const SH_CN_INDEX_CODES = new Set([
  '000016', '000300', '000688', '000905', '000906', '000985',
])

/** 从代码段推断交易所（无 exchange 时兜底，与 shared inferCnExchangeFromSymbol 对齐） */
export function inferCnExchangeFromCode(code: string): 'SH' | 'SZ' | 'BJ' {
  const c = normalizeCode(code)
  if (c.startsWith('92') || c.startsWith('43') || c.startsWith('83') || c.startsWith('87')) return 'BJ'
  if (c.startsWith('399')) return 'SZ'
  // 上证 ETF 代码段（51/52/56/58）；深证 ETF 为 159xxx / 16xxxx，走下方默认
  const head2 = c.slice(0, 2)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return 'SH'
  if (c.startsWith('6')) return 'SH'
  if (c.startsWith('9')) return 'SH'
  if (c.startsWith('3') || c.startsWith('2')) return 'SZ'
  if (c === '000001') return 'SZ'
  if (SH_CN_INDEX_CODES.has(c)) return 'SH'
  if (c.startsWith('0')) return 'SZ'
  return 'SZ'
}

function inferCnAssetClass(code: string, exchange: 'SH' | 'SZ' | 'BJ'): 'EQUITY' | 'ETF' | 'INDEX' {
  const c = normalizeCode(code)
  if (isCnEtfCode(c)) return 'ETF'
  if (exchange === 'SZ') return c.startsWith('399') ? 'INDEX' : 'EQUITY'
  if (exchange === 'SH') return (c.startsWith('000') && c.length === 6) ? 'INDEX' : 'EQUITY'
  return 'EQUITY'
}

/** A 股指数判定 — 以 exchange 为主键 */
export function isCnIndexCode(code: string, exchange?: string | null): boolean {
  const c = normalizeCode(code)
  if (isCnEtfCode(c)) return false
  const ex = (exchange ?? inferCnExchangeFromCode(c)).toUpperCase()
  if (ex === 'SZ') return c.startsWith('399')
  if (ex === 'SH') return c.startsWith('000') && c.length === 6
  return false
}

/** A 股 ETF 代码段（宽基/行业/跨境等；不含 LOF 16xxxx — 见 isCnLofSymbol） */
export function isCnEtfCode(code: string): boolean {
  const c = normalizeCode(code)
  if (c.length !== 6) return false
  const head2 = c.slice(0, 2)
  const head3 = c.slice(0, 3)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (head3 === '159') return true
  return false
}

/** 场内上市基金代码段（ETF / LOF 等）— 与 @opptrix/a-stock-layer fund-instrument 对齐 */
export function isCnListedFundSymbol(code: string): boolean {
  let raw = String(code ?? '').trim().toUpperCase()
  const ns = /^CN:(?:PF|OF)[.:](\d{6})$/.exec(raw)
  if (ns) raw = ns[1]!
  raw = raw.replace(/\.(OF|SH|SZ|BJ|PF)$/i, '').replace(/\D/g, '')
  if (raw.length > 6) raw = raw.slice(-6)
  const c = raw.padStart(6, '0')
  if (!/^\d{6}$/.test(c)) return false
  const head2 = c.slice(0, 2)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (c.startsWith('159') || isCnLofSymbol(c)) return true
  return false
}

/** 场内 LOF（16xxxx，不含 159xxx ETF 段） */
export function isCnLofSymbol(code: string): boolean {
  let raw = String(code ?? '').trim().toUpperCase()
  const ns = /^CN:(?:PF|OF)[.:](\d{6})$/.exec(raw)
  if (ns) raw = ns[1]!
  raw = raw.replace(/\.(OF|SH|SZ|BJ|PF)$/i, '').replace(/\D/g, '')
  if (raw.length > 6) raw = raw.slice(-6)
  const c = raw.padStart(6, '0')
  if (!/^\d{6}$/.test(c)) return false
  return c.startsWith('16') && !c.startsWith('159')
}

/** 按成交日取不晚于该日的最近单位净值（场外/场内基金持仓记账） */
export function resolveFundNavOnDate(
  rows: Array<{ date: string; nav?: number | null }>,
  date: string,
): number | null {
  const target = date.slice(0, 10)
  if (!target || !rows.length) return null
  let bestDate = ''
  let bestNav: number | null = null
  for (const row of rows) {
    const d = row.date?.slice(0, 10)
    if (!d || d > target) continue
    const nav = row.nav
    if (nav == null || !Number.isFinite(nav)) continue
    if (!bestDate || d > bestDate) {
      bestDate = d
      bestNav = nav
    }
  }
  return bestNav
}

/** 按成交日取当日收盘价（场内 ETF / 场内基金） */
export function resolveCloseOnDate(
  bars: Array<{ date: string; close?: number | null }>,
  date: string,
): number | null {
  const target = date.slice(0, 10)
  if (!target || !bars.length) return null
  for (const bar of bars) {
    const d = bar.date?.slice(0, 10)
    if (d !== target) continue
    const close = bar.close
    if (close != null && Number.isFinite(close)) return close
  }
  let bestDate = ''
  let bestClose: number | null = null
  for (const bar of bars) {
    const d = bar.date?.slice(0, 10)
    if (!d || d > target) continue
    const close = bar.close
    if (close == null || !Number.isFinite(close)) continue
    if (!bestDate || d > bestDate) {
      bestDate = d
      bestClose = close
    }
  }
  return bestClose
}

export function hasCjkText(value: string | null | undefined): boolean {
  return Boolean(value && /[\u4e00-\u9fff]/.test(value))
}

/** Prefer Chinese name from quote / radar / stored watchlist item (longest CJK wins). */
export function resolveDisplayStockName(
  code: string,
  ...candidates: Array<string | null | undefined>
): string {
  const normalized = normalizeCode(code)
  const clean = candidates
    .map(c => c?.trim())
    .filter((c): c is string => Boolean(c && c !== normalized))
  const cjk = clean.filter(hasCjkText)
  if (cjk.length > 0) {
    return cjk.reduce((best, cur) => (cur.length >= best.length ? cur : best))
  }
  if (clean[0]) return clean[0]
  return normalized
}

/** A-share volume in lots (手). */
export function formatVolume(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿手`
  if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万手`
  return `${value.toFixed(0)}手`
}

export function formatSignedNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}
