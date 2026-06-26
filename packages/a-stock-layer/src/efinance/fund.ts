import { FUND_HEADERS } from './config.js'
import type { EfRow } from './common.js'
import { num, normDate } from './utils.js'

async function fundGet(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params)
  const resp = await fetch(`https://fundmobapi.eastmoney.com/FundMNewApi/${path}?${qs}`, {
    headers: FUND_HEADERS,
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json() as Promise<Record<string, unknown>>
}

/** ef.fund — mirrors efinance.fund */
export const fund = {
  /** Historical NAV — ef.fund.get_quote_history */
  async getQuoteHistory(fundCode: string, pageSize = 40000): Promise<EfRow[]> {
    const json = await fundGet('FundMNHisNetList', {
      FCODE: fundCode, IsShareNet: 'true', MobileKey: '1', appType: 'ttjj',
      appVersion: '6.2.8', pageIndex: '1', pageSize: String(pageSize),
      plat: 'Iphone', product: 'EFund', version: '6.2.8',
    })
    const datas = (json?.Datas ?? json?.datas) as Record<string, string>[] | undefined
    if (!datas?.length) return []
    return datas.map(it => ({
      日期: normDate(it.FSRQ ?? ''),
      单位净值: num(it.DWJZ),
      累计净值: num(it.LJJZ),
      涨跌幅: num(it.JZZZL) ?? it.JZZZL ?? null,
    }))
  },

  /** Realtime estimated change — ef.fund.get_realtime_increase_rate */
  async getRealtimeIncreaseRate(fundCodes: string | string[]): Promise<EfRow[]> {
    const codes = Array.isArray(fundCodes) ? fundCodes : [fundCodes]
    const json = await fundGet('FundMNFInfo', {
      pageIndex: '1', pageSize: '300000', Fcodes: codes.join(','),
      P: 'F', plat: 'Iphone', product: 'EFund', version: '6.2.8',
    })
    const rows = (json?.Datas ?? json?.datas) as Record<string, unknown>[] | undefined
    if (!rows?.length) return []
    return rows.map(it => ({
      基金代码: String(it.FCODE ?? ''),
      基金名称: String(it.SHORTNAME ?? ''),
      最新净值: num(it.ACCNAV),
      最新净值公开日期: normDate(String(it.PDATE ?? '')),
      估算时间: String(it.GZTIME ?? ''),
      估算涨跌幅: num(it.GSZZL),
    }))
  },

  /** Fund profile — ef.fund.get_base_info */
  async getBaseInfo(fundCode: string): Promise<EfRow | null> {
    const json = await fundGet('FundMNNBasicInformation', {
      FCODE: fundCode, plat: 'Iphone', product: 'EFund', version: '6.3.8',
    })
    const items = json?.Datas as Record<string, unknown> | undefined
    if (!items) return null
    return {
      基金代码: String(items.FCODE ?? fundCode),
      基金简称: String(items.SHORTNAME ?? ''),
      成立日期: normDate(String(items.ESTABDATE ?? '')),
      涨跌幅: num(items.RZDF),
      最新净值: num(items.DWJZ),
      基金公司: String(items.JJGS ?? ''),
      净值更新日期: normDate(String(items.FSRQ ?? '')),
      简介: String(items.COMMENTS ?? '').replace(/\n/g, ' ').trim(),
    }
  },

  /** Holdings — ef.fund.get_invest_position */
  async getInvestPosition(fundCode: string, date?: string): Promise<EfRow[]> {
    const params: Record<string, string> = {
      FCODE: fundCode, appType: 'ttjj', plat: 'Iphone', product: 'EFund', version: '6.2.8',
    }
    if (date) params.DATE = date
    const json = await fundGet('FundMNInverstPosition', params)
    const stocks = (json?.fundStocks ?? (json as { data?: { fundStocks?: unknown[] } }).data?.fundStocks) as Record<string, unknown>[] | undefined
    if (!stocks?.length) return []
    const pubDate = String(json?.Expansion ?? date ?? '')
    return stocks.map(it => ({
      基金代码: fundCode,
      股票代码: String(it.GPDM ?? ''),
      股票简称: String(it.GPJC ?? ''),
      持仓占比: num(it.JZBL),
      较上期变化: num(it.PCTNVCHG),
      公开日期: normDate(pubDate),
    }))
  },

  /** Public holding dates — ef.fund.get_public_dates */
  async getPublicDates(fundCode: string): Promise<string[]> {
    const json = await fundGet('FundMNFPeriod', {
      FCODE: fundCode, plat: 'Iphone', product: 'EFund', version: '6.2.8',
    })
    const dates = (json?.Datas ?? json?.datas) as string[] | undefined
    return dates?.map(normDate) ?? []
  },

  /** Period performance — ef.fund.get_period_increase */
  async getPeriodIncrease(fundCode: string): Promise<EfRow[]> {
    const json = await fundGet('FundMNPeriodIncrease', {
      FCODE: fundCode, plat: 'Iphone', product: 'EFund', version: '6.3.8',
    })
    const rows = (json?.Datas ?? json?.datas) as Record<string, unknown>[] | undefined
    if (!rows?.length) return []
    return rows.map(it => ({
      基金代码: fundCode,
      周期: String(it.title ?? it.period ?? it.TITLE ?? ''),
      涨跌幅: num(it.syl ?? it.SYL ?? it.increase),
    }))
  },

  /** All holdings across dates — ef.fund.get_invest_position (all periods) */
  async getAllInvestPositions(fundCode: string): Promise<EfRow[]> {
    const dates = await fund.getPublicDates(fundCode)
    const results: EfRow[] = []
    for (const d of dates.slice(0, 8)) {
      const rows = await fund.getInvestPosition(fundCode, d)
      results.push(...rows)
    }
    return results
  },
}

export type FundModule = typeof fund
