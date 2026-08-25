/**
 * CN 场外开放式基金标准行 — Engine / market-data / Hub / UI 统一消费。
 */
export type StandardFundRateInfoItem = {
  /** 标准字段 */
  label: string
  /** UI 兼容别名（与 label 同值） */
  name?: string
  rate?: number | null
  note?: string
}

export type StandardFundProfileRow = Record<string, unknown> & {
  code: string
  name?: string
  fullName?: string
  fundType?: string
  manager?: string
  managerId?: string
  /** 任职起止 / 天数 / 任职收益（来自 manager_info[0]） */
  managerStartDate?: string
  managerEndDate?: string
  managerOfficeDays?: number | null
  managerTenureReturn?: number | null
  company?: string
  companyId?: string
  /** 管理人公司 enrich（companies/detail） */
  companyType?: string
  companyFundCount?: number | null
  companyScale?: number | null
  companyEstablishDate?: string
  custodian?: string
  expenseRatio?: number | null
  rateInfo?: StandardFundRateInfoItem[]
  purchaseFee?: number | null
  redeemFee?: number | null
  scale?: number | null
  totalShares?: number | null
  unitNav?: number | null
  /**
   * 历史字段名 accNav；扶摇路径下为 `adj_nav`（复权净值），**不是**累计净值。
   */
  accNav?: number | null
  navDate?: string
  changePct?: number | null
  benchmark?: string
  investTarget?: string
  investScope?: string
  investPhilosophy?: string
  investStrategy?: string
  /** 交易规则文案列表（扶摇 trade_rule） */
  tradeRules?: string[]
  establishDate?: string
  riskLevel?: string
  source?: string
}

export type StandardFundManagerRow = Record<string, unknown> & {
  code: string
  managerId?: string
  name?: string
  gender?: string
  education?: string
  resume?: string
  startDate?: string
  endDate?: string
  officeDays?: number | null
  tenureReturn?: number | null
  workYears?: number | null
  /** UI：从业年限（与 workYears 同值） */
  years?: number | null
  /** UI：投资风格文案（仅字符串，禁止塞入 raw object） */
  style?: string | null
  philosophy?: string
  /** 原始经历列表 */
  experienceList?: unknown[]
  /** UI：经历摘要文案 */
  experience?: string
  representFunds?: string[]
  scale?: number | null
  performance?: Record<string, unknown> | null
  performanceSummary?: string
  source?: string
}

export type StandardFundDiagnosisDimension = {
  name: string
  score?: number | null
  value?: string | null
  label?: string
  peerAvg?: number | null
  detail?: string
}

export type StandardFundDiagnosisRow = Record<string, unknown> & {
  code: string
  score?: number | null
  grade?: string
  summary?: string
  resilience?: string | number | null
  dimensions?: StandardFundDiagnosisDimension[]
  source?: string
}

export type StandardFundNewsRow = Record<string, unknown> & {
  code: string
  title: string
  date?: string
  url?: string
  sourceName?: string
  summary?: string
  source?: string
}

export type StandardFundFinancialIndicator = {
  label: string
  value?: number | string | null
  unit?: string
}

export type StandardFundFinancialsRow = Record<string, unknown> & {
  code: string
  reportDate?: string
  indicators: StandardFundFinancialIndicator[]
  /** UI 财务摘要兼容字段 */
  revenue?: number | null
  revenueYoy?: number | null
  netProfit?: number | null
  netProfitYoy?: number | null
  eps?: number | null
  roe?: number | null
  grossMargin?: number | null
  debtRatio?: number | null
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
  /** 管理人持有占比 */
  mgmtStaffHoldRatio?: number | null
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
  /** 响应级汇总（可选，透出到行上供 UI） */
  dividendCount?: number | null
  dividendTotal?: number | null
  source?: string
}
