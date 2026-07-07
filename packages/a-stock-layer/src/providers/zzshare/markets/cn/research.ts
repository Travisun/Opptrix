import type { DragonTiger, LimitUpDown, MoneyFlow, NewsItem, SentimentData } from '../../../../core/schema.js'
import { normalizeCode } from '../../../../utils/helpers.js'
import type { ZzshareClient } from '../../api/client.js'
import { invokeZzshare } from '../../api/invoke.js'
import { toTsCode } from '../../api/symbols.js'
import {
  mapLhbDetailToInstHolding,
  mapLhbDetailToMoneyFlow,
  mapLhbHistoryToShareholders,
} from '../../../common/free-proxies.js'
import {
  genericRecords,
  mapZzshareGenericRecords,
  mapZzshareLhbDetailRows,
  mapZzshareLhbListRows,
  mapZzshareLhbStockHistoryRows,
  mapZzshareMarketSentimentRows,
  mapZzsharePlatesListRows,
  mapZzsharePlatesRankRows,
  mapZzshareReviewUplimitReasonRows,
  mapZzshareSentimentBullDataRows,
  mapZzshareStockUplimitReasonRows,
  mapZzshareTopicTableListRows,
  mapZzshareUplimitHotRows,
  mapZzshareUplimitStocksRows,
  mapZzshareUpdownDistributionRows,
  mapZzshareStockNewsRows,
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
}

/**
 * 向 `ZzshareCnHandler` 原型混入研究类能力（龙虎榜、涨跌停、情绪、板块等）。
 *
 * @param Driver 驱动类（通常为 `ZzshareDriver`）
 */
export function mixZzshareResearch(Driver: { prototype: ZzshareCnHandler }) {
  const p = Driver.prototype as ZzHandler

  /**
   * 龙虎榜每日上榜列表 — Capability `DRAGON_TIGER`。
   *
   * @param date 查询日期 YYYY-MM-DD，默认今天
   * @returns 龙虎榜条目；无数据时 `null`
   */
  p.dragonTiger = async function dragonTiger(date = ''): Promise<DragonTiger[] | null> {
    const queryDate = resolveQueryDate(date)
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'lhb_list', { date1: ymdToApi(queryDate) })
      const rows = mapZzshareLhbListRows(data, queryDate)
      return rows.length ? rows : null
    })
  }

  /**
   * 涨跌停复盘 — Capability `LIMIT_UPDOWN`。
   *
   * 合并 `uplimit_stocks` 与 `review_uplimit_reason_open` 去重。
   *
   * @param date 查询日期 YYYY-MM-DD，默认今天
   * @returns 涨跌停记录；无数据时 `null`
   */
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

  /**
   * 市场涨跌家数分布 — Capability `MARKET_BREADTH`。
   *
   * @param date 查询日期 YYYY-MM-DD，默认今天
   * @returns 涨跌分布统计行；无数据时 `null`
   */
  p.marketBreadth = async function marketBreadth(date = ''): Promise<Record<string, unknown>[] | null> {
    const queryDate = resolveQueryDate(date)
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'updown_distribution', { date1: ymdToApi(queryDate) })
      const rows = mapZzshareUpdownDistributionRows(data, queryDate)
      return rows.length ? rows : null
    })
  }

  /**
   * 市场情绪 — Capability `SENTIMENT`。
   *
   * 空代码/`MARKET`/`000001` 时拉全市场综合情绪；否则拉个股同花顺热度。
   *
   * @param code 股票代码或留空表示全市场
   * @returns 情绪摘要；无数据时 `null`
   */
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

  /**
   * 板块列表 — Capability `SECTOR_LIST`。
   *
   * @param plateType 板块类型：17=题材、15=概念、14=行业，默认 14
   * @returns 板块行；无数据时 `null`
   */
  p.sectorList = async function sectorList(plateType = '14'): Promise<Record<string, unknown>[] | null> {
    const typeNum = Number(plateType) || 14
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'plates_list', { plate_type: typeNum })
      const rows = mapZzsharePlatesListRows(data, typeNum)
      return rows.length ? rows : null
    })
  }

  /**
   * 涨停热点与连板梯队 — 自定义方法 `zzUplimitHot`。
   *
   * @param date 查询日期 YYYY-MM-DD，默认今天
   * @param board 可选板块过滤
   * @returns 热点板块数据；无数据时 `null`
   */
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

  /**
   * 龙虎榜席位明细 — 自定义方法 `zzLhbDetail`。
   *
   * @param date 查询日期 YYYY-MM-DD，默认今天
   * @param stockCode 6 位股票代码（必填）
   * @returns 买卖席位详情；无数据或代码为空时 `null`
   */
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

  /**
   * 板块热度排名 — 自定义方法 `zzPlatesRank`。
   *
   * @param plateType 板块类型，默认 14（行业）
   * @param date 排名日期 YYYY-MM-DD，默认今天
   * @param limit 返回条数，默认 20
   * @returns 排名行；无数据时 `null`
   */
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

  /**
   * 题材库表格列表 — 自定义方法 `zzTopicTables`。
   *
   * @param page 页码，默认 1
   * @param limit 每页条数，默认 20
   * @returns 题材表格摘要；无数据时 `null`
   */
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

  /**
   * AI 投研报告列表 — 自定义方法 `zzAiReports`。
   *
   * @param type 报告类型（如 `daily`），默认 `daily`
   * @param page 页码，默认 1
   * @param pageSize 每页条数，默认 10
   * @returns 报告列表行；无数据时 `null`
   */
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

  /**
   * 异动与监管预警 — 自定义方法 `zzMovementAlerts`。
   *
   * @param date 查询日期 YYYY-MM-DD，默认今天
   * @param type 异动类型过滤，空表示全部
   * @param limit 返回条数，默认 50
   * @returns 异动记录；无数据时 `null`
   */
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

  /**
   * 宏观情绪聚合 — 自定义方法 `zzMacroSentiment`。
   *
   * 合并 `sentiment_bull_data` 与 `open_sentiment_data`。
   *
   * @param date1 起始日期 YYYY-MM-DD；空则默认近 30 日
   * @param date2 结束日期 YYYY-MM-DD；空则与 date1 或今天相同
   * @returns 情绪时序行；无数据时 `null`
   */
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

  /**
   * 个股资讯/公告 — Capability `NEWS`。
   * 合并涨停原因、历史涨停、异动预警与 AI 报告摘要（免费 open API）。
   */
  p.news = async function news(
    code: string,
    page = 1,
    pageSize = 20,
    _newsType = '',
  ): Promise<NewsItem[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const limit = Math.max(1, Math.min(pageSize, 50))
    const offset = Math.max(0, (Math.max(1, page) - 1) * limit)
    return this.withClient(async client => {
      const ts = toTsCode(bare)
      const [reason, history, alerts, reports] = await Promise.all([
        invokeZzshare(client, 'stock_uplimit_reason', { stock_code: bare }).catch(() => null),
        invokeZzshare(client, 'stock_uplimit_reason_history', { stock_code: bare }).catch(() => null),
        invokeZzshare(client, 'movement_alerts', { stock_code: bare, limit: 30, is_real: 1 }).catch(() => null),
        invokeZzshare(client, 'ai_report_list', { type: 'daily', page: 1, page_size: 10 }).catch(() => null),
      ])
      const reasonRows = mapZzshareStockUplimitReasonRows(reason, bare)
      const historyRows = mapZzshareStockUplimitReasonRows(history, bare).map(r => ({ ...r, source: 'stock_uplimit_reason_history' }))
      const alertRows = genericRecords(alerts)
        .filter(row => !row.code || normalizeCode(String(row.code)) === bare)
        .map(row => ({ ...row, code: bare, source: 'movement_alerts' }))
      const reportRows = genericRecords(reports)
        .filter(row => {
          const text = JSON.stringify(row)
          return text.includes(bare) || text.includes(ts)
        })
        .map(row => ({ ...row, code: bare, source: 'ai_report_list', reason: row.title ?? row.summary }))
      const limitRows: Record<string, unknown>[] = []
      for (let i = 0; i < 5; i++) {
        const d = ymdDaysAgo(i)
        const lu = await invokeZzshare(client, 'review_uplimit_reason_open', { date1: ymdToApi(d) }).catch(() => null)
        const mapped = mapZzshareReviewUplimitReasonRows(lu, d)
          .filter(row => row.code === bare)
          .map(row => ({
            code: bare,
            date: row.date,
            reason: row.reason ?? row.name,
            source: 'review_uplimit_reason',
          }))
        limitRows.push(...mapped)
        if (limitRows.length >= limit) break
      }
      const items = mapZzshareStockNewsRows(bare, reasonRows, historyRows, alertRows, reportRows, limitRows)
      const sliced = items.slice(offset, offset + limit)
      return sliced.length ? sliced : null
    })
  }

  /** 主营业务 — Capability `MAIN_BUSINESS`（来自个股 profile / stock_info）。 */
  p.mainBusiness = async function mainBusiness(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const profiles = await this.profile(bare)
    const p0 = profiles?.[0]
    const item = p0?.mainBusiness || p0?.businessScope || p0?.industry || p0?.orgProfile
    if (!item) return null
    return [{ code: bare, item, source: 'profile' }]
  }

  /** 机构持仓 — Capability `INST_HOLDING`（龙虎榜机构席位代理）。 */
  p.instHolding = async function instHolding(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'lhb_stock_history', {
        stock_code: bare,
      }).catch(() => null)
      const history = mapZzshareLhbStockHistoryRows(data, bare)
      const seats: Record<string, unknown>[] = []
      for (let i = 0; i < 10; i++) {
        const queryDate = ymdDaysAgo(i)
        const detail = await invokeZzshare(client, 'lhb_detail', {
          date1: ymdToApi(queryDate),
          stock_code: bare,
        }).catch(() => null)
        seats.push(...mapZzshareLhbDetailRows(detail, queryDate))
        if (seats.length) break
      }
      const rows = mapLhbDetailToInstHolding(bare, [...history, ...seats])
      return rows.length ? rows : null
    })
  }

  /** 股东信息 — Capability `SHAREHOLDER`（龙虎榜历史席位弱代理，非十大股东）。 */
  p.shareholders = async function shareholders(code: string, _reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'lhb_stock_history', {
        stock_code: bare,
      }).catch(() => null)
      const rows = mapLhbHistoryToShareholders(bare, mapZzshareLhbStockHistoryRows(data, bare))
      return rows.length ? rows : null
    })
  }

  /** 个股资金流 — Capability `STOCK_MONEY_FLOW`（龙虎榜净买额代理）。 */
  p.moneyFlow = async function moneyFlow(code: string): Promise<MoneyFlow[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'lhb_stock_history', {
        stock_code: bare,
      }).catch(() => null)
      const history = mapZzshareLhbStockHistoryRows(data, bare)
      const rows = mapLhbDetailToMoneyFlow(bare, history)
      return rows.length ? rows : null
    })
  }

  /** 板块资金流 — Capability `SECTOR_MONEY_FLOW`（板块热度排名代理）。 */
  p.sectorMoneyFlow = async function sectorMoneyFlow(sectorType = '14'): Promise<Record<string, unknown>[] | null> {
    const plateType = Number(sectorType) || 14
    return this.withClient(async client => {
      for (let i = 0; i < 10; i++) {
        const queryDate = ymdDaysAgo(i)
        const data = await client.plates_rank(plateType, ymdToApi(queryDate), 30).catch(() => null)
        const rows = mapZzsharePlatesRankRows(data, plateType, queryDate)
        const mapped = rows.map(row => ({
          sectorCode: String(row.plateCode ?? row.plate_code ?? ''),
          sectorName: String(row.plate_name ?? row.plateName ?? row.name ?? ''),
          date: queryDate,
          netAmount: row.money_leader ?? row.money_leader_buy ?? null,
          changePct: row.rate ?? row.changePct ?? row.change_pct ?? null,
          source: 'plates_rank_proxy',
        })).filter(r => r.sectorName)
        if (mapped.length) return mapped
      }
      return null
    })
  }

  /** 大盘资金流 — Capability `MARKET_MONEY_FLOW`（涨跌家数分布代理）。 */
  p.marketMoneyFlow = async function marketMoneyFlow(direction = 'market'): Promise<Record<string, unknown>[] | null> {
    const queryDate = todayYmd()
    return this.withClient(async client => {
      const data = await invokeZzshare(client, 'updown_distribution', { date1: ymdToApi(queryDate) })
      const rows = mapZzshareUpdownDistributionRows(data, queryDate)
      if (!rows.length) return null
      const latest = rows[rows.length - 1]!
      const up = Number(latest.up ?? latest.up_count ?? 0) || 0
      const down = Number(latest.down ?? latest.down_count ?? 0) || 0
      return [{
        direction,
        date: queryDate,
        netAmount: up - down,
        shNet: latest.sh_up ?? null,
        szNet: latest.sz_up ?? null,
        source: 'updown_distribution_proxy',
      }]
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
