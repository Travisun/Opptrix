import type { CustomMethodApiDoc } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'
import { AKSHARE_CUSTOM_METHOD_NAMES } from './custom-method-catalog.js'
import type { CustomMethodParam } from '../../core/custom-methods.js'

const INVOKE = (method: string, args = '[]') =>
  `engine.invokeCustomMethod("akshare", "${method}", ${args})`

const CATEGORY_HINTS: Array<{ prefix: string; label: string }> = [
  { prefix: 'amac', label: 'AMAC 私募/基金业' },
  { prefix: 'bond', label: '债券' },
  { prefix: 'futures', label: '期货' },
  { prefix: 'currency', label: '汇率' },
  { prefix: 'energy', label: '能源/碳排放' },
  { prefix: 'movie', label: '票房' },
  { prefix: 'indexOption', label: '期权波动率' },
  { prefix: 'sse', label: '上交所' },
  { prefix: 'szse', label: '深交所' },
  { prefix: 'repo', label: '回购利率' },
  { prefix: 'qdii', label: 'QDII' },
  { prefix: 'stock', label: 'A 股市场指标' },
]

function categoryLabel(method: string): string {
  const hit = CATEGORY_HINTS.find(row => method.startsWith(row.prefix))
  return hit?.label ?? 'AKShare 另类数据'
}

function inferParams(method: string): CustomMethodParam[] {
  if (method.includes('Daily') || method.includes('Hist') || method.includes('History')) {
    return [
      { name: 'startDate', type: 'string', description: '起始日期 YYYY-MM-DD' },
      { name: 'endDate', type: 'string', description: '结束日期 YYYY-MM-DD' },
    ]
  }
  if (method.endsWith('Sina') || method.includes('symbol') || method.includes('Symbol')) {
    return [{ name: 'symbol', type: 'string', description: '合约/品种/代码', required: true }]
  }
  if (method.includes('date') || method.includes('Date')) {
    return [{ name: 'date', type: 'string', description: '日期 YYYY-MM-DD' }]
  }
  if (method === 'amacFundInfo') {
    return [
      { name: 'startPage', type: 'number', description: '起始页', required: true },
      { name: 'endPage', type: 'number', description: '结束页', required: true },
    ]
  }
  if (method === 'currencyConvert') {
    return [
      { name: 'from', type: 'string', description: '源币种', default: 'USD' },
      { name: 'to', type: 'string', description: '目标币种', default: 'CNY' },
      { name: 'amount', type: 'number', description: '金额', default: 10000 },
    ]
  }
  return []
}

function buildDoc(method: string): CustomMethodApiDoc {
  const label = categoryLabel(method)
  const params = inferParams(method)
  return {
    method,
    description: `${method}（${label}）`,
    sourceUrl: 'https://akshare.akfamily.xyz/',
    params,
    returns: 'Record<string, unknown>[] | null',
    usage: INVOKE(method),
    notes: '非标准 Instrument API，请使用 list_provider_custom_methods / invoke_provider_custom_method',
    example: `{"provider":"akshare","method":"${method}","args":[]}`,
  }
}

export const AKSHARE_METHOD_DOCS: Record<string, CustomMethodApiDoc> = Object.fromEntries(
  AKSHARE_CUSTOM_METHOD_NAMES.map(method => [method, buildDoc(method)]),
)

export const AKSHARE_CUSTOM = AKSHARE_CUSTOM_METHOD_NAMES.map(
  method => toCustomMethodDef(AKSHARE_METHOD_DOCS[method]!),
)
