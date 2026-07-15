import { safeFloat } from '../../../utils/helpers.js'
import type { EmInstOrgKey } from '../api/zlsj.js'

const OVERVIEW_ORDER = ['机构汇总', '基金', 'QFII', '社保', '保险', '券商', '信托', '其他']

function ymd(raw: unknown): string {
  return String(raw ?? '').slice(0, 10)
}

export function mapInstHoldReportDates(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(r => ({
    date: ymd(r.REPORT_DATE),
    name: String(r.REPORT_DATE_NAME ?? ''),
    isFundShow: String(r.IS_FUND_SHOW ?? '') === '1',
    isComplete: String(r.IS_COMPLETE ?? '') === '1',
    source: 'eastmoney',
  })).filter(r => r.date)
}

/** 一览：按页面 jgArr 顺序补齐空类型 */
export function mapInstHoldOverviewRows(
  code: string,
  reportDate: string,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const byName = new Map(rows.map(r => [String(r.ORG_TYPE_NAME ?? ''), r]))
  return OVERVIEW_ORDER.map(name => {
    const r = byName.get(name)
    return {
      code,
      reportDate,
      orgType: name,
      holderCount: r != null ? safeFloat(r.HOULD_NUM) : 0,
      totalShares: r != null ? safeFloat(r.TOTAL_SHARES) : 0,
      holdValue: r != null ? safeFloat(r.HOLD_VALUE) : 0,
      totalSharesRatio: r != null ? safeFloat(r.TOTALSHARES_RATIO) : 0,
      freeSharesRatio: r != null ? safeFloat(r.FREESHARES_RATIO) : 0,
      source: 'eastmoney',
    }
  })
}

export function mapInstHoldDetailRows(
  code: string,
  reportDate: string,
  orgKey: EmInstOrgKey,
  orgName: string,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((r, i) => ({
    code,
    reportDate,
    orgKey,
    orgType: String(r.ORG_TYPE ?? orgName),
    orgTypeCode: r.ORG_TYPE_CODE != null ? String(r.ORG_TYPE_CODE) : null,
    holderCode: r.HOLDER_CODE != null ? String(r.HOLDER_CODE) : null,
    holderName: String(r.HOLDER_NAME ?? ''),
    parentOrgName: r.PARENT_ORG_NAME != null ? String(r.PARENT_ORG_NAME) : null,
    parentOrgCode: r.PARENT_ORGCODE_OLD != null ? String(r.PARENT_ORGCODE_OLD) : null,
    totalShares: safeFloat(r.TOTAL_SHARES),
    holdMarketCap: safeFloat(r.HOLD_MARKET_CAP),
    totalSharesRatio: safeFloat(r.TOTAL_SHARES_RATIO),
    freeSharesRatio: safeFloat(r.FREE_SHARES_RATIO),
    netAssetRatio: r.NETASSET_RATIO != null ? safeFloat(r.NETASSET_RATIO) : null,
    rank: i + 1,
    source: 'eastmoney',
  }))
}

/** 标准 INST_HOLDING：一览行 + 当前季标识 */
export function mapInstHoldingCapability(
  code: string,
  reportDate: string,
  overview: Record<string, unknown>[],
): Record<string, unknown>[] {
  return overview.map(row => ({
    ...row,
    indicator: '机构持仓',
    pageUrl: `https://data.eastmoney.com/zlsj/detail/${code}.html`,
  }))
}
