import { SCREEN_PACK_FACTORS } from '../sync/config.js'
import { SCREEN_FACTOR_LABELS } from './factors.js'

export type ScreenFactorOp = '>' | '<' | '>=' | '<=' | '='

export interface ScreenFactorSpec {
  name: string
  label: string
  unit: string
  value_type: 'number'
  description: string
  typical_range: string
  example_conditions: Array<{ op: ScreenFactorOp; value: number; meaning: string }>
}

export interface LocalUniverseScreenSchema {
  version: string
  data_source: string
  prerequisite: string
  trade_date: {
    format: string
    default: string
    description: string
  }
  factor_conditions: {
    description: string
    max_count: number
    item_shape: { factor: string; op: ScreenFactorOp; value: number }
    operators: ScreenFactorOp[]
    factors: ScreenFactorSpec[]
  }
  filters: {
    industry_contains: { type: 'string'; description: string; example: string }
    industries: { type: 'string[]'; description: string; example: string[] }
    markets: { type: 'string[]'; enum: ['SH', 'SZ', 'BJ']; description: string }
    min_total_score: { type: 'number'; range: string; description: string }
    max_total_score: { type: 'number'; range: string; description: string }
    min_market_cap_yi: { type: 'number'; unit: '亿元'; description: string }
    max_market_cap_yi: { type: 'number'; unit: '亿元'; description: string }
    min_pe: { type: 'number'; unit: '倍'; description: string }
    max_pe: { type: 'number'; unit: '倍'; description: string }
    min_pb: { type: 'number'; unit: '倍'; description: string }
    max_pb: { type: 'number'; unit: '倍'; description: string }
    exclude_st: { type: 'boolean'; default: true; description: string }
    scorecard: { type: 'string'; default: '综合评估'; description: string }
  }
  sort: {
    sort_by: {
      type: 'string'
      enum: string[]
      default: 'total_score'
      description: string
    }
    sort_order: { type: 'string'; enum: ['asc', 'desc']; default: 'desc' }
  }
  pagination: {
    top_n: { type: 'number'; min: 1; max: 200; default: 40; description: string }
  }
  response_fields: string[]
  examples: Array<{ title: string; query: Record<string, unknown> }>
}

const FACTOR_SPECS: Record<string, Omit<ScreenFactorSpec, 'name' | 'label'>> = {
  momentum_1m: {
    unit: '%',
    value_type: 'number',
    description: '近 1 个月价格涨跌幅（约 20 个交易日，仅日 K）。',
    typical_range: '-20–30',
    example_conditions: [{ op: '>=', value: 5, meaning: '短期强势' }],
  },
  momentum_3m: {
    unit: '%',
    value_type: 'number',
    description: '近 3 个月价格涨跌幅（仅日 K）。',
    typical_range: '-30–50',
    example_conditions: [{ op: '>=', value: 10, meaning: '中期动量' }],
  },
  momentum_6m: {
    unit: '%',
    value_type: 'number',
    description: '近 6 个月价格涨跌幅（仅日 K）。',
    typical_range: '-40–80',
    example_conditions: [{ op: '>=', value: 15, meaning: '中长期趋势向上' }],
  },
  volume_ratio: {
    unit: '倍',
    value_type: 'number',
    description: '近 5 日均量 / 前 35 日均量（仅日 K 成交量）。',
    typical_range: '0.5–3',
    example_conditions: [{ op: '>=', value: 1.5, meaning: '近期放量' }],
  },
  volatility_20d: {
    unit: '%',
    value_type: 'number',
    description: '近 20 个交易日日收益率标准差，衡量价格波动（仅日 K）。',
    typical_range: '1–8',
    example_conditions: [{ op: '<=', value: 3, meaning: '低波动' }],
  },
  drawdown_60d: {
    unit: '%',
    value_type: 'number',
    description: '现价相对近 60 日最高价的回撤幅度，负值表示低于阶段高点（仅日 K）。',
    typical_range: '-40–0',
    example_conditions: [{ op: '>=', value: -15, meaning: '距高点回撤不超过 15%' }],
  },
}

export function buildLocalUniverseScreenSchema(latestTradeDate?: string | null): LocalUniverseScreenSchema {
  const sortFactors = [...SCREEN_PACK_FACTORS]
  return {
    version: '1.1',
    data_source: '本地日 K 衍生因子（cn_daily_bars → stock_factors / stock_scores，无行情/财报依赖）',
    prerequisite: '须先完成 A 股日 K 同步；因子由 K 线批量计算，不触发额外 Provider 请求。',
    trade_date: {
      format: 'YYYY-MM-DD',
      default: latestTradeDate ?? '最新因子交易日',
      description: '可选；省略则使用 stock_factors 表最新 trade_date。',
    },
    factor_conditions: {
      description: '因子条件为 AND 关系：须同时满足所有条件。factor 名须来自 factors 列表。',
      max_count: 8,
      item_shape: { factor: 'momentum_3m', op: '>=', value: 10 },
      operators: ['>', '<', '>=', '<=', '='],
      factors: SCREEN_PACK_FACTORS.map(name => ({
        name,
        label: SCREEN_FACTOR_LABELS[name] ?? name,
        ...FACTOR_SPECS[name],
      })),
    },
    filters: {
      industry_contains: {
        type: 'string',
        description: '行业名称模糊匹配（stocks.industry LIKE %关键词%）。与 industries 二选一或叠加。',
        example: '半导体',
      },
      industries: {
        type: 'string[]',
        description: '行业精确匹配（任一击中即可）。可先 list_local_industries 查看可用行业名。',
        example: ['白酒', '半导体'],
      },
      markets: {
        type: 'string[]',
        enum: ['SH', 'SZ', 'BJ'],
        description: '交易所板块：SH=沪市(60/68)，SZ=深市(00/30)，BJ=北交所(43/83/87/92)。',
      },
      min_total_score: {
        type: 'number',
        range: '0–100',
        description: '综合评分下限（stock_scores，默认评分卡「综合评估」）。',
      },
      max_total_score: {
        type: 'number',
        range: '0–100',
        description: '综合评分上限。',
      },
      min_market_cap_yi: {
        type: 'number',
        unit: '亿元',
        description: '总市值下限（来自日行情 market_cap，单位亿元）。',
      },
      max_market_cap_yi: {
        type: 'number',
        unit: '亿元',
        description: '总市值上限（亿元）。',
      },
      min_pe: { type: 'number', unit: '倍', description: '日行情 PE 下限（与因子 pe 同源，便于不写 factor_conditions）。' },
      max_pe: { type: 'number', unit: '倍', description: '日行情 PE 上限。' },
      min_pb: { type: 'number', unit: '倍', description: '日行情 PB 下限。' },
      max_pb: { type: 'number', unit: '倍', description: '日行情 PB 上限。' },
      exclude_st: {
        type: 'boolean',
        default: true,
        description: '是否排除 ST 股，默认 true。',
      },
      scorecard: {
        type: 'string',
        default: '综合评估',
        description: '排序与 min/max_total_score 使用的评分卡名称。',
      },
    },
    sort: {
      sort_by: {
        type: 'string',
        enum: ['total_score', 'market_cap', ...sortFactors],
        default: 'total_score',
        description: '结果排序字段；因子名排序时按对应 factor_value。',
      },
      sort_order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    },
    pagination: {
      top_n: {
        type: 'number',
        min: 1,
        max: 200,
        default: 40,
        description: '返回条数上限；passed 为满足条件的总数（可能大于 top_n）。',
      },
    },
    response_fields: [
      'trade_date', 'passed', 'total_universe', 'source', 'scorecard',
      'items[].code', 'items[].name', 'items[].industry', 'items[].total_score',
      'items[].pe', 'items[].pb', 'items[].market_cap_yi', 'items[].key_factors',
    ],
    examples: [
      {
        title: '中期动量 + 低波动',
        query: {
          factor_conditions: [
            { factor: 'momentum_3m', op: '>=', value: 10 },
            { factor: 'volatility_20d', op: '<=', value: 4 },
          ],
          top_n: 50,
        },
      },
      {
        title: '半导体行业中评分较高',
        query: {
          industry_contains: '半导体',
          min_total_score: 60,
          sort_by: 'total_score',
          top_n: 30,
        },
      },
      {
        title: '沪市动量 + 放量',
        query: {
          factor_conditions: [
            { factor: 'momentum_3m', op: '>=', value: 10 },
            { factor: 'volume_ratio', op: '>=', value: 1.2 },
          ],
          markets: ['SH'],
          top_n: 40,
        },
      },
    ],
  }
}
