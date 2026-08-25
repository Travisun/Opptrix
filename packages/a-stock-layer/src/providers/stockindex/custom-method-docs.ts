import type { CustomMethodApiDoc } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'
import { STOCKINDEX_DEFAULT_BASE_URL } from './settings.js'

const BASE = STOCKINDEX_DEFAULT_BASE_URL
const INVOKE = (method: string, args = '["茅台"]') =>
  `engine.invokeCustomMethod("stockindex", "${method}", ${args})`

export const STOCKINDEX_METHOD_DOCS: Record<string, CustomMethodApiDoc> = {
  stockIndexListStocks: {
    method: 'stockIndexListStocks',
    description: '个股名录（分页，走 OpptrixQuant 标的检索）',
    sourceUrl: `${BASE}/api/v1/instruments?class_token=stock`,
    pageUrl: 'https://quant.opptrix.net',
    params: [
      { name: 'market', type: 'string', description: 'CN / HK / US / JP / KR / SG', default: 'CN' },
      { name: 'page', type: 'number', description: '页码，从 1 起', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 35', default: 35 },
      { name: 'q', type: 'string', description: '名称或代码关键词' },
    ],
    returns: '[{ page, pageSize, total, items, source }]',
    usage: INVOKE('stockIndexListStocks', '["CN",1,35]'),
    example: '{"provider":"stockindex","method":"stockIndexListStocks","args":["HK",1,35]}',
    notes: '单页 ≤ 35，需 API Key（X-API-Key）；日/月配额超限返回 429',
  },
  fundMetrics: {
    method: 'fundMetrics',
    description: '基金绩效指标（总收益 / 年化 / 胜率 / 最大回撤 / 波动率 / 夏普 / 索提诺 / 卡玛）',
    sourceUrl: `${BASE}/api/v1/funds/{code}/metrics`,
    pageUrl: 'https://quant.opptrix.net',
    params: [
      { name: 'code', type: 'string', description: '6 位公募基金代码', required: true },
    ],
    returns: '[{ code, name, asOfDate, startDate, endDate, totalReturn, annualReturn, winRate, maxDrawdown, annualVol, downsideVol, sharpe, sortino, calmar, days, source }]；无指标或非基金代码时 null',
    usage: INVOKE('fundMetrics', '["009049"]'),
    example: '{"provider":"stockindex","method":"fundMetrics","args":["009049"]}',
    notes: '需 API Key；数值字段为百分比/比率数值（上游为字符串或 null）；as_of_date 为指标基准日',
  },
}

export const STOCKINDEX_CUSTOM = Object.values(STOCKINDEX_METHOD_DOCS).map(toCustomMethodDef)
