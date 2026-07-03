import type { Socket } from 'node:net'
import {
  ATTRIBUTE_SPLIT,
  BAOSTOCK_PER_PAGE_COUNT,
  BSERR_NO_LOGIN,
  BSERR_PASSWORD_EMPTY,
  BSERR_SUCCESS,
  BSERR_USERNAME_EMPTY,
  DEFAULT_START_DATE,
  MESSAGE_TYPE_ADJUSTFACTOR_REQUEST,
  MESSAGE_TYPE_GETKDATAPLUS_REQUEST,
  MESSAGE_TYPE_LOGIN_REQUEST,
  MESSAGE_TYPE_LOGOUT_REQUEST,
  MESSAGE_TYPE_PROFITDATA_REQUEST,
  MESSAGE_TYPE_OPERATIONDATA_REQUEST,
  MESSAGE_TYPE_QUERYALLSTOCK_REQUEST,
  MESSAGE_TYPE_QUERYBALANCEDATA_REQUEST,
  MESSAGE_TYPE_QUERYCASHFLOWDATA_REQUEST,
  MESSAGE_TYPE_QUERYDEPOSITRATEDATA_REQUEST,
  MESSAGE_TYPE_QUERYDIVIDENDDATA_REQUEST,
  MESSAGE_TYPE_QUERYDUPONTDATA_REQUEST,
  MESSAGE_TYPE_QUERYFORECASTREPORT_REQUEST,
  MESSAGE_TYPE_QUERYGROWTHDATA_REQUEST,
  MESSAGE_TYPE_QUERYHS300STOCKS_REQUEST,
  MESSAGE_TYPE_QUERYLOANRATEDATA_REQUEST,
  MESSAGE_TYPE_QUERYMONEYSUPPLYDATAMONTH_REQUEST,
  MESSAGE_TYPE_QUERYMONEYSUPPLYDATAYEAR_REQUEST,
  MESSAGE_TYPE_QUERYPERFORMANCEEXPRESSREPORT_REQUEST,
  MESSAGE_TYPE_QUREYREQUIREDRESERVERATIODATA_REQUEST,
  MESSAGE_TYPE_QUERYSHIBORDATA_REQUEST,
  MESSAGE_TYPE_QUERYSTOCKBASIC_REQUEST,
  MESSAGE_TYPE_QUERYSTOCKINDUSTRY_REQUEST,
  MESSAGE_TYPE_QUERYTRADEDATES_REQUEST,
  MESSAGE_TYPE_QUERYSZ50STOCKS_REQUEST,
  MESSAGE_TYPE_QUERYZZ500STOCKS_REQUEST,
  MESSAGE_TYPE_QUERYTERMINATEDSTOCKS_REQUEST,
  MESSAGE_TYPE_QUERYSUSPENDEDSTOCKS_REQUEST,
  MESSAGE_TYPE_QUERYSTSTOCKS_REQUEST,
  MESSAGE_TYPE_QUERYSTARSTSTOCKS_REQUEST,
  MESSAGE_TYPE_QUERYCPIDATA_REQUEST,
  MESSAGE_TYPE_QUERYPPIDATA_REQUEST,
  MESSAGE_TYPE_QUERYPMIDATA_REQUEST,
  MESSAGE_TYPE_QUERYSTOCKCONCEPT_REQUEST,
  MESSAGE_TYPE_QUERYSTOCKAREA_REQUEST,
  MESSAGE_TYPE_QUERYAMESTOCK_REQUEST,
  MESSAGE_TYPE_QUERYGEMSTOCK_REQUEST,
  MESSAGE_TYPE_QUERYSHHKSTOCK_REQUEST,
  MESSAGE_TYPE_QUERYSZHKSTOCK_REQUEST,
  MESSAGE_TYPE_QUERYSTOCKINRISK_REQUEST,
  MESSAGE_SPLIT,
} from './constants.js'
import {
  BaostockProtocolError,
  connectSocket,
  organizeMsgBody,
  parseDataRecords,
  parseFields,
  parseResponse,
  sendRequest,
  type ParsedBaostockMessage,
} from './protocol.js'
import { normalizeBaostockCode } from './symbols.js'

export type BaostockRow = Record<string, string | number | null>

export interface BaostockResult {
  error_code: string
  error_msg: string
  method?: string
  user_id?: string
  cur_page?: string
  per_page?: string
  fields: string[]
  data: unknown[][]
  meta?: Record<string, string>
}

/** @deprecated use BaostockResult */
export type BaostockQueryResult = BaostockResult

export interface BaostockLoginResult {
  error_code: string
  error_msg: string
  method?: string
  user_id?: string
}

export class BaostockApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'BaostockApiError'
  }
}

export function zipBaostockRows(result: BaostockResult): Record<string, string>[] {
  const { fields, data } = result
  if (!fields.length || !data.length) return []
  return data.map(record => {
    const row: Record<string, string> = {}
    for (let i = 0; i < fields.length; i++) {
      const value = record[i]
      row[fields[i]] = value == null ? '' : String(value)
    }
    return row
  })
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function currentYear(): string {
  return String(new Date().getFullYear())
}

function currentQuarter(): string {
  return String(Math.floor(new Date().getMonth() / 3) + 1)
}

function assertSuccess(result: BaostockResult): void {
  if (result.error_code !== BSERR_SUCCESS) {
    throw new BaostockApiError(result.error_msg || 'Baostock API error', result.error_code)
  }
}

/** Baostock K 线 fields 必须含 date、code，否则服务端返回 10004020 */
export function ensureBaostockKlineFields(fields: string): string {
  const parts = fields.split(',').map(f => f.trim()).filter(Boolean)
  const rest = parts.filter(f => !['date', 'code'].includes(f.toLowerCase()))
  return ['date', 'code', ...rest].join(',')
}

function parseStandardPage(bodyParts: string[], metaKeys: string[]): BaostockResult {
  const meta: Record<string, string> = {}
  for (let i = 0; i < metaKeys.length; i++) {
    meta[metaKeys[i]] = bodyParts[7 + i] ?? ''
  }

  // Layout: [0-5] header · [6] data JSON · [7..7+N-1] meta · [7+N] fields
  const fieldsIndex = 7 + metaKeys.length

  return {
    error_code: bodyParts[0] ?? '',
    error_msg: bodyParts[1] ?? '',
    method: bodyParts[2] ?? '',
    user_id: bodyParts[3] ?? '',
    cur_page: bodyParts[4] ?? '1',
    per_page: bodyParts[5] ?? String(BAOSTOCK_PER_PAGE_COUNT),
    fields: parseFields(bodyParts[fieldsIndex] ?? ''),
    data: parseDataRecords(bodyParts[6] ?? ''),
    meta,
  }
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export class BaostockClient {
  private socket: Socket | null = null
  private userId = 'anonymous'
  private loggedIn = false
  private readonly perPage: number
  /** Baostock 单连接请求-响应协议；并发读会在 Socket 上堆叠 data/end/error 监听器 */
  private opTail: Promise<unknown> = Promise.resolve()

  constructor(perPage = BAOSTOCK_PER_PAGE_COUNT) {
    this.perPage = perPage
  }

  private runExclusive<T>(op: () => Promise<T>): Promise<T> {
    const next = this.opTail.then(op, op)
    this.opTail = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private sendSocketRequest(msgType: string, body: string): Promise<ParsedBaostockMessage> {
    return this.runExclusive(() => sendRequest(this.requireSocket(), msgType, body))
  }

  get isLoggedIn(): boolean {
    return this.loggedIn
  }

  get sessionUserId(): string {
    return this.userId
  }

  async ensureSession(): Promise<void> {
    if (this.loggedIn && this.socket) return
    const login = await this.login()
    if (login.error_code !== BSERR_SUCCESS) {
      throw new BaostockApiError(login.error_msg || '登录失败', login.error_code)
    }
  }

  async login(
    userId = 'anonymous',
    password = '123456',
    options = '0',
  ): Promise<BaostockLoginResult> {
    if (!userId) {
      return { error_code: BSERR_USERNAME_EMPTY, error_msg: '用户ID不能为空。' }
    }
    if (!password) {
      return { error_code: BSERR_PASSWORD_EMPTY, error_msg: '密码不能为空。' }
    }

    return this.runExclusive(async () => {
      if (this.loggedIn && this.socket && this.userId === userId) {
        return {
          error_code: BSERR_SUCCESS,
          error_msg: 'login success',
          method: 'login',
          user_id: this.userId,
        }
      }

      await this.disconnect()
      this.socket = await connectSocket()
      this.userId = userId

      const body = ['login', userId, password, String(options)].join(MESSAGE_SPLIT)
      const parsed = await sendRequest(this.socket, MESSAGE_TYPE_LOGIN_REQUEST, body)
      const parts = parsed.bodyParts

      const result: BaostockLoginResult = {
        error_code: parts[0] ?? '',
        error_msg: parts[1] ?? '',
      }

      if (result.error_code === BSERR_SUCCESS) {
        result.method = parts[2]
        result.user_id = parts[3]
        this.loggedIn = true
      } else {
        await this.disconnect()
      }

      return result
    })
  }

  async logout(): Promise<BaostockLoginResult> {
    return this.runExclusive(async () => {
      if (!this.socket || !this.loggedIn) {
        return { error_code: BSERR_NO_LOGIN, error_msg: 'you don\'t login.' }
      }

      const body = ['logout', this.userId, formatTimestamp(new Date())].join(MESSAGE_SPLIT)

      let parsed
      try {
        parsed = await sendRequest(this.socket, MESSAGE_TYPE_LOGOUT_REQUEST, body)
      } catch (e) {
        await this.disconnect()
        throw e
      }

      const parts = parsed.bodyParts
      const result: BaostockLoginResult = {
        error_code: parts[0] ?? '',
        error_msg: parts[1] ?? '',
        method: parts[2],
        user_id: parts[3],
      }

      await this.disconnect()
      return result
    })
  }

  async disconnect(): Promise<void> {
    this.loggedIn = false
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
  }

  private requireSocket(): Socket {
    if (!this.socket || !this.loggedIn) {
      throw new BaostockApiError('未登录 Baostock', BSERR_NO_LOGIN)
    }
    return this.socket
  }

  private async queryOrganizedPage(
    msgType: string,
    paramParts: string[],
    metaKeys: string[],
  ): Promise<BaostockResult> {
    const msgBody = organizeMsgBody(paramParts.join(ATTRIBUTE_SPLIT))
    const parsed = await this.sendSocketRequest(msgType, msgBody)
    return parseStandardPage(parsed.bodyParts, metaKeys)
  }

  private async queryAllPages(
    msgType: string,
    buildParamParts: (page: number, perPage: number) => string[],
    metaKeys: string[],
  ): Promise<BaostockResult> {
    let page = 1
    let merged: BaostockResult | null = null

    for (;;) {
      const result = await this.queryOrganizedPage(
        msgType,
        buildParamParts(page, this.perPage),
        metaKeys,
      )
      assertSuccess(result)

      if (!merged) {
        merged = { ...result, data: [...result.data] }
      } else {
        merged.data.push(...result.data)
        merged.cur_page = result.cur_page
      }

      if (result.data.length < this.perPage) break
      page += 1
    }

    return merged!
  }

  private async queryKlinePlusPage(
    page: number,
    code: string,
    fields: string,
    startDate: string,
    endDate: string,
    frequency: string,
    adjustflag: string,
  ): Promise<BaostockResult> {
    const normalized = normalizeBaostockCode(code)
    const body = [
      'query_history_k_data_plus',
      this.userId,
      String(page),
      String(this.perPage),
      normalized,
      fields,
      startDate,
      endDate,
      frequency,
      adjustflag,
    ].join(MESSAGE_SPLIT)

    const parsed = await this.sendSocketRequest(MESSAGE_TYPE_GETKDATAPLUS_REQUEST, body)
    const parts = parsed.bodyParts
    const fieldList = parseFields(parts[8] ?? '')

    return {
      error_code: parts[0] ?? '',
      error_msg: parts[1] ?? '',
      method: parts[2] ?? '',
      user_id: parts[3] ?? '',
      cur_page: parts[4] ?? String(page),
      per_page: parts[5] ?? String(this.perPage),
      fields: fieldList,
      data: parseDataRecords(parts[6] ?? ''),
      meta: {
        code: parts[7] ?? normalized,
        start_date: parts[9] ?? startDate,
        end_date: parts[10] ?? endDate,
        frequency: parts[11] ?? frequency,
        adjustflag: parts[12] ?? adjustflag,
      },
    }
  }

  async queryHistoryKDataPlus(
    code: string,
    fields: string,
    startDate = DEFAULT_START_DATE,
    endDate = todayYmd(),
    frequency = 'd',
    adjustflag = '3',
  ): Promise<BaostockResult> {
    const safeFields = ensureBaostockKlineFields(fields)
    let page = 1
    let merged: BaostockResult | null = null

    for (;;) {
      const result = await this.queryKlinePlusPage(
        page, code, safeFields, startDate, endDate, frequency, adjustflag,
      )
      assertSuccess(result)

      if (!merged) {
        merged = { ...result, data: [...result.data] }
      } else {
        merged.data.push(...result.data)
        merged.cur_page = result.cur_page
      }

      if (result.data.length < this.perPage) break
      page += 1
    }

    return merged!
  }

  async queryTradeDates(startDate = DEFAULT_START_DATE, endDate = todayYmd()): Promise<BaostockResult> {
    return this.queryAllPages(
      MESSAGE_TYPE_QUERYTRADEDATES_REQUEST,
      (page, perPage) => ['query_trade_dates', this.userId, String(page), String(perPage), startDate, endDate],
      ['start_date', 'end_date'],
    )
  }

  async queryAllStock(day = todayYmd()): Promise<BaostockResult> {
    return this.queryAllPages(
      MESSAGE_TYPE_QUERYALLSTOCK_REQUEST,
      (page, perPage) => ['query_all_stock', this.userId, String(page), String(perPage), day],
      ['day'],
    )
  }

  async queryStockBasic(code = '', codeName = ''): Promise<BaostockResult> {
    const normalized = code ? normalizeBaostockCode(code) : ''
    return this.queryAllPages(
      MESSAGE_TYPE_QUERYSTOCKBASIC_REQUEST,
      (page, perPage) => ['query_stock_basic', this.userId, String(page), String(perPage), normalized, codeName],
      ['code', 'code_name'],
    )
  }

  async queryDividendData(
    code: string,
    year = currentYear(),
    yearType: 'report' | 'operate' = 'report',
  ): Promise<BaostockResult> {
    return this.queryAllPages(
      MESSAGE_TYPE_QUERYDIVIDENDDATA_REQUEST,
      (page, perPage) => [
        'query_dividend_data', this.userId, String(page), String(perPage),
        normalizeBaostockCode(code), year, yearType,
      ],
      ['code', 'year', 'yearType'],
    )
  }

  async queryAdjustFactor(
    code: string,
    startDate = DEFAULT_START_DATE,
    endDate = todayYmd(),
  ): Promise<BaostockResult> {
    return this.queryAllPages(
      MESSAGE_TYPE_ADJUSTFACTOR_REQUEST,
      (page, perPage) => [
        'query_adjust_factor', this.userId, String(page), String(perPage),
        normalizeBaostockCode(code), startDate, endDate,
      ],
      ['code', 'start_date', 'end_date'],
    )
  }

  async queryProfitData(code: string, year = currentYear(), quarter = currentQuarter()): Promise<BaostockResult> {
    return this.querySeasonData(MESSAGE_TYPE_PROFITDATA_REQUEST, 'query_profit_data', code, year, quarter)
  }

  async queryOperationData(code: string, year = currentYear(), quarter = currentQuarter()): Promise<BaostockResult> {
    return this.querySeasonData(MESSAGE_TYPE_OPERATIONDATA_REQUEST, 'query_operation_data', code, year, quarter)
  }

  async queryGrowthData(code: string, year = currentYear(), quarter = currentQuarter()): Promise<BaostockResult> {
    return this.querySeasonData(MESSAGE_TYPE_QUERYGROWTHDATA_REQUEST, 'query_growth_data', code, year, quarter)
  }

  async queryBalanceData(code: string, year = currentYear(), quarter = currentQuarter()): Promise<BaostockResult> {
    return this.querySeasonData(MESSAGE_TYPE_QUERYBALANCEDATA_REQUEST, 'query_balance_data', code, year, quarter)
  }

  async queryCashFlowData(code: string, year = currentYear(), quarter = currentQuarter()): Promise<BaostockResult> {
    return this.querySeasonData(MESSAGE_TYPE_QUERYCASHFLOWDATA_REQUEST, 'query_cash_flow_data', code, year, quarter)
  }

  async queryDupontData(code: string, year = currentYear(), quarter = currentQuarter()): Promise<BaostockResult> {
    return this.querySeasonData(MESSAGE_TYPE_QUERYDUPONTDATA_REQUEST, 'query_dupont_data', code, year, quarter)
  }

  private async querySeasonData(
    msgType: string,
    method: string,
    code: string,
    year: string,
    quarter: string,
  ): Promise<BaostockResult> {
    return this.queryAllPages(
      msgType,
      (page, perPage) => [
        method, this.userId, String(page), String(perPage),
        normalizeBaostockCode(code), year, String(quarter),
      ],
      ['code', 'year', 'quarter'],
    )
  }

  async queryPerformanceExpressReport(
    code: string,
    startDate = DEFAULT_START_DATE,
    endDate = todayYmd(),
  ): Promise<BaostockResult> {
    return this.queryAllPages(
      MESSAGE_TYPE_QUERYPERFORMANCEEXPRESSREPORT_REQUEST,
      (page, perPage) => [
        'query_performance_express_report', this.userId, String(page), String(perPage),
        normalizeBaostockCode(code), startDate, endDate,
      ],
      ['code', 'start_date', 'end_date'],
    )
  }

  async queryForecastReport(
    code: string,
    startDate = DEFAULT_START_DATE,
    endDate = todayYmd(),
  ): Promise<BaostockResult> {
    return this.queryAllPages(
      MESSAGE_TYPE_QUERYFORECASTREPORT_REQUEST,
      (page, perPage) => [
        'query_forecast_report', this.userId, String(page), String(perPage),
        normalizeBaostockCode(code), startDate, endDate,
      ],
      ['code', 'start_date', 'end_date'],
    )
  }

  async queryStockIndustry(code = '', date = ''): Promise<BaostockResult> {
    const normalized = code ? normalizeBaostockCode(code) : ''
    return this.queryAllPages(
      MESSAGE_TYPE_QUERYSTOCKINDUSTRY_REQUEST,
      (page, perPage) => ['query_stock_industry', this.userId, String(page), String(perPage), normalized, date],
      ['code', 'date'],
    )
  }

  async queryHs300Stocks(date = ''): Promise<BaostockResult> {
    return this.queryIndexStocks(MESSAGE_TYPE_QUERYHS300STOCKS_REQUEST, 'query_hs300_stocks', date)
  }

  async querySz50Stocks(date = ''): Promise<BaostockResult> {
    return this.queryIndexStocks(MESSAGE_TYPE_QUERYSZ50STOCKS_REQUEST, 'query_sz50_stocks', date)
  }

  async queryZz500Stocks(date = ''): Promise<BaostockResult> {
    return this.queryIndexStocks(MESSAGE_TYPE_QUERYZZ500STOCKS_REQUEST, 'query_zz500_stocks', date)
  }

  async queryStockConcept(code: string, date = ''): Promise<BaostockResult> {
    return this.queryCodeDateMeta(
      MESSAGE_TYPE_QUERYSTOCKCONCEPT_REQUEST,
      'query_stock_concept',
      code,
      date,
    )
  }

  async queryStockArea(code: string, date = ''): Promise<BaostockResult> {
    return this.queryCodeDateMeta(
      MESSAGE_TYPE_QUERYSTOCKAREA_REQUEST,
      'query_stock_area',
      code,
      date,
    )
  }

  async queryTerminatedStocks(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYTERMINATEDSTOCKS_REQUEST, 'query_terminated_stocks', day)
  }

  async querySuspendedStocks(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYSUSPENDEDSTOCKS_REQUEST, 'query_suspended_stocks', day)
  }

  async queryStStocks(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYSTSTOCKS_REQUEST, 'query_st_stocks', day)
  }

  async queryStarStStocks(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYSTARSTSTOCKS_REQUEST, 'query_starst_stocks', day)
  }

  async queryAmeStocks(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYAMESTOCK_REQUEST, 'query_ame_stocks', day)
  }

  async queryGemStocks(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYGEMSTOCK_REQUEST, 'query_gem_stocks', day)
  }

  async queryShhkStocks(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYSHHKSTOCK_REQUEST, 'query_shhk_stocks', day)
  }

  async querySzhkStocks(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYSZHKSTOCK_REQUEST, 'query_szhk_stocks', day)
  }

  async queryStocksInRisk(day = ''): Promise<BaostockResult> {
    return this.queryDayStockList(MESSAGE_TYPE_QUERYSTOCKINRISK_REQUEST, 'query_stocks_in_risk', day)
  }

  async queryCpiData(startDate = '', endDate = ''): Promise<BaostockResult> {
    return this.queryDateRangeMacro(MESSAGE_TYPE_QUERYCPIDATA_REQUEST, 'query_cpi_data', startDate, endDate)
  }

  async queryPpiData(startDate = '', endDate = ''): Promise<BaostockResult> {
    return this.queryDateRangeMacro(MESSAGE_TYPE_QUERYPPIDATA_REQUEST, 'query_ppi_data', startDate, endDate)
  }

  async queryPmiData(startDate = '', endDate = ''): Promise<BaostockResult> {
    return this.queryDateRangeMacro(MESSAGE_TYPE_QUERYPMIDATA_REQUEST, 'query_pmi_data', startDate, endDate)
  }

  private async queryCodeDateMeta(
    msgType: string,
    method: string,
    code: string,
    date: string,
  ): Promise<BaostockResult> {
    const normalized = normalizeBaostockCode(code)
    return this.queryAllPages(
      msgType,
      (page, perPage) => [method, this.userId, String(page), String(perPage), normalized, date],
      ['code', 'date'],
    )
  }

  private async queryDayStockList(msgType: string, method: string, day: string): Promise<BaostockResult> {
    return this.queryIndexStocks(msgType, method, day)
  }

  private async queryIndexStocks(msgType: string, method: string, date: string): Promise<BaostockResult> {
    return this.queryAllPages(
      msgType,
      (page, perPage) => [method, this.userId, String(page), String(perPage), date],
      ['date'],
    )
  }

  async queryDepositRateData(startDate = '', endDate = ''): Promise<BaostockResult> {
    return this.queryDateRangeMacro(
      MESSAGE_TYPE_QUERYDEPOSITRATEDATA_REQUEST,
      'query_deposit_rate_data',
      startDate,
      endDate,
    )
  }

  async queryLoanRateData(startDate = '', endDate = ''): Promise<BaostockResult> {
    return this.queryDateRangeMacro(
      MESSAGE_TYPE_QUERYLOANRATEDATA_REQUEST,
      'query_loan_rate_data',
      startDate,
      endDate,
    )
  }

  async queryRequiredReserveRatioData(
    startDate = '',
    endDate = '',
    yearType = '0',
  ): Promise<BaostockResult> {
    return this.queryAllPages(
      MESSAGE_TYPE_QUREYREQUIREDRESERVERATIODATA_REQUEST,
      (page, perPage) => [
        'query_required_reserve_ratio_data', this.userId, String(page), String(perPage),
        startDate, endDate, yearType,
      ],
      ['start_date', 'end_date', 'yearType'],
    )
  }

  async queryMoneySupplyDataMonth(startDate = '', endDate = ''): Promise<BaostockResult> {
    return this.queryDateRangeMacro(
      MESSAGE_TYPE_QUERYMONEYSUPPLYDATAMONTH_REQUEST,
      'query_money_supply_data_month',
      startDate,
      endDate,
    )
  }

  async queryMoneySupplyDataYear(startDate = '', endDate = ''): Promise<BaostockResult> {
    return this.queryDateRangeMacro(
      MESSAGE_TYPE_QUERYMONEYSUPPLYDATAYEAR_REQUEST,
      'query_money_supply_data_year',
      startDate,
      endDate,
    )
  }

  async queryShiborData(startDate = '', endDate = ''): Promise<BaostockResult> {
    return this.queryDateRangeMacro(
      MESSAGE_TYPE_QUERYSHIBORDATA_REQUEST,
      'query_shibor_data',
      startDate,
      endDate,
    )
  }

  private async queryDateRangeMacro(
    msgType: string,
    method: string,
    startDate: string,
    endDate: string,
  ): Promise<BaostockResult> {
    return this.queryAllPages(
      msgType,
      (page, perPage) => [method, this.userId, String(page), String(perPage), startDate, endDate],
      ['start_date', 'end_date'],
    )
  }

  // Python-style snake_case aliases used by the driver layer
  query_history_k_data_plus = this.queryHistoryKDataPlus.bind(this)
  query_trade_dates = this.queryTradeDates.bind(this)
  query_all_stock = this.queryAllStock.bind(this)
  query_stock_basic = this.queryStockBasic.bind(this)
  query_dividend_data = this.queryDividendData.bind(this)
  query_adjust_factor = this.queryAdjustFactor.bind(this)
  query_profit_data = this.queryProfitData.bind(this)
  query_operation_data = this.queryOperationData.bind(this)
  query_growth_data = this.queryGrowthData.bind(this)
  query_balance_data = this.queryBalanceData.bind(this)
  query_cash_flow_data = this.queryCashFlowData.bind(this)
  query_dupont_data = this.queryDupontData.bind(this)
  query_performance_express_report = this.queryPerformanceExpressReport.bind(this)
  query_forecast_report = this.queryForecastReport.bind(this)
  query_stock_industry = this.queryStockIndustry.bind(this)
  query_hs300_stocks = this.queryHs300Stocks.bind(this)
  query_sz50_stocks = this.querySz50Stocks.bind(this)
  query_zz500_stocks = this.queryZz500Stocks.bind(this)
  query_stock_concept = this.queryStockConcept.bind(this)
  query_stock_area = this.queryStockArea.bind(this)
  query_terminated_stocks = this.queryTerminatedStocks.bind(this)
  query_suspended_stocks = this.querySuspendedStocks.bind(this)
  query_st_stocks = this.queryStStocks.bind(this)
  query_starst_stocks = this.queryStarStStocks.bind(this)
  query_ame_stocks = this.queryAmeStocks.bind(this)
  query_gem_stocks = this.queryGemStocks.bind(this)
  query_shhk_stocks = this.queryShhkStocks.bind(this)
  query_szhk_stocks = this.querySzhkStocks.bind(this)
  query_stocks_in_risk = this.queryStocksInRisk.bind(this)
  query_cpi_data = this.queryCpiData.bind(this)
  query_ppi_data = this.queryPpiData.bind(this)
  query_pmi_data = this.queryPmiData.bind(this)
  query_deposit_rate_data = this.queryDepositRateData.bind(this)
  query_loan_rate_data = this.queryLoanRateData.bind(this)
  query_required_reserve_ratio_data = this.queryRequiredReserveRatioData.bind(this)
  query_money_supply_data_month = this.queryMoneySupplyDataMonth.bind(this)
  query_money_supply_data_year = this.queryMoneySupplyDataYear.bind(this)
  query_shibor_data = this.queryShiborData.bind(this)
}

export async function testBaostockConnection(): Promise<{ ok: boolean; message: string }> {
  const client = new BaostockClient()
  try {
    const login = await client.login()
    if (login.error_code !== BSERR_SUCCESS) {
      return { ok: false, message: login.error_msg || '登录失败' }
    }

    const result = await client.queryTradeDates('2024-01-01', '2024-01-10')
    if (!result.data.length) {
      await client.logout()
      return { ok: false, message: '接口返回为空' }
    }

    await client.logout()
    return { ok: true, message: `连接成功 · 交易日历 ${result.data.length} 条` }
  } catch (e) {
    await client.disconnect()
    if (e instanceof BaostockApiError || e instanceof BaostockProtocolError) {
      return { ok: false, message: e.message }
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export { parseResponse, parseDataRecords, parseFields, organizeMsgBody }
