import type { StockProfile } from '../../../core/schema.js'
import { SINA_SOURCE } from '../types/responses.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import type {
  SinaConceptPlateRow,
  SinaCorpInfoRaw,
  SinaExecutiveRow,
  SinaFundHoldingBlock,
  SinaIndexMembershipRow,
  SinaRelatedSecurityRow,
  SinaShareholderMeta,
  SinaShareholderRow,
} from '../api/types.js'

function parseRegCapitalWan(raw?: string): number | null {
  if (!raw) return null
  const m = raw.match(/([\d,.]+)\s*万/)
  return m ? safeFloat(m[1].replace(/,/g, '')) : safeFloat(raw.replace(/[^\d.]/g, ''))
}

/** F10 公司简介 HTML → {@link StockProfile} */
export function mapSinaCorpInfoToProfile(
  code: string,
  raw: SinaCorpInfoRaw,
): StockProfile {
  const bare = normalizeCode(code)
  const orgName = raw['公司名称：']
  return {
    code: bare,
    name: orgName?.replace(/\(.*\)/, '').trim() || undefined,
    orgName,
    orgNameEn: raw['公司英文名称：'],
    industry: undefined,
    listingDate: raw['上市日期：'],
    foundDate: raw['成立日期：'],
    mainBusiness: raw['主营业务：'],
    orgProfile: raw.orgProfile,
    address: raw['注册地址：'],
    officeAddress: raw['办公地址：'],
    website: raw['公司网址：'],
    orgTel: raw['公司电话：'],
    orgFax: raw['公司传真：'],
    orgEmail: raw['公司电子邮箱：'],
    secretary: raw['董事会秘书：'],
    regCapital: parseRegCapitalWan(raw['注册资本：']),
    issuePrice: safeFloat(raw['发行价格：']),
    securityType: raw['上市市场：'] || raw['组织形式：'],
    leadUnderwriter: raw['主承销商：'],
  }
}

export function mapSinaExecutives(rows: SinaExecutiveRow[]): Record<string, unknown>[] {
  return rows.map(row => ({
    name: row.name,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    source: SINA_SOURCE,
  }))
}

export function mapSinaShareholders(
  code: string,
  meta: SinaShareholderMeta,
  rows: SinaShareholderRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  const header = {
    code: bare,
    asOfDate: meta.asOfDate,
    announceDate: meta.announceDate,
    holderCount: meta.holderCount,
    type: 'meta',
    source: SINA_SOURCE,
  }
  const items = rows.map(row => ({
    code: bare,
    rank: row.rank,
    name: row.name,
    shares: row.shares,
    ratio: row.ratio,
    shareType: row.shareType,
    asOfDate: meta.asOfDate,
    type: 'holder',
    source: SINA_SOURCE,
  }))
  return items.length ? [header, ...items] : []
}

export function mapSinaFundHoldings(
  code: string,
  blocks: SinaFundHoldingBlock[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return blocks.map(row => ({
    code: bare,
    fundName: row.fundName,
    fundCode: row.fundCode,
    shares: row.shares,
    floatPct: row.floatPct,
    marketValue: row.marketValue,
    navPct: row.navPct,
    asOfDate: row.asOfDate,
    source: SINA_SOURCE,
  }))
}

export function mapSinaConceptPlates(
  code: string,
  rows: SinaConceptPlateRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    name: row.name,
    node: row.node,
    marketUrl: row.marketUrl,
    plateType: 'concept',
    source: SINA_SOURCE,
  }))
}

export function mapSinaRelatedSecurities(
  code: string,
  rows: SinaRelatedSecurityRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    relatedCode: row.code,
    relatedName: row.name,
    relationType: row.type ?? 'related',
    source: SINA_SOURCE,
  }))
}

export function mapSinaIndexMembership(
  code: string,
  rows: SinaIndexMembershipRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    indexName: row.indexName,
    indexCode: row.indexCode,
    enterDate: row.enterDate,
    exitDate: row.exitDate,
    source: SINA_SOURCE,
  }))
}
