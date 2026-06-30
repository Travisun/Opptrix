import { bond } from './bond.js'
import { fund } from './fund.js'
import { futures } from './futures.js'
import { stock } from './stock.js'

/**
 * Pure Node efinance — mirrors `import efinance as ef`
 *
 * Usage:
 *   import { ef } from '@opptrix/a-stock-layer'
 *   await ef.stock.getQuote('600519')
 *   await ef.fund.getQuoteHistory('161725')
 */
export const ef = { stock, fund, bond, futures }

export { stock, fund, bond, futures }
export type { EfRow } from './common.js'
export * from './common.js'
export * from './config.js'
export * from './utils.js'

export type Efinance = typeof ef
