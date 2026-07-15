/** 东方财富 push2 / datacenter 公共常量与响应形态 */

export const EM_REFERER = 'https://data.eastmoney.com/'
export const EM_UT = 'b2884a393a59ad64002292a3e90d46a5'
export const EM_UT_CLIST = '8dec03ba335b81bf4ebdf7b29ec27d15'

export const EM_DATACENTER = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
export const EM_PUSH2 = 'https://push2.eastmoney.com'
export const EM_PUSH2HIS = 'https://push2his.eastmoney.com'

/** 个股主力排名板块过滤（对应 zjlx/list.html） */
export const EM_STOCK_RANK_FS: Record<string, string> = {
  all: 'm:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:7+f:!2,m:1+t:3+f:!2',
  hsa: 'm:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2',
  sha: 'm:1+t:2+f:!2,m:1+t:23+f:!2',
  sza: 'm:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2',
  cyb: 'm:0+t:80+f:!2',
  zxb: 'm:0+t:13+f:!2',
  bja: 'm:0+t:81+f:!2',
  hb: 'm:1+t:3+f:!2',
  sb: 'm:0+t:7+f:!2',
}

/** 板块资金流 fs（行业 / 概念 / 地域）— 对应 bkzj */
export const EM_BOARD_FS: Record<string, string> = {
  industry: 'm:90+s:4',
  hy: 'm:90+s:4',
  '14': 'm:90+s:4',
  concept: 'm:90+t:3',
  gn: 'm:90+t:3',
  '15': 'm:90+t:3',
  region: 'm:90+t:1',
  dy: 'm:90+t:1',
  area: 'm:90+t:1',
  '1': 'm:90+t:1',
}

/** 资金流监控排序字段：1=今日主力 / 5=5 日 / 10=10 日 */
export const EM_FLOW_STAT_FID: Record<string, string> = {
  '1': 'f62',
  today: 'f62',
  '5': 'f164',
  '10': 'f174',
}

export const EM_FFLOW_FIELDS1 = 'f1,f2,f3,f7'
export const EM_FFLOW_FIELDS2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65'
export const EM_CLIST_FIELDS =
  'f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124,f164,f174'

/** 融资融券分市场 SCDM */
export const EM_MARGIN_MARKET: Record<string, string> = {
  sh: '007',
  sha: '007',
  沪: '007',
  sz: '001',
  sza: '001',
  深: '001',
  bj: '002',
  bja: '002',
  京: '002',
}

export interface EmDatacenterResult {
  pages?: number
  count?: number
  data?: Record<string, unknown>[]
}

export interface EmDatacenterResponse {
  version?: string
  result?: EmDatacenterResult | null
  success?: boolean
  message?: string
  code?: number
}

export interface EmPush2Data {
  total?: number
  diff?: Record<string, unknown>[]
  klines?: string[]
  code?: string
  name?: string
  market?: number
}

export interface EmPush2Response {
  rc?: number
  rt?: number
  svr?: number
  lt?: number
  full?: number
  data?: EmPush2Data | null
}
