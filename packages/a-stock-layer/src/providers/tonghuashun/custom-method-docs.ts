import type { CustomMethodApiDoc, CustomMethodParam } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'
import { FUYAO_BASE_URL } from './config.js'

const BASE = FUYAO_BASE_URL
const PAGE = 'https://fuyao.aicubes.cn/'
const INVOKE = (method: string, args = '[]') =>
  `engine.invokeCustomMethod("tonghuashun", "${method}", ${args})`

const CODE_PARAM: CustomMethodParam = {
  name: 'code',
  type: 'string',
  description: '6 位 A 股代码或 thscode（如 600519、600519.SH）',
  required: true,
}

const INDEX_CODE_PARAM: CustomMethodParam = {
  name: 'code',
  type: 'string',
  description: '同花顺指数/板块 thscode 或裸代码（如 885338.TI、000300）',
  required: true,
}

function thsDoc(
  method: string,
  description: string,
  path: string,
  params: CustomMethodParam[],
  returns: string,
  extra?: Partial<Pick<CustomMethodApiDoc, 'notes' | 'example' | 'usage'>>,
): CustomMethodApiDoc {
  return {
    method,
    description,
    sourceUrl: `${BASE}${path}`,
    pageUrl: PAGE,
    params,
    returns,
    usage: extra?.usage ?? INVOKE(method),
    notes: extra?.notes
      ?? '须配置富耀 API Key（X-api-key）；Referer 为 https://fuyao.aicubes.cn/。无数据或 Key 未配置时返回 null。',
    example: extra?.example ?? `{"provider":"tonghuashun","method":"${method}","args":[]}`,
  }
}

export const TONGHUASHUN_METHOD_DOCS: Record<string, CustomMethodApiDoc> = {
  thsIndexList: thsDoc(
    'thsIndexList',
    '同花顺指数/板块目录（按 tag 分类）',
    '/api/a-share-index/catalog/ths-index-list',
    [
      {
        name: 'tag',
        type: 'string',
        description: '目录类型：cn_concept（概念）/ region（地域）/ tszs（特色指数）/ industry（行业）',
        default: 'cn_concept',
      },
    ],
    'Record<string, unknown>[] 含 item 行及 source=tonghuashun',
    {
      example: '{"provider":"tonghuashun","method":"thsIndexList","args":["cn_concept"]}',
      usage: INVOKE('thsIndexList', '["cn_concept"]'),
    },
  ),

  thsIndexConstituents: thsDoc(
    'thsIndexConstituents',
    '同花顺指数/板块成分股列表',
    '/api/a-share-index/constituents/ths-stock-list',
    [INDEX_CODE_PARAM],
    'Record<string, unknown>[] 成分股行，含 source=tonghuashun',
    {
      example: '{"provider":"tonghuashun","method":"thsIndexConstituents","args":["885338.TI"]}',
      usage: INVOKE('thsIndexConstituents', '["885338.TI"]'),
      notes: 'thscode 须为同花顺指数编码；裸代码将自动转为 thscode。与标准 sector_list 不同，返回上游原始成分结构。',
    },
  ),

  thsFinancialIndicators: thsDoc(
    'thsFinancialIndicators',
    '财务指标（成长/盈利/偿债/营运/现金流等 abilities 分组）',
    '/api/a-share/financials/indicators',
    [
      CODE_PARAM,
      {
        name: 'report',
        type: 'string',
        description: '报告期，如 2024、2024Q3',
        required: true,
      },
    ],
    '[{ ...indicatorsPayload, source: "tonghuashun" }]',
    {
      example: '{"provider":"tonghuashun","method":"thsFinancialIndicators","args":["600519","2024Q3"]}',
      usage: INVOKE('thsFinancialIndicators', '["600519","2024Q3"]'),
      notes: '与标准 financials（利润表摘要）互补；按单报告期返回 abilities 指标树。',
    },
  ),

  thsLimitUpLadder: thsDoc(
    'thsLimitUpLadder',
    '连板天梯（近 30 个交易日涨停梯队）',
    '/api/a-share/special-data/limit-up-ladder',
    [],
    '[{ ...ladderPayload, source: "tonghuashun" }]',
    {
      example: '{"provider":"tonghuashun","method":"thsLimitUpLadder","args":[]}',
    },
  ),

  thsSkyrocketList: thsDoc(
    'thsSkyrocketList',
    '热度飙升榜 Top30',
    '/api/a-share/special-data/skyrocket-list',
    [
      {
        name: 'period',
        type: 'string',
        description: '统计周期：day（日榜）/ hour（小时榜）',
        default: 'day',
      },
    ],
    'Record<string, unknown>[] 热股行，含 source=tonghuashun',
    {
      example: '{"provider":"tonghuashun","method":"thsSkyrocketList","args":["day"]}',
      usage: INVOKE('thsSkyrocketList', '["day"]'),
    },
  ),

  thsHotStockListHistory: thsDoc(
    'thsHotStockListHistory',
    '历史热股排行（按自然日）',
    '/api/a-share/special-data/hot-stock-list-history',
    [
      {
        name: 'date',
        type: 'string',
        description: '自然日 YYYY-MM-DD',
        required: true,
      },
    ],
    'Record<string, unknown>[] 热股行，含 source=tonghuashun',
    {
      example: '{"provider":"tonghuashun","method":"thsHotStockListHistory","args":["2024-01-15"]}',
      usage: INVOKE('thsHotStockListHistory', '["2024-01-15"]'),
    },
  ),

  thsHotStockRankTrend: thsDoc(
    'thsHotStockRankTrend',
    '个股热榜排名走势（时间序列）',
    '/api/a-share/special-data/hot-stock-rank-trend',
    [
      CODE_PARAM,
      { name: 'start', type: 'string', description: '起始日期 YYYY-MM-DD' },
      { name: 'end', type: 'string', description: '结束日期 YYYY-MM-DD' },
    ],
    'Record<string, unknown>[] 排名走势行，含 source=tonghuashun',
    {
      example: '{"provider":"tonghuashun","method":"thsHotStockRankTrend","args":["600519","2024-01-01","2024-03-01"]}',
      usage: INVOKE('thsHotStockRankTrend', '["600519","2024-01-01","2024-03-01"]'),
    },
  ),

  thsAnomalyAnalysisList: thsDoc(
    'thsAnomalyAnalysisList',
    '当日个股异动原因列表（全市场）',
    '/api/a-share/special-data/anomaly-analysis-list',
    [
      {
        name: 'tag',
        type: 'string',
        description: '异动类型筛选标签（上游 tag 枚举，可选）',
      },
    ],
    'Record<string, unknown>[] 异动行，含 source=tonghuashun',
    {
      example: '{"provider":"tonghuashun","method":"thsAnomalyAnalysisList","args":[]}',
    },
  ),

  thsAnomalyAnalysisStock: thsDoc(
    'thsAnomalyAnalysisStock',
    '按股票批量查询当日异动原因',
    '/api/a-share/special-data/anomaly-analysis-stock',
    [
      {
        name: 'codes',
        type: 'string',
        description: '单只代码、逗号分隔多码，或 invoke 时传 JSON 字符串数组',
        required: true,
      },
    ],
    'Record<string, unknown>[] 异动行，含 source=tonghuashun',
    {
      example: '{"provider":"tonghuashun","method":"thsAnomalyAnalysisStock","args":["600519,000001"]}',
      usage: INVOKE('thsAnomalyAnalysisStock', '["600519"]'),
      notes: '支持批量；裸代码自动转为 thscode，多码以逗号拼接请求上游。',
    },
  ),
}

export const TONGHUASHUN_CUSTOM = Object.values(TONGHUASHUN_METHOD_DOCS).map(toCustomMethodDef)
