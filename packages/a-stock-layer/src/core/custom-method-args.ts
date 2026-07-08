import type { InstrumentRef, Market } from '@opptrix/shared'
import {
  canonicalCnSymbol,
  canonicalHkSymbol,
  canonicalUsSymbol,
  instrumentProviderSymbol,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
  parseInstrumentRef,
} from '@opptrix/shared'
import type { CustomMethodDef, CustomMethodParam } from './custom-methods.js'
import { normalizeCode, secFullCode } from '../utils/helpers.js'

const SYMBOL_PARAM_NAMES = new Set([
  'code', 'symbol', 'stock', 'stockcode', 'stock_code', 'ticker',
])

const CODES_PARAM_NAMES = new Set(['codes'])

const MARKET_PARAM_NAMES = new Set(['market'])

const CN_PROVIDER_IDS = new Set([
  'baostock', 'tickflow', 'zzshare', 'sinafinance', 'tencent',
])

function normalizeMarketValue(value: unknown): string {
  const m = String(value ?? '').trim().toUpperCase()
  if (m === 'CHINA' || m === 'A') return 'CN'
  if (m === 'HONGKONG') return 'HK'
  if (m === 'AMERICA') return 'US'
  return m
}

function parseInstrumentLikeValue(value: unknown): InstrumentRef | null {
  if (value == null) return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    return parseInstrumentRef(value)
  }
  if (typeof value !== 'string') return null

  const s = value.trim()
  if (!s) return null

  if (s.startsWith('{')) {
    try {
      return parseInstrumentRef(JSON.parse(s))
    } catch {
      // fall through
    }
  }

  const secPrefix = /^(sh|sz|bj)(\d{6})$/i.exec(s)
  if (secPrefix) {
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: 'EQUITY',
      symbol: secPrefix[2]!,
    })
  }

  const baostockDot = /^(sh|sz)\.(\d{6})$/i.exec(s.toLowerCase())
  if (baostockDot) {
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: 'EQUITY',
      symbol: baostockDot[2]!,
    })
  }

  const dotSuffix = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(s)
  if (dotSuffix) {
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: 'EQUITY',
      symbol: dotSuffix[1]!,
    })
  }

  const canonical = parseCanonicalInstrumentInput(s)
  if (canonical) return canonical

  return null
}

function defaultMarketForProvider(providerId: string): Market {
  if (CN_PROVIDER_IDS.has(providerId)) return 'CN'
  return 'CN'
}

function resolveMarketHint(
  providerId: string,
  params: CustomMethodParam[],
  args: unknown[],
): Market {
  for (let i = 0; i < params.length && i < args.length; i++) {
    if (MARKET_PARAM_NAMES.has(params[i]!.name.toLowerCase())) {
      const m = normalizeMarketValue(args[i])
      if (m === 'CN' || m === 'US' || m === 'HK' || m === 'JP' || m === 'KR' || m === 'CRYPTO') {
        return m
      }
    }
  }
  return defaultMarketForProvider(providerId)
}

function formatSymbolForProvider(
  providerId: string,
  paramName: string,
  ref: InstrumentRef,
): string {
  const n = normalizeInstrumentRef(ref)

  if (providerId === 'baostock') {
    return canonicalCnSymbol(n.symbol)
  }

  if (providerId === 'tencent' || providerId === 'sinafinance') {
    if (n.market === 'CN' && (paramName === 'codes' || paramName === 'code')) {
      return secFullCode(n.symbol)
    }
    if (n.market === 'CN') return canonicalCnSymbol(n.symbol)
    return instrumentProviderSymbol(n)
  }

  if (providerId === 'tickflow' || providerId === 'zzshare') {
    return canonicalCnSymbol(n.symbol)
  }

  if (providerId === 'stockindex' || providerId === 'akshare') {
    switch (n.market) {
      case 'US': return canonicalUsSymbol(n.symbol)
      case 'HK': return canonicalHkSymbol(n.symbol)
      case 'CN': return canonicalCnSymbol(n.symbol)
      case 'CRYPTO': return instrumentProviderSymbol(n)
      default: return instrumentProviderSymbol(n)
    }
  }

  return instrumentProviderSymbol(n)
}

function normalizeSymbolArg(
  providerId: string,
  paramName: string,
  value: unknown,
  marketHint: Market,
): unknown {
  const ref = parseInstrumentLikeValue(value)
  if (ref) {
    return formatSymbolForProvider(providerId, paramName, ref)
  }

  if (typeof value !== 'string') return value

  const raw = value.trim()
  if (!raw) return value

  if (CN_PROVIDER_IDS.has(providerId) || providerId === 'akshare') {
    if (/^\d{1,6}$/.test(raw) || /^(\d{6})\.(SH|SZ)$/i.test(raw)) {
      const sym = canonicalCnSymbol(raw)
      if ((providerId === 'tencent' || providerId === 'sinafinance') && paramName === 'codes') {
        return secFullCode(sym)
      }
      return sym
    }
    if (/^(sh|sz|bj)\d{6}$/i.test(raw)) {
      const sym = normalizeCode(raw.replace(/^(sh|sz|bj)/i, ''))
      if ((providerId === 'tencent' || providerId === 'sinafinance') && paramName === 'codes') {
        return secFullCode(sym)
      }
      return sym
    }
    if (/^(sh|sz)\.\d{6}$/i.test(raw)) {
      return normalizeCode(raw.split('.')[1] ?? raw)
    }
  }

  if (marketHint === 'US' && /^[A-Z][A-Z0-9.-]{0,11}$/i.test(raw)) {
    return canonicalUsSymbol(raw)
  }
  if (marketHint === 'HK' && /^\d{1,5}$/.test(raw)) {
    return canonicalHkSymbol(raw)
  }

  return value
}

function normalizeCodesArg(providerId: string, value: unknown, marketHint: Market): unknown {
  if (Array.isArray(value)) {
    return value.map(item => normalizeSymbolArg(providerId, 'codes', item, marketHint))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) {
          return normalizeCodesArg(providerId, parsed, marketHint)
        }
      } catch {
        // fall through
      }
    }
    if (providerId === 'tencent' || providerId === 'sinafinance') {
      return trimmed.split(',')
        .map(part => String(normalizeSymbolArg(providerId, 'codes', part.trim(), marketHint)))
        .join(',')
    }
    return trimmed.split(',')
      .map(part => normalizeSymbolArg(providerId, 'codes', part.trim(), marketHint))
  }
  return value
}

function normalizeArgValue(
  providerId: string,
  param: CustomMethodParam,
  value: unknown,
  marketHint: Market,
): unknown {
  const name = param.name.toLowerCase()

  if (MARKET_PARAM_NAMES.has(name)) {
    return normalizeMarketValue(value)
  }

  if (CODES_PARAM_NAMES.has(name)) {
    return normalizeCodesArg(providerId, value, marketHint)
  }

  if (SYMBOL_PARAM_NAMES.has(name)) {
    return normalizeSymbolArg(providerId, name, value, marketHint)
  }

  return value
}

export type NormalizedCustomMethodArgs = {
  args: unknown[]
  /** 可读转换说明，供调试或 Agent 回显 */
  transforms: string[]
}

/** 将 Agent 传入的 args 规范化为各 Provider 期望的标的格式 */
export function normalizeCustomMethodArgs(
  providerId: string,
  def: CustomMethodDef,
  rawArgs: unknown[],
): NormalizedCustomMethodArgs {
  const marketHint = resolveMarketHint(providerId, def.params, rawArgs)
  const args: unknown[] = []
  const transforms: string[] = []

  const limit = Math.max(def.params.length, rawArgs.length)
  for (let i = 0; i < limit; i++) {
    const param = def.params[i]
    const raw = rawArgs[i]
    if (raw === undefined) {
      args.push(raw)
      continue
    }
    if (!param) {
      args.push(raw)
      continue
    }

    const next = normalizeArgValue(providerId, param, raw, marketHint)
    args.push(next)
    if (JSON.stringify(next) !== JSON.stringify(raw)) {
      transforms.push(`${param.name}: ${JSON.stringify(raw)} → ${JSON.stringify(next)}`)
    }
  }

  return { args, transforms }
}
