/**
 * 东财宏观数据中心（cjsj）中国指标目录。
 * 页面入口：https://data.eastmoney.com/cjsj/ppi.html 左侧「中国宏观」区。
 */

import {
  EM_FOREIGN_MKT_SUFFIX,
  EM_MACRO_FOREIGN,
  EM_MACRO_INDUSTRY,
  type EmMacroForeignItem,
  type EmMacroIndustryItem,
} from './macro-catalog-data.js'

export type { EmMacroForeignItem, EmMacroIndustryItem }
export { EM_FOREIGN_MKT_SUFFIX, EM_MACRO_FOREIGN, EM_MACRO_INDUSTRY }

export interface EmMacroCnDef {
  /** 稳定 key（与页面文件名一致，如 ppi / cpi） */
  key: string
  /** 中文名 */
  name: string
  reportName: string
  sortColumns: string
  pageUrl: string
  /** LPR 等少数报表需要 token */
  token?: string
  /** 匹配 macroIndicator 的别名 */
  aliases: string[]
}

const PAGE = (slug: string) => `https://data.eastmoney.com/cjsj/${slug}.html`

/** 中国宏观主表（油价为组合接口，见 emMacroOil*） */
export const EM_MACRO_CN: EmMacroCnDef[] = [
  { key: 'cpi', name: '居民消费价格指数(CPI)', reportName: 'RPT_ECONOMY_CPI', sortColumns: 'REPORT_DATE', pageUrl: PAGE('cpi'), aliases: ['cpi', '通胀', '物价'] },
  { key: 'ppi', name: '工业品出厂价格指数(PPI)', reportName: 'RPT_ECONOMY_PPI', sortColumns: 'REPORT_DATE', pageUrl: PAGE('ppi'), aliases: ['ppi', '出厂'] },
  { key: 'gdp', name: '国内生产总值(GDP)', reportName: 'RPT_ECONOMY_GDP', sortColumns: 'REPORT_DATE', pageUrl: PAGE('gdp'), aliases: ['gdp', '生产总值'] },
  { key: 'pmi', name: '采购经理人指数(PMI)', reportName: 'RPT_ECONOMY_PMI', sortColumns: 'REPORT_DATE', pageUrl: PAGE('pmi'), aliases: ['pmi', '景气'] },
  { key: 'gdzctz', name: '城镇固定资产投资', reportName: 'RPT_ECONOMY_ASSET_INVEST', sortColumns: 'REPORT_DATE', pageUrl: PAGE('gdzctz'), aliases: ['gdzctz', '固投', '投资'] },
  { key: 'house', name: '房价指数(08—10年)', reportName: 'RPT_ECONOMY_HOSE_INDEX', sortColumns: 'REPORT_DATE', pageUrl: PAGE('house'), aliases: ['house', '房价'] },
  { key: 'newhouse', name: '新房价指数', reportName: 'RPT_ECONOMY_HOUSE_PRICE', sortColumns: 'REPORT_DATE', pageUrl: PAGE('newhouse'), aliases: ['newhouse', '新房'] },
  { key: 'qyjqzs', name: '企业景气及企业家信心指数', reportName: 'RPT_ECONOMY_BOOM_INDEX', sortColumns: 'REPORT_DATE', pageUrl: PAGE('qyjqzs'), aliases: ['qyjqzs', '企业景气'] },
  { key: 'gyzjz', name: '工业增加值增长', reportName: 'RPT_ECONOMY_INDUS_GROW', sortColumns: 'REPORT_DATE', pageUrl: PAGE('gyzjz'), aliases: ['gyzjz', '工业增加值'] },
  { key: 'qyspjg', name: '企业商品价格指数', reportName: 'RPT_ECONOMY_GOODS_INDEX', sortColumns: 'REPORT_DATE', pageUrl: PAGE('qyspjg'), aliases: ['qyspjg', '企业商品'] },
  { key: 'xfzxx', name: '消费者信心指数', reportName: 'RPT_ECONOMY_FAITH_INDEX', sortColumns: 'REPORT_DATE', pageUrl: PAGE('xfzxx'), aliases: ['xfzxx', '消费者信心'] },
  { key: 'xfp', name: '社会消费品零售总额', reportName: 'RPT_ECONOMY_TOTAL_RETAIL', sortColumns: 'REPORT_DATE', pageUrl: PAGE('xfp'), aliases: ['xfp', '社零', '零售'] },
  { key: 'hbgyl', name: '货币供应量', reportName: 'RPT_ECONOMY_CURRENCY_SUPPLY', sortColumns: 'REPORT_DATE', pageUrl: PAGE('hbgyl'), aliases: ['hbgyl', 'm2', '货币供应'] },
  { key: 'hgjck', name: '海关进出口增减情况一览表', reportName: 'RPT_ECONOMY_CUSTOMS', sortColumns: 'REPORT_DATE', pageUrl: PAGE('hgjck'), aliases: ['hgjck', '进出口', '海关'] },
  { key: 'gpjytj', name: '全国股票交易统计表', reportName: 'RPT_ECONOMY_STOCK_STATISTICS', sortColumns: 'REPORT_DATE', pageUrl: PAGE('gpjytj'), aliases: ['gpjytj', '股票交易'] },
  { key: 'hjwh', name: '外汇和黄金储备', reportName: 'RPT_ECONOMY_GOLD_CURRENCY', sortColumns: 'REPORT_DATE', pageUrl: PAGE('hjwh'), aliases: ['hjwh', '外储', '黄金储备'] },
  { key: 'banktransfer', name: '交易结算资金(银证转账)', reportName: 'RPT_BANKSECURITY_TRANSFER_FUND', sortColumns: 'END_DATE', pageUrl: PAGE('banktransfer'), aliases: ['banktransfer', '银证转账', '结算资金'] },
  { key: 'fdi', name: '外商直接投资:实际利用外资金额', reportName: 'RPT_ECONOMY_FDI_NEW', sortColumns: 'REPORT_DATE', pageUrl: PAGE('fdi'), aliases: ['fdi', '外资'] },
  { key: 'czsr', name: '财政收入', reportName: 'RPT_ECONOMY_INCOME', sortColumns: 'REPORT_DATE', pageUrl: PAGE('czsr'), aliases: ['czsr', '财政'] },
  { key: 'qgsssr', name: '全国税收收入', reportName: 'RPT_ECONOMY_TAX', sortColumns: 'REPORT_DATE', pageUrl: PAGE('qgsssr'), aliases: ['qgsssr', '税收'] },
  { key: 'xzxd', name: '新增信贷数据', reportName: 'RPT_ECONOMY_RMB_LOAN', sortColumns: 'REPORT_DATE', pageUrl: PAGE('xzxd'), aliases: ['xzxd', '信贷'] },
  { key: 'wbck', name: '本外币存款', reportName: 'RPT_ECONOMY_FOREX_DEPOSIT', sortColumns: 'REPORT_DATE', pageUrl: PAGE('wbck'), aliases: ['wbck', '存款'] },
  { key: 'whxd', name: '外汇贷款数据', reportName: 'RPT_ECONOMY_FOREX_LOAN', sortColumns: 'REPORT_DATE', pageUrl: PAGE('whxd'), aliases: ['whxd', '外汇贷款'] },
  { key: 'ckzbj', name: '存款准备金率', reportName: 'RPT_ECONOMY_DEPOSIT_RESERVE', sortColumns: 'REPORT_DATE', pageUrl: PAGE('ckzbj'), aliases: ['ckzbj', '准备金', 'rrr'] },
  { key: 'yhll', name: '利率调整', reportName: 'RPT_ECONOMY_DEPOSIT_RATE', sortColumns: 'REPORT_DATE', pageUrl: PAGE('yhll'), aliases: ['yhll', '存款利率', '贷款利率'] },
  {
    key: 'lpr',
    name: 'LPR数据',
    reportName: 'RPTA_WEB_RATE',
    sortColumns: 'TRADE_DATE',
    pageUrl: PAGE('globalRateLPR'),
    token: '8944c01f984b480b601f8213e9a4a8ae',
    aliases: ['lpr', '贷款报价'],
  },
]

export function findMacroCn(indicator: string): EmMacroCnDef | undefined {
  const want = indicator.trim().toLowerCase()
  if (!want) return undefined
  return EM_MACRO_CN.find(
    d => d.key === want || d.aliases.some(a => a === want || want.includes(a) || a.includes(want)),
  )
}

export function findMacroForeign(keyOrIdOrName: string): EmMacroForeignItem | undefined {
  const want = keyOrIdOrName.trim()
  if (!want) return undefined
  const low = want.toLowerCase()
  return EM_MACRO_FOREIGN.find(
    d => d.key === want
      || d.indicatorId === want
      || d.name === want
      || d.name.toLowerCase().includes(low)
      || d.country.includes(want),
  )
}

export function findMacroIndustry(keyOrIdOrName: string): EmMacroIndustryItem | undefined {
  const want = keyOrIdOrName.trim()
  if (!want) return undefined
  const low = want.toLowerCase()
  return EM_MACRO_INDUSTRY.find(
    d => d.key === want
      || d.indicatorId === want
      || d.name === want
      || d.name.toLowerCase().includes(low),
  )
}

export function foreignReportName(mkt: number): string {
  const suffix = EM_FOREIGN_MKT_SUFFIX[mkt] ?? EM_FOREIGN_MKT_SUFFIX[0]
  return `RPT_ECONOMICVALUE_${suffix}`
}
