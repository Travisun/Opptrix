import type { CustomMethodDef, CustomMethodParam, ProviderCustomMethods } from './custom-methods.js'
import { listProviderCustomMethods } from './custom-methods.js'

const FULL_PROVIDER_THRESHOLD = 24
const DEFAULT_METHOD_LIMIT = 40
const OVERVIEW_SAMPLE_SIZE = 8

const AKSHARE_CATEGORY_HINTS = [
  'AMAC 私募/基金业（amac*）',
  '债券（bond*）',
  '期货（futures*）',
  '汇率（currency*）',
  '能源/碳排放（energy*）',
  '期权波动率（indexOption*）',
  '上交所（sse*）',
  '深交所（szse*）',
  'A 股市场指标（stock*）',
]

export type AgentCustomMethodEntry = {
  method: string
  description: string
  params: CustomMethodParam[]
  example?: string
}

export type AgentCustomMethodProviderBlock = {
  providerId: string
  methodCount: number
  methods: AgentCustomMethodEntry[]
  truncated?: boolean
  categoryHints?: string[]
  hint?: string
}

export type AgentCustomMethodListResult = {
  providers: AgentCustomMethodProviderBlock[]
  usageHint: string
}

function compactMethod(def: CustomMethodDef): AgentCustomMethodEntry {
  return {
    method: def.method,
    description: def.description,
    params: def.params,
    example: def.example,
  }
}

function matchesKeyword(def: CustomMethodDef, keyword: string): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  return def.method.toLowerCase().includes(q)
    || def.description.toLowerCase().includes(q)
}

function summarizeProvider(
  block: ProviderCustomMethods,
  keyword?: string,
  limit = DEFAULT_METHOD_LIMIT,
): AgentCustomMethodProviderBlock {
  const filtered = keyword
    ? block.methods.filter(m => matchesKeyword(m, keyword))
    : block.methods
  const methodCount = block.methods.length

  if (!keyword && methodCount > FULL_PROVIDER_THRESHOLD) {
    return {
      providerId: block.providerId,
      methodCount,
      methods: filtered.slice(0, OVERVIEW_SAMPLE_SIZE).map(compactMethod),
      truncated: true,
      categoryHints: block.providerId === 'akshare' ? AKSHARE_CATEGORY_HINTS : undefined,
      hint: block.providerId === 'akshare'
        ? `共 ${methodCount} 个方法，请传 keyword（如 bond、amac、sse、stock）或精确 method 名后重试`
        : `共 ${methodCount} 个方法，请传 keyword 或 provider_id 缩小范围`,
    }
  }

  const capped = filtered.slice(0, Math.max(1, limit))
  return {
    providerId: block.providerId,
    methodCount: filtered.length,
    methods: capped.map(compactMethod),
    truncated: filtered.length > capped.length,
    hint: filtered.length > capped.length
      ? `匹配 ${filtered.length} 个，已截断为前 ${capped.length} 个；请缩小 keyword 或提高 limit`
      : undefined,
  }
}

/** Agent 友好的自定义方法目录 — 控制 token 体积，支持 keyword / limit 过滤 */
export function listCustomMethodsForAgent(options?: {
  providerId?: string
  keyword?: string
  limit?: number
}): AgentCustomMethodListResult {
  const keyword = options?.keyword?.trim() || undefined
  const limit = options?.limit != null && options.limit > 0
    ? Math.min(Math.floor(options.limit), 80)
    : DEFAULT_METHOD_LIMIT

  const raw = listProviderCustomMethods(options?.providerId)
  const providers = raw.map(block => summarizeProvider(block, keyword, limit))

  const usageHint = [
    '标准 Instrument API（get_instrument_* / search_instruments）已覆盖的行情、K 线、快照、搜索优先使用，勿重复调自定义方法。',
    '调用链：list_enabled_providers → list_provider_custom_methods(provider_id, keyword?) → invoke_provider_custom_method。',
    'invoke 的 args 为 JSON 数组，按 params 顺序传参；code/symbol 支持 InstrumentRef、CN:代码、600519.SH、sh600519，引擎自动转为 Provider 格式。',
    keyword
      ? `当前 keyword="${keyword}"；无结果时请换关键词或去掉 provider_id 浏览分类提示。`
      : '大数据源（如 akshare）须带 provider_id 或 keyword，避免一次拉全量方法列表。',
  ].join(' ')

  return { providers, usageHint }
}
