import { normalizeCode } from '../../../../utils/helpers.js'
import type { SinafinanceCnHandler } from './handler.js'
import {
  fetchSinaConceptPlatesFromCode,
  fetchSinaCorpFullBundle,
  fetchSinaExecutives,
  fetchSinaFundHoldings,
  fetchSinaIndexMembership,
  fetchSinaMajorShareholders,
  fetchSinaRelatedSecurities,
} from '../../api/corp-service.js'
import {
  fetchSinaAnnualBulletins,
  fetchSinaAddStockHistory,
  fetchSinaAllBulletinPage,
  fetchSinaBulletinDetail,
  fetchSinaBulletins,
  fetchSinaCirculateShareholders,
  fetchSinaCorpRule,
  fetchSinaDividendList,
  fetchSinaDragonTigerForStock,
  fetchSinaFinancialPivotRaw,
  fetchSinaInsiderTrades,
  fetchSinaIpoInfo,
  fetchSinaLargeOrderTraces,
  fetchSinaMarginTradingSnapshot,
  fetchSinaPerfForecastList,
  fetchSinaPriceHistory,
  fetchSinaPriceStats,
  fetchSinaShareUnlockList,
  fetchSinaStockComment,
  fetchSinaStockStructureHistory,
} from '../../api/ext-service.js'

type Handler = SinafinanceCnHandler & Record<string, unknown>

/** 为 sinafinance 挂载新浪 F10 扩展自定义方法 */
export function mixSinafinanceExt(Driver: { prototype: SinafinanceCnHandler }) {
  const p = Driver.prototype as Handler

  p.sinaCorpInfo = async function sinaCorpInfo(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaCorpFullBundle(bare)
  }

  p.sinaExecutives = async function sinaExecutives(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaExecutives(bare)
    return rows.length ? rows : null
  }

  p.sinaMajorShareholders = async function sinaMajorShareholders(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaMajorShareholders(bare)
    return rows.length ? rows : null
  }

  p.sinaCirculateShareholders = async function sinaCirculateShareholders(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaCirculateShareholders(bare)
    return rows.length ? rows : null
  }

  p.sinaFundHoldings = async function sinaFundHoldings(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaFundHoldings(bare)
    return rows.length ? rows : null
  }

  p.sinaConceptPlates = async function sinaConceptPlates(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaConceptPlatesFromCode(bare)
    return rows.length ? rows : null
  }

  p.sinaRelatedSecurities = async function sinaRelatedSecurities(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaRelatedSecurities(bare)
    return rows.length ? rows : null
  }

  p.sinaIndexMembership = async function sinaIndexMembership(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaIndexMembership(bare)
    return rows.length ? rows : null
  }

  p.sinaDividends = async function sinaDividends(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaDividendList(bare)
    return rows.length ? rows : null
  }

  p.sinaFinancialPivot = async function sinaFinancialPivot(
    code: string,
    sheet: 'guide' | 'profit' | 'balance' | 'cashflow' | 'dupont' = 'guide',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFinancialPivotRaw(bare, sheet)
  }

  p.sinaStockStructure = async function sinaStockStructure(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaStockStructureHistory(bare)
    return rows.length ? rows : null
  }

  p.sinaCorpRule = async function sinaCorpRule(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaCorpRule(bare)
  }

  p.sinaAnnualBulletins = async function sinaAnnualBulletins(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaAnnualBulletins(bare)
    return rows.length ? rows : null
  }

  p.sinaBulletins = async function sinaBulletins(
    code: string,
    pageType: 'ndbg' | 'zqbg' | 'yjdbg' | 'sjdbg' = 'ndbg',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaBulletins(bare, pageType)
    return rows.length ? rows : null
  }

  p.sinaAllBulletins = async function sinaAllBulletins(code: string, page = 1) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const result = await fetchSinaAllBulletinPage(bare, page)
    return result.items.length ? result : null
  }

  p.sinaBulletinDetail = async function sinaBulletinDetail(code: string, bulletinId: string) {
    const bare = normalizeCode(code)
    if (!bare || !bulletinId) return null
    return fetchSinaBulletinDetail(bare, bulletinId)
  }

  p.sinaInsiderTrades = async function sinaInsiderTrades(
    code: string,
    bdate = '',
    edate = '',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaInsiderTrades(bare, bdate, edate)
    return rows.length ? rows : null
  }

  p.sinaStockComment = async function sinaStockComment(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaStockComment(bare)
  }

  p.sinaPriceHistory = async function sinaPriceHistory(
    code: string,
    startDate = '',
    endDate = '',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const result = await fetchSinaPriceHistory(bare, startDate, endDate)
    return result.levels.length ? result : null
  }

  p.sinaIpoInfo = async function sinaIpoInfo(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaIpoInfo(bare)
  }

  p.sinaAddStockHistory = async function sinaAddStockHistory(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaAddStockHistory(bare)
    return rows.length ? rows : null
  }

  p.sinaShareUnlock = async function sinaShareUnlock(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaShareUnlockList(bare)
    return rows.length ? rows : null
  }

  p.sinaMarginTrading = async function sinaMarginTrading(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaMarginTradingSnapshot(bare)
    return rows.length ? rows : null
  }

  p.sinaDragonTigerStock = async function sinaDragonTigerStock(code: string, date = '') {
    const bare = normalizeCode(code)
    if (!bare) return null
    const tradeDate = date || new Date().toISOString().slice(0, 10)
    const rows = await fetchSinaDragonTigerForStock(bare, tradeDate)
    return rows.length ? rows : null
  }

  p.sinaPriceDistribution = async function sinaPriceDistribution(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaPriceStats(bare)
    return rows.length ? rows : null
  }

  p.sinaLargeOrders = async function sinaLargeOrders(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaLargeOrderTraces(bare)
    return rows.length ? rows : null
  }

  p.sinaPerfForecast = async function sinaPerfForecast(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaPerfForecastList(bare)
    return rows.length ? rows : null
  }
}
