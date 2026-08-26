import type { AssetClass } from '@opptrix/shared'
import { isCnListedFundSymbol } from '../../../core/fund-instrument.js'
import { normalizeCode, resolveMarket } from '../../../utils/helpers.js'

export type FuyaoFundType = 'otc' | 'exchange' | 'reits'

export interface FuyaoFundRouteOpts {
  assetClass?: AssetClass
}

/** 6 位公募基金代码 → 扶摇 fund_type + thscode */
export function resolveFuyaoFundRoute(
  code: string,
  opts?: FuyaoFundRouteOpts,
): { fundType: FuyaoFundType; thscode: string } | null {
  const assetClass = opts?.assetClass
  if (assetClass === 'REIT') {
    let raw = String(code ?? '').trim().toUpperCase()
    const listedMatch = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(raw)
    if (listedMatch) {
      return { fundType: 'otc', thscode: `${listedMatch[1]}.${listedMatch[2]}` }
    }
    raw = raw.replace(/\.(OF|SH|SZ|BJ|PF)$/i, '')
    const bare = normalizeCode(raw)
    if (!bare || !/^\d{6}$/.test(bare)) return null
    // REIT 保留上市后缀；仅 fund_type 传 otc
    return { fundType: 'otc', thscode: `${bare}.${resolveMarket(bare)}` }
  }

  let raw = String(code ?? '').trim().toUpperCase()
  const ofMatch = /^(\d{6})\.OF$/i.exec(raw)
  if (ofMatch) {
    return { fundType: 'otc', thscode: `${ofMatch[1]}.OF` }
  }
  const listedMatch = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(raw)
  if (listedMatch) {
    return { fundType: 'exchange', thscode: `${listedMatch[1]}.${listedMatch[2]}` }
  }
  const bare = normalizeCode(raw)
  if (!bare || !/^\d{6}$/.test(bare)) return null
  if (assetClass === 'ETF' || assetClass === 'LOF' || isCnListedFundSymbol(bare)) {
    return { fundType: 'exchange', thscode: `${bare}.${resolveMarket(bare)}` }
  }
  return { fundType: 'otc', thscode: `${bare}.OF` }
}
