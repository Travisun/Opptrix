import { bareCnSymbol, safeFloat } from '../../../utils/helpers.js'

function ymd(raw: unknown): string {
  return String(raw ?? '').slice(0, 10)
}

function num(raw: unknown): number | null {
  return safeFloat(raw)
}

/** 个股两融明细 → 标准 marginTrade 行 */
export function mapMarginStockRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => {
    const code = bareCnSymbol(String(row.SCODE ?? row.scode ?? ''))
    return {
      code,
      name: String(row.SECNAME ?? row.secname ?? ''),
      date: ymd(row.DATE ?? row.date),
      market: String(row.MARKET ?? ''),
      financingBalance: num(row.RZYE),
      financingBuy: num(row.RZMRE),
      financingRepay: num(row.RZCHE),
      financingNetBuy: num(row.RZJME),
      financingBalancePct: num(row.RZYEZB),
      securitiesBalance: num(row.RQYE),
      securitiesVolume: num(row.RQYL),
      securitiesSell: num(row.RQMCL),
      marginBalance: num(row.RZRQYE),
      circMarketCap: num(row.SZ),
      source: 'eastmoney_rzrq_ggmx',
    }
  }).filter(r => r.code)
}

/** 市场合计两融历史 */
export function mapMarginMarketTotalRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => ({
    date: ymd(row.DIM_DATE ?? row.date),
    indexClose: num(row.NEW),
    indexChangePct: num(row.ZDF),
    circMarketCap: num(row.LTSZ),
    financingBalance: num(row.RZYE),
    financingBalancePct: num(row.RZYEZB),
    financingBuy: num(row.RZMRE),
    financingRepay: num(row.RZCHE),
    financingNetBuy: num(row.RZJME),
    securitiesBalance: num(row.RQYE),
    securitiesVolume: num(row.RQYL),
    securitiesSell: num(row.RQMCL),
    source: 'eastmoney_rzrq_lshj',
  })).filter(r => r.date)
}

/** 分市场两融历史 */
export function mapMarginMarketExchangeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => ({
    date: ymd(row.DIM_DATE ?? row.date),
    marketCode: String(row.SCDM ?? ''),
    marketName: String(row.XOB_MARKET_0001 ?? ''),
    indexClose: num(row.NEW),
    indexChangePct: num(row.ZDF),
    circMarketCap: num(row.LTSZ),
    financingBalance: num(row.RZYE),
    financingBalancePct: num(row.RZYEZB),
    financingBuy: num(row.RZMRE),
    financingRepay: num(row.RZCHE),
    financingNetBuy: num(row.RZJME),
    securitiesBalance: num(row.RQYE),
    securitiesVolume: num(row.RQYL),
    securitiesSell: num(row.RQMCL),
    source: 'eastmoney_rzrq_lssh',
  })).filter(r => r.date)
}
