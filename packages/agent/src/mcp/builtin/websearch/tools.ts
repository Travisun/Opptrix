/**
 * 网页搜索本机 MCP 工具定义（listTools / CallTool）。
 */

import { runWebSearch, type WebSearchResult } from './search.js'
import type { SearchRegion, TimeWindow } from './engines.js'

export interface WebsearchMcpToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

const WEB_SEARCH_DESCRIPTION = `
广域互联网公开搜索引擎（多引擎聚合，无需数据密钥）。返回公开网页的标题、链接与摘要，不含整页原文。用于百科、政策原文、技术文档、官方手册等一般资料查询。本工具不是行情、公告或研报专用检索，也不是股市主路径。

【何时用】
- 百科/维基、公开文档、政策原文、技术资料、非投研公开网页（含 site: / filetype: / 精确短语）。
- 用户明确要「网上搜公开网页」「查维基」「搜官方文档」等一般互联网资料。

【禁止首选 — 不得当股市主路径】
- 股价/行情/资金流向/财务问数 → 问财 query2data 或本地 get_instrument_*（quotes/snapshot/financials/money_flow 等）。
- 上市公司公告 → announcement_search 或本地 get_instrument_notices / get_notice_content。
- 机构研报 → report_search 或本地 search_library；会话附件用 list_session_documents。
- 选股/问数 → query2data；标的代码歧义才用 search_instruments。
- 资讯浏览 → news_search 或 list_news_*。

【兜底】
仅当上述专用工具不可用、调用失败，或确认当前会话没有对应能力时，才允许用本工具查一般公开网页。引用结果时必须向用户声明：来自公开网页检索，内容可能不真实或过期，不能作为行情、公告或研报依据。

【打开网页】
需要阅读具体页面时，先用本工具拿到链接，再用 browser_navigate；用户已给出 URL 时直接 browser_navigate，勿先搜。

【用法】
1. query 写清晰检索词；可用 site:域名、filetype:pdf、引号精确匹配。
2. region：auto（默认，按是否含汉字分流国内/国际引擎）| cn | global。
3. time：h|d|w|m|y 可选时间窗；也可拆开传 site。
4. limit：1–20，默认 8。结果不足时换关键词或 region，勿引导用户去装数据密钥。
`.trim()

export const WEBSEARCH_MCP_TOOLS: WebsearchMcpToolDef[] = [
  {
    name: 'web_search',
    description: WEB_SEARCH_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '检索词，可含 site:/filetype:/引号精确短语。例：site:github.com react hooks；"machine learning" filetype:pdf',
        },
        region: {
          type: 'string',
          enum: ['auto', 'cn', 'global'],
          description: '引擎区域：auto（默认，含汉字走国内）| cn | global',
        },
        site: {
          type: 'string',
          description: '可选，站内检索域名（与 query 内 site: 等价）',
        },
        time: {
          type: 'string',
          enum: ['h', 'd', 'w', 'm', 'y'],
          description: '可选时间窗：h 近一小时 / d 天 / w 周 / m 月 / y 年',
        },
        limit: {
          type: 'number',
          description: '返回条数上限，1–20，默认 8',
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

function asRegion(v: unknown): SearchRegion | undefined {
  const s = asString(v).trim().toLowerCase()
  if (s === 'auto' || s === 'cn' || s === 'global') return s
  return undefined
}

function asTime(v: unknown): TimeWindow | undefined {
  const s = asString(v).trim().toLowerCase()
  if (s === 'h' || s === 'd' || s === 'w' || s === 'm' || s === 'y') return s
  return undefined
}

export async function callWebsearchMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<WebSearchResult> {
  if (name !== 'web_search') {
    throw new Error(`未知网页搜索工具: ${name}`)
  }
  return runWebSearch({
    query: asString(args.query),
    region: asRegion(args.region),
    site: asString(args.site).trim() || undefined,
    time: asTime(args.time),
    limit: asOptionalNumber(args.limit),
  })
}
