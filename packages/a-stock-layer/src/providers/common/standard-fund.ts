/**
 * CN 场外开放式基金标准行 — Engine / market-data / Hub / UI 统一消费。
 */
export type StandardFundProfileRow = Record<string, unknown> & {
  code: string
  name?: string
  fullName?: string
  fundType?: string
  manager?: string
  company?: string
  custodian?: string
  expenseRatio?: number | null
  scale?: number | null
  totalShares?: number | null
  unitNav?: number | null
  accNav?: number | null
  navDate?: string
  changePct?: number | null
  benchmark?: string
  investTarget?: string
  investScope?: string
  establishDate?: string
  riskLevel?: string
  source?: string
}

export type StandardFundNavRow = Record<string, unknown> & {
  code: string
  date: string
  nav?: number | null
  accNav?: number | null
  changePct?: number | null
  source?: string
}

export type StandardFundHoldingRow = Record<string, unknown> & {
  reportDate: string
  holdingSymbol: string
  holdingName?: string | null
  weight?: number | null
  shares?: number | null
  marketValue?: number | null
  assetType?: string
  source?: string
}

export type StandardFundQuoteRow = Record<string, unknown> & {
  code: string
  name?: string
  unitNav?: number | null
  accNav?: number | null
  prevNav?: number | null
  changePct?: number | null
  navDate?: string
  source?: string
}
