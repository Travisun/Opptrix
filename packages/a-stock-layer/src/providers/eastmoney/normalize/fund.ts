import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import type { StandardFundHoldingRow, StandardFundNavRow, StandardFundProfileRow, StandardFundQuoteRow } from '../../common/standard-fund.js'
import type {
  EmJjccHoldingRaw,
  EmJbgkFields,
  EmFundLsjzRow,
  EmPingzhongData,
} from '../api/fund.js'

const SOURCE = 'eastmoney_fund'

function parsePercentText(raw: unknown): number | null {
  const text = String(raw ?? '').replace('%', '').trim()
  if (!text || text === '---') return null
  return safeFloat(text)
}

function parseYiFromText(raw: unknown): number | null {
  const text = String(raw ?? '').trim()
  if (!text || text === '---') return null
  const n = safeFloat(text.replace(/[,，]/g, '').replace(/[^\d.-]/g, ''))
  if (n == null) return null
  if (text.includes('亿')) return n
  if (text.includes('万')) return n / 10000
  return n
}

function parseSharesYi(raw: unknown): number | null {
  const text = String(raw ?? '').trim()
  if (!text || text === '---') return null
  const n = safeFloat(text.replace(/[,，]/g, '').replace(/[^\d.-]/g, ''))
  if (n == null) return null
  if (text.includes('万')) return n / 10000
  if (text.includes('亿')) return n
  return n
}

export function mapEmJbgkToProfileFields(
  fields: EmJbgkFields,
): Partial<StandardFundProfileRow> {
  const establish = fields['成立日期/规模'] ?? fields['成立日期'] ?? ''
  const [establishDate, establishScale] = establish.split('/').map(s => s.trim())
  return {
    fullName: fields['基金全称'] ?? undefined,
    name: fields['基金简称'] ?? undefined,
    fundType: fields['基金类型'] ?? undefined,
    manager: fields['基金经理人'] ?? fields['基金经理'] ?? undefined,
    company: fields['基金管理人'] ?? undefined,
    custodian: fields['基金托管人'] ?? undefined,
    benchmark: fields['业绩比较基准'] ?? undefined,
    establishDate: establishDate?.slice(0, 10) || undefined,
    scale: parseYiFromText(fields['净资产规模'] ?? fields['资产规模']),
    totalShares: parseSharesYi(fields['份额规模'] ?? establishScale),
    expenseRatio: parsePercentText(fields['管理费率']),
  }
}

export function mapEmPingzhongToProfileExtras(
  ping: EmPingzhongData | null,
): Record<string, unknown> {
  if (!ping) return {}
  const extras: Record<string, unknown> = {
    trackingTarget: undefined,
    saleFeeRate: ping.fund_Rate || undefined,
    sourceSaleFeeRate: ping.fund_sourceRate || undefined,
    minPurchase: ping.fund_minsg || undefined,
  }
  if (ping.syl_1y) extras.return1m = safeFloat(ping.syl_1y)
  if (ping.syl_3y) extras.return3m = safeFloat(ping.syl_3y)
  if (ping.syl_6y) extras.return6m = safeFloat(ping.syl_6y)
  if (ping.syl_1n) extras.return1y = safeFloat(ping.syl_1n)
  if (ping.Data_assetAllocation) extras.assetAllocation = ping.Data_assetAllocation
  if (ping.Data_currentFundManager) extras.managers = ping.Data_currentFundManager
  if (ping.Data_performanceEvaluation) extras.performanceEvaluation = ping.Data_performanceEvaluation
  if (ping.Data_holderStructure) extras.holderStructure = ping.Data_holderStructure
  if (ping.Data_fluctuationScale) extras.fluctuationScale = ping.Data_fluctuationScale
  if (ping.Data_fundSharesPositions) extras.fundSharesPositions = ping.Data_fundSharesPositions
  if (ping.Data_netWorthTrend) extras.netWorthTrend = ping.Data_netWorthTrend
  if (ping.swithSameType) extras.sameTypeFunds = ping.swithSameType
  return extras
}

export function mapEmToFundProfileRow(
  code: string,
  jbgk: { fields: EmJbgkFields; sections: Record<string, string> } | null,
  ping: EmPingzhongData | null,
  latestNav?: EmFundLsjzRow | null,
): StandardFundProfileRow | null {
  const bare = normalizeCode(code)
  if (!bare) return null
  const base = jbgk ? mapEmJbgkToProfileFields(jbgk.fields) : {}
  const extras = mapEmPingzhongToProfileExtras(ping)
  const name = base.name ?? ping?.fS_name ?? undefined
  if (!name && !jbgk && !ping && !latestNav) return null

  const navDate = String(latestNav?.FSRQ ?? '').slice(0, 10) || undefined
  const unitNav = safeFloat(latestNav?.DWJZ)
  const accNav = safeFloat(latestNav?.LJJZ)
  const changePct = safeFloat(latestNav?.JZZZL)

  return {
    code: bare,
    name,
    fullName: base.fullName ?? undefined,
    fundType: base.fundType ?? undefined,
    manager: base.manager ?? undefined,
    company: base.company ?? undefined,
    custodian: base.custodian ?? undefined,
    benchmark: base.benchmark ?? undefined,
    establishDate: base.establishDate ?? undefined,
    scale: base.scale ?? undefined,
    totalShares: base.totalShares ?? undefined,
    expenseRatio: base.expenseRatio ?? undefined,
    unitNav,
    accNav,
    navDate,
    changePct,
    investTarget: jbgk?.sections['投资目标'] ?? undefined,
    investScope: jbgk?.sections['投资范围'] ?? undefined,
    investStrategy: jbgk?.sections['投资策略'] ?? undefined,
    investIdea: jbgk?.sections['投资理念'] ?? undefined,
    dividendPolicy: jbgk?.sections['分红政策'] ?? undefined,
    riskFeatures: jbgk?.sections['风险收益特征'] ?? undefined,
    trackingTarget: jbgk?.fields['跟踪标的'] ?? undefined,
    custodyFeeRate: parsePercentText(jbgk?.fields['托管费率']),
    maxSubscribeFeeRate: parsePercentText(jbgk?.fields['最高认购费率']),
    maxPurchaseFeeRate: parsePercentText(jbgk?.fields['最高申购费率']),
    maxRedeemFeeRate: parsePercentText(jbgk?.fields['最高赎回费率']),
    saleServiceFeeRate: parsePercentText(jbgk?.fields['销售服务费率']),
    issueDate: jbgk?.fields['发行日期']?.slice(0, 10) || undefined,
    ...extras,
    source: SOURCE,
  }
}

export function mapEmLsjzToFundNavRows(
  code: string,
  rows: EmFundLsjzRow[],
): StandardFundNavRow[] {
  const bare = normalizeCode(code)
  return rows
    .map(row => ({
      code: bare,
      date: String(row.FSRQ ?? '').slice(0, 10),
      nav: safeFloat(row.DWJZ),
      accNav: safeFloat(row.LJJZ),
      changePct: safeFloat(row.JZZZL),
      purchaseStatus: row.SGZT ?? undefined,
      redeemStatus: row.SHZT ?? undefined,
      source: SOURCE,
    }))
    .filter(r => r.date)
}

export function mapEmLsjzToFundQuoteRow(
  code: string,
  row: EmFundLsjzRow | null,
  profile?: Partial<StandardFundProfileRow>,
): StandardFundQuoteRow | null {
  if (!row) return null
  const bare = normalizeCode(code)
  return {
    code: bare,
    name: profile?.name ?? undefined,
    unitNav: safeFloat(row.DWJZ),
    accNav: safeFloat(row.LJJZ),
    changePct: safeFloat(row.JZZZL),
    navDate: String(row.FSRQ ?? '').slice(0, 10) || undefined,
    source: SOURCE,
  }
}

export function mapEmJjccToFundHoldings(
  code: string,
  rows: EmJjccHoldingRaw[],
): StandardFundHoldingRow[] {
  const bare = normalizeCode(code)
  return rows
    .map(row => {
      const symbol = normalizeCode(row.symbol)
      return {
        reportDate: String(row.reportDate ?? '').slice(0, 10)
          || new Date().toISOString().slice(0, 10),
        holdingSymbol: symbol,
        holdingName: row.name || null,
        weight: parsePercentText(row.weight),
        shares: safeFloat(String(row.shares ?? '').replace(/,/g, '')),
        marketValue: safeFloat(String(row.marketValue ?? '').replace(/,/g, '')),
        assetType: 'stock',
        source: `${SOURCE}_jjcc`,
      }
    })
    .filter(r => r.holdingSymbol || r.holdingName)
}
