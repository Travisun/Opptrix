import type { DragonTiger, LimitUpDown, MarketMoneyFlow, MoneyFlow, SentimentData } from '../../../../core/schema.js'
import { normalizeCode } from '../../../../utils/helpers.js'
import type { ZzshareClient } from '../../api/client.js'
import { invokeZzshare } from '../../api/invoke.js'
import { toTsCode } from '../../api/symbols.js'
import {
  genericRecords,
  mapZzshareGenericRecords,
  mapZzshareLhbDetailRows,
  mapZzshareLhbListRows,
  mapZzshareMarketSentimentRows,
  mapZzsharePlatesListRows,
  mapZzsharePlatesRankRows,
  mapZzshareReviewUplimitReasonRows,
  mapZzshareSentimentBullDataRows,
  mapZzshareTopicTableListRows,
  mapZzshareUplimitHotRows,
  mapZzshareUplimitStocksRows,
  mapZzshareUpdownDistributionRows,
  mapZzshareMarketMoneyFlowRows,
  mapZzshareSentimentMarketTopNRows,
  mapZzshareStockMoneyFlowRows,
} from '../../normalize/index.js'
import type { ZzshareCnHandler } from './handler.js'

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolveQueryDate(date = ''): string {
  return date ? date.slice(0, 10) : todayYmd()
}

function ymdToApi(v: string): string {
  return v.replace(/-/g, '').slice(0, 8)
}

type ZzHandler = ZzshareCnHandler & {
  withClient<T>(fn: (client: ZzshareClient) => Promise<T>): Promise<T | null>
  sectorList?(plateType?: string): Promise<Record<string, unknown>[] | null>
  zzUplimitHot?(date?: string, board?: string): Promise<Record<string, unknown>[] | null>
  zzLhbDetail?(date?: string, stockCode?: string): Promise<Record<string, unknown>[] | null>
  zzPlatesRank?(plateType?: number, date?: string, limit?: number): Promise<Record<string, unknown>[] | null>
  zzTopicTables?(page?: number, limit?: number): Promise<Record<string, unknown>[] | null>
  zzAiReports?(type?: string, page?: number, pageSize?: number): Promise<Record<string, unknown>[] | null>
  zzMovementAlerts?(date?: string, type?: string, limit?: number): Promise<Record<string, unknown>[] | null>
  zzMacroSentiment?(date1?: string, date2?: string): Promise<Record<string, unknown>[] | null>
  moneyFlow?(code: string): Promise<MoneyFlow[] | null>
  marketMoneyFlow?(direction?: string): Promise<MarketMoneyFlow[] | null>
  zzSentimentMarketTopN?(modalId?: number, date1?: string, date2?: string): Promise<Record<string, unknown>[] | null>
}

export function mixZzshareResearch(Driver: { prototype: ZzshareCnHandler }) {
  const p = Driver.prototype as ZzHandler

  p.dragonTiger = async function dragonTiger(date = ''): Promise<DragonTiger[] | null> {
    const queryDate = resolveQueryDate(date)
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'lhb_list', { date1: ymdToApi(queryDate) })
      const rows = mapZzshareLhbListRows(data, queryDate)
      return rows.length ? rows : null
    })
  }

  p.limitUpdown = async function limitUpdown(date = ''): Promise<LimitUpDown[] | null> {
    const queryDate = resolveQueryDate(date)
    return this.withClient(async client => {
      const [stocks, review] = await Promise.all([
        invokeZzshare(client, 'uplimit_stocks', { date1: ymdToApi(queryDate) }).catch(() => null),
        invokeZzshare(client, 'review_uplimit_reason_open', { date1: ymdToApi(queryDate) }).catch(() => null),
      ])

      const fromStocks = stocks ? mapZzshareUplimitStocksRows(stocks, queryDate) : []
      const fromReview = review ? mapZzshareReviewUplimitReasonRows(review, queryDate) : []
      const merged = new Map<string, LimitUpDown>()
      for (const row of [...fromStocks, ...fromReview]) {
        merged.set(`${row.code}:${row.date}`, row)
      }
      const out = [...merged.values()]
      return out.length ? out : null
    })
  }

  p.marketBreadth = async function marketBreadth(date = ''): Promise<Record<string, unknown>[] | null> {
    const queryDate = resolveQueryDate(date)
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'updown_distribution', { date1: ymdToApi(queryDate) })
      const rows = mapZzshareUpdownDistributionRows(data, queryDate)
      return rows.length ? rows : null
    })
  }

  p.sentiment = async function sentiment(code = ''): Promise<SentimentData[] | null> {
    const bare = normalizeCode(code)
    const isMarket = !bare || bare === 'MARKET' || bare === '000001'

    return this.withClient(async client => {
      if (isMarket) {
        const end = todayYmd()
        const data = await invokeZzshare(client, 'market_sentiment', {
          date1: ymdToApi(ymdDaysAgo(30)),
          date2: ymdToApi(end),
        })
        const rows = mapZzshareMarketSentimentRows(data, end)
        if (!rows.length) return null
        const latest = rows[rows.length - 1]!
        return [{
          code: 'market',
          score: typeof latest.score === 'number' ? latest.score : null,
          label: String(latest.label ?? latest.sentiment ?? ''),
          summary: String(latest.summary ?? latest.desc ?? '市场情绪'),
          timestamp: String(latest.date ?? end),
        }]
      }

      const data = await invokeZzshare(client, 'stock_ths_hot', {
        code: toTsCode(bare),
        date1: ymdToApi(todayYmd()),
      })
      const rows = mapZzshareGenericRecords(data)
      if (!rows.length) return null
      const latest = rows[rows.length - 1]!
      return [{
        code: bare,
        score: typeof latest.hot === 'number' ? latest.hot as number : null,
        label: String(latest.rank ?? latest.hot_rank ?? ''),
        summary: String(latest.reason ?? latest.desc ?? '同花顺热度'),
        timestamp: String(latest.date ?? latest.date1 ?? todayYmd()),
      }]
    })
  }

  p.sectorList = async function sectorList(plateType = '14'): Promise<Record<string, unknown>[] | null> {
    const typeNum = Number(plateType) || 14
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'plates_list', { plate_type: typeNum })
      const rows = mapZzsharePlatesListRows(data, typeNum)
      return rows.length ? rows : null
    })
  }

  p.moneyFlow = async function moneyFlow(code: string): Promise<MoneyFlow[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const queryDate = ymdToApi(todayYmd())
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'stock_moneyflow', {
        stock_id: bare,
        m_type: '',
      })
      const rows = mapZzshareStockMoneyFlowRows(bare, data, queryDate)
      return rows.length ? rows : null
    })
  }

  p.marketMoneyFlow = async function marketMoneyFlow(
    direction = 'market',
  ): Promise<MarketMoneyFlow[] | null> {
    const queryDate = ymdToApi(todayYmd())
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'market_mf', {
        stock: '',
        date: queryDate,
        wm: 0,
        default_v: 0,
      }).catch(() => null)
      if (data == null) return null
      const rows = mapZzshareMarketMoneyFlowRows(data, queryDate, direction)
      return rows.length ? rows : null
    })
  }

  p.zzSentimentMarketTopN = async function zzSentimentMarketTopN(
    modalId = 1,
    date1 = '',
    date2 = '',
  ): Promise<Record<string, unknown>[] | null> {
    const end = resolveQueryDate(date2 || date1)
    const start = date1 ? resolveQueryDate(date1) : ymdDaysAgo(14)
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'sentiment_market_top_n', {
        modal_id: modalId,
        date1: ymdToApi(start),
        date2: ymdToApi(end),
      })
      const rows = mapZzshareSentimentMarketTopNRows(data)
      return rows.length ? rows : null
    })
  }

  p.zzUplimitHot = async function zzUplimitHot(
    date = '',
    board = '',
  ): Promise<Record<string, unknown>[] | null> {
    const queryDate = resolveQueryDate(date)
    return this.withClient(async client => {
      const params: Record<string, unknown> = { date1: ymdToApi(queryDate) }
      if (board) params.board = board
      const data = await invokeZzshare(client, 'uplimit_hot', params)
      const rows = mapZzshareUplimitHotRows(data, queryDate)
      return rows.length ? rows : null
    })
  }

  p.zzLhbDetail = async function zzLhbDetail(
    date = '',
    stockCode = '',
  ): Promise<Record<string, unknown>[] | null> {
    const queryDate = resolveQueryDate(date)
    const bare = normalizeCode(stockCode)
    if (!bare) return null
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'lhb_detail', {
        date1: ymdToApi(queryDate),
        stock_code: bare,
      })
      const rows = mapZzshareLhbDetailRows(data, queryDate)
      return rows.length ? rows : null
    })
  }

  p.zzPlatesRank = async function zzPlatesRank(
    plateType = 14,
    date = '',
    limit = 20,
  ): Promise<Record<string, unknown>[] | null> {
    const queryDate = resolveQueryDate(date)
    return this.withClient(async client => {
      const data = await client.plates_rank(Number(plateType) || 14, ymdToApi(queryDate), limit)
      const rows = mapZzsharePlatesRankRows(data, Number(plateType) || 14, queryDate)
      return rows.length ? rows : null
    })
  }

  p.zzTopicTables = async function zzTopicTables(
    page = 1,
    limit = 20,
  ): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'topic_table_list', { page, limit, brief: 1 })
      const rows = mapZzshareTopicTableListRows(data)
      return rows.length ? rows : null
    })
  }

  p.zzAiReports = async function zzAiReports(
    type = 'daily',
    page = 1,
    pageSize = 10,
  ): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'ai_report_list', { type, page, page_size: pageSize })
      const rows = genericRecords(data).map(row => ({ ...row, source: 'ai_report_list' }))
      return rows.length ? rows : null
    })
  }

  p.zzMovementAlerts = async function zzMovementAlerts(
    date = '',
    type = '',
    limit = 50,
  ): Promise<Record<string, unknown>[] | null> {
    const queryDate = resolveQueryDate(date)
    return this.withClient(async client => {
      const params: Record<string, unknown> = {
        date1: ymdToApi(queryDate),
        limit,
        is_real: 1,
      }
      if (type) params.type = type
      const data = await invokeZzshare(client, 'movement_alerts', params)
      const rows = genericRecords(data).map(row => ({
        ...row,
        date: queryDate,
        source: 'movement_alerts',
      }))
      return rows.length ? rows : null
    })
  }

  p.zzMacroSentiment = async function zzMacroSentiment(
    date1 = '',
    date2 = '',
  ): Promise<Record<string, unknown>[] | null> {
    const end = resolveQueryDate(date2 || date1)
    const start = date1 ? resolveQueryDate(date1) : ymdDaysAgo(30)
    return this.withClient(async client => {
      const [bull, open] = await Promise.all([
        invokeZzshare(client, 'sentiment_bull_data', {
          date1: ymdToApi(start),
          date2: ymdToApi(end),
        }).catch(() => null),
        invokeZzshare(client, 'open_sentiment_data', {
          date1: ymdToApi(start),
          date2: ymdToApi(end),
        }).catch(() => null),
      ])
      const rows = [
        ...mapZzshareSentimentBullDataRows(bull, end),
        ...mapZzshareGenericRecords(open).map(row => ({ ...row, source: 'open_sentiment_data' })),
      ]
      return rows.length ? rows : null
    })
  }
}

function ymdDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
