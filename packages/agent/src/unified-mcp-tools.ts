/** 跨市场 InstrumentRef 统一 MCP 工具 — 经 ResearchHub instrument_* 路由 */

import { normalizeInstrumentHubParams } from '@opptrix/shared'

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
    description: '市场：CN | US | HK | CRYPTO（JP/KR 暂未接入行情）',
  },
  symbol: {
    type: 'string',
    description: '裸标的代码（如 000009、AAPL）；A 股须配合 exchange；勿填 CN:SZ.xxx 命名空间',
  },
  assetClass: {
    type: 'string',
    description: '可选资产类型：EQUITY | ETF | INDEX | FUND | CRYPTO_SPOT | CRYPTO_PERP（通常由 search 命中提供，勿自行推断指数）',
  },
  quote: {
    type: 'string',
    description: 'Crypto 计价币，如 USDT（CRYPTO 市场常用）',
  },
  exchange: {
    type: 'string',
    description: 'A 股交易所 SH | SZ | BJ（消歧同码异名，必填）',
  },
  code: {
    type: 'string',
    description: 'Stock-index 命名空间（推荐）：CN:SZ.000009、US:AAPL、HK:00700；引擎自动解析',
  },
}

/** 可复用的 InstrumentRef 参数字段：嵌套 instrument 对象，或平铺 market + symbol */
export const INSTRUMENT_REF_SCHEMA: JsonSchema['properties'] = {
  instrument: {
    type: 'object',
    description: 'InstrumentRef（推荐）：search_instruments 返回的 instrument；含 market、symbol、exchange',
    properties: INSTRUMENT_OBJECT_PROPERTIES,
    required: ['market', 'symbol'],
  },
  code: INSTRUMENT_OBJECT_PROPERTIES.code,
  market: {
    type: 'string',
    description: '平铺写法：市场 CN | US | HK | CRYPTO（与 instrument/code 二选一）',
  },
  symbol: {
    type: 'string',
    description: '平铺写法：裸代码 + exchange（与 instrument/code 二选一）',
  },
  assetClass: INSTRUMENT_OBJECT_PROPERTIES.assetClass,
  quote: INSTRUMENT_OBJECT_PROPERTIES.quote,
  exchange: INSTRUMENT_OBJECT_PROPERTIES.exchange,
}

function resolveInstrumentParams(args: Record<string, unknown>): Record<string, unknown> {
  return normalizeInstrumentHubParams(args)
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
  'search_instruments',
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
  'get_instrument_institution_rating',
  'get_instrument_institution_report',
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

export function CHAT_MCP_TOOL_NAMES(registry: { list: () => Array<{ name: string }> }): readonly string[] {
  return registry.list().map(t => t.name)
}

type DispatchFn = (feature: string, params: Record<string, unknown>) => Promise<unknown>
type SchemaFn = (properties: JsonSchema['properties'], required?: string[]) => JsonSchema

export function buildUnifiedInstrumentTools(
  d: DispatchFn,
  S: SchemaFn,
): UnifiedInstrumentToolDef[] {
  return [
    {
      name: 'search_instruments',
      category: '跨市场标的',
      description: '按代码或名称在线搜索标的（唯一搜索入口）；可用 markets 过滤 CN/US/HK/CRYPTO',
      parameters: S({
        keyword: { type: 'string', description: '搜索关键词' },
        markets: { type: 'array', description: '可选市场过滤，如 CN、US、HK、CRYPTO' },
        limit: { type: 'number', description: '返回条数，默认 30，最大 50' },
      }, ['keyword']),
      handler: (a) => d('instrument_search', a),
    },
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
      name: 'get_instrument_profile',
      category: '基本面',
      description: '公司/标的概况事实表（主业、行业、概念、上市信息等）；核实「做什么的」时优先于 snapshot 碎片',
      parameters: S({ ...INSTRUMENT_REF_SCHEMA }),
      handler: (a) => d('instrument_profile', resolveInstrumentParams(a)),
    },
    {
      name: 'get_instrument_financials',
      category: '基本面',
      description: '财务摘要多期事实表（营收/利润/ROE/同比等）；核实增速与质量时使用，勿用 evaluate 黑盒代替。要资产负债/现金流明细请改用对应工具',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        report_type: {
          type: 'string',
          description: '报告类型：all（默认，多期）| annual | quarter',
        },
        report_date: {
          type: 'string',
          description: '可选，报告期 YYYY-MM-DD；空则返回可用最近若干期',
        },
      }),
      handler: (a) => d('instrument_financials', {
        ...resolveInstrumentParams(a),
        report_type: a.report_type ?? 'all',
        report_date: a.report_date ?? '',
      }),
    },
    {
      name: 'get_instrument_balance_sheet',
      category: '基本面',
      description: '资产负债表多期事实表（经 queryInstrumentData balance_sheet）；核实总资产/负债/权益时优先于摘要',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        report_date: {
          type: 'string',
          description: '可选，过滤报告期 YYYY-MM-DD（返回该日及之后）',
        },
      }),
      handler: (a) => d('instrument_balance_sheet', {
        ...resolveInstrumentParams(a),
        report_date: a.report_date ?? '',
      }),
    },
    {
      name: 'get_instrument_cash_flow',
      category: '基本面',
      description: '现金流量表多期事实表（经 queryInstrumentData cash_flow）；核实经营/筹资/投资现金流时使用',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        report_date: {
          type: 'string',
          description: '可选，过滤报告期 YYYY-MM-DD（返回该日及之后）',
        },
      }),
      handler: (a) => d('instrument_cash_flow', {
        ...resolveInstrumentParams(a),
        report_date: a.report_date ?? '',
      }),
    },
    {
      name: 'get_instrument_shareholders',
      category: '基本面',
      description: '股东结构事实表（十大股东/股本等）；核实股权集中度或机构持仓时使用',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        report_date: {
          type: 'string',
          description: '可选，报告期 YYYY-MM-DD',
        },
      }),
      handler: (a) => d('instrument_shareholders', {
        ...resolveInstrumentParams(a),
        report_date: a.report_date,
      }),
    },
    {
      name: 'get_instrument_dividend',
      category: '基本面',
      description: '分红派息历史事实表；核实分红政策与历史派息时使用',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        page: { type: 'number', description: '可选，页码（港股等分页源）' },
        page_size: { type: 'number', description: '可选，每页条数' },
      }),
      handler: (a) => d('instrument_dividend', {
        ...resolveInstrumentParams(a),
        page: a.page,
        page_size: a.page_size,
      }),
    },
    {
      name: 'get_instrument_money_flow',
      category: '市场资金',
      description: '个股资金流向事实表（主力/散户等）；核实北向或主力进出时使用，勿用 market_dynamics 笼统代替',
      parameters: S({ ...INSTRUMENT_REF_SCHEMA }),
      handler: (a) => d('instrument_money_flow', resolveInstrumentParams(a)),
    },
    {
      name: 'get_instrument_notices',
      category: '公告研报',
      description: '按标的拉取上市公司公告/披露列表；读全文时再对条目 url 调用 get_notice_content',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        page: { type: 'number', description: '页码，默认 1' },
        page_size: { type: 'number', description: '每页条数，默认 20，最大 50' },
      }),
      handler: (a) => d('instrument_notices', {
        ...resolveInstrumentParams(a),
        page: a.page ?? 1,
        page_size: a.page_size ?? 20,
      }),
    },
    {
      name: 'get_sector_list',
      category: '行业板块',
      description: '板块或行业目录（boards / industries）；拿 board_key / industry_code 后再调 get_sector_constituents',
      parameters: S({
        market: { type: 'string', description: '市场 CN|US|HK，默认 CN' },
        kind: { type: 'string', description: 'industries（默认）或 boards' },
        level: { type: 'string', description: '行业层级 1|2（仅 industries）' },
        plate_type: {
          type: 'string',
          description: '可选，直接传 plateType 如 industries:CN、boards:HK、board:hsj:CN',
        },
      }),
      handler: (a) => d('sector_list', {
        market: a.market ?? 'CN',
        kind: a.kind ?? 'industries',
        level: a.level,
        plate_type: a.plate_type,
      }),
    },
    {
      name: 'get_sector_constituents',
      category: '行业板块',
      description: '板块或行业成分股列表；须先有 board_key 或 industry_code（来自 get_sector_list）',
      parameters: S({
        market: { type: 'string', description: '市场 CN|US|HK，默认 CN' },
        board_key: { type: 'string', description: '板块键，如 hsj、cyb' },
        industry_code: { type: 'string', description: '行业代码（如申万）' },
        page: { type: 'number', description: '页码，默认 1' },
        page_size: { type: 'number', description: '每页条数，默认 50，最大 100' },
      }),
      handler: (a) => d('sector_constituents', {
        market: a.market ?? 'CN',
        board_key: a.board_key,
        industry_code: a.industry_code,
        page: a.page ?? 1,
        page_size: a.page_size ?? 50,
      }),
    },
    {
      name: 'get_etf_profile',
      category: 'ETF',
      description: 'ETF 档案事实表（跟踪指数、费率、规模等）；净值用 get_etf_nav，成分用 get_etf_holdings',
      parameters: S({ ...INSTRUMENT_REF_SCHEMA }),
      handler: (a) => d('etf_profile', resolveInstrumentParams(a)),
    },
    {
      name: 'get_market_session',
      category: '市场资金',
      description: '轻量交易时段状态（是否盘中/盘前）；非完整节假日日历，精确交易日走 provider_ext',
      parameters: S({
        market: { type: 'string', description: '市场 CN|US|HK，默认 CN' },
      }),
      handler: (a) => d('market_session', { market: a.market ?? 'CN' }),
    },
    {
      name: 'get_cn_market_special',
      category: '市场资金',
      description:
        'A 股专题：连板天梯、热度飙升榜、历史热股、个股热榜走势、异动原因、同花顺概念/行业指数目录与成分（须启用同花顺富耀）',
      parameters: S({
        kind: {
          type: 'string',
          description:
            'limit_up_ladder | skyrocket | hot_history | hot_rank_trend | anomaly_list | anomaly_stock | ths_index_list | ths_index_constituents',
        },
        code: { type: 'string', description: '个股或指数代码（hot_rank_trend / ths_index_constituents / anomaly_stock）' },
        codes: { type: 'string', description: 'anomaly_stock 多码时可逗号分隔' },
        date: { type: 'string', description: 'hot_history 必填 YYYY-MM-DD' },
        period: { type: 'string', description: 'skyrocket：day|hour，默认 day' },
        tag: { type: 'string', description: 'ths_index_list：cn_concept|region|tszs|industry；anomaly_list 可选' },
        start: { type: 'string', description: 'hot_rank_trend 可选起始日' },
        end: { type: 'string', description: 'hot_rank_trend 可选结束日' },
        index_code: { type: 'string', description: 'ths_index_constituents 可选，同 code' },
      }, ['kind']),
      handler: (a) => d('cn_market_special', a),
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
      description: '批量获取已有候选标的的在线聚合快照；instruments 数组或 codes+market',
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
      description: '获取单只标的 K 线/图表序列；A 股日 K 优先读本地 DuckDB，在线 Provider 补充实时；美股/港股/日股/韩股/Crypto 默认日 K',
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
      description: '对单只标的做在线评估打分：A 股股票为评分卡，CN ETF 与美股/港股/Crypto 为技术分析 bundle；使用 InstrumentRef',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        code: { type: 'string', description: '兼容旧写法：A 股 6 位代码（推荐改用 instrument 或 market+symbol）' },
        scorecard: { type: 'string', description: '评分卡名称，默认综合评估（A 股单票评估时有效）' },
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
    {
      name: 'get_instrument_institution_rating',
      category: '跨市场标的',
      description: '28 家机构风格综合评级与共识；仅 A 股支持，使用 InstrumentRef',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        code: { type: 'string', description: '兼容旧写法：A 股 6 位代码（推荐改用 instrument 或 market+symbol）' },
        groups: { type: 'array', description: '可选机构分组过滤' },
      }),
      handler: (a) => d('instrument_institution_rating', {
        ...resolveInstrumentParams({ ...a, code: legacyCodeFrom(a) }),
        groups: a.groups,
      }),
    },
    {
      name: 'get_instrument_institution_report',
      category: '跨市场标的',
      description: '机构评级完整文本报告；仅 A 股支持，使用 InstrumentRef',
      parameters: S({
        ...INSTRUMENT_REF_SCHEMA,
        code: { type: 'string', description: '兼容旧写法：A 股 6 位代码（推荐改用 instrument 或 market+symbol）' },
        groups: { type: 'array', description: '可选机构分组过滤' },
      }),
      handler: (a) => d('instrument_institution_report', {
        ...resolveInstrumentParams({ ...a, code: legacyCodeFrom(a) }),
        groups: a.groups,
      }),
    },
    {
      name: 'list_enabled_providers',
      category: '数据源扩展',
      description: '查询已启用的数据源（provider_id、名称、优先级、能力摘要）',
      parameters: S({}),
      handler: () => d('provider_list', {}),
    },
    {
      name: 'list_provider_custom_methods',
      category: '数据源扩展',
      description: '查询数据源自定义方法目录（板块、宏观、情绪等）；标准 get_instrument_* 无覆盖时使用',
      parameters: S({
        provider_id: {
          type: 'string',
          description: '数据源 ID，如 baostock、zzshare、stockindex、akshare；大数据源建议必填',
        },
        keyword: {
          type: 'string',
          description: '可选，按方法名或描述过滤（如 bond、amac、sse、concept）',
        },
        limit: {
          type: 'number',
          description: '返回条数上限，默认 40，最大 80',
        },
      }),
      handler: (a) => d('provider_custom_methods', {
        provider_id: a.provider_id,
        keyword: a.keyword,
        limit: a.limit,
      }),
    },
    {
      name: 'invoke_provider_custom_method',
      category: '数据源扩展',
      description: '调用数据源自定义方法；须先用 list_provider_custom_methods 确认 method 与 params',
      parameters: S({
        provider_id: {
          type: 'string',
          description: '数据源 ID（如 baostock、zzshare、akshare）',
        },
        method: {
          type: 'string',
          description: '方法名（如 bsStockConcept、zzSentimentMarketTopN）',
        },
        args: {
          type: 'array',
          description: '参数 JSON 数组，顺序与 params 定义一致；元素可为 string/number/boolean/对象',
          items: {},
        },
      }, ['provider_id', 'method']),
      handler: (a) => d('provider_invoke_custom', {
        provider_id: a.provider_id,
        method: a.method,
        args: a.args ?? [],
      }),
    },
  ]
}
