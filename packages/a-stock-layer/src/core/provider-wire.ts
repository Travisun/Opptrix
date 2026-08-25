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
  parseStockMarket,
  type StockMarket,
} from '../utils/helpers.js'
import { fundTsCode } from '../providers/tushare/codes.js'

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

    if (n.assetClass === 'FUND') {
      if (CN_DOT_SUFFIX_PROVIDERS.has(providerId)) {
        return fundTsCode(sym)
      }
      return sym
    }

    if (CN_DOT_SUFFIX_PROVIDERS.has(providerId)) {
      return cnTsCode(sym, ex)
    }


    if (providerId === 'stockindex') {
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

  // fundList 首参为市场常量 CN，勿按标的重写
  if (method === 'fundList' && typeof copy[0] === 'string' && copy[0].toUpperCase() === 'CN') {
    return copy
  }

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
