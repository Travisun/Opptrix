import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import {
  buildInstrumentNamespace,
  buildOpptrixInstrumentId,
  instrumentRefKey,
  isAssetClass,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
} from '@opptrix/shared'
import { normalizeCode } from '../utils/helpers.js'
import { normalizeHkEquityCode } from '../utils/hk-market.js'
import { normalizeUsSymbol } from '../utils/us-market.js'
import { tryLegacyToInstrument } from '../watchlist/instrument.js'

export function inferPortfolioMarket(code: string, market?: Market): Market {
  if (market) return market
  const parsed = tryLegacyToInstrument(code)
  if (parsed) return parsed.market
  return 'CN'
}

export function normalizePortfolioSymbol(code: string, market: Market): string {
  switch (market) {
    case 'HK':
      return normalizeHkEquityCode(code)
    case 'US':
      return normalizeUsSymbol(code)
    case 'CN':
      return normalizeCode(code)
    default:
      return code.trim()
  }
}

function isCnFundRef(ref: InstrumentRef): boolean {
  const ex = ref.exchange?.toUpperCase()
  return ref.assetClass === 'FUND' || ex === 'PF' || ex === 'OF'
}

function looksLikeCnFundInput(raw: string): boolean {
  const text = raw.trim()
  if (/^CN:(?:PF|OF)[.:]\d{6}$/i.test(text)) return true
  if (/^\d{6}\.(?:OF|PF)$/i.test(text)) return true
  return false
}

/** 场外基金后缀 / 命名空间 → FUND（parseCanonical 未覆盖的 .OF/.PF） */
function tryParseCnFundInput(raw: string): InstrumentRef | null {
  const text = raw.trim()
  const ns = /^CN:(?:PF|OF)[.:](\d{6})$/i.exec(text)
  if (ns) {
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: 'FUND',
      symbol: ns[1]!,
      exchange: 'PF',
    })
  }
  const suffix = /^(\d{6})\.(?:OF|PF)$/i.exec(text)
  if (suffix) {
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: 'FUND',
      symbol: suffix[1]!,
      exchange: 'PF',
    })
  }
  return null
}

function applyExplicitAssetClass(ref: InstrumentRef, assetClass?: AssetClass): InstrumentRef {
  if (!assetClass) return ref
  if (ref.assetClass === assetClass) return ref
  if (assetClass === 'FUND' && ref.market === 'CN') {
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: 'FUND',
      symbol: normalizeCode(ref.symbol),
      exchange: 'PF',
    })
  }
  return normalizeInstrumentRef({ ...ref, assetClass })
}

export type PortfolioInstrumentInput =
  | InstrumentRef
  | {
      code?: string
      symbol?: string
      market?: Market
      assetClass?: AssetClass
      instrument?: InstrumentRef
    }

/**
 * 账本标的单一入口 — 接受完整 InstrumentRef，或 code+market+assetClass。
 * 显式 FUND/ETF 不会默认误成 EQUITY；旧调用仅传 code/market 仍兼容。
 */
export function portfolioInstrumentRef(input: InstrumentRef): InstrumentRef
export function portfolioInstrumentRef(
  code: string,
  market?: Market,
  assetClass?: AssetClass,
): InstrumentRef
export function portfolioInstrumentRef(
  codeOrInput: string | PortfolioInstrumentInput,
  market?: Market,
  assetClass?: AssetClass,
): InstrumentRef {
  if (typeof codeOrInput === 'object' && codeOrInput != null) {
    if ('market' in codeOrInput && 'assetClass' in codeOrInput && 'symbol' in codeOrInput
      && typeof (codeOrInput as InstrumentRef).symbol === 'string'
      && (codeOrInput as InstrumentRef).symbol.length > 0
      && !('code' in codeOrInput && (codeOrInput as { code?: string }).code)
      && !('instrument' in codeOrInput && (codeOrInput as { instrument?: InstrumentRef }).instrument)
    ) {
      return normalizeInstrumentRef(codeOrInput as InstrumentRef)
    }
    const bag = codeOrInput as {
      code?: string
      symbol?: string
      market?: Market
      assetClass?: AssetClass
      instrument?: InstrumentRef
    }
    if (bag.instrument) {
      return applyExplicitAssetClass(normalizeInstrumentRef(bag.instrument), bag.assetClass)
    }
    const code = String(bag.code ?? bag.symbol ?? '').trim()
    if (!code) {
      return normalizeInstrumentRef({ market: bag.market ?? 'CN', assetClass: bag.assetClass ?? 'EQUITY', symbol: '' })
    }
    return portfolioInstrumentRef(code, bag.market, bag.assetClass)
  }

  const trimmed = String(codeOrInput).trim()
  const parsed = parseCanonicalInstrumentInput(trimmed)
  if (parsed) return applyExplicitAssetClass(normalizeInstrumentRef(parsed), assetClass)
  const asFund = tryParseCnFundInput(trimmed)
  if (asFund) return applyExplicitAssetClass(asFund, assetClass)
  if (assetClass === 'FUND') {
    const m = inferPortfolioMarket(trimmed, market)
    const symbol = normalizePortfolioSymbol(trimmed, m)
    if (m === 'CN') {
      return normalizeInstrumentRef({
        market: 'CN',
        assetClass: 'FUND',
        symbol: normalizeCode(symbol),
        exchange: 'PF',
      })
    }
    return normalizeInstrumentRef({ market: m, assetClass: 'FUND', symbol })
  }
  const m = inferPortfolioMarket(trimmed, market)
  const symbol = normalizePortfolioSymbol(trimmed, m)
  if (m === 'CN') {
    const fromLegacy = tryLegacyToInstrument(symbol)
    if (fromLegacy) return applyExplicitAssetClass(fromLegacy, assetClass)
    const inferred = assetClass && isAssetClass(assetClass) ? assetClass : 'EQUITY'
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: inferred,
      symbol: normalizeCode(symbol),
    })
  }
  const inferred = assetClass && isAssetClass(assetClass) ? assetClass : 'EQUITY'
  return normalizeInstrumentRef({ market: m, assetClass: inferred, symbol })
}

/** 账本键 = instrumentRefKey(normalizeInstrumentRef(ref)) */
export function portfolioLedgerKey(
  code: string,
  market?: Market,
  assetClass?: AssetClass,
): string {
  return instrumentRefKey(portfolioInstrumentRef(code, market, assetClass))
}

/**
 * 账本持久化 / API 对外 code — Opptrix ID（MARKET:CLASS:SYMBOL）。
 * 与关注列表一致；读路径仍经 portfolioCodeAliases 双读旧裸码。
 */
export function portfolioDisplayCode(
  code: string,
  market?: Market,
  assetClass?: AssetClass,
): string {
  return buildOpptrixInstrumentId(portfolioInstrumentRef(code, market, assetClass))
}

/** clear / fee lookup：Opptrix + 命名空间 + 旧裸码 / CN:PF 别名 */
export function portfolioCodeAliases(
  code: string,
  market?: Market,
  assetClass?: AssetClass,
): Set<string> {
  const ref = portfolioInstrumentRef(code, market, assetClass)
  const aliases = new Set<string>()
  const opptrix = buildOpptrixInstrumentId(ref)
  const ns = buildInstrumentNamespace(ref)
  aliases.add(opptrix)
  aliases.add(ns)
  aliases.add(ref.symbol)
  aliases.add(portfolioLedgerKey(code, market, assetClass))
  if (ref.market === 'CN') {
    const bare = normalizeCode(ref.symbol)
    aliases.add(bare)
    aliases.add(`CN:PF.${bare}`)
    aliases.add(`CN:OF.${bare}`)
    aliases.add(`${bare}.OF`)
    aliases.add(`${bare}.PF`)
    const ex = ref.exchange?.toUpperCase()
    if (ex && ex !== 'PF' && ex !== 'OF') {
      aliases.add(`CN:${ex}.${bare}`)
      aliases.add(`${bare}.${ex}`)
    }
  }
  if (ref.market === 'HK') {
    aliases.add(`HK:${ref.symbol}`)
    const stripped = ref.symbol.replace(/^0+/, '') || ref.symbol
    aliases.add(stripped)
    aliases.add(`${ref.symbol}.HK`)
  }
  if (ref.market === 'US') {
    aliases.add(`US:${ref.symbol}`)
    aliases.add(`${ref.symbol}.US`)
  }
  return aliases
}

export function portfolioCodesMatch(
  aCode: string,
  aMarket: Market | undefined,
  bCode: string,
  bMarket: Market | undefined,
  aAssetClass?: AssetClass,
  bAssetClass?: AssetClass,
): boolean {
  const a = portfolioInstrumentRef(aCode, aMarket, aAssetClass)
  const b = portfolioInstrumentRef(bCode, bMarket, bAssetClass)
  // namespace key 不含 assetClass：须同 assetClass 才可按键相等判定（INDEX≠EQUITY）
  if (a.assetClass === b.assetClass && instrumentRefKey(a) === instrumentRefKey(b)) {
    return true
  }
  // 兼容：历史场外基金可能存为裸六位，查询侧带 CN:PF.xxx / xxx.OF
  if (a.market !== 'CN' || b.market !== 'CN') return false
  if (normalizeCode(a.symbol) !== normalizeCode(b.symbol)) return false
  const aFund = isCnFundRef(a) || looksLikeCnFundInput(aCode)
  const bFund = isCnFundRef(b) || looksLikeCnFundInput(bCode)
  if (aFund === bFund) {
    return aFund && normalizeCode(a.symbol) === normalizeCode(b.symbol)
  }
  const bareSide = aFund ? bCode.trim() : aCode.trim()
  // 仅与裸六位账本行对齐；不把 CN:SZ.xxx 与 CN:PF.xxx 混为一谈
  return /^\d{6}$/.test(bareSide)
}

/** 从旧成交行推断 assetClass（无字段时从 code 解析） */
export function inferTradeAssetClass(
  code: string,
  market?: Market,
  assetClass?: AssetClass,
): AssetClass {
  if (assetClass && isAssetClass(assetClass)) return assetClass
  return portfolioInstrumentRef(code, market).assetClass
}
