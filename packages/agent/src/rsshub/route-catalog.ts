import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** 内置 RSSHub 路由 schema（精选 domain / route；v3 含 channels） */
export interface RsshubRouteEntry {
  /** 展示名：schema `name` 优先，回退 `title` */
  name: string
  /** 与 name 同步，兼容旧调用方 */
  title: string
  path: string
  example?: string
  /** 栏目 label → path 段取值 */
  channels?: Record<string, string>
  params?: unknown
  maintainers?: string[]
}

export interface RsshubDomainEntry {
  name: string
  priority?: number
  routes: RsshubRouteEntry[]
}

export interface RsshubCategoryEntry {
  description: string
  domains: Record<string, RsshubDomainEntry>
}

export interface RsshubSchemaMeta {
  version?: string
  generated_at?: string
  description?: string
  total_domains?: number
  total_routes?: number
  total_channels?: number
  categories?: Record<string, string>
  docs_base_url?: string
  radar_rules_url?: string
  data_sources?: Record<string, unknown>
}

export interface RsshubRoutesSchema {
  meta: RsshubSchemaMeta
  docs_lookup?: Record<string, unknown>
  categories: Record<string, RsshubCategoryEntry>
}

export interface RsshubCategorySummary {
  id: string
  description: string
  domain_count: number
  route_count: number
}

export interface RsshubDomainSummary {
  domain: string
  name: string
  priority?: number
  route_count: number
  feed_count: number
}

/** 拉平后的可订阅叶子（route 或 route×channel） */
export interface RsshubFeedLeaf {
  label: string
  path: string
  route_name: string
  channel?: string
  example?: string
  category: string
}

export interface RsshubRouteHit {
  category: string
  domain: string
  name: string
  /** 命中叶子的展示标签（含「路由 · 频道」） */
  title: string
  path: string
  example?: string
  channel?: string
  score?: number
}

/** 明显不是栏目名的 channel key —— 跳过该项；若全部如此则整组降级为单叶子 */
const GENERIC_CHANNEL_KEYS = new Set([
  '分类',
  '类别',
  '栏目',
  '栏目id',
  '栏目ID',
  '参数',
  '编号',
  'id',
  'ID',
  'Id',
  'ids',
  'Ids',
  'param',
  'params',
  'type',
  'Type',
  'code',
  'Code',
  '类型',
])

let cachedSchema: RsshubRoutesSchema | null = null

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isGenericChannelKey(key: string): boolean {
  const t = key.trim()
  if (!t) return true
  if (GENERIC_CHANNEL_KEYS.has(t)) return true
  return /^(id|ids|param|params|type|code)$/i.test(t)
}

/**
 * 剥掉路径中未填的可选参数段（`/:foo?`）。
 * 例：`/wallstreetcn/live/global/:score?` → `/wallstreetcn/live/global`
 */
export function stripUnfilledOptionalParams(pathTemplate: string): string {
  return pathTemplate.replace(/\/:[A-Za-z0-9_]+\?/g, '')
}

/**
 * 将模板第一个 `:param` / `:param?` 替换为 channel 值，再剥掉其余未填可选参数。
 * - `/cls/telegraph/:category?` + `watch` → `/cls/telegraph/watch`
 * - `/wallstreetcn/live/:category?/:score?` + `global` → `/wallstreetcn/live/global`
 */
export function expandRoutePath(pathTemplate: string, channelValue?: string): string {
  const value = channelValue?.trim()
  if (!value) {
    return stripUnfilledOptionalParams(pathTemplate)
  }
  const match = /\/:([A-Za-z0-9_]+)(\?)?/.exec(pathTemplate)
  if (!match || match.index == null) {
    return stripUnfilledOptionalParams(pathTemplate)
  }
  const before = pathTemplate.slice(0, match.index)
  const after = pathTemplate.slice(match.index + match[0].length)
  return stripUnfilledOptionalParams(`${before}/${value}${after}`)
}

/**
 * 无 channel 时优先用 example；否则剥掉未填可选参数。
 */
export function resolveRoutePath(
  route: { path: string; example?: string },
  channelValue?: string,
): string {
  const value = channelValue?.trim()
  if (value) return expandRoutePath(route.path, value)
  if (typeof route.example === 'string' && route.example.trim()) {
    return route.example.trim()
  }
  return expandRoutePath(route.path)
}

function parseChannels(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined
  const channels: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v.trim()) channels[k] = v
  }
  return Object.keys(channels).length > 0 ? channels : undefined
}

function parseRoute(raw: unknown): RsshubRouteEntry | null {
  if (!isRecord(raw)) return null
  const nameFromName = typeof raw.name === 'string' ? raw.name.trim() : ''
  const nameFromTitle = typeof raw.title === 'string' ? raw.title.trim() : ''
  const display = nameFromName || nameFromTitle
  const path = typeof raw.path === 'string' ? raw.path : ''
  if (!path) return null
  const entry: RsshubRouteEntry = {
    name: display || path,
    title: display || path,
    path,
  }
  if (typeof raw.example === 'string') entry.example = raw.example
  if (raw.params !== undefined) entry.params = raw.params
  if (Array.isArray(raw.maintainers)) {
    entry.maintainers = raw.maintainers.filter((m): m is string => typeof m === 'string')
  }
  const channels = parseChannels(raw.channels)
  if (channels) entry.channels = channels
  return entry
}

function parseDomain(raw: unknown): RsshubDomainEntry | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name : ''
  const routesRaw = Array.isArray(raw.routes) ? raw.routes : []
  const routes = routesRaw.map(parseRoute).filter((r): r is RsshubRouteEntry => r != null)
  const entry: RsshubDomainEntry = { name: name || '未命名来源', routes }
  if (typeof raw.priority === 'number') entry.priority = raw.priority
  return entry
}

function parseMeta(raw: unknown): RsshubSchemaMeta {
  if (!isRecord(raw)) return {}
  const meta: RsshubSchemaMeta = {}
  if (typeof raw.version === 'string') meta.version = raw.version
  if (typeof raw.generated_at === 'string') meta.generated_at = raw.generated_at
  if (typeof raw.description === 'string') meta.description = raw.description
  if (typeof raw.total_domains === 'number') meta.total_domains = raw.total_domains
  if (typeof raw.total_routes === 'number') meta.total_routes = raw.total_routes
  if (typeof raw.total_channels === 'number') meta.total_channels = raw.total_channels
  if (typeof raw.docs_base_url === 'string') meta.docs_base_url = raw.docs_base_url
  if (typeof raw.radar_rules_url === 'string') meta.radar_rules_url = raw.radar_rules_url
  if (isRecord(raw.categories)) {
    const cats: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw.categories)) {
      if (typeof v === 'string') cats[k] = v
    }
    if (Object.keys(cats).length) meta.categories = cats
  }
  if (isRecord(raw.data_sources)) meta.data_sources = raw.data_sources
  return meta
}

function parseSchema(raw: unknown): RsshubRoutesSchema {
  if (!isRecord(raw)) {
    throw new Error('RSSHub 路由目录格式无效')
  }
  const meta = parseMeta(raw.meta)
  const categoriesRaw = isRecord(raw.categories) ? raw.categories : {}
  const categories: Record<string, RsshubCategoryEntry> = {}
  for (const [catId, catVal] of Object.entries(categoriesRaw)) {
    if (!isRecord(catVal)) continue
    const description = typeof catVal.description === 'string' ? catVal.description : catId
    const domainsRaw = isRecord(catVal.domains) ? catVal.domains : {}
    const domains: Record<string, RsshubDomainEntry> = {}
    for (const [host, domVal] of Object.entries(domainsRaw)) {
      const parsed = parseDomain(domVal)
      if (parsed) domains[host] = parsed
    }
    categories[catId] = { description, domains }
  }
  const docs_lookup = isRecord(raw.docs_lookup) ? raw.docs_lookup : undefined
  return { meta, docs_lookup, categories }
}

function loadSchema(): RsshubRoutesSchema {
  if (cachedSchema) return cachedSchema
  const path = fileURLToPath(new URL('./rsshub_routes_schema.json', import.meta.url))
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
  cachedSchema = parseSchema(raw)
  return cachedSchema
}

/** 测试用：清空进程内 cache */
export function resetRsshubRouteCatalogForTests(): void {
  cachedSchema = null
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), 1), max)
}

function scoreMatch(q: string, fields: string[]): number {
  const lower = q.toLowerCase()
  let best = 0
  for (const field of fields) {
    const hay = field.toLowerCase()
    if (!hay) continue
    if (hay === lower) best = Math.max(best, 100)
    else if (hay.startsWith(lower)) best = Math.max(best, 80)
    else if (hay.includes(lower)) best = Math.max(best, 60)
  }
  return best
}

/** 将单条 route 展开为可订阅叶子（有 channels 则按栏目拉平） */
export function flattenRouteToFeeds(route: RsshubRouteEntry, category: string): RsshubFeedLeaf[] {
  const channels = route.channels
  if (channels && Object.keys(channels).length > 0) {
    const usable = Object.entries(channels).filter(([k]) => !isGenericChannelKey(k))
    if (usable.length === 0) {
      return [
        {
          label: route.name,
          path: resolveRoutePath(route),
          route_name: route.name,
          example: route.example,
          category,
        },
      ]
    }
    return usable.map(([key, value]) => ({
      label: `${route.name} · ${key}`,
      path: expandRoutePath(route.path, value),
      route_name: route.name,
      channel: key,
      example: route.example,
      category,
    }))
  }
  return [
    {
      label: route.name,
      path: resolveRoutePath(route),
      route_name: route.name,
      example: route.example,
      category,
    },
  ]
}

function countFeedsInDomain(dom: RsshubDomainEntry, category: string): number {
  let n = 0
  for (const route of dom.routes) {
    n += flattenRouteToFeeds(route, category).length
  }
  return n
}

/** ask_user / 用户口语常用别名 → 分类 id（精确匹配用，优先于宽松包含） */
const CATEGORY_ALIASES: Record<string, string> = {
  财经: 'finance',
  金融: 'finance',
  经济: 'finance',
  股票: 'stock',
  证券: 'stock',
  投资: 'stock',
  政府: 'government',
  政策: 'government',
  媒体: 'media',
  新闻: 'media',
  科技: 'tech',
  ai: 'tech',
  航天: 'tech',
  大宗: 'commodity',
  黄金: 'commodity',
  商品: 'commodity',
  其他: 'other',
}

function listCategoryIdDescriptions(
  schema: RsshubRoutesSchema,
): Array<{ id: string; description: string }> {
  return Object.entries(schema.categories).map(([id, cat]) => ({
    id,
    description: cat.description,
  }))
}

/**
 * 将用户传入的分类（英文 id / 中文 description / 常用别名）解析为 schema 分类 id。
 * 优先级：精确 id → 大小写不敏感 id → 精确 description → 别名 → description 包含（唯一命中）。
 */
export function resolveCategoryId(raw: string): string | null {
  const input = raw.trim()
  if (!input) return null
  const schema = loadSchema()
  const entries = Object.entries(schema.categories)

  if (schema.categories[input]) return input

  const lower = input.toLowerCase()
  for (const [id] of entries) {
    if (id.toLowerCase() === lower) return id
  }

  for (const [id, cat] of entries) {
    if (cat.description === input) return id
  }

  const aliasId = CATEGORY_ALIASES[input] ?? CATEGORY_ALIASES[lower]
  if (aliasId && schema.categories[aliasId]) return aliasId

  // description 分段精确（如「财经/经济/金融」中的「经济」）
  for (const [id, cat] of entries) {
    const parts = cat.description.split(/[/、，,\s]+/).filter(Boolean)
    if (parts.some((p) => p === input || p.toLowerCase() === lower)) return id
  }

  // 宽松：唯一包含关系，避免多分类误伤
  const containHits: string[] = []
  for (const [id, cat] of entries) {
    if (cat.description.includes(input) || input.includes(cat.description)) {
      containHits.push(id)
    }
  }
  if (containHits.length === 1) return containHits[0]

  return null
}

const CATEGORIES_ASK_HINT =
  'ask_user 的 option.id 必须用分类 id（finance/stock/…），label 可用 description；选完后立刻 list_rsshub_domains({category: 所选 id})'

export function listCategories(): {
  categories: RsshubCategorySummary[]
  meta: RsshubSchemaMeta
  hint: string
} {
  const schema = loadSchema()
  const categories: RsshubCategorySummary[] = []
  for (const [id, cat] of Object.entries(schema.categories)) {
    let domain_count = 0
    let route_count = 0
    for (const dom of Object.values(cat.domains)) {
      domain_count += 1
      route_count += dom.routes.length
    }
    categories.push({
      id,
      description: cat.description,
      domain_count,
      route_count,
    })
  }
  return { categories, meta: schema.meta, hint: CATEGORIES_ASK_HINT }
}

/**
 * 按分类列出该分类下全部域名（单分类通常 ≤15，默认 limit 够全量返回）。
 * 排序：priority 升序，再按 name。
 * category 可为 id、中文 description 或常用别名（经 resolveCategoryId）。
 */
export function listDomains(opts: {
  category: string
  limit?: number
}): {
  category: string
  description: string
  domains: RsshubDomainSummary[]
  total: number
  error?: string
  categories?: Array<{ id: string; description: string }>
} {
  const raw = opts.category.trim()
  if (!raw) {
    const schema = loadSchema()
    return {
      category: '',
      description: '',
      domains: [],
      total: 0,
      error: 'category 必填',
      categories: listCategoryIdDescriptions(schema),
    }
  }
  const limit = clampLimit(opts.limit, 50, 50)
  const schema = loadSchema()
  const category = resolveCategoryId(raw)
  if (!category) {
    return {
      category: raw,
      description: '',
      domains: [],
      total: 0,
      error: `未找到分类「${raw}」；请传分类 id（如 finance）或中文名（如「财经/经济/金融」「财经」）`,
      categories: listCategoryIdDescriptions(schema),
    }
  }
  const cat = schema.categories[category]
  if (!cat) {
    return {
      category: raw,
      description: '',
      domains: [],
      total: 0,
      error: `未找到分类「${raw}」`,
      categories: listCategoryIdDescriptions(schema),
    }
  }

  const domains: RsshubDomainSummary[] = []
  for (const [host, dom] of Object.entries(cat.domains)) {
    const entry: RsshubDomainSummary = {
      domain: host,
      name: dom.name,
      route_count: dom.routes.length,
      feed_count: countFeedsInDomain(dom, category),
    }
    if (typeof dom.priority === 'number') entry.priority = dom.priority
    domains.push(entry)
  }

  domains.sort((a, b) => {
    const pa = typeof a.priority === 'number' ? a.priority : 99
    const pb = typeof b.priority === 'number' ? b.priority : 99
    return pa - pb || a.name.localeCompare(b.name, 'zh') || a.domain.localeCompare(b.domain)
  })

  return {
    category,
    description: cat.description,
    domains: domains.slice(0, limit),
    total: domains.length,
  }
}

/**
 * 按域名列出拉平后的可订阅叶子（路由 + 频道已展开，供 ask_user 多选）。
 * 默认最多返回 50（ask_user 上限）；limit 上限 100；可用 q 对 label/path 子串过滤。
 */
export function listDomainFeeds(opts: {
  domain: string
  category?: string
  q?: string
  limit?: number
}): {
  domain: string
  name?: string
  category?: string
  categories_found: string[]
  total_feeds: number
  has_more: boolean
  feeds: RsshubFeedLeaf[]
  hint?: string
  error?: string
  categories?: Array<{ id: string; description: string }>
} {
  const domain = opts.domain.trim().toLowerCase()
  if (!domain) {
    return {
      domain: '',
      categories_found: [],
      total_feeds: 0,
      has_more: false,
      feeds: [],
      error: 'domain 必填',
    }
  }
  const limit = clampLimit(opts.limit, 50, 100)
  const rawCategory = opts.category?.trim() || undefined
  const schema = loadSchema()
  let categoryFilter: string | undefined
  if (rawCategory) {
    const resolved = resolveCategoryId(rawCategory)
    if (!resolved) {
      return {
        domain: opts.domain.trim(),
        category: rawCategory,
        categories_found: [],
        total_feeds: 0,
        has_more: false,
        feeds: [],
        error: `未找到分类「${rawCategory}」；请传分类 id（如 finance）或中文名`,
        categories: listCategoryIdDescriptions(schema),
      }
    }
    categoryFilter = resolved
  }
  const q = opts.q?.trim().toLowerCase() || undefined

  type Collected = RsshubFeedLeaf & { domainName: string; priority: number }
  const collected: Collected[] = []
  const categoriesFound: string[] = []

  for (const [catId, cat] of Object.entries(schema.categories)) {
    if (categoryFilter && catId !== categoryFilter) continue
    for (const [host, dom] of Object.entries(cat.domains)) {
      if (host.toLowerCase() !== domain && !host.toLowerCase().includes(domain)) continue
      if (!categoriesFound.includes(catId)) categoriesFound.push(catId)
      const priority = typeof dom.priority === 'number' ? dom.priority : 99
      for (const route of dom.routes) {
        for (const feed of flattenRouteToFeeds(route, catId)) {
          if (q) {
            const hay = `${feed.label} ${feed.path} ${feed.route_name} ${feed.channel ?? ''}`.toLowerCase()
            if (!hay.includes(q)) continue
          }
          collected.push({ ...feed, domainName: dom.name, priority })
        }
      }
    }
  }

  if (!collected.length) {
    return {
      domain: opts.domain.trim(),
      category: categoryFilter,
      categories_found: categoriesFound,
      total_feeds: 0,
      has_more: false,
      feeds: [],
      error: q
        ? `未找到域名「${opts.domain.trim()}」下匹配「${opts.q?.trim()}」的可订阅项`
        : `未找到域名「${opts.domain.trim()}」的内置路由`,
    }
  }

  // 按站点 priority，再保持 route 展开顺序（stable：不按 path 重排叶子）
  collected.sort((a, b) => a.priority - b.priority)

  const total_feeds = collected.length
  const sliced = collected.slice(0, limit)
  const has_more = total_feeds > sliced.length
  const result: {
    domain: string
    name?: string
    category?: string
    categories_found: string[]
    total_feeds: number
    has_more: boolean
    feeds: RsshubFeedLeaf[]
    hint?: string
  } = {
    domain: opts.domain.trim(),
    name: sliced[0]?.domainName,
    category: categoryFilter,
    categories_found: categoriesFound,
    total_feeds,
    has_more,
    feeds: sliced.map(({ label, path, route_name, channel, example, category }) => {
      const leaf: RsshubFeedLeaf = { label, path, route_name, category }
      if (channel) leaf.channel = channel
      if (example) leaf.example = example
      return leaf
    }),
  }
  if (has_more) {
    result.hint =
      `共 ${total_feeds} 个可订阅项，已返回前 ${sliced.length} 个（ask_user 最多 50）。` +
      `请用 q 关键词缩小后再让用户勾选，或提高 limit（上限 100）。`
  }
  return result
}

/**
 * @deprecated 语义已改为拉平 feeds；请用 listDomainFeeds。保留别名以免旧调用断裂。
 */
export function getDomainRoutes(opts: {
  domain: string
  category?: string
  q?: string
  limit?: number
}): ReturnType<typeof listDomainFeeds> {
  return listDomainFeeds(opts)
}

export function searchRoutes(opts: {
  q: string
  category?: string
  limit?: number
}): {
  q: string
  category?: string
  total_matched: number
  routes: RsshubRouteHit[]
  error?: string
  categories?: Array<{ id: string; description: string }>
} {
  const q = opts.q.trim()
  if (!q) {
    return { q: '', category: opts.category, total_matched: 0, routes: [] }
  }
  const limit = clampLimit(opts.limit, 10, 20)
  const schema = loadSchema()
  const rawCategory = opts.category?.trim() || undefined
  let categoryFilter: string | undefined
  if (rawCategory) {
    const resolved = resolveCategoryId(rawCategory)
    if (!resolved) {
      return {
        q,
        category: rawCategory,
        total_matched: 0,
        routes: [],
        error: `未找到分类「${rawCategory}」；请传分类 id（如 finance）或中文名`,
        categories: listCategoryIdDescriptions(schema),
      }
    }
    categoryFilter = resolved
  }
  const hits: RsshubRouteHit[] = []

  for (const [catId, cat] of Object.entries(schema.categories)) {
    if (categoryFilter && catId !== categoryFilter) continue
    for (const [host, dom] of Object.entries(cat.domains)) {
      for (const route of dom.routes) {
        for (const feed of flattenRouteToFeeds(route, catId)) {
          const score = scoreMatch(q, [
            feed.label,
            feed.path,
            feed.route_name,
            feed.channel ?? '',
            host,
            dom.name,
            feed.example ?? '',
            route.path,
          ])
          if (score <= 0) continue
          const hit: RsshubRouteHit = {
            category: catId,
            domain: host,
            name: dom.name,
            title: feed.label,
            path: feed.path,
            score,
          }
          if (feed.example) hit.example = feed.example
          if (feed.channel) hit.channel = feed.channel
          hits.push(hit)
        }
      }
    }
  }

  hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.path.localeCompare(b.path))
  return {
    q,
    category: categoryFilter,
    total_matched: hits.length,
    routes: hits.slice(0, limit),
  }
}
