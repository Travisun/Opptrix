/**
 * Provider 标准方法注册表 — Capability 驱动方法与扩展自定义方法的分层约定。
 *
 * 三层结构：
 * 1. Raw API（providers 下 api 目录）— HTTP / 协议细节
 * 2. Service（*-service.ts / standard-*.ts）— 带 source 的标准化响应
 * 3. Driver（markets handler + ext）— BaseDriver 标准方法 + Provider 前缀自定义方法
 *
 * Engine 仅通过 CAP_METHOD 映射调用；自定义方法供 ResearchHub feature 或 Agent 工具直连。
 */
import { Capability } from '../../core/capabilities.js'

/** 已实现 Capability 绑定的标准 Driver 方法 */
export const STANDARD_DRIVER_METHODS = [
  'realtime', 'batchRealtime', 'kline', 'moneyFlow',
  'indexRealtime', 'indexKline', 'marketMoneyFlow', 'sectorMoneyFlow',
  'sectorList', 'profile', 'shareholders', 'financials', 'news', 'sentiment',
  'dragonTiger', 'marginTrade', 'dividend', 'stockBasic', 'stockList',
  'limitUpdown', 'marketBreadth', 'globalIndex', 'exchangeRate', 'tradeCalendar',
  'cashFlow', 'balanceSheet', 'incomeStatement', 'instHolding', 'blockTrade',
  'lockupExpiry', 'sharePledge', 'intradayTick', 'indexConstituents',
  'insiderTrade', 'perfForecast', 'ipoData', 'convertibleBonds', 'macroIndicator',
  'chipDistribution', 'chipProfile', 'mainBusiness', 'topCustomerSupplier',
  'actualController', 'subsidiaries', 'relatedPartyTrades', 'rdInvestment',
  'maEvents', 'employeeComposition', 'institutionalVisits', 'peerCompanies',
  'managerInfo', 'shareholderPlans', 'buyback',
  'etfData', 'etfList', 'etfProfile', 'etfNav', 'etfHoldings',
] as const

/** CN ETF 四件套 — 本地 sync / EtfDetailTab / localEtfScreen 依赖 */
export const CN_ETF_STANDARD_METHODS = [
  'etfList',
  'etfProfile',
  'etfNav',
  'etfHoldings',
] as const

/** Phase-2 ETF 扩展方法（尚未纳入 Capability 枚举，由 Provider 自定义方法暴露） */
export const CN_ETF_EXTENDED_METHODS = [
  'etfShareChange',      // 申赎份额变动 → 未来 ETF_FLOW
  'etfFees',             // 费率与交易规则
  'etfDividends',        // 现金分红
  'etfAnnouncements',    // 基金公告
  'etfTopHolders',       // 十大持有人
  'etfHolderStructure',  // 持有人结构
  'etfDocuments',        // 法律文件
  'etfAgencies',         // 销售机构
] as const

/** 各 Provider 已实现的 ETF 标准方法覆盖（维护于 manifest + handler） */
export const PROVIDER_ETF_COVERAGE: Record<string, readonly string[]> = {
  zzshare: ['etfList', 'etfProfile', 'etfNav'],
  baostock: ['etfList', 'etfProfile', 'etfNav', 'etfHoldings'],
  tickflow: ['etfList', 'etfProfile'],
  sinafinance: ['etfList', 'etfProfile', 'etfNav', 'etfHoldings'],
  tencent: ['etfList', 'etfProfile', 'etfNav', 'etfHoldings'],
}

/** 建议新增的 Capability（DATA-LAYER Phase-2） */
export const PLANNED_ETF_CAPABILITIES = [
  'etf_flow',           // 份额变动 / 申赎
  'etf_fees',           // 费率
  'etf_dividend',       // 分红（与 EQUITY DIVIDEND 区分）
  'etf_announcement',   // 公告
] as const

export function capabilityForMethod(method: string): Capability | undefined {
  for (const [cap, name] of Object.entries({
    [Capability.ETF_LIST]: 'etfList',
    [Capability.ETF_PROFILE]: 'etfProfile',
    [Capability.ETF_NAV]: 'etfNav',
    [Capability.ETF_HOLDINGS]: 'etfHoldings',
    [Capability.ETF_DATA]: 'etfData',
    [Capability.STOCK_REALTIME]: 'realtime',
    [Capability.STOCK_KLINE]: 'kline',
  })) {
    if (name === method) return cap as Capability
  }
  return undefined
}
