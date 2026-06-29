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
  pe: {
    unit: '倍',
    value_type: 'number',
    description: '市盈率 TTM，越低通常代表估值越便宜（需结合盈利质量）。',
    typical_range: '5–80，亏损或微利个股可能缺失',
    example_conditions: [
      { op: '<=', value: 20, meaning: '低估值' },
      { op: '>=', value: 0, meaning: '盈利为正（有 PE）' },
    ],
  },
  pb: {
    unit: '倍',
    value_type: 'number',
    description: '市净率，适用于银行、周期、重资产行业。',
    typical_range: '0.5–10',
    example_conditions: [{ op: '<=', value: 2, meaning: '破净附近或低 PB' }],
  },
  roe: {
    unit: '%',
    value_type: 'number',
    description: '净资产收益率（最近年报/财报），衡量盈利效率。',
    typical_range: '5–30',
    example_conditions: [{ op: '>=', value: 15, meaning: '高 ROE 质量' }],
  },
  debt_ratio: {
    unit: '%',
    value_type: 'number',
    description: '资产负债率，越低财务杠杆越小。',
    typical_range: '20–80',
    example_conditions: [{ op: '<=', value: 50, meaning: '低负债' }],
  },
  gross_margin: {
    unit: '%',
    value_type: 'number',
    description: '毛利率，反映产品竞争力与定价权。',
    typical_range: '10–60',
    example_conditions: [{ op: '>=', value: 30, meaning: '较高毛利' }],
  },
  net_profit_yoy: {
    unit: '%',
    value_type: 'number',
    description: '净利润同比增速。',
    typical_range: '-50–200',
    example_conditions: [{ op: '>=', value: 20, meaning: '利润较快增长' }],
  },
  profit_cagr_3y: {
    unit: '%',
    value_type: 'number',
    description: '近 3 年净利润复合增速（本地估算）。',
    typical_range: '0–40',
    example_conditions: [{ op: '>=', value: 15, meaning: '持续增长' }],
  },
  roe_trend: {
    unit: '%',
    value_type: 'number',
    description: 'ROE 变化趋势（近年 ROE 差值，正数表示改善）。',
    typical_range: '-10–10',
    example_conditions: [{ op: '>=', value: 2, meaning: 'ROE 改善' }],
  },
  peg: {
    unit: '倍',
    value_type: 'number',
    description: 'PE / 利润增速，成长估值指标；越低越便宜（需利润增速>0）。',
    typical_range: '0.5–3',
    example_conditions: [{ op: '<=', value: 1.2, meaning: 'PEG 合理偏低' }],
  },
  momentum_1m: {
    unit: '%',
    value_type: 'number',
    description: '近 1 个月价格涨跌幅（约 20 个交易日）。',
    typical_range: '-20–30',
    example_conditions: [{ op: '>=', value: 5, meaning: '短期强势' }],
  },
  momentum_3m: {
    unit: '%',
    value_type: 'number',
    description: '近 3 个月价格涨跌幅。',
    typical_range: '-30–50',
    example_conditions: [{ op: '>=', value: 10, meaning: '中期动量' }],
  },
  momentum_6m: {
    unit: '%',
    value_type: 'number',
    description: '近 6 个月价格涨跌幅。',
    typical_range: '-40–80',
    example_conditions: [{ op: '>=', value: 15, meaning: '中长期趋势向上' }],
  },
  volume_ratio: {
    unit: '倍',
    value_type: 'number',
    description: '近 5 日均量 / 前 35 日均量，衡量放量程度。',
    typical_range: '0.5–3',
    example_conditions: [{ op: '>=', value: 1.5, meaning: '近期放量' }],
  },
}

export function buildLocalUniverseScreenSchema(latestTradeDate?: string | null): LocalUniverseScreenSchema {
  const sortFactors = [...SCREEN_PACK_FACTORS]
  return {
    version: '1.0',
    data_source: '本地 L0 初选库（SQLite stock_factors / stock_scores / stock_quotes_daily）',
    prerequisite: '先调用 get_market_db_status 确认 is_ready=true；未就绪时勿调用本筛选，改用 screen_stocks 或 trigger_market_db_sync。',
    trade_date: {
      format: 'YYYY-MM-DD',
      default: latestTradeDate ?? '最新因子交易日',
      description: '可选；省略则使用 stock_factors 表最新 trade_date。',
    },
    factor_conditions: {
      description: '因子条件为 AND 关系：须同时满足所有条件。factor 名须来自 factors 列表。',
      max_count: 8,
      item_shape: { factor: 'pe', op: '<=', value: 25 },
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
        description: '行业精确匹配（任一击中即可）。可先 get_industry_stats 查看可用行业名。',
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
        enum: ['total_score', 'pe', 'pb', 'market_cap', ...sortFactors],
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
        title: '高 ROE 低估值',
        query: {
          factor_conditions: [
            { factor: 'roe', op: '>=', value: 15 },
            { factor: 'pe', op: '<=', value: 25 },
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
        title: '沪市动量 + 市值过滤',
        query: {
          factor_conditions: [{ factor: 'momentum_3m', op: '>=', value: 10 }],
          markets: ['SH'],
          min_market_cap_yi: 100,
          top_n: 40,
        },
      },
    ],
  }
}
