import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import {
  instrumentDisplayCode,
  instrumentRefLabel,
  normalizeInstrumentRef,
} from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import { marketReadAll } from './duck-read.js'

export interface LocalInstrumentHit {
  code: string
  name: string | null
  market: Market
  assetClass: AssetClass
  exchange: string | null
  instrument: InstrumentRef
  /** Mention / composer prefix e.g. US:AAPL */
  refLabel: string
}

function rowToHit(row: {
  code: string
  name: string | null
  market: string
  asset_class: string
  exchange: string | null
}): LocalInstrumentHit {
  const market = row.market as Market
  const assetClass = row.asset_class as AssetClass
  const instrument = normalizeInstrumentRef({
    market,
    assetClass,
    symbol: row.code,
    exchange: row.exchange ?? undefined,
  })
  return {
    code: instrumentDisplayCode(instrument),
    name: row.name,
    market: instrument.market,
    assetClass: instrument.assetClass,
    exchange: row.exchange,
    instrument,
    refLabel: instrumentRefLabel(instrument),
  }
}

/** Unified local universe search — CN/US/Crypto instruments table */
export function searchLocalInstruments(
  store: MarketDataStore,
  keyword: string,
  limit = 30,
  markets?: Market[],
): LocalInstrumentHit[] {
  const kw = keyword.trim()
  if (kw.length < 1) return []
  const like = `%${kw.toUpperCase()}%`
  const likeName = `%${kw}%`
  const params: unknown[] = [like, likeName, likeName]
  let marketSql = ''
  if (markets?.length) {
    marketSql = ` AND market IN (${markets.map(() => '?').join(',')})`
    params.push(...markets)
  }
  params.push(limit)
  const rows = marketReadAll(store, `
    SELECT code, name, market, asset_class, exchange FROM v_instruments_unified
    WHERE status = 'active'
      AND (
        UPPER(code) LIKE ?
        OR name LIKE ?
        OR UPPER(name) LIKE ?
      )
      ${marketSql}
    ORDER BY
      CASE market WHEN 'CN' THEN 0 WHEN 'US' THEN 1 WHEN 'CRYPTO' THEN 2 ELSE 3 END,
      code
    LIMIT ?
  `, params, () => store.db.prepare(`
    SELECT code, name, market, asset_class, exchange FROM v_instruments_unified
    WHERE status = 'active'
      AND (
        UPPER(code) LIKE ?
        OR name LIKE ?
        OR UPPER(name) LIKE ?
      )
      ${marketSql}
    ORDER BY
      CASE market WHEN 'CN' THEN 0 WHEN 'US' THEN 1 WHEN 'CRYPTO' THEN 2 ELSE 3 END,
      code
    LIMIT ?
  `).all(...params) as {
    code: string
    name: string | null
    market: string
    asset_class: string
    exchange: string | null
  }[])
  return rows.map(rowToHit)
}

export function listLocalInstrumentsSummary(store: MarketDataStore) {
  const rows = store.db.prepare(`
    SELECT market, asset_class, COUNT(*) AS c FROM v_instruments_unified
    WHERE status = 'active'
    GROUP BY market, asset_class
    ORDER BY market, asset_class
  `).all() as { market: string; asset_class: string; c: number }[]
  return rows.map(r => ({
    market: r.market as Market,
    assetClass: r.asset_class as AssetClass,
    count: r.c,
  }))
}
