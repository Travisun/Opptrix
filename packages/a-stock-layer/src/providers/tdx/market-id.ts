import { createRequire } from 'node:module'
import { isBseCode, normalizeCode } from '../../utils/helpers.js'

const require = createRequire(import.meta.url)

/** pytdx / TDX standard market ids: SZ=0, SH=1, BJ=2 */
export function toTdxMarketId(code: string): 0 | 1 | 2 {
  const c = normalizeCode(code)
  if (isBseCode(c)) return 2
  const isSh = c.startsWith('6')
    || (c.startsWith('9') && !isBseCode(c))
    || (c.startsWith('000') && parseInt(c, 10) < 1000)
  return isSh ? 1 : 0
}

/** nodetdx lacks BJ in MARKETID_MAP — patch getMarketId once at load. */
let patched = false

export function patchNodetdxBjMarket(): void {
  if (patched) return
  patched = true
  try {
    const helper = require('nodetdx/helper') as {
      getMarketId: (marketCode: string) => number | undefined
    }
    const orig = helper.getMarketId.bind(helper)
    helper.getMarketId = (marketCode: string) => {
      if (marketCode === 'BJ') return 2
      return orig(marketCode)
    }
  } catch { /* nodetdx unavailable */ }
}
