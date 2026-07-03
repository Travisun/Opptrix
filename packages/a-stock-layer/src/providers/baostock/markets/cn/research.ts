import { normalizeCode } from '../../../../utils/helpers.js'
import { BaostockApiError, zipBaostockRows, type BaostockClient, type BaostockResult } from '../../api/client.js'
import { toBaostockCode, fromBaostockCode } from '../../api/symbols.js'
import {
  mapBaostockGenericRows,
  mapBaostockStockListSpecialty,
} from '../../normalize/specialty.js'
import type { BaostockCnHandler } from './handler.js'

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ymdDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function resolveQueryDay(day = ''): string {
  const raw = day.trim()
  if (!raw) return todayYmd()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }
  return raw.slice(0, 10)
}

function resolveRangeStart(startDate = ''): string {
  const raw = startDate.trim()
  if (!raw) return ymdDaysAgo(3650)
  return resolveQueryDay(raw)
}

function resolveRangeEnd(endDate = ''): string {
  return resolveQueryDay(endDate)
}

type BsHandler = BaostockCnHandler & {
  withClient<T>(fn: (client: BaostockClient) => Promise<T>): Promise<T | null>
}

async function mapDayList(
  client: BaostockClient,
  day: string,
  fn: (c: BaostockClient, d: string) => Promise<BaostockResult>,
  source: string,
): Promise<Record<string, unknown>[] | null> {
  const res = await fn(client, day)
  const rows = mapBaostockStockListSpecialty(res, source, day)
  return rows.length ? rows : null
}

async function mapDayListWithFallback(
  handler: BsHandler,
  client: BaostockClient,
  day: string,
  fn: (c: BaostockClient, d: string) => Promise<BaostockResult>,
  source: string,
  fallback: (c: BaostockClient, d: string) => Promise<Record<string, unknown>[] | null>,
): Promise<Record<string, unknown>[] | null> {
  try {
    const rows = await mapDayList(client, day, fn, source)
    if (rows?.length) return rows
  } catch (e) {
    if (!(e instanceof BaostockApiError) || e.code !== '10004020') throw e
  }
  return fallback(client, day)
}

function filterAllStockByCodePrefix(
  result: BaostockResult,
  day: string,
  source: string,
  test: (baostockCode: string) => boolean,
): Record<string, unknown>[] {
  return zipBaostockRows(result)
    .filter(row => test(String(row.code ?? '')))
    .map(row => ({
      source,
      tradeDate: day,
      code: fromBaostockCode(String(row.code)),
      ...row,
    }))
}

export function mixBaostockResearch(Driver: { prototype: BaostockCnHandler }) {
  const p = Driver.prototype as BsHandler & Record<string, unknown>

  p.bsStockConcept = async function bsStockConcept(code: string, date = '') {
    const bare = normalizeCode(code)
    if (!bare) return null
    return this.withClient(async client => {
      const res = await client.queryStockConcept(toBaostockCode(bare), resolveQueryDay(date))
      const rows = mapBaostockGenericRows(res, 'stock_concept')
      return rows.length ? rows : null
    })
  }

  p.bsStockArea = async function bsStockArea(code: string, date = '') {
    const bare = normalizeCode(code)
    if (!bare) return null
    return this.withClient(async client => {
      const res = await client.queryStockArea(toBaostockCode(bare), resolveQueryDay(date))
      const rows = mapBaostockGenericRows(res, 'stock_area')
      return rows.length ? rows : null
    })
  }

  p.bsAdjustFactor = async function bsAdjustFactor(
    code: string,
    startDate = '',
    endDate = '',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const start = resolveRangeStart(startDate)
    const end = resolveRangeEnd(endDate)
    return this.withClient(async client => {
      const res = await client.queryAdjustFactor(toBaostockCode(bare), start, end)
      const rows = mapBaostockGenericRows(res, 'adjust_factor')
      return rows.length ? rows : null
    })
  }

  p.bsGemStocks = async function bsGemStocks(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(async client => mapDayListWithFallback(
      this,
      client,
      queryDay,
      (c, d) => c.queryGemStocks(d),
      'gem_stocks',
      async (c, d) => {
        const all = await c.queryAllStock(d)
        const rows = filterAllStockByCodePrefix(all, d, 'gem_stocks_fallback', code =>
          code.startsWith('sz.30'))
        return rows.length ? rows : null
      },
    ))
  }

  p.bsStarStStocks = async function bsStarStStocks(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(client => mapDayList(client, queryDay, (c, d) => c.queryStarStStocks(d), 'starst_stocks'))
  }

  p.bsStStocks = async function bsStStocks(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(client => mapDayList(client, queryDay, (c, d) => c.queryStStocks(d), 'st_stocks'))
  }

  p.bsAmeStocks = async function bsAmeStocks(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(client => mapDayList(client, queryDay, (c, d) => c.queryAmeStocks(d), 'ame_stocks'))
  }

  p.bsSuspendedStocks = async function bsSuspendedStocks(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(client => mapDayList(client, queryDay, (c, d) => c.querySuspendedStocks(d), 'suspended_stocks'))
  }

  p.bsTerminatedStocks = async function bsTerminatedStocks(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(client => mapDayList(client, queryDay, (c, d) => c.queryTerminatedStocks(d), 'terminated_stocks'))
  }

  p.bsStocksInRisk = async function bsStocksInRisk(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(client => mapDayList(client, queryDay, (c, d) => c.queryStocksInRisk(d), 'stocks_in_risk'))
  }

  p.bsShhkStocks = async function bsShhkStocks(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(client => mapDayList(client, queryDay, (c, d) => c.queryShhkStocks(d), 'shhk_stocks'))
  }

  p.bsSzhkStocks = async function bsSzhkStocks(day = '') {
    const queryDay = resolveQueryDay(day)
    return this.withClient(client => mapDayList(client, queryDay, (c, d) => c.querySzhkStocks(d), 'szhk_stocks'))
  }

  p.bsMacroCpi = async function bsMacroCpi(startDate = '', endDate = '') {
    const end = resolveRangeEnd(endDate)
    const start = resolveRangeStart(startDate)
    return this.withClient(async client => {
      const res = await client.queryCpiData(start, end)
      const rows = mapBaostockGenericRows(res, 'cpi')
      return rows.length ? rows : null
    })
  }

  p.bsMacroPpi = async function bsMacroPpi(startDate = '', endDate = '') {
    const end = resolveRangeEnd(endDate)
    const start = resolveRangeStart(startDate)
    return this.withClient(async client => {
      const res = await client.queryPpiData(start, end)
      const rows = mapBaostockGenericRows(res, 'ppi')
      return rows.length ? rows : null
    })
  }

  p.bsMacroPmi = async function bsMacroPmi(startDate = '', endDate = '') {
    const end = resolveRangeEnd(endDate)
    const start = resolveRangeStart(startDate)
    return this.withClient(async client => {
      const res = await client.queryPmiData(start, end)
      const rows = mapBaostockGenericRows(res, 'pmi')
      return rows.length ? rows : null
    })
  }
}
