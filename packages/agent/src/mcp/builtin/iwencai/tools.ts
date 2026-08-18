/**
 * 问财本机 MCP 工具定义（listTools / CallTool）。
 */

import type { IwencaiSearchChannel } from './client.js'
import { requireIwencaiClient } from './client.js'

export interface IwencaiMcpToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

const QUERY2DATA_DESCRIPTION = `
用自然语言问数与选股（同花顺问财）。覆盖结构化金融数据，不要用本工具搜新闻/公告/研报（分别用 news_search、announcement_search、report_search）。

【能力】一次调用可覆盖以下问数/筛选（按用户问题选域，勿漏）：
- 选股：A股多条件筛选，含行情、技术形态（均线/突破/K线）、财务、行业概念。
- ETF：按跟踪指数、规模、费率、风格（成长/价值/平衡）等筛选。
- 公募基金筛选：类型、业绩、经理、风险、持仓、资产配置。
- 行情：股价涨跌、成交量、主力资金、大小单、MACD/KDJ/RSI/布林；ETF 与指数行情。
- 财务：营收、利润、ROE、负债、现金流、PE/PB/PS。
- 指数：上证、沪深300、创业板、恒生、纳斯达克等点位、涨跌、成交量。
- 行业：行业估值、财务、盈利、行情、板块排名。
- 单只基金：业绩、持仓、风险、评级、获奖、经理、公司。
- 宏观：GDP、CPI、PPI、利率、汇率、社融、M2、PMI、工业增加值、消费、投资、进出口。

【用法】
1. 先改写：口语→标准金融术语，保留核心条件；过复杂则拆成多个独立 query 多次调用。
2. 改写例：「给我选科技股」→「属于科技股的股票」；「同花顺今天多少钱」→「同花顺最新价格」；「茅台负债」→「贵州茅台负债率」；「今年GDP」→「近年/最近一期中国GDP」；「上证多少点」→「上证指数最新点位」。
3. 返回 datas 为当前页；code_count 是总数，可能远大于 datas；chunks_info 为解析条件。code_count 大于 datas 条数时用 page 翻页。limit 范围 1–50，默认 10。
4. datas 为空时最多再试 2 次，逐步放宽苛刻条件；回答时说明最终使用的 query。
5. 回答须表格化列出关键字段（股票代码/简称等随查询变化）；必须写「数据来源：同花顺问财」。无数据时可提示用户也可到问财网页查询。
6. 未配置密钥时工具会报错：引导用户在设置里启用「问财」并填写密钥。
`.trim()

const NEWS_SEARCH_DESCRIPTION = `
财经新闻与资讯检索（同花顺问财）。覆盖官媒、主流财经媒体、垂直行业网站、上市公司与非上市公司官网；用于了解最新财经事件、政策动态、行业革新、企业业务进展。不要用本工具查选股、行情、财务、指数、宏观等结构化数据（用 query2data），也不要查公告或研报（分别用 announcement_search、report_search）。

【用法】
1. 每个独立主题、标的、政策、行业或时间窗各调用一次；query 用简洁中文，不要把多个无关主题塞进同一句。
2. 结果不足则换更聚焦的 query 再调，或配合 query2data 补结构化数据。
3. 回答必须基于返回原文，不得臆造；标注「数据来源：同花顺问财」。
4. 用户要最新、今日、近期或当前进展时，优先较新条目，不要把过时新闻当成最新。
5. 查询例：「贵州茅台今日新闻」「人工智能产业政策 最新消息」。
6. 未配置密钥时工具会报错：引导用户在设置里启用「问财」并填写密钥。size 范围 1–50，默认 10；不足则再调。
`.trim()

const ANNOUNCEMENT_SEARCH_DESCRIPTION = `
金融标的公告检索（同花顺问财）。覆盖 A股、港股、基金、ETF；公告类型包括定期财务报告、分红派息、回购增持、资产重组等官方披露。不要用本工具查新闻或研报（分别用 news_search、report_search），也不要查结构化行情/选股（用 query2data）。

【用法】
1. 每个独立标的、公告类型或时间窗各调用一次；query 用简洁中文，不要把多个无关主题塞进同一句。
2. 结果不足则换更聚焦的 query 再调，或配合 query2data 核对财务与行情数字。
3. 回答必须基于返回原文，不得臆造；标注「数据来源：同花顺问财」。写清公告标题、时间与标的（字段存在才写）。
4. 用户要最新或近期时，优先较新公告，不要把过时披露当成最新。
5. 查询例：「贵州茅台 分红公告」「上市公司业绩预告」。
6. 未配置密钥时工具会报错：引导用户在设置里启用「问财」并填写密钥。size 范围 1–50，默认 10；不足则再调。
`.trim()

const REPORT_SEARCH_DESCRIPTION = `
机构研报检索（同花顺问财）。收录主流投研机构研究报告，用于快速获取专业、深度的分析逻辑、投资评级、目标价等投研决策信息。不要用本工具查新闻或公告（分别用 news_search、announcement_search），也不要查结构化行情/选股（用 query2data）。

【用法】
1. 每个独立标的、行业、报告类型、评级或时间窗各调用一次；query 用简洁中文，不要把多个无关主题塞进同一句。
2. 结果不足则换更聚焦的 query 再调，或配合 query2data 核对财务与行情数字。
3. 回答必须基于返回原文，不得臆造；标注「数据来源：同花顺问财」。摘标题、机构、时间、评级、目标价、核心逻辑、链接（字段存在才写，缺失勿编造）。
4. 查询例：「贵州茅台研报」「新能源行业 研报 投资评级」。
5. 未配置密钥时工具会报错：引导用户在设置里启用「问财」并填写密钥。size 范围 1–50，默认 10；不足则再调。
`.trim()

export const IWENCAI_MCP_TOOLS: IwencaiMcpToolDef[] = [
  {
    name: 'query2data',
    description: QUERY2DATA_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '改写后的标准金融问句（勿直接塞口语）。例：「属于科技股的股票」「同花顺最新价格」「贵州茅台负债率」「最近一期中国GDP」「上证指数最新点位」',
        },
        page: {
          type: 'number',
          description:
            '页码，从 1 开始，默认 1。当返回的 code_count 大于当前页 datas 条数时递增 page 翻页。',
        },
        limit: {
          type: 'number',
          description:
            '每页条数，1–50，默认 10。需要更多结果时先提高 limit（不超过 50），仍不足再用 page 翻页。',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'news_search',
    description: NEWS_SEARCH_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '改写后的简洁中文检索问句。例：「贵州茅台今日新闻」「人工智能产业政策 最新消息」。每个主题单独一次调用。',
        },
        size: {
          type: 'number',
          description:
            '返回条数，1–50，默认 10。结果不够时提高 size，或换更聚焦的 query 再调。',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'announcement_search',
    description: ANNOUNCEMENT_SEARCH_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '改写后的简洁中文检索问句。例：「贵州茅台 分红公告」「上市公司业绩预告」。每个标的或公告类型单独一次调用。',
        },
        size: {
          type: 'number',
          description:
            '返回条数，1–50，默认 10。结果不够时提高 size，或换更聚焦的 query 再调。',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'report_search',
    description: REPORT_SEARCH_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '改写后的简洁中文检索问句。例：「贵州茅台研报」「新能源行业 研报 投资评级」。每个标的、行业或时间窗单独一次调用。',
        },
        size: {
          type: 'number',
          description:
            '返回条数，1–50，默认 10。结果不够时提高 size，或换更聚焦的 query 再调。',
        },
      },
      required: ['query'],
    },
  },
]

function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '')
}

function asOptionalNumber(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

async function searchChannel(
  channel: IwencaiSearchChannel,
  args: Record<string, unknown>,
): Promise<unknown> {
  const client = requireIwencaiClient()
  return client.comprehensiveSearch({
    query: asString(args.query),
    channels: [channel],
    size: asOptionalNumber(args.size),
  })
}

export async function callIwencaiMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'query2data': {
      const client = requireIwencaiClient()
      return client.query2data({
        query: asString(args.query),
        page: asOptionalNumber(args.page),
        limit: asOptionalNumber(args.limit),
      })
    }
    case 'news_search':
      return searchChannel('news', args)
    case 'announcement_search':
      return searchChannel('announcement', args)
    case 'report_search':
      return searchChannel('report', args)
    default:
      throw new Error(`未知问财工具: ${name}`)
  }
}
