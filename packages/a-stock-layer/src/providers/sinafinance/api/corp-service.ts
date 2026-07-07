import {
  fetchSinaCorpInfoHtml,
  fetchSinaCorpManagerHtml,
  fetchSinaCorpOtherInfoHtml,
  fetchSinaCorpRelatedHtml,
  fetchSinaFundHolderHtml,
  fetchSinaStockHolderHtml,
  parseSinaConceptPlatesFromHtml,
  parseSinaCorpInfoFromHtml,
  parseSinaExecutivesFromHtml,
  parseSinaFundHoldingsFromHtml,
  parseSinaIndexMembershipFromHtml,
  parseSinaIndustryFromHtml,
  parseSinaRelatedSecuritiesFromHtml,
  parseSinaShareholdersFromHtml,
} from './corp.js'
import {
  mapSinaConceptPlates,
  mapSinaCorpInfoToProfile,
  mapSinaExecutives,
  mapSinaFundHoldings,
  mapSinaIndexMembership,
  mapSinaRelatedSecurities,
  mapSinaShareholders,
} from '../normalize/corp.js'
import type { StockProfile } from '../../../core/schema.js'
import { SINA_SOURCE } from '../types/responses.js'

/** 完整公司资料包（简介 + 行业 + 概念名列表） */
export async function fetchSinaCorpFullBundle(code: string): Promise<Record<string, unknown>> {
  const [infoHtml, industryHtml, conceptHtml] = await Promise.all([
    fetchSinaCorpInfoHtml(code),
    fetchSinaCorpOtherInfoHtml(code, 2),
    fetchSinaCorpOtherInfoHtml(code, 5),
  ])
  const raw = parseSinaCorpInfoFromHtml(infoHtml)
  const profile = mapSinaCorpInfoToProfile(code, raw)
  const industry = parseSinaIndustryFromHtml(industryHtml)
  const concepts = parseSinaConceptPlatesFromHtml(conceptHtml).map(c => c.name)
  if (industry) profile.industry = industry
  if (concepts.length) profile.concepts = concepts
  return { profile, raw, industry, concepts, source: SINA_SOURCE }
}

export async function fetchSinaCorpProfile(code: string): Promise<StockProfile | null> {
  const bundle = await fetchSinaCorpFullBundle(code)
  return (bundle.profile as StockProfile | undefined) ?? null
}

export async function fetchSinaExecutives(code: string) {
  const html = await fetchSinaCorpManagerHtml(code)
  return mapSinaExecutives(parseSinaExecutivesFromHtml(html))
}

export async function fetchSinaMajorShareholders(code: string) {
  const html = await fetchSinaStockHolderHtml(code)
  const { meta, rows } = parseSinaShareholdersFromHtml(html)
  return mapSinaShareholders(code, meta, rows)
}

export async function fetchSinaFundHoldings(code: string) {
  const html = await fetchSinaFundHolderHtml(code)
  return mapSinaFundHoldings(code, parseSinaFundHoldingsFromHtml(html))
}

export async function fetchSinaConceptPlatesFromCode(code: string) {
  const html = await fetchSinaCorpOtherInfoHtml(code, 5)
  return mapSinaConceptPlates(code, parseSinaConceptPlatesFromHtml(html))
}

export async function fetchSinaRelatedSecurities(code: string) {
  const html = await fetchSinaCorpRelatedHtml(code)
  return mapSinaRelatedSecurities(code, parseSinaRelatedSecuritiesFromHtml(html))
}

export async function fetchSinaIndexMembership(code: string) {
  const html = await fetchSinaCorpRelatedHtml(code)
  return mapSinaIndexMembership(code, parseSinaIndexMembershipFromHtml(html))
}
