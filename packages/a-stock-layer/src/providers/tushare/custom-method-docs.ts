import type { CustomMethodApiDoc } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'

const INVOKE = (method: string, args = '[]') =>
  `engine.invokeCustomMethod("tushare", "${method}", ${args})`

export const TUSHARE_METHOD_DOCS: Record<string, CustomMethodApiDoc> = {
  tushareFundCompany: {
    method: 'tushareFundCompany',
    description: '公募基金公司列表（fund_company）',
    sourceUrl: 'https://tushare.pro/document/2?doc_id=118',
    params: [],
    returns: '[{ name, shortName, province, city, website, chairman, manager, regCapital, setupDate, ... }]',
    usage: INVOKE('tushareFundCompany'),
    notes: '需 Tushare Token 与积分（约 2000 档）。',
    example: '{"provider":"tushare","method":"tushareFundCompany","args":[]}',
  },
  tushareFundDiv: {
    method: 'tushareFundDiv',
    description: '公募基金分红（fund_div）',
    sourceUrl: 'https://tushare.pro/document/2?doc_id=120',
    params: [
      { name: 'fundCode', type: 'string', description: '6 位基金代码或 ts_code', default: '' },
      { name: 'annDate', type: 'string', description: '公告日 YYYYMMDD，可选', default: '' },
    ],
    returns: '[{ code, annDate, exDate, payDate, divCash, divProc, ... }]',
    usage: INVOKE('tushareFundDiv', '["000001"]'),
    example: '{"provider":"tushare","method":"tushareFundDiv","args":["000001"]}',
  },
  tushareFundDaily: {
    method: 'tushareFundDaily',
    description: '场内基金日线行情（fund_daily，E 场内 ETF/LOF 等）',
    sourceUrl: 'https://tushare.pro/document/2?doc_id=127',
    params: [
      { name: 'fundCode', type: 'string', description: '基金代码或 ts_code', required: true },
      { name: 'startDate', type: 'string', description: '开始日期 YYYYMMDD', default: '' },
      { name: 'endDate', type: 'string', description: '结束日期 YYYYMMDD', default: '' },
    ],
    returns: '[{ code, date, open, high, low, close, changePct, volume, amount, ... }]',
    usage: INVOKE('tushareFundDaily', '["510330","20250101","20250618"]'),
    example: '{"provider":"tushare","method":"tushareFundDaily","args":["510330","20250101","20250618"]}',
  },
  tushareFundAdj: {
    method: 'tushareFundAdj',
    description: '基金复权因子（fund_adj）',
    sourceUrl: 'https://tushare.pro/document/2?doc_id=109',
    params: [
      { name: 'fundCode', type: 'string', description: '基金代码或 ts_code', required: true },
      { name: 'startDate', type: 'string', description: '开始日期', default: '' },
      { name: 'endDate', type: 'string', description: '结束日期', default: '' },
    ],
    returns: '[{ code, tradeDate, adjFactor, ... }]',
    usage: INVOKE('tushareFundAdj', '["510330"]'),
    notes: '较高积分档（约 5000+）。',
    example: '{"provider":"tushare","method":"tushareFundAdj","args":["510330"]}',
  },
  tushareFundBasic: {
    method: 'tushareFundBasic',
    description: '公募基金基础信息原始行（fund_basic，支持 E 场内 / O 场外）',
    sourceUrl: 'https://tushare.pro/document/2?doc_id=19',
    params: [
      { name: 'tsCodeOrCode', type: 'string', description: 'ts_code 或 6 位代码', required: true },
      { name: 'market', type: 'string', description: 'E 场内 / O 场外（裸码时）', default: '' },
    ],
    returns: '[{ ts_code, name, management, custodian, fund_type, market, ... }]',
    usage: INVOKE('tushareFundBasic', '["000001.OF"]'),
    example: '{"provider":"tushare","method":"tushareFundBasic","args":["000001.OF"]}',
  },
  tushareFundNavRaw: {
    method: 'tushareFundNavRaw',
    description: '公募基金净值原始行（fund_nav）',
    sourceUrl: 'https://tushare.pro/document/2?doc_id=119',
    params: [
      { name: 'fundCode', type: 'string', description: '6 位基金代码', required: true },
      { name: 'endDate', type: 'string', description: '净值日期 YYYYMMDD', default: '' },
    ],
    returns: '[{ ts_code, end_date, unit_nav, accum_nav, adj_nav, ... }]',
    usage: INVOKE('tushareFundNavRaw', '["000001"]'),
    example: '{"provider":"tushare","method":"tushareFundNavRaw","args":["000001"]}',
  },
}

export const TUSHARE_CUSTOM = Object.values(TUSHARE_METHOD_DOCS).map(toCustomMethodDef)
