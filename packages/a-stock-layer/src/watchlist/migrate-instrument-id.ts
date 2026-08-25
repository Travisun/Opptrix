/**
 * 方案 B：关注列表标的身份轻量迁移（幂等）。
 * — 合法 instrument / 可 parse 的 namespace → normalize + namespace code
 * — 1–5 位纯数字无可靠 market → 不瞎改成 CN；可清假 CN pad，保留原 code
 * — 有 industry / instrument.market 提示 HK/US 时规范化
 */
import type { InstrumentRef, Market } from '@opptrix/shared'
import {
  buildInstrumentNamespace,
  isAmbiguousNumericCode,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
  tryParseInstrumentInput,
} from '@opptrix/shared'
import type { WatchlistItem } from './models.js'

/** user-store meta 标记 — 一次性迁移完成 */
export const INSTRUMENT_ID_UNIFY_WATCHLIST_V1 = 'instrument_id_unify_watchlist_v1'

function inferMarketFromIndustry(industry: string | undefined): Market | null {
  const s = industry?.trim() ?? ''
  if (!s) return null
  if (/港股|香港|HKEX|\bHK\b/i.test(s)) return 'HK'
  if (/美股|纳斯达克|纽交所|NASDAQ|NYSE|AMEX|\bUS\b/i.test(s)) return 'US'
  if (/日股|\bJP\b|东证/i.test(s)) return 'JP'
  if (/韩股|\bKR\b|韩交所/i.test(s)) return 'KR'
  if (/Crypto|加密|币安|Binance|OKX/i.test(s)) return 'CRYPTO'
  if (/A股|上交所|深交所|北交所|公募基金/i.test(s)) return 'CN'
  return null
}

/**
 * 历史：短码被 pad 成 CN 假身份。
 * 判定：instrument 为 CN，且 symbol 等于短码或其 6 位左补零。
 */
export function looksLikeFakeCnPadFromShortCode(item: WatchlistItem): boolean {
  const inst = item.instrument
  if (!inst || inst.market !== 'CN') return false

  const code = String(item.code ?? '').trim()
  let bare = ''
  if (isAmbiguousNumericCode(code)) {
    bare = code
  } else {
    const fromNs = tryParseInstrumentInput(code)
    if (fromNs?.market === 'CN') {
      const sym = fromNs.symbol.replace(/\D/g, '')
      // CN:SZ.000700 且无其它可靠来源时，仅当「像短码补零」才视为假身份：
      // 这里用「原 code 文本含短数字段」不够稳，改为：若 industry 标明港股/美股则一律当假 CN。
      const hint = inferMarketFromIndustry(item.industry)
      if (hint && hint !== 'CN' && /^\d{6}$/.test(sym)) {
        const stripped = sym.replace(/^0+/, '') || sym
        return stripped.length <= 5
      }
      return false
    }
    bare = code.replace(/\D/g, '')
  }
  if (!bare || bare.length > 5 || !/^\d+$/.test(bare)) return false
  const padded = bare.padStart(6, '0')
  return inst.symbol === padded || inst.symbol === bare
}

function refFromMarketHint(market: Market, rawSymbol: string): InstrumentRef | null {
  const digits = rawSymbol.replace(/\D/g, '')
  if (market === 'HK' && digits) {
    return normalizeInstrumentRef({
      market: 'HK',
      assetClass: 'EQUITY',
      symbol: digits,
      exchange: 'HK',
    })
  }
  if (market === 'US' && rawSymbol.trim()) {
    return normalizeInstrumentRef({
      market: 'US',
      assetClass: 'EQUITY',
      symbol: rawSymbol.trim(),
    })
  }
  if (market === 'CN' && /^\d{6}$/.test(digits)) {
    return tryParseInstrumentInput(digits)
  }
  if ((market === 'JP' || market === 'KR') && digits) {
    return normalizeInstrumentRef({
      market,
      assetClass: 'EQUITY',
      symbol: digits,
    })
  }
  return null
}

/**
 * 单条幂等迁移。失败时原样返回（不丢数据）。
 */
export function migrateWatchlistItemInstrumentIdV1(item: WatchlistItem): WatchlistItem {
  try {
    const codeRaw = String(item.code ?? '').trim()
    const name = item.name?.trim() || codeRaw

    // 1) 已有合法 instrument
    if (item.instrument && item.instrument.market && item.instrument.symbol) {
      if (looksLikeFakeCnPadFromShortCode(item)) {
        const hint = inferMarketFromIndustry(item.industry) ?? (
          item.instrument.market !== 'CN' ? item.instrument.market : null
        )
        const bare = codeRaw.replace(/\D/g, '') || item.instrument.symbol.replace(/\D/g, '')
        if (hint && hint !== 'CN') {
          const fixed = refFromMarketHint(hint, bare || item.instrument.symbol)
          if (fixed) {
            return {
              ...item,
              code: buildInstrumentNamespace(fixed),
              name,
              instrument: fixed,
            }
          }
        }
        // 无可靠市场：清假 CN，保留可读 code（短码原样）
        const keepCode = /^\d{1,5}$/.test(bare) ? bare : codeRaw
        return {
          ...item,
          code: keepCode,
          name,
          instrument: undefined,
        }
      }
      const normalized = normalizeInstrumentRef(item.instrument)
      return {
        ...item,
        code: buildInstrumentNamespace(normalized),
        name: item.name?.trim() || buildInstrumentNamespace(normalized),
        instrument: normalized,
      }
    }

    // 2) code 可权威 parse（含 HK:… / US:… / 6 位 CN / 命名空间）
    const parsed = parseCanonicalInstrumentInput(codeRaw)
    if (parsed) {
      return {
        ...item,
        code: buildInstrumentNamespace(parsed),
        name,
        instrument: parsed,
      }
    }

    // 3) 1–5 位纯数字：仅在有 industry/market 提示时规范化
    if (isAmbiguousNumericCode(codeRaw)) {
      const hint = inferMarketFromIndustry(item.industry)
      if (hint) {
        const fixed = refFromMarketHint(hint, codeRaw)
        if (fixed) {
          return {
            ...item,
            code: buildInstrumentNamespace(fixed),
            name,
            instrument: fixed,
          }
        }
      }
      // 不瞎改成 CN；保留原样
      return {
        ...item,
        code: codeRaw,
        name,
        instrument: undefined,
      }
    }

    return {
      ...item,
      code: codeRaw || item.code,
      name,
    }
  } catch (err) {
    console.warn(
      '[watchlist] instrument_id_unify_v1 item skipped:',
      err instanceof Error ? err.message : String(err),
    )
    return item
  }
}

export function migrateWatchlistItemsInstrumentIdV1(items: WatchlistItem[]): WatchlistItem[] {
  return items.map(migrateWatchlistItemInstrumentIdV1)
}
