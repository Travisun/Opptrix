/**
 * Provider 线格式适配 — 将 InstrumentRef（市场 + 交易所 + 代码）转为各 Provider 期望的入参。
 * 仅在 Engine / Hub 边界调用；Provider driver 不解析命名空间。
 */

import type { InstrumentRef } from '@opptrix/shared'
import {
  canonicalCnSymbol,
  canonicalHkSymbol,
  canonicalUsSymbol,
  instrumentProviderSymbol,
  normalizeInstrumentRef,
} from '@opptrix/shared'
import {
  cnSecSymbol,
  normalizeCode,
  parseStockMarket,
  type StockMarket,
} from '../utils/helpers.js'

const QUOTE_METHODS = new Set([
  'realtime',
  'realtimeSec',
  'batchRealtime',
  'kline',
  'indexRealtime',
  'indexKline',
  'moneyFlow',
  'chipDistribution',
  'chipProfile',
  'intradayTick',
])

const CN_SEC_PROVIDERS = new Set(['tencent', 'sinafinance'])

/** 接受 000977.SZ / 600519.SH 线格式的 Provider */
const CN_DOT_SUFFIX_PROVIDERS = new Set([
  'tushare', 'tickflow', 'tonghuashun', 'zzshare', 'baostock',
])

function cnExchange(ref: InstrumentRef): StockMarket | null {
  return parseStockMarket(ref.exchange)
}

function cnTsCode(symbol: string, exchange?: string | null): string {
  const sym = canonicalCnSymbol(symbol)
  const ex = parseStockMarket(exchange)
  if (ex) return `${sym}.${ex}`
  return sym
}

/**
 * 将 InstrumentRef 转为指定 Provider 方法的线格式字符串。
 * @param paramName 参数名（code / codes / symbol）影响 sec 符号是否带交易所前缀
 */
export function wireProviderSymbolArg(
  providerId: string,
  paramName: string,
  method: string,
  ref: InstrumentRef,
): string {
  const n = normalizeInstrumentRef(ref)

  if (n.market === 'CRYPTO') {
    return instrumentProviderSymbol(n)
  }
  if (n.market === 'US') {
    return canonicalUsSymbol(n.symbol)
  }
  if (n.market === 'HK') {
    return canonicalHkSymbol(n.symbol)
  }
  if (n.market === 'JP' || n.market === 'KR') {
    return n.symbol
  }

  if (n.market === 'CN') {
    const sym = canonicalCnSymbol(n.symbol)
    const ex = cnExchange(n)

    if (CN_DOT_SUFFIX_PROVIDERS.has(providerId)) {
      return cnTsCode(sym, ex)
    }

    if (CN_SEC_PROVIDERS.has(providerId)) {
      const needsSec = paramName === 'codes'
        || (paramName === 'code' && (QUOTE_METHODS.has(method) || method.includes('Quote') || method.includes('Realtime')))
      if (needsSec) {
        return cnSecSymbol(sym, ex)
      }
      return sym
    }

    if (providerId === 'stockindex' || providerId === 'akshare') {
      return sym
    }

    return sym
  }

  return instrumentProviderSymbol(n)
}

/** 在 qScoped 调用前，按实际命中的 Provider 重写 registry 方法 args */
export function wireRegistryMethodArgs(
  providerId: string,
  method: string,
  args: unknown[],
  ref: InstrumentRef,
): unknown[] {
  if (!args.length) return args
  const copy = [...args]
  const paramName = method === 'batchRealtime' ? 'codes' : 'code'

  if (Array.isArray(copy[0])) {
    copy[0] = (copy[0] as unknown[]).map(item =>
      typeof item === 'string'
        ? wireProviderSymbolArg(providerId, 'codes', method, ref)
        : item,
    )
    return copy
  }

  if (typeof copy[0] === 'string' || copy[0] == null) {
    copy[0] = wireProviderSymbolArg(providerId, paramName, method, ref)
  }

  return copy
}

/** Hub 直连 Provider 方法时构造参数列表 */
export function formatProviderMethodArgs(
  providerId: string,
  method: string,
  ref: InstrumentRef,
  extraArgs: unknown[] = [],
): unknown[] {
  const wired = wireProviderSymbolArg(providerId, 'code', method, ref)
  return [wired, ...extraArgs]
}

/** 从腾讯 smartbox / qt 原始 symbol 提取交易所 */
export function exchangeFromTencentSecSymbol(raw: string): StockMarket | undefined {
  const lower = String(raw).trim().toLowerCase()
  if (lower.startsWith('sh')) return 'SH'
  if (lower.startsWith('sz')) return 'SZ'
  if (lower.startsWith('bj')) return 'BJ'
  return undefined
}

/** 裸码 + 交易所 → 腾讯 sec 符号（sh600519） */
export function tencentSecSymbol(symbol: string, exchange?: string | null): string {
  return cnSecSymbol(symbol, exchange)
}
