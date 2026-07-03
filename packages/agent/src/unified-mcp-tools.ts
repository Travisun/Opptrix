/** 跨市场 InstrumentRef 统一 MCP 工具 — 经 ResearchHub instrument_* 路由 */

export interface JsonSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    items?: unknown
    default?: unknown
    properties?: Record<string, { type: string; description?: string }>
    required?: string[]
  }>
  required?: string[]
}

export interface UnifiedInstrumentToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

const INSTRUMENT_OBJECT_PROPERTIES: Record<string, { type: string; description?: string }> = {
  market: {
    type: 'string',
    description: '市场：CN | US | HK | JP | KR | CRYPTO',
  },
  symbol: {
    type: 'string',
    description: '标的代码，如 600519、AAPL、7203、BTC',
  },
  assetClass: {
    type: 'string',
    description: '可选资产类型：EQUITY | ETF | INDEX | FUND | CRYPTO_SPOT | CRYPTO_PERP',
  },
  quote: {
    type: 'string',
    description: 'Crypto 计价币，如 USDT（CRYPTO 市场常用）',
  },
  exchange: {
    type: 'string',
    description: '可选交易所或板块标识',
  },
}

/** 可复用的 InstrumentRef 参数字段：嵌套 instrument 对象，或平铺 market + symbol */
export const INSTRUMENT_REF_SCHEMA: JsonSchema['properties'] = {
  instrument: {
    type: 'object',
    description: 'InstrumentRef 对象（推荐）：含 market、symbol；Crypto 需 quote',
    properties: INSTRUMENT_OBJECT_PROPERTIES,
    required: ['market', 'symbol'],
  },
  market: {
    type: 'string',
    description: '平铺写法：市场 CN | US | HK | JP | KR | CRYPTO（与 instrument 二选一）',
  },
  symbol: {
    type: 'string',
    description: '平铺写法：标的代码（与 instrument 二选一）',
  },
  assetClass: INSTRUMENT_OBJECT_PROPERTIES.assetClass,
  quote: INSTRUMENT_OBJECT_PROPERTIES.quote,
  exchange: INSTRUMENT_OBJECT_PROPERTIES.exchange,
}

function resolveInstrumentParams(args: Record<string, unknown>): Record<string, unknown> {
  if (args.instrument && typeof args.instrument === 'object') {
    return { instrument: args.instrument }
  }
  const flat: Record<string, unknown> = {}
  if (args.market != null) flat.market = args.market
  if (args.symbol != null) flat.symbol = args.symbol
  if (args.assetClass != null) flat.assetClass = args.assetClass
  if (args.quote != null) flat.quote = args.quote
  if (args.exchange != null) flat.exchange = args.exchange
  return flat
}

function legacyCodeFrom(args: Record<string, unknown>): string | undefined {
  if (args.code != null) return String(args.code)
  if (args.instrument && typeof args.instrument === 'object') {
    const sym = (args.instrument as Record<string, unknown>).symbol
    if (sym != null) return String(sym)
  }
  if (args.symbol != null) return String(args.symbol)
  return undefined
}

export const UNIFIED_INSTRUMENT_TOOL_NAMES = [
  'get_instrument_capabilities',
  'get_instrument_snapshot',
  'get_instrument_quotes',
  'batch_instrument_snapshots',
  'get_instrument_chart',
  'evaluate_instrument',
  'get_instrument_strategy_signal',
  'get_instrument_indicators',
  'verify_instrument_strategy',
  'get_instrument_latest_evaluation',
  'get_instrument_cyq',
] as const

export const UNIFIED_MINING_INSTRUMENT_TOOLS = [
  'get_instrument_capabilities',
  'get_instrument_snapshot',
  'get_instrument_quotes',
  'get_instrument_chart',
  'get_instrument_strategy_signal',
  'evaluate_instrument',
  'get_instrument_indicators',
] as const

export const LEGACY_MARKET_DATA_TOOL_NAMES = [
  'get_us_stock_quote',
  'get_us_stock_kline',
  'get_us_stock_snapshot',
  'get_us_stock_profile',
  'get_us_stock_financials',
  'get_crypto_quote',
  'get_crypto_kline',
  'get_crypto_snapshot',
  'get_stock_quotes',
  'get_stock_kline',
  'get_stock_chart',
  'get_stock_detail',
  'search_us_stocks',
  'search_crypto_pairs',
  'evaluate_stock',
  'get_strategy_signal',
  'strategy_verify',
  'strategy_verify_report',
  'get_latest_evaluation',
  'batch_stock_snapshots',
  'get_stock_cyq',
  'search_stocks',
] as const

const LEGACY_MARKET_DATA_TOOL_SET = new Set<string>(LEGACY_MARKET_DATA_TOOL_NAMES)

export function CHAT_MCP_TOOL_NAMES(registry: { list: () => Array<{ name: string }> }): readonly string[] {
  return registry.list()
    .map(t => t.name)
    .filter(name => !LEGACY_MARKET_DATA_TOOL_SET.has(name))
}

type DispatchFn = (feature: string, params: Record<string, unknown>) => Promise<unknown>
type SchemaFn = (properties: JsonSchema['properties'], required?: string[]) => JsonSchema

export function buildUnifiedInstrumentTools(
  d: DispatchFn,
  S: SchemaFn,
): UnifiedInstrumentToolDef[] {
  return [
    {
      name: 'get_instrument_capabilities',
      category: '跨市场标的',
      description: '查询标的可用能力（快照、行情、K 线、评估等）；不熟悉的市场或代码格式时请先调用',
      parameters: S({ ...INSTRUMENT_REF_SCHEMA }),
      handler: (a) => d('instrument_capabilities', resolveInstrumentParams(a)),
    },
    {
      name: 'get_instrument_snapshot',
      category: '跨市场标的',
      description: '获取单只标的聚合快照（概况、行情、关键指标）；跨市场统一入口，使用 InstrumentRef 指定标的',
      parameters: S({ ...INSTRUMENT_REF_SCHEMA }),
      handler: (a) => d('instrument_snapshot', resolveInstrumentParams(a)),
    },
    {
      name: 'get_instrument_quotes',
      category: '跨市场标的',
      description: '批量获取多只标的最新价、涨跌幅等实时/近收盘行情；instruments 为 InstrumentRef 数组',
      parameters: S({
        instruments: {
          type: 'array',
          description: 'InstrumentRef 数组，每项含 market、symbol（Crypto 需 quote）',
          items: {
            type: 'object',
            properties: INSTRUMENT_OBJECT_PROPERTIES,
            required: ['market', 'symbol'],
          },
        },
      }, ['instruments']),
      handler: (a) => d('instrument_quotes', { instruments: a.instruments }),
    },
    {
      name: 'batch_instrument_snapshots',
      category: '跨市场标的',
      description: '批量获取候选标的本地截面快照（行业、评分、估值、初选因子）；instruments 数组或 codes+market（A 股挖掘初选后首选）',
      parameters: S({
        instruments: {
          type: 'array',
          description: 'InstrumentRef 数组，每项含 market、symbol',
          items: {
            type: 'object',
            properties: INSTRUMENT_OBJECT_PROPERTIES,
            required: ['market', 'symbol'],
          },
        },
        codes: {
          type: 'array',
          description: '兼容写法：标的代码列表（须配合 market，默认 CN）',
        },
        market: {
          type: 'string',
          description: '与 codes 配合使用，默认 CN',
        },
      }),
      handler: (a) => {
        if (Array.isArray(a.instruments) && a.instruments.length) {
          return d('instrument_batch_snapshots', { instruments: a.instruments })
        }
        return d('instrument_batch_snapshots', {
          codes: a.codes,
          market: a.market ?? 'CN',
        })
      },
    },
    {
      name: 'get_instrument_chart',
      category: '跨市场标的',
      description: '获取单只标的 K 线/图表序列；A 股支持多周期，美股/港股/日股/韩股/Crypto 默认日 K',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        period: { type: 'string', description: 'K 线周期，如 daily、weekly、monthly；默认 daily' },
        count: { type: 'number', description: 'K 线根数，默认 120，建议 ≤ 240' },
      }),
      handler: (a) => d('instrument_chart', {
        ...resolveInstrumentParams(a),
        period: a.period ?? 'daily',
        count: a.count ?? 120,
      }),
    },
    {
      name: 'evaluate_instrument',
      category: '跨市场标的',
      description: '对单只标的做评估打分：A 股为因子评分卡，美股/港股/日股/韩股/Crypto 为技术分析 bundle；使用 InstrumentRef',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        code: { type: 'string', description: '兼容旧写法：A 股 6 位代码（推荐改用 instrument 或 market+symbol）' },
        scorecard: { type: 'string', description: '评分卡名称，默认综合评估（A 股因子评估时有效）' },
      }),
      handler: (a) => d('instrument_evaluation', {
        ...resolveInstrumentParams(a),
        code: legacyCodeFrom(a),
        scorecard: a.scorecard ?? '综合评估',
      }),
    },
    {
      name: 'get_instrument_strategy_signal',
      category: '跨市场标的',
      description: '获取单只标的 9 策略融合多空倾向信号；跨市场统一入口，使用 InstrumentRef',
      parameters: S({ ...INSTRUMENT_REF_SCHEMA }),
      handler: (a) => d('instrument_strategy_signal', resolveInstrumentParams(a)),
    },
    {
      name: 'get_instrument_indicators',
      category: '跨市场标的',
      description: '获取单只标的技术指标 bundle（均线位置、动量、波动率等）；跨市场统一入口',
      parameters: S({ ...INSTRUMENT_REF_SCHEMA }),
      handler: (a) => d('instrument_indicators', resolveInstrumentParams(a)),
    },
    {
      name: 'verify_instrument_strategy',
      category: '跨市场标的',
      description: '验证单只标的策略历史信号胜率与 forward 收益；跨市场统一入口，使用 InstrumentRef',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        code: { type: 'string', description: '兼容旧写法：A 股 6 位代码（推荐改用 instrument 或 market+symbol）' },
        checkpoints: { type: 'number', description: '验证点数，默认 30' },
        forward_days: { type: 'number', description: '持有天数，默认 5' },
      }),
      handler: (a) => d('instrument_strategy_verify', {
        ...resolveInstrumentParams(a),
        code: legacyCodeFrom(a),
        checkpoints: a.checkpoints ?? 30,
        forward_days: a.forward_days ?? 5,
      }),
    },
    {
      name: 'get_instrument_latest_evaluation',
      category: '跨市场标的',
      description: '读取单只标的最近一次评估缓存，避免重复 evaluate_instrument；使用 InstrumentRef',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        code: { type: 'string', description: '兼容旧写法：A 股 6 位代码（推荐改用 instrument 或 market+symbol）' },
      }),
      handler: (a) => d('latest_evaluation', {
        ...resolveInstrumentParams(a),
        code: legacyCodeFrom(a),
      }),
    },
    {
      name: 'get_instrument_cyq',
      category: '跨市场标的',
      description: '获取 A 股筹码分布（获利盘、成本区）；仅 CN 市场支持，使用 InstrumentRef',
      parameters: S({ ...INSTRUMENT_REF_SCHEMA }),
      handler: (a) => d('instrument_cyq', resolveInstrumentParams(a)),
    },
  ]
}
