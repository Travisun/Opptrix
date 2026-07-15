import type { MarketMoneyFlow, MoneyFlow, SectorMoneyFlow } from '../../../../core/schema.js'
import { bareCnSymbol, resolveSecId } from '../../../../utils/helpers.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import {
  emClist,
  emMarginMarketByExchange,
  emMarginMarketTotal,
  emMarginStockHistory as fetchEmMarginStockHistory,
  emMarketFflowHistory,
  emMutualDealStats,
  emStockMoneyFlowHistory,
  emUlistMoneyFlow,
  resolveBoardFs,
  resolveFlowStatFid,
  resolveStockRankFs,
} from '../../api/client.js'
import {
  EM_MACRO_CN,
  EM_MACRO_FOREIGN,
  EM_MACRO_INDUSTRY,
  emFetchMacroCn,
  emFetchMacroForeign,
  emFetchMacroIndustry,
  emFetchMacroOil,
  type EmOilKind,
} from '../../api/macro.js'
import {
  EM_INST_ORG_TYPES,
  emFetchInstHoldDetail,
  emFetchInstHoldOverview,
  emFetchInstHoldReportDates,
} from '../../api/zlsj.js'
import {
  mapMarginMarketExchangeRows,
  mapMarginMarketTotalRows,
  mapMarginStockRows,
} from '../../normalize/margin.js'
import {
  mapMacroCnFriendly,
  mapMacroForeignRows,
  mapMacroIndustryRows,
  mapMacroOilRows,
} from '../../normalize/macro.js'
import {
  mapInstHoldDetailRows,
  mapInstHoldOverviewRows,
  mapInstHoldReportDates,
  mapInstHoldingCapability,
} from '../../normalize/zlsj.js'
import {
  mapClistSectorRows,
  mapClistStockMoneyFlowRows,
  mapFflowKlines,
  mapMutualDealToMarketMoneyFlow,
  mapUlistToMarketMoneyFlow,
  mapUlistToMoneyFlow,
} from '../../normalize/money-flow.js'

/**
 * 东方财富 — 资金流 / 两融 / 宏观 / 机构持仓（zlsj）。
 *
 * 页面入口：
 * - https://data.eastmoney.com/zjlx/dpzjlx.html
 * - https://data.eastmoney.com/bkzj/
 * - https://data.eastmoney.com/rzrq/total.html
 * - https://data.eastmoney.com/cjsj/ppi.html
 * - https://data.eastmoney.com/zlsj/detail/{code}.html
 */
export class EastmoneyCnHandler extends MarketHandlerShell {
  /** 个股资金流日序列 — Capability `STOCK_MONEY_FLOW` */
  async moneyFlow(code: string, days = 30): Promise<MoneyFlow[] | null> {
    const bare = bareCnSymbol(code)
    if (!bare) return null
    const limit = Math.min(Math.max(Number(days) || 30, 1), 120)
    const histP = Promise.race([
      emStockMoneyFlowHistory(bare, limit)
        .then(r => mapFflowKlines(bare, r.klines))
        .catch(() => [] as MoneyFlow[]),
      new Promise<MoneyFlow[]>(resolve => {
        setTimeout(() => resolve([]), 2800)
      }),
    ])
    const snapP = emUlistMoneyFlow([resolveSecId(bare)])
      .then(rows => mapUlistToMoneyFlow(bare, rows[0]))
      .catch(() => null)
    const [rows, snap] = await Promise.all([histP, snapP])
    if (rows.length) return rows
    return snap ? [snap] : null
  }

  /**
   * 板块资金流排名 — Capability `SECTOR_MONEY_FLOW`
   * @param sectorType industry|concept|region|hy|gn|dy
   */
  async sectorMoneyFlow(sectorType = 'industry'): Promise<SectorMoneyFlow[] | null> {
    try {
      const fs = resolveBoardFs(sectorType)
      for (const fid of ['f62', 'f164'] as const) {
        const rows = await emClist({ fs, fid, pz: 50 })
        const mapped = mapClistSectorRows(rows, sectorType, fid)
        if (mapped.some(r => r.netAmount != null)) return mapped
        if (mapped.length && fid === 'f164') return mapped
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * 大盘资金流 — Capability `MARKET_MONEY_FLOW`
   * @param direction market=沪深主力；north/south=沪深港通
   */
  async marketMoneyFlow(direction = 'market'): Promise<MarketMoneyFlow[] | null> {
    const dir = String(direction ?? 'market').toLowerCase()
    try {
      if (/north|south|北|南|hsgt|northbound|southbound/.test(dir)) {
        const raw = await emMutualDealStats(1, 60)
        const mapped = mapMutualDealToMarketMoneyFlow(dir, raw)
        return mapped.length ? mapped : null
      }
      const snap = await emUlistMoneyFlow(['1.000001', '0.399001'])
      const fromUlist = mapUlistToMarketMoneyFlow(dir || 'market', snap)
      if (fromUlist.length) return fromUlist

      const [sh, sz] = await Promise.all([
        emMarketFflowHistory('000001', 5),
        emMarketFflowHistory('399001', 5),
      ])
      const shRows = mapFflowKlines('000001', sh.klines)
      const szRows = mapFflowKlines('399001', sz.klines)
      const shLast = shRows[shRows.length - 1]
      const szLast = szRows[szRows.length - 1]
      if (!shLast && !szLast) return null
      const date = shLast?.date ?? szLast?.date ?? ''
      const shNet = shLast?.mainNet ?? null
      const szNet = szLast?.mainNet ?? null
      return [{
        direction: dir || 'market',
        date,
        netAmount: (shNet ?? 0) + (szNet ?? 0),
        shNet,
        szNet,
      }]
    } catch {
      return null
    }
  }

  /** 个股两融最近明细 — Capability `MARGIN_TRADE` */
  async marginTrade(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = bareCnSymbol(code)
    if (!bare) return null
    try {
      const rows = mapMarginStockRows(await fetchEmMarginStockHistory(bare, 1, 30))
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /**
   * 个股机构持仓一览 — Capability `INST_HOLDING`
   * @pageUrl https://data.eastmoney.com/zlsj/detail/002851.html
   */
  async instHolding(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = bareCnSymbol(code)
    if (!bare) return null
    try {
      const { reportDate, rows } = await emFetchInstHoldOverview(bare)
      if (!rows.length) return null
      const mapped = mapInstHoldingCapability(
        bare,
        reportDate,
        mapInstHoldOverviewRows(bare, reportDate, rows),
      )
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  // ── 自定义方法：主力排名 / 板块监控 / 两融历史 ──

  /**
   * 个股主力净流入排名（可按市场板块过滤）
   * @pageUrl https://data.eastmoney.com/zjlx/list.html
   */
  async emStockMoneyFlowRank(
    market = 'hsa',
    page = 1,
    pageSize = 50,
    stat = '1',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const fs = resolveStockRankFs(market)
      const fid = resolveFlowStatFid(stat)
      const rows = await emClist({
        fs,
        fid,
        pn: Math.max(Number(page) || 1, 1),
        pz: Math.min(Math.max(Number(pageSize) || 50, 1), 100),
      })
      const mapped = mapClistStockMoneyFlowRows(rows, fid)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 板块资金流监控（今日 / 5 日 / 10 日净流入排序）
   * @pageUrl https://data.eastmoney.com/bkzj/jlr.html
   */
  async emSectorMoneyFlowMonitor(
    sectorType = 'industry',
    stat = '1',
    pageSize = 50,
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const fs = resolveBoardFs(sectorType)
      const fid = resolveFlowStatFid(stat)
      const rows = await emClist({ fs, fid, pz: Math.min(Math.max(Number(pageSize) || 50, 1), 100) })
      const mapped = mapClistStockMoneyFlowRows(rows, fid).map(row => ({
        ...row,
        sectorCode: row.code,
        sectorName: row.name,
        sectorType,
        sortFid: fid,
      }))
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 板块资金流（行业 / 概念 / 地域）
   * @pageUrl https://data.eastmoney.com/bkzj/gn.html
   */
  async emBoardMoneyFlow(
    boardType = 'concept',
    pageSize = 50,
  ): Promise<Record<string, unknown>[] | null> {
    return this.emSectorMoneyFlowMonitor(boardType, '1', pageSize)
  }

  /** 大盘资金流日历史（上证 / 深成） */
  async emMarketMoneyFlowHistory(
    indexCode = '000001',
    limit = 30,
  ): Promise<MoneyFlow[] | null> {
    try {
      const { klines } = await emMarketFflowHistory(String(indexCode || '000001'), Number(limit) || 30)
      const rows = mapFflowKlines(String(indexCode || '000001'), klines)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /** 沪深京两融合计历史 */
  async emMarginMarketTotal(page = 1, pageSize = 50): Promise<Record<string, unknown>[] | null> {
    try {
      const rows = mapMarginMarketTotalRows(
        await emMarginMarketTotal(Number(page) || 1, Number(pageSize) || 50),
      )
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /** 分市场两融历史 market=sh|sz|bj */
  async emMarginMarketExchange(
    market = 'sh',
    page = 1,
    pageSize = 50,
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const rows = mapMarginMarketExchangeRows(
        await emMarginMarketByExchange(market, Number(page) || 1, Number(pageSize) || 50),
      )
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /** 个股两融分页历史 */
  async emMarginStockHistory(
    code: string,
    page = 1,
    pageSize = 50,
  ): Promise<Record<string, unknown>[] | null> {
    const bare = bareCnSymbol(code)
    if (!bare) return null
    try {
      const rows = mapMarginStockRows(
        await fetchEmMarginStockHistory(bare, Number(page) || 1, Number(pageSize) || 50),
      )
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  // ── 宏观数据中心（cjsj）──

  /**
   * 标准 Capability.MACRO_INDICATOR — 中国宏观序列。
   * @param indicator cpi|ppi|gdp|pmi|lpr|m2|社零…（空则返回核心指标各最新 3 条）
   * @pageUrl https://data.eastmoney.com/cjsj/ppi.html
   */
  async macroIndicator(indicator = ''): Promise<Record<string, unknown>[] | null> {
    const want = indicator.trim()
    const limit = 60
    try {
      if (want) {
        const got = await emFetchMacroCn(want, 1, limit)
        if (!got?.rows.length) return null
        const mapped = mapMacroCnFriendly(got.def, got.rows)
        return mapped.length ? mapped : null
      }
      const core = ['cpi', 'ppi', 'pmi', 'gdp', 'lpr']
      const out: Record<string, unknown>[] = []
      for (const key of core) {
        const got = await emFetchMacroCn(key, 1, 3)
        if (!got?.rows.length) continue
        out.push(...mapMacroCnFriendly(got.def, got.rows).slice(0, 3))
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }

  /**
   * 宏观指标目录（中国 / 国外 / 行业指数）
   * @pageUrl https://data.eastmoney.com/cjsj/ppi.html
   */
  async emMacroList(scope = 'all'): Promise<Record<string, unknown>[] | null> {
    const s = String(scope || 'all').toLowerCase()
    const rows: Record<string, unknown>[] = []
    if (s === 'all' || s === 'cn' || s === 'china') {
      for (const d of EM_MACRO_CN) {
        rows.push({
          scope: 'cn',
          key: d.key,
          name: d.name,
          reportName: d.reportName,
          pageUrl: d.pageUrl,
          aliases: d.aliases,
        })
      }
      rows.push(
        { scope: 'cn', key: 'oil_adjust', name: '成品油调价', pageUrl: 'https://data.eastmoney.com/cjsj/oil_world.html' },
        { scope: 'cn', key: 'oil_province', name: '各省油价', pageUrl: 'https://data.eastmoney.com/cjsj/oil_world.html' },
        { scope: 'cn', key: 'oil_quote', name: '原油行情', pageUrl: 'https://data.eastmoney.com/cjsj/oil_world.html' },
      )
    }
    if (s === 'all' || s === 'foreign' || s === 'global') {
      for (const d of EM_MACRO_FOREIGN) {
        rows.push({
          scope: 'foreign',
          key: d.key,
          name: d.name,
          indicatorId: d.indicatorId,
          country: d.country,
          unit: d.unit,
          mkt: d.mkt,
        })
      }
    }
    if (s === 'all' || s === 'industry' || s === 'hyzs') {
      for (const d of EM_MACRO_INDUSTRY) {
        rows.push({
          scope: 'industry',
          key: d.key,
          name: d.name,
          indicatorId: d.indicatorId,
        })
      }
    }
    return rows.length ? rows : null
  }

  /**
   * 中国宏观单指标序列（全量目录 key，不限 macroIndicator 常用项）
   * @pageUrl https://data.eastmoney.com/cjsj/cpi.html
   */
  async emMacro(
    indicator: string,
    page = 1,
    pageSize = 60,
  ): Promise<Record<string, unknown>[] | null> {
    if (!String(indicator || '').trim()) return null
    try {
      const got = await emFetchMacroCn(indicator, Number(page) || 1, Number(pageSize) || 60)
      if (!got?.rows.length) return null
      const mapped = mapMacroCnFriendly(got.def, got.rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 国外宏观（foreign_X_Y / INDICATOR_ID / 指标名）
   * @pageUrl https://data.eastmoney.com/cjsj/foreign_0_0.html
   */
  async emMacroForeign(
    keyOrIdOrName: string,
    page = 1,
    pageSize = 60,
  ): Promise<Record<string, unknown>[] | null> {
    if (!String(keyOrIdOrName || '').trim()) return null
    try {
      const got = await emFetchMacroForeign(keyOrIdOrName, Number(page) || 1, Number(pageSize) || 60)
      if (!got?.rows.length) return null
      const mapped = mapMacroForeignRows(got.item, got.rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 行业指数（hyzs_list_EMI… / EMI 码 / 指数名）
   * @pageUrl https://data.eastmoney.com/cjsj/hyzs_list.html
   */
  async emMacroIndustryIndex(
    keyOrIdOrName: string,
    page = 1,
    pageSize = 60,
  ): Promise<Record<string, unknown>[] | null> {
    if (!String(keyOrIdOrName || '').trim()) return null
    try {
      const got = await emFetchMacroIndustry(keyOrIdOrName, Number(page) || 1, Number(pageSize) || 60)
      if (!got?.rows.length) return null
      const mapped = mapMacroIndustryRows(got.item, got.rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 油价：调价 / 各省 / 原油行情
   * @pageUrl https://data.eastmoney.com/cjsj/oil_world.html
   */
  async emMacroOil(
    kind: EmOilKind | string = 'adjust',
    page = 1,
    pageSize = 60,
  ): Promise<Record<string, unknown>[] | null> {
    const k = String(kind || 'adjust').toLowerCase()
    const oilKind: EmOilKind =
      k === 'province' || k === '各省' ? 'province'
        : k === 'quote' || k === '原油' ? 'quote'
          : 'adjust'
    try {
      const rows = await emFetchMacroOil(oilKind, Number(page) || 1, Number(pageSize) || 60)
      const mapped = mapMacroOilRows(oilKind, rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  // ── 主力数据 · 机构持仓（zlsj/detail）──

  /** 机构持仓可用季报日期 */
  async emInstHoldReportDates(limit = 25): Promise<Record<string, unknown>[] | null> {
    try {
      const mapped = mapInstHoldReportDates(await emFetchInstHoldReportDates(Number(limit) || 25))
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 季报机构持仓一览（基金/QFII/社保/保险/券商/信托/其他/汇总）
   * @pageUrl https://data.eastmoney.com/zlsj/detail/002851.html
   */
  async emInstHoldOverview(
    code: string,
    reportDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    const bare = bareCnSymbol(code)
    if (!bare) return null
    try {
      const { reportDate: date, rows } = await emFetchInstHoldOverview(bare, reportDate || undefined)
      if (!rows.length) return null
      return mapInstHoldOverviewRows(bare, date, rows)
    } catch {
      return null
    }
  }

  /**
   * 分类型机构持仓明细（Tab：fund/qfii/social/broker/insurance/trust/all）
   * @pageUrl https://data.eastmoney.com/zlsj/detail/002851.html
   */
  async emInstHoldDetail(
    code: string,
    orgType: string = 'fund',
    reportDate = '',
    page = 1,
    pageSize = 30,
  ): Promise<Record<string, unknown>[] | null> {
    const bare = bareCnSymbol(code)
    if (!bare) return null
    try {
      const got = await emFetchInstHoldDetail(
        bare,
        orgType,
        reportDate || undefined,
        Number(page) || 1,
        Number(pageSize) || 30,
      )
      const mapped = mapInstHoldDetailRows(bare, got.reportDate, got.orgKey, got.orgName, got.rows)
      const meta = {
        pages: got.pages,
        pageUrl: got.pageUrl,
        orgTypes: EM_INST_ORG_TYPES.map(t => ({ key: t.key, shType: t.shType, name: t.name })),
      }
      if (!mapped.length) {
        return [{
          code: bare,
          reportDate: got.reportDate,
          orgKey: got.orgKey,
          orgType: got.orgName,
          empty: true,
          ...meta,
        }]
      }
      return mapped.map(row => ({ ...row, ...meta }))
    } catch {
      return null
    }
  }
}
