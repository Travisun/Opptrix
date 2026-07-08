import { isCnEtfCode } from '../../core/instrument.js'
import { normalizeCode } from '../../utils/helpers.js'
import { BaostockClient } from '../baostock/api/client.js'
import { isBaostockEnabled } from '../baostock/config.js'
import {
  mapIndexConstituentRows,
  resolveIndexConstQuery,
} from '../baostock/normalize/index-const.js'
import { todayYmd } from '../baostock/normalize/index.js'
import { resolveEtfIndexProxy } from './free-proxies.js'
import { mapIndexConstToStandardEtfHoldings } from './standard-etf.js'

/**
 * 宽基 ETF 持仓代理 — 经 Baostock 指数成分映射为标准 etfHoldings 行。
 * 供 sinafinance / tencent 等无基金持仓 API 的 Provider 复用；失败时返回 null 以触发 Engine 回退。
 */
export async function etfHoldingsViaIndexProxy(
  etfCode: string,
): Promise<Record<string, unknown>[] | null> {
  if (!isCnEtfCode(etfCode)) return null
  if (!isBaostockEnabled()) return null

  const bare = normalizeCode(etfCode)
  const indexCode = resolveEtfIndexProxy(bare)
  const kind = indexCode ? resolveIndexConstQuery(indexCode) : null
  if (!indexCode || !kind) return null

  try {
    const client = new BaostockClient()
    await client.ensureSession()
    const date = todayYmd().replace(/-/g, '')
    const res = kind === 'hs300'
      ? await client.queryHs300Stocks(date)
      : kind === 'sz50'
        ? await client.querySz50Stocks(date)
        : await client.queryZz500Stocks(date)
    if (res.error_code !== '0') return null
    const constituents = mapIndexConstituentRows(indexCode, res)
    const mapped = mapIndexConstToStandardEtfHoldings(bare, indexCode, constituents)
    return mapped.length ? mapped : null
  } catch {
    return null
  }
}
