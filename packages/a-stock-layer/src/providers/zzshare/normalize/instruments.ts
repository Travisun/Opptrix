import type { StockListItem, StockProfile } from '../../../core/schema.js'
import { normalizeCode } from '../../../utils/helpers.js'
import {
  codeFromRow,
  fmtYmd,
  marketFromRow,
  pick,
  rowsFromPayload,
  str,
  type ZzshareRow,
} from './common.js'

export function mapZzshareStockBasicRows(rows: unknown): StockListItem[] {
  return rowsFromPayload(rows).map(row => {
    const code = codeFromRow(row)
    return {
      code,
      name: str(pick(row, 'name', 'code_name', 'fullname')),
      industry: str(pick(row, 'industry')),
      market: marketFromRow(row, code),
    }
  })
}

export function mapZzshareStockListRows(rows: unknown): StockListItem[] {
  return mapZzshareStockBasicRows(rows)
}

export function mapZzshareStockInfoRow(
  code: string,
  info: ZzshareRow,
  basic?: ZzshareRow,
): StockProfile {
  const base = basic ?? {}
  const bare = normalizeCode(codeFromRow(info, codeFromRow(base, code)))
  const conceptsRaw = pick(info, 'concepts', 'concept', 'plates')
  let concepts: string[] | undefined
  if (Array.isArray(conceptsRaw)) {
    concepts = conceptsRaw.map(v => str(v)).filter(Boolean)
  } else if (typeof conceptsRaw === 'string' && conceptsRaw.trim()) {
    concepts = conceptsRaw.split(/[,，、|]/).map(s => s.trim()).filter(Boolean)
  }

  return {
    code: bare,
    name: str(pick(info, 'name', 'stock_name')) || str(pick(base, 'name')),
    orgName: str(pick(info, 'org_name', 'company_name', 'fullname')) || undefined,
    industry: str(pick(info, 'industry')) || str(pick(base, 'industry')) || undefined,
    industryCsrc: str(pick(info, 'industry_csrc', 'industryClassification')) || undefined,
    concepts,
    listingDate: fmtYmd(pick(info, 'list_date', 'listing_date', 'ipoDate')) || fmtYmd(pick(base, 'list_date')) || undefined,
    foundDate: fmtYmd(pick(info, 'found_date', 'setup_date')) || undefined,
    mainBusiness: str(pick(info, 'main_business', 'mainBusiness')) || undefined,
    orgProfile: str(pick(info, 'org_profile', 'profile', 'introduction')) || undefined,
    businessScope: str(pick(info, 'business_scope', 'businessScope')) || undefined,
    totalMarketCap: null,
    circulatingMarketCap: null,
    employees: null,
    province: str(pick(info, 'province', 'area')) || undefined,
    city: str(pick(info, 'city')) || undefined,
    address: str(pick(info, 'address', 'office')) || undefined,
    website: str(pick(info, 'website', 'web_site')) || undefined,
    chairman: str(pick(info, 'chairman')) || undefined,
    legalPerson: str(pick(info, 'legal_person', 'legal_representative')) || undefined,
    secretary: str(pick(info, 'secretary', 'board_secretary')) || undefined,
    orgTel: str(pick(info, 'org_tel', 'phone')) || undefined,
    securityType: str(pick(info, 'security_type', 'type', 'market')) || str(pick(base, 'market')) || undefined,
    formerName: str(pick(info, 'former_name', 'old_name')) || undefined,
    issuePrice: null,
  }
}

export function mapZzshareProfileFromBasic(code: string, basic: ZzshareRow): StockProfile {
  return mapZzshareStockInfoRow(code, {}, basic)
}
