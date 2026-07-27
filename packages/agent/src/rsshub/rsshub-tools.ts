import type { ToolMeta } from '../tool-meta.js'
import {
  getDomainRoutes,
  listCategories,
  listDomains,
  searchRoutes,
} from './route-catalog.js'

type JsonSchema = {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    items?: unknown
    default?: unknown
  }>
  required?: string[]
}

export interface RsshubToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
  meta?: ToolMeta
}

const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
  ({ type: 'object', properties, required })

/**
 * 内置 RSS 路由目录工具 — 三级漏斗：分类 → 网站 → 拉平多选订阅项 → 拼基址 + add_news_source。
 * 不经 Hub；结果已截断，禁止 dump 全量 schema。
 */
export function buildRsshubTools(): Omit<RsshubToolDef, 'meta'>[] {
  return [
    {
      name: 'list_rsshub_categories',
      category: '资讯中心',
      description:
        '列出内置 RSS 路由分类（财经/股票/政策等）及各分类域名与路由数量；添加订阅三级漏斗第 1 步',
      parameters: S({}),
      handler: async () => listCategories(),
    },
    {
      name: 'list_rsshub_domains',
      category: '资讯中心',
      description:
        '按分类列出该分类下全部域名（含 feed_count 可订阅叶子数）；添加订阅三级漏斗第 2 步，供 ask_user 单选网站。category 可传英文 id（finance）或中文分类名（「财经/经济/金融」「财经」），内部会解析',
      parameters: S({
        category: {
          type: 'string',
          description:
            '分类（必填）：英文 id（finance|stock|government|media|tech|commodity|other）或中文名/别名（如「财经/经济/金融」「财经」「金融」）；大小写不敏感',
        },
        limit: {
          type: 'number',
          description: '返回域名数，默认 50（够全量），上限 50',
          default: 50,
        },
      }, ['category']),
      handler: async (a) => {
        const category = String(a.category ?? '').trim()
        if (!category) return { error: 'category 必填' }
        const limit = a.limit != null ? Number(a.limit) : undefined
        return listDomains({ category, limit })
      },
    },
    {
      name: 'search_rsshub_routes',
      category: '资讯中心',
      description:
        '在内置目录中按关键词搜索可订阅叶子（含频道名）；用户已点名具体媒体时的捷径，勿代替全站选择',
      parameters: S({
        q: {
          type: 'string',
          description: '搜索关键词，如 财联社、看盘、eastmoney、电报',
        },
        category: {
          type: 'string',
          description:
            '可选分类：英文 id 或中文名/别名（同 list_rsshub_domains），内部会解析',
        },
        limit: {
          type: 'number',
          description: '返回条数，默认 10，上限 20',
          default: 10,
        },
      }, ['q']),
      handler: async (a) => {
        const q = String(a.q ?? '').trim()
        if (!q) return { error: 'q 必填' }
        const category = a.category != null ? String(a.category).trim() : undefined
        const limit = a.limit != null ? Number(a.limit) : undefined
        return searchRoutes({ q, category: category || undefined, limit })
      },
    },
    {
      name: 'get_rsshub_domain_routes',
      category: '资讯中心',
      description:
        '按域名列出拉平后的可订阅项（路由与频道已展开为叶子，如「电报 · 看盘」）；三级漏斗第 3 步，供 ask_user(allow_multiple=true) 多选；勿再先选路由再选频道',
      parameters: S({
        domain: {
          type: 'string',
          description: '域名，如 cls.cn、wallstreetcn.com、10jqka.com.cn',
        },
        category: {
          type: 'string',
          description: '可选分类（英文 id 或中文名），缩小范围；内部会解析',
        },
        q: {
          type: 'string',
          description: '可选：对 label/path 子串过滤；叶子过多（>50）时先筛再 ask_user',
        },
        limit: {
          type: 'number',
          description: '返回叶子数，默认 50（适配 ask_user），上限 100；超限时 has_more=true',
          default: 50,
        },
      }, ['domain']),
      handler: async (a) => {
        const domain = String(a.domain ?? '').trim()
        if (!domain) return { error: 'domain 必填' }
        const category = a.category != null ? String(a.category).trim() : undefined
        const q = a.q != null ? String(a.q).trim() : undefined
        const limit = a.limit != null ? Number(a.limit) : undefined
        return getDomainRoutes({
          domain,
          category: category || undefined,
          q: q || undefined,
          limit,
        })
      },
    },
  ]
}
