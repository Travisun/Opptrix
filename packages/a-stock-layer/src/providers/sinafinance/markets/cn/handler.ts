import type {
  Dividend,
  DragonTiger,
  FinancialSummary,
  IndexKline, IndexRealtime, MoneyFlow, NewsItem, StockKline, StockListItem,
  StockProfile, StockRealtime,
} from '../../../../core/schema.js'
import { bareCnSymbol, ensureCnSecSymbol, normalizeCode } from '../../../../utils/helpers.js'
import type { StockMarket } from '../../../../utils/helpers.js'
import { cnTodayString } from '../../../../utils/market-session.js'
import type { IntradayTrendFetchResult } from '../../../../utils/intraday-trends.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { isSinafinanceHttpError, type SinafinanceHttpError } from '../../api/errors.js'
import { trySinafinanceSources } from '../../api/fallback.js'
import { fetchSinaNoticeList, fetchSinaStockNews } from '../../api/content.js'
import { fetchSinaCorpProfile } from '../../api/corp-service.js'
import {
  fetchSinaConceptPlatesFromCode,
  fetchSinaRelatedSecurities,
} from '../../api/corp-service.js'
import {
  fetchSinaAllShareholders,
  fetchSinaBalanceSheet,
  fetchSinaBlockTradeList,
  fetchSinaCashFlowStatement,
  fetchSinaDividendList,
  fetchSinaDragonTigerByDate,
  fetchSinaFinancialSummary,
  fetchSinaIncomeStatement,
  fetchSinaMarginTradingSnapshot,
  fetchSinaPerfForecastList,
  fetchSinaShareUnlockList,
} from '../../api/ext-service.js'
import { SINA_SOURCE } from '../../types/responses.js'
import {
  fetchSinaExtendedQuoteLine,
  fetchSinaJsVar,
  fetchSinaMinline,
  fetchSinaMoneyFlow,
  fetchSinaTransList,
} from '../../api/market.js'
import {
  fetchSinaHqList,
  fetchSinaBoardStocks,
  fetchSinaIndexQuote,
  fetchSinaKlineRows,
  fetchSinaMarketBreadth,
  fetchSinaQuotesBySymbols,
  fetchSinaStockList,
  fetchSinaStockQuote,
  SINA_GLOBAL_INDEX,
  SINA_KLINE_SCALE,
} from '../../api/sina.js'
import { toSinaListSymbol } from '../../api/symbols.js'
import {
  mapSinaNoticeRows,
  mapSinaStockNewsRows,
  resolveSinaNewsChannel,
} from '../../normalize/content.js'
import { filterKlineByRange, mapSinaKlineRows } from '../../normalize/kline.js'
import {
  mapSinaMinlineTicks,
  mapSinaMoneyFlow,
  mapSinaTransRows,
} from '../../normalize/market.js'
import {
  mapGlobalIndexHqQuote,
  mapIndexHqQuote,
  mapSinaExtendedProfile,
  mapStockHqQuote,
  parseHqLine,
  parseSinaExtendedParts,
} from '../../normalize/quote.js'

/**
 * 新浪财经 — A 股行情、F10 公司资料、财务与数据中心公开接口。
 *
 * 页面入口：`finance.sina.com.cn/realstock/company/{symbol}/nc.shtml`
 * F10 资料：`vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/{code}.phtml`
 */
export class SinafinanceCnHandler extends MarketHandlerShell {

  private async sinaRealtime(code: string): Promise<StockRealtime | null> {
    const text = await fetchSinaStockQuote(code)
    const row = text.trim().split('\n').map(parseHqLine).filter(Boolean)[0]
    if (!row) return null
    return mapStockHqQuote(row, code)
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    const q = await this.sinaRealtime(code)
    return q ? [q] : null
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    if (!codes.length) return null
    const entries = codes.map(c => ({
      bare: bareCnSymbol(c),
      symbol: ensureCnSecSymbol(c),
    }))
    const out = new Map<string, StockRealtime>()
    let lastError: SinafinanceHttpError | undefined

    try {
      const pairs = entries.map(e => ({ code: e.bare, symbol: e.symbol }))
      const sinaRows = await fetchSinaQuotesBySymbols(pairs.map(p => p.symbol))
      const byKey = new Map(sinaRows.map(r => [r!.key, r!]))
      for (const pair of pairs) {
        const row = byKey.get(pair.symbol)
        if (!row) continue
        const quote = mapStockHqQuote(row, pair.code)
        if (quote) out.set(quote.code, quote)
      }
    } catch (e) {
      if (isSinafinanceHttpError(e)) lastError = e
      else throw e
    }

    const results = entries.map(e => out.get(e.bare)).filter(Boolean) as StockRealtime[]
    if (!results.length && lastError) throw lastError
    return results.length ? results : null
  }

  async indexRealtime(code: string): Promise<IndexRealtime[] | null> {
    const quote = await trySinafinanceSources([
      async () => {
        const text = await fetchSinaIndexQuote(code)
        const row = text.trim().split('\n').map(parseHqLine).filter(Boolean)[0]
        return row ? mapIndexHqQuote(row, code) : null
      },
    ])
    return quote ? [quote] : null
  }

  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count = 320,
  ): Promise<StockKline[] | null> {
    if (!SINA_KLINE_SCALE[period]) return null
    const raw = await fetchSinaKlineRows(code, Math.min(count || 1023, 1023), period)
    const mapped = mapSinaKlineRows(raw, code)
    if (!mapped?.length) return null
    const filtered = filterKlineByRange(mapped, start, end)
    return filtered.length ? filtered : mapped
  }

  async indexKline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count = 320,
  ): Promise<IndexKline[] | null> {
    const rows = await this.kline(code, period, start, end, count)
    return rows as IndexKline[] | null
  }

  async stockList(market = 'all'): Promise<StockListItem[] | null> {
    return fetchSinaStockList(market)
  }

  async marketBreadth(date = ''): Promise<Record<string, unknown>[] | null> {
    return fetchSinaMarketBreadth(date)
  }

  async globalIndex(code = ''): Promise<Record<string, unknown>[] | null> {
    const keys = code ? [code.trim().toLowerCase()] : Object.keys(SINA_GLOBAL_INDEX)
    const results: Record<string, unknown>[] = []
    let lastError: SinafinanceHttpError | undefined

    try {
      const symbols = keys.map(k => SINA_GLOBAL_INDEX[k]).filter(Boolean)
      if (symbols.length) {
        const text = await fetchSinaHqList(symbols)
        const parsed = text.trim().split('\n').map(parseHqLine).filter(Boolean)
        for (const key of keys) {
          const sym = SINA_GLOBAL_INDEX[key]
          if (!sym) continue
          const row = parsed.find(r => r?.key === sym)
          if (!row) continue
          const mapped = mapGlobalIndexHqQuote(row, key)
          if (mapped) results.push({ ...mapped, source: SINA_SOURCE })
        }
      }
    } catch (e) {
      if (isSinafinanceHttpError(e)) lastError = e
      else throw e
    }

    if (!results.length && lastError) throw lastError
    return results.length ? results : null
  }

  async exchangeRate(_pair = ''): Promise<Record<string, unknown>[] | null> {
    return null
  }

  async news(
    code: string,
    page = 1,
    pageSize = 20,
    newsType = 'all',
  ): Promise<NewsItem[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const channel = resolveSinaNewsChannel(newsType)
    const n = Math.max(1, Math.min(pageSize, 50))

    if (channel === 'notice') {
      const data = await fetchSinaNoticeList({ code: bare, pageSize: n })
      const items = mapSinaNoticeRows(bare, data.result?.data ?? [])
      return items.length ? items : null
    }
    const data = await fetchSinaStockNews({ code: bare, page, pageSize: n })
    const items = mapSinaStockNewsRows(bare, data.result?.data ?? [])
    return items.length ? items : null
  }

  async profile(code: string): Promise<StockProfile[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const [corpProfile, extLine, jsvar] = await Promise.all([
      fetchSinaCorpProfile(bare),
      fetchSinaExtendedQuoteLine(bare),
      fetchSinaJsVar(bare).catch(() => ''),
    ])
    const extProfile = mapSinaExtendedProfile(
      bare,
      parseSinaExtendedParts(extLine),
      jsvar,
    )
    const merged: StockProfile = {
      ...(extProfile ?? { code: bare }),
      ...(corpProfile ?? {}),
      code: bare,
      name: corpProfile?.name ?? extProfile?.name,
      industry: corpProfile?.industry ?? extProfile?.industry,
      concepts: corpProfile?.concepts?.length
        ? corpProfile.concepts
        : extProfile?.concepts,
      totalMarketCap: extProfile?.totalMarketCap ?? corpProfile?.totalMarketCap,
    }
    return [merged]
  }

  async shareholders(code: string, _reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaAllShareholders(bare)
    return rows
  }

  async dividend(code: string): Promise<Dividend[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaDividendList(bare)
    return rows.length ? rows : null
  }

  async financials(
    code: string,
    _reportDate = '',
    _reportType = 'annual',
  ): Promise<FinancialSummary[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaFinancialSummary(bare)
    return rows.length ? rows : null
  }

  async dragonTiger(date = ''): Promise<DragonTiger[] | null> {
    const tradeDate = date || new Date().toISOString().slice(0, 10)
    const rows = await fetchSinaDragonTigerByDate(tradeDate)
    return rows.length ? rows : null
  }

  async blockTrade(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaBlockTradeList(bare)
    return rows.length ? rows : null
  }

  /** 限售解禁 — 数据中心 `kind/xsjj` */
  async lockupExpiry(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaShareUnlockList(bare)
    return rows.length ? rows : null
  }

  /** 融资融券快照 — 全市场页按代码筛选 */
  async marginTrade(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaMarginTradingSnapshot(bare)
    return rows.length ? rows : null
  }

  /** 业绩预告 — F10 `vFD_AchievementNotice` */
  async perfForecast(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaPerfForecastList(bare)
    return rows.length ? (rows as unknown as Record<string, unknown>[]) : null
  }

  /** 利润表透视 — `vFD_ProfitStatement` */
  async incomeStatement(code: string, _reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaIncomeStatement(bare)
    return rows.length ? rows : null
  }

  /** 资产负债表透视 — `vFD_BalanceSheet` */
  async balanceSheet(code: string, _reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaBalanceSheet(bare)
    return rows.length ? rows : null
  }

  /** 现金流量表透视 — `vFD_CashFlow` */
  async cashFlow(code: string, _reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaCashFlowStatement(bare)
    return rows.length ? rows : null
  }

  async sectorList(plateType = 'all'): Promise<Record<string, unknown>[] | null> {
    const stockMatch = plateType.trim().match(/^stock:(\d{6})$/i)
    if (stockMatch?.[1]) {
      const rows = await fetchSinaConceptPlatesFromCode(stockMatch[1])
      return rows.length ? rows : null
    }
    const nodeMatch = plateType.trim().match(/^node:(.+)$/i)
    if (nodeMatch?.[1]) {
      const stocks = await fetchSinaBoardStocks(nodeMatch[1], 1, 50)
      if (!stocks?.length) return null
      return stocks.map(s => ({
        code: s.code,
        name: s.name,
        market: s.market,
        node: nodeMatch[1],
        source: SINA_SOURCE,
      }))
    }
    const list = await fetchSinaStockList(plateType)
    return list?.length
      ? list.map(s => ({ ...s, source: SINA_SOURCE }))
      : null
  }

  async peerCompanies(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaRelatedSecurities(bare)
    return rows.length ? rows : null
  }

  async moneyFlow(code: string, _days = 1): Promise<MoneyFlow[] | null> {
    const bare = bareCnSymbol(code)
    if (!bare) return null
    const snap = await fetchSinaMoneyFlow(bare)
    const row = mapSinaMoneyFlow(bare, snap)
    return row ? [row] : null
  }

  async intradayTick(code: string, _date = ''): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const { rows } = await fetchSinaTransList(bare, 30)
    const mapped = mapSinaTransRows(bare, rows)
    return mapped.length ? mapped : null
  }

  async fetchIntradaySessions(
    code: string,
    _ndays = 1,
    _market?: StockMarket,
  ): Promise<IntradayTrendFetchResult | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const env = await fetchSinaMinline(bare)
    const ticks = mapSinaMinlineTicks(bare, env.result?.data ?? [])
    if (!ticks.length) return null
    const sessionDate = cnTodayString()
    const bars = ticks.map(t => {
      const clock = String(t.time ?? '').trim().slice(0, 5)
      return {
        time: `${sessionDate} ${clock}:00`,
        price: t.price as number,
        volume: (t.volume as number) ?? 0,
        amount: 0,
        avgPrice: (t.avgPrice as number) ?? (t.price as number),
      }
    })
    return {
      sessions: [{ sessionDate, preClose: null, bars }],
      apiPreClose: null,
    }
  }

  async minuteTrendKline(
    code: string,
    _ndays = 1,
    count = 0,
  ): Promise<StockKline[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const env = await fetchSinaMinline(bare)
    const ticks = mapSinaMinlineTicks(bare, env.result?.data ?? [])
    if (!ticks.length) return null
    const sessionDate = cnTodayString()
    let rows: StockKline[] = ticks.map(t => {
      const timeText = String(t.time ?? '').trim()
      const clock = timeText.length >= 5 ? timeText.slice(0, 5) : timeText
      return {
        code: bare,
        date: `${sessionDate} ${clock}:00`,
        open: t.price as number,
        close: t.price as number,
        high: t.price as number,
        low: t.price as number,
        volume: (t.volume as number) ?? 0,
        amount: 0,
        changePct: null,
        turnoverRate: null,
      }
    })
    if (count > 0 && rows.length > count) rows = rows.slice(-count)
    return rows
  }
}
