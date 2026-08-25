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

export type StandardFundPerformance = {
  w1?: number | null
  w4?: number | null
  w13?: number | null
  w26?: number | null
  w52?: number | null
  year?: number | null
  year2?: number | null
  year3?: number | null
  year5?: number | null
  total?: number | null
}

export type StandardFundRankCell = {
  rank?: number | null
  total?: number | null
}

export type StandardFundReturnsRow = Record<string, unknown> & {
  code: string
  performance?: StandardFundPerformance
  ranks?: Partial<Record<keyof StandardFundPerformance, StandardFundRankCell>>
  peerAvg?: StandardFundPerformance
  source?: string
}

export type StandardFundDrawdownRow = Record<string, unknown> & {
  code: string
  period: string
  label: string
  value?: number | null
  source?: string
}

export type StandardFundAllocItem = {
  name: string
  ratio?: number | null
}

export type StandardFundAllocationRow = Record<string, unknown> & {
  code: string
  reportDate?: string
  assets: StandardFundAllocItem[]
  industries: StandardFundAllocItem[]
  source?: string
}

export type StandardFundHolderTopRow = {
  name: string
  share?: number | null
  ratio?: number | null
}

export type StandardFundHoldersRow = Record<string, unknown> & {
  code: string
  holderAmount?: number | null
  avgHolderShare?: number | null
  instHolderRatio?: number | null
  indivHolderRatio?: number | null
  holderReportDate?: string
  top: StandardFundHolderTopRow[]
  source?: string
}

export type StandardFundDividendRow = Record<string, unknown> & {
  code: string
  date: string
  recordDate?: string
  amount?: number | null
  type?: string
  source?: string
}
