import { FS_DICT } from './config.js'
import type { EfRow } from './common.js'
import { getBaseInfo, getQuoteHistory, getRealtimeQuotesByFs } from './common.js'

/** ef.futures — mirrors efinance.futures */
export const futures = {
  async getRealtimeQuotes(): Promise<EfRow[]> {
    return getRealtimeQuotesByFs(FS_DICT.futures)
  },

  getQuoteHistory,
  getBaseInfo,
}

export type FuturesModule = typeof futures
