import { isCnListedFundSymbol } from '../../../core/fund-instrument.js'
import { normalizeCode, resolveMarket } from '../../../utils/helpers.js'

export type FuyaoFundType = 'otc' | 'exchange' | 'reits'

/** 6 位公募基金代码 → 扶摇 fund_type + thscode */
export function resolveFuyaoFundRoute(code: string): { fundType: FuyaoFundType; thscode: string } | null {
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
  if (isCnListedFundSymbol(bare)) {
    return { fundType: 'exchange', thscode: `${bare}.${resolveMarket(bare)}` }
  }
  return { fundType: 'otc', thscode: `${bare}.OF` }
}
