import { httpGetWithRetry, sdkKeyHeaders } from '../../../utils/http.js'
import { loadZzshareConfig } from '../config.js'
import {
  CUSTOM_METHOD_NAMES,
  DEFAULT_BASE_URL,
  SHORTCUTS,
  type ZzshareParamNames,
} from './constants.js'
import { fromTsCode, normalizeSymbol, toBackendExchange, toTsCode } from './symbols.js'

export class ZzshareAuthError extends Error {
  constructor(message = '自在量化 API 鉴权失败，请检查 Token 配置') {
    super(message)
    this.name = 'ZzshareAuthError'
  }
}

export class ZzshareRateLimitError extends Error {
  constructor(message = '自在量化 API 请求过于频繁，请稍后再试') {
    super(message)
    this.name = 'ZzshareRateLimitError'
  }
}

type QueryValue = string | number | boolean | null | undefined

export interface DailyQuery {
  ts_code?: string
  trade_date?: string
  start_date?: string
  end_date?: string
  offset?: number
  limit?: number
  fields?: string
  adj?: string
  candle_mode?: number
  export_all?: boolean | string
  [key: string]: QueryValue
}

export interface DailyBar {
  ts_code: string | null
  trade_date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  pre_close: number | null
  change: number | null
  pct_chg: number | null
  vol: number | null
  amount: number | null
  volume?: number | null
  turnover?: number | null
  factor?: number | null
  prev_close?: number | null
  avg_price?: number | null
  high_limit?: number | null
  low_limit?: number | null
  turnover_rate?: number | null
  amp_rate?: number | null
  quote_rate?: number | null
  is_paused?: unknown
  is_st?: unknown
}

export interface StkMinsQuery {
  ts_code?: string
  trade_time?: string
  start_time?: string
  end_time?: string
  freq?: string
  count?: number
  [key: string]: QueryValue
}

export interface StkMinBar {
  ts_code: string | null
  trade_time: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  vol: number | null
  amount: number | null
}

export interface RtKQuery {
  ts_code?: string
  fields?: string
  [key: string]: QueryValue
}

export interface RtKBar {
  ts_code: string
  name?: string
  pre_close?: number | null
  high?: number | null
  open?: number | null
  low?: number | null
  close?: number | null
  vol?: number | null
  amount?: number | null
  num?: number | null
  ask_price1?: number | null
  ask_volume1?: number | null
  bid_price1?: number | null
  bid_volume1?: number | null
  [key: string]: unknown
}

export interface StockBasicQuery {
  ts_code?: string
  exchange?: string
  list_status?: string
  is_hs?: string
  fields?: string
  name?: string
  [key: string]: QueryValue
}

export interface StockBasicRow {
  ts_code: string
  symbol: string
  name: string
  area: string
  industry: string
  fullname: string
  enname: string
  cnspell: string
  market: string
  exchange: string
  curr_type: string
  list_status: string
  list_date: string
  delist_date: string
  is_hs: string
}

const RT_K_BASE_COLS = [
  'ts_code', 'name', 'pre_close', 'high', 'open', 'low', 'close',
  'vol', 'amount', 'num', 'ask_price1', 'ask_volume1', 'bid_price1', 'bid_volume1',
] as const

const DAILY_DEFAULT_COLS = [
  'ts_code', 'trade_date', 'open', 'high', 'low', 'close',
  'pre_close', 'change', 'pct_chg', 'vol', 'amount',
] as const

const DAILY_ALL_COLS = [
  'ts_code', 'trade_date', 'open', 'high', 'low', 'close',
  'volume', 'turnover', 'factor', 'prev_close', 'avg_price',
  'high_limit', 'low_limit', 'turnover_rate', 'amp_rate',
  'quote_rate', 'is_paused', 'is_st',
] as const

const STOCK_BASIC_COLS = [
  'ts_code', 'symbol', 'name', 'area', 'industry', 'fullname', 'enname',
  'cnspell', 'market', 'exchange', 'curr_type', 'list_status',
  'list_date', 'delist_date', 'is_hs',
] as const

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeDate(value: unknown): string {
  return String(value ?? '').replace(/-/g, '')
}

function queryParams(params: Record<string, QueryValue> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    out[key] = String(value)
  }
  return out
}

function isTruthyFlag(value: unknown): boolean {
  const s = String(value ?? '').toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

function pickColumns<T extends object>(rows: T[], columns: readonly string[]): T[] {
  return rows.map(row => {
    const src = row as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const col of columns) {
      if (col in src) out[col] = src[col]
    }
    return out as T
  })
}

function sortByKey<T extends object>(rows: T[], key: string, ascending = false): T[] {
  return [...rows].sort((a, b) => {
    const av = String((a as Record<string, unknown>)[key] ?? '')
    const bv = String((b as Record<string, unknown>)[key] ?? '')
    return ascending ? av.localeCompare(bv) : bv.localeCompare(av)
  })
}

export class ZzshareClient {
  readonly token: string
  readonly timeoutMs: number
  readonly baseUrl: string

  constructor(
    token = '',
    timeoutMs = 10_000,
    baseUrl = DEFAULT_BASE_URL,
  ) {
    this.token = token.trim() || process.env.ZZSHARE_TOKEN?.trim() || process.env.OPPTRIX_ZZSHARE_API_KEY?.trim() || 'anonymous'
    this.timeoutMs = timeoutMs
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.registerShortcuts()
  }

  static fromConfig(cfg = loadZzshareConfig()): ZzshareClient {
    return new ZzshareClient(cfg.token, cfg.timeoutMs, cfg.baseUrl)
  }

  private headers(): Record<string, string> {
    return sdkKeyHeaders(this.token)
  }

  private async requestWithRetry(
    url: string,
    params: Record<string, QueryValue> = {},
  ) {
    return httpGetWithRetry(url, queryParams(params), {
      timeoutMs: this.timeoutMs,
      extraHeaders: this.headers(),
    })
  }

  async query(path: string, params: Record<string, QueryValue> = {}): Promise<unknown> {
    const cleanPath = path.replace(/^\//, '')
    const url = `${this.baseUrl}/${cleanPath}`
    const res = await this.requestWithRetry(url, params)

    if (res.status === 200) {
      const body = await res.json()
      const code = body.code
      if (code === 200 || code === 20000) return body.data
      if ('data' in body) return body.data
      return body
    }
    if (res.status === 401) {
      throw new ZzshareAuthError(
        '自在量化 API 鉴权失败。请检查 ZZSHARE_TOKEN / OPPTRIX_ZZSHARE_API_KEY 或在 quant.zizizaizai.com 个人中心更新 Token。',
      )
    }
    if (res.status === 429) {
      const text = await res.text()
      throw new ZzshareRateLimitError(
        `自在量化 API 请求频率已达上限，请稍后再试或升级会员。${text ? ` ${text}` : ''}`,
      )
    }
    const text = await res.text()
    throw new Error(`自在量化 HTTP ${res.status}${text ? `: ${text}` : ''}`)
  }

  private registerShortcuts(): void {
    for (const [name, shortcut] of Object.entries(SHORTCUTS)) {
      if (CUSTOM_METHOD_NAMES.has(name)) continue
      const bound = (...args: unknown[]) => this.invokeShortcut(name, args)
      Object.defineProperty(this, name, {
        value: bound,
        writable: false,
        enumerable: true,
        configurable: true,
      })
    }
  }

  private invokeShortcut(name: string, args: unknown[]): Promise<unknown> {
    const shortcut = SHORTCUTS[name]
    if (!shortcut) throw new Error(`Unknown zzshare shortcut: ${name}`)

    const kwargs: Record<string, QueryValue> = {}
    const paramNames = shortcut.params
    const actualParams = Array.isArray(paramNames) ? paramNames : Object.keys(paramNames)

    if (args.length === 1 && args[0] != null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      Object.assign(kwargs, args[0] as Record<string, QueryValue>)
    } else {
      if (!Array.isArray(paramNames)) {
        Object.assign(kwargs, paramNames)
      }
      for (let i = 0; i < args.length; i++) {
        if (i < actualParams.length) kwargs[actualParams[i]!] = args[i] as QueryValue
      }
    }

    if (!Array.isArray(paramNames)) {
      for (const [key, value] of Object.entries(paramNames)) {
        if (kwargs[key] == null || kwargs[key] === '') kwargs[key] = value
      }
    }

    let path = shortcut.path
    for (const param of actualParams) {
      const placeholder = `{${param}}`
      if (path.includes(placeholder)) {
        if (kwargs[param] == null || kwargs[param] === '') {
          throw new Error(`缺少路径参数 '${param}' for ${name}`)
        }
        path = path.replace(placeholder, String(kwargs[param]))
        delete kwargs[param]
      }
    }

    return this.query(path, kwargs)
  }

  async daily(query: DailyQuery = {}): Promise<DailyBar[]> {
    const {
      ts_code,
      trade_date,
      start_date,
      end_date,
      offset,
      limit,
      fields,
      adj,
      candle_mode: candleModeInput,
      export_all: exportAll,
      ...rest
    } = query

    const useTsCode = ts_code ? toTsCode(ts_code) : undefined
    const normalizedTradeDate = trade_date ? normalizeDate(trade_date) : undefined
    const normalizedStart = start_date ? normalizeDate(start_date) : undefined
    const normalizedEnd = end_date ? normalizeDate(end_date) : undefined

    const params: Record<string, QueryValue> = { ...rest }
    const adjNorm = String(adj ?? '').toLowerCase()
    let candleMode = candleModeInput
    if (candleMode == null) {
      if (adjNorm === 'qfq') candleMode = 1
      else if (adjNorm === 'hfq') candleMode = 2
      else candleMode = 0
    }
    params.candle_mode = candleMode

    let url: string
    if (!useTsCode) {
      if (!normalizedTradeDate) throw new Error('当 ts_code 为空时，trade_date 不能为空')
      params.trade_date = normalizedTradeDate
      if (offset != null) params.offset = offset
      if (limit != null) params.limit = limit
      url = `${this.baseUrl}/v3/market/kline/day`
    } else {
      params.get_type = 'range'
      if (normalizedTradeDate) {
        params.start_date = normalizedTradeDate
        params.end_date = normalizedTradeDate
      } else {
        if (normalizedStart) params.start_date = normalizedStart
        if (normalizedEnd) params.end_date = normalizedEnd
      }
      if (limit != null) params.limit = limit
      if (offset != null) params.offset = offset
      url = `${this.baseUrl}/v3/market/kline/day/${useTsCode}`
    }

    let data: unknown = null
    try {
      const res = await this.requestWithRetry(url, params)
      if (res.status === 200) {
        const body = await res.json()
        if (typeof body === 'object' && body !== null) {
          if (body.code === 200 || 'data' in body) data = body.data
          else data = body
        }
      } else if (res.status === 401) {
        throw new ZzshareAuthError()
      } else if (res.status === 429) {
        throw new ZzshareRateLimitError()
      }
    } catch (e) {
      if (e instanceof ZzshareAuthError || e instanceof ZzshareRateLimitError) throw e
      data = null
    }

    const records = extractRecordList(data, useTsCode)
    let rows = records.map(row => normalizeDailyRow(row, useTsCode))

    if (rows.length) {
      rows = rows.map(row => {
        const next = { ...row }
        for (const col of [
          'open', 'high', 'low', 'close', 'pre_close', 'change', 'pct_chg', 'vol', 'amount',
          'volume', 'turnover', 'factor', 'prev_close', 'avg_price', 'high_limit', 'low_limit',
          'turnover_rate', 'amp_rate', 'quote_rate',
        ] as const) {
          if (col in next) next[col] = toNumber(next[col])
        }
        if (next.change == null && next.pre_close != null && next.close != null) {
          next.change = next.close - next.pre_close
        }
        if (next.pct_chg == null && next.change != null && next.pre_close != null && next.pre_close !== 0) {
          next.pct_chg = (next.change / next.pre_close) * 100
        }
        if (next.ts_code) next.ts_code = toTsCode(next.ts_code)
        return next
      })
      rows = sortByKey(rows, 'trade_date', false)
    }

    const exportAllMode = isTruthyFlag(exportAll)
    const allMode = fields === 'all' || exportAllMode
    const orderedColumns = allMode ? DAILY_ALL_COLS : DAILY_DEFAULT_COLS

    if (!rows.length) {
      return [] as DailyBar[]
    }

    let result = rows.map(row => {
      const out: DailyBar = { ...row }
      for (const col of orderedColumns) {
        if (!(col in out)) (out as unknown as Record<string, unknown>)[col] = null
      }
      return pickColumns([out], orderedColumns)[0]!
    })

    if (fields && fields !== 'all') {
      const requested = fields.split(',').map(s => s.trim()).filter(Boolean)
      const selected = requested.filter(f => result[0] && f in result[0])
      if (selected.length) {
        result = pickColumns(result, selected)
      } else {
        result = []
      }
    }

    return result
  }

  async stk_mins(query: StkMinsQuery = {}): Promise<StkMinBar[]> {
    const {
      ts_code,
      trade_time,
      start_time,
      end_time,
      freq = '1min',
      count,
      ...rest
    } = query

    const useTsCode = ts_code ? toTsCode(ts_code) : undefined
    if (!useTsCode) throw new Error('ts_code 不能为空')

    const params: Record<string, QueryValue> = { freq, ...rest }
    if (trade_time) params.trade_time = trade_time
    if (start_time) params.start_time = start_time
    if (end_time) params.end_time = end_time
    if (count != null) params.count = count

    const url = `${this.baseUrl}/v3/market/kline/minute/${useTsCode}`

    let data: unknown = null
    try {
      const res = await this.requestWithRetry(url, params)
      if (res.status === 200) {
        const body = await res.json()
        if (typeof body === 'object' && body !== null) {
          if (body.code === 200 || 'data' in body) data = body.data
          else data = body
        }
      } else if (res.status === 401) {
        throw new ZzshareAuthError()
      } else if (res.status === 429) {
        throw new ZzshareRateLimitError()
      }
    } catch (e) {
      if (e instanceof ZzshareAuthError || e instanceof ZzshareRateLimitError) throw e
      data = null
    }

    const records = extractRecordList(data, useTsCode)
    let rows: StkMinBar[] = records.map(row => {
      const rowTsCode = row.ts_code ?? row.code ?? useTsCode
      return {
        ts_code: rowTsCode ? toTsCode(String(rowTsCode)) : null,
        trade_time: String(row.trade_time ?? ''),
        open: toNumber(row.open),
        high: toNumber(row.high),
        low: toNumber(row.low),
        close: toNumber(row.close),
        vol: toNumber(row.vol),
        amount: toNumber(row.amount),
      }
    })

    if (!rows.length) return []

    rows = sortByKey(rows, 'trade_time', false)
    return pickColumns(rows, ['ts_code', 'trade_time', 'open', 'high', 'low', 'close', 'vol', 'amount'])
  }

  async rt_k(query: RtKQuery = {}): Promise<RtKBar[]> {
    const { ts_code, fields, ...rest } = query
    const params: Record<string, QueryValue> = { ...rest }
    if (ts_code) params.ts_code = ts_code

    const url = `${this.baseUrl}/v3/market/kline/realtime`
    let data: RtKBar[] = []

    try {
      const res = await this.requestWithRetry(url, params)
      if (res.status === 200) {
        const body = await res.json()
        const list = (body.data as { list?: unknown[] } | undefined)?.list
        if (Array.isArray(list)) {
          data = list.filter((item): item is RtKBar => typeof item === 'object' && item !== null) as RtKBar[]
        }
      }
    } catch {
      data = []
    }

    const numericCols = [
      'pre_close', 'open', 'high', 'low', 'close', 'vol', 'amount', 'num',
      'ask_price1', 'ask_volume1', 'bid_price1', 'bid_volume1',
      'quote_rate', 'high_limit', 'low_limit', 'turnover_rate', 'market_value', 'circulation_value',
      'min5_chgpct', 'ttm_pe_rate', 'eps_ttm', 'auction_vol', 'auction_val', 'auction_px',
    ]

    const rows = data.map(row => {
      const out: RtKBar = { ...row }
      for (const col of numericCols) {
        if (col in out) (out as Record<string, unknown>)[col] = toNumber(out[col])
      }
      return out
    })

    if (!rows.length) {
      return [] as RtKBar[]
    }

    if (fields === 'all') return rows
    return pickColumns(rows, RT_K_BASE_COLS)
  }

  async stock_basic(query: StockBasicQuery = {}): Promise<StockBasicRow[]> {
    const {
      ts_code,
      exchange,
      list_status = 'L',
      is_hs,
      fields,
      name,
    } = query

    const requestedStatus = (list_status || 'L').toUpperCase()
    if (!['L', 'D', 'P'].includes(requestedStatus)) {
      throw new Error('list_status 仅支持 L/D/P')
    }

    const backendExchange = toBackendExchange(exchange)
    if (exchange && backendExchange == null) {
      throw new Error('exchange 仅支持 SSE/SZSE/BSE/SH/SZ/BJ/GEM/KSH/STAR/SS/ALL')
    }

    if (requestedStatus === 'P') {
      const empty = emptyStockBasicRows(fields)
      return empty
    }

    const queryStatus = requestedStatus === 'L' || requestedStatus === 'D' ? requestedStatus : 'ALL'
    const exchangeList = backendExchange ? [backendExchange] : ['SS', 'KSH', 'SZ', 'GEM', 'BJ']

    const rows: Array<Record<string, unknown>> = []
    for (const ex of exchangeList) {
      const data = await this.query('v3/open/stocks/list', {
        exchange: ex,
        list_status: queryStatus,
        format: 'records',
      })
      if (typeof data === 'object' && data !== null) {
        const batch = (data as { list?: unknown[] }).list
        if (Array.isArray(batch)) {
          for (const item of batch) {
            if (typeof item === 'object' && item !== null) rows.push(item as Record<string, unknown>)
          }
        }
      }
    }

    let normalizedCodes: string[] | undefined
    if (ts_code) {
      normalizedCodes = ts_code.split(',').map(s => normalizeSymbol(s.trim())).filter(Boolean)
    }

    const resultRows: StockBasicRow[] = []
    const seen = new Set<string>()

    for (const row of rows) {
      const code = String(row.code ?? '').trim()
      if (!code) continue
      if (normalizedCodes && !normalizedCodes.includes(code)) continue
      const rowName = String(row.name ?? '').trim()
      if (name && !rowName.includes(name)) continue

      const { exchange: exName } = fromTsCode(code)
      const typeCode = String(row.type_code ?? '').toUpperCase()
      const marketName = typeCode === 'GEM' ? '创业板' : typeCode.includes('KSH') ? '科创板' : ''

      const tsCode = toTsCode(code)
      if (seen.has(tsCode)) continue
      seen.add(tsCode)

      resultRows.push({
        ts_code: tsCode,
        symbol: code,
        name: rowName,
        area: '',
        industry: '',
        fullname: rowName,
        enname: '',
        cnspell: '',
        market: marketName,
        exchange: exName,
        curr_type: 'CNY',
        list_status: String(row.list_status ?? queryStatus).toUpperCase(),
        list_date: '',
        delist_date: '',
        is_hs: '',
      })
    }

    let result = resultRows
    if (is_hs) {
      const flag = is_hs.toUpperCase()
      if (flag === 'H' || flag === 'S') result = []
    }

    if (fields) {
      const requested = fields.split(',').map(s => s.trim()).filter(Boolean)
      const selected = requested.filter(f => STOCK_BASIC_COLS.includes(f as typeof STOCK_BASIC_COLS[number]))
      if (selected.length) return pickColumns(result, selected)
      return []
    }

    return pickColumns(result, STOCK_BASIC_COLS)
  }

  plates_rank(plate_type: number, date1: string, limit = 10): Promise<unknown> {
    return this.query(`v3/market/plates/${plate_type}/rank`, { date1, limit })
  }

  plates_rank_days(
    plate_type: number,
    date2: string,
    n_days = 5,
    n_type = 3,
    limit = 10,
  ): Promise<unknown> {
    return this.query(`v3/market/plates/${plate_type}/rank/days`, {
      date2,
      n_days,
      n_type,
      limit,
    })
  }

  plates_rank_days_new(
    plate_type: number,
    date2: string,
    n_days = 5,
    n_type = 3,
    limit = 20,
    prev_days = 3,
  ): Promise<unknown> {
    return this.query(`v3/market/plates/${plate_type}/rank/days/new`, {
      date2,
      n_days,
      n_type,
      limit,
      prev_days,
    })
  }
}

function extractRecordList(data: unknown, fallbackTsCode?: string): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    const list = obj.list
    if (Array.isArray(list)) {
      return list.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    }
    if (fallbackTsCode && Object.keys(obj).length) return [obj]
  }
  return []
}

function normalizeDailyRow(row: Record<string, unknown>, fallbackTsCode?: string): DailyBar {
  const rowTsCode = row.ts_code ?? row.symbol ?? row.code ?? fallbackTsCode
  return {
    ts_code: rowTsCode ? toTsCode(String(rowTsCode)) : null,
    trade_date: normalizeDate(row.trade_date ?? row.date ?? row.day),
    open: toNumber(row.open ?? row.o),
    high: toNumber(row.high ?? row.h),
    low: toNumber(row.low ?? row.l),
    close: toNumber(row.close ?? row.c),
    pre_close: toNumber(row.pre_close ?? row.prev_close),
    change: toNumber(row.change),
    pct_chg: toNumber(row.pct_chg ?? row.pct_change ?? row.quote_rate),
    vol: toNumber(row.vol ?? row.volume),
    amount: toNumber(row.amount ?? row.turnover),
    volume: toNumber(row.volume ?? row.vol),
    turnover: toNumber(row.turnover ?? row.amount),
    factor: toNumber(row.factor),
    prev_close: toNumber(row.prev_close ?? row.pre_close),
    avg_price: toNumber(row.avg_price),
    high_limit: toNumber(row.high_limit),
    low_limit: toNumber(row.low_limit),
    turnover_rate: toNumber(row.turnover_rate),
    amp_rate: toNumber(row.amp_rate),
    quote_rate: toNumber(row.quote_rate ?? row.pct_chg ?? row.pct_change),
    is_paused: row.is_paused,
    is_st: row.is_st,
  }
}

function emptyStockBasicRows(fields?: string): StockBasicRow[] {
  if (!fields) return []
  const requested = fields.split(',').map(s => s.trim()).filter(Boolean)
  const selected = requested.filter(f => STOCK_BASIC_COLS.includes(f as typeof STOCK_BASIC_COLS[number]))
  if (selected.length) return []
  return []
}

export async function testZzshareConnection(
  token?: string,
): Promise<{ ok: boolean; message: string }> {
  const resolved = (token ?? loadZzshareConfig().token).trim() || 'anonymous'
  const client = new ZzshareClient(resolved)

  try {
    const days = await client.query('market/trade/days', { days: 5 })
    if (days == null) {
      return { ok: false, message: '交易日历接口无数据，请检查网络或稍后再试' }
    }

    if (resolved !== 'anonymous') {
      try {
        const rt = await client.rt_k({ ts_code: '600000.SH' })
        if (Array.isArray(rt)) {
          return { ok: true, message: `自在量化连接成功 · 交易日历正常 · 实时行情可用（${rt.length} 条快照）` }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: true, message: `自在量化连接成功 · 交易日历正常 · 实时行情未验证（${msg}）` }
      }
    }

    return { ok: true, message: '自在量化连接成功 · 交易日历正常（匿名模式，实时行情需配置 Token）' }
  } catch (e) {
    if (e instanceof ZzshareAuthError) {
      return { ok: false, message: e.message }
    }
    if (e instanceof ZzshareRateLimitError) {
      return { ok: false, message: e.message }
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
