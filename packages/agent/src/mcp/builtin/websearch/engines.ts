/**
 * 多引擎目录、语言分流、检索 URL 构造（无 API Key）。
 */

export type SearchRegion = 'auto' | 'cn' | 'global'
export type TimeWindow = 'h' | 'd' | 'w' | 'm' | 'y'

export type EngineId =
  | 'baidu'
  | 'bing_cn'
  | 'bing_int'
  | 'so360'
  | 'sogou'
  | 'sogou_weixin'
  | 'shenma'
  | 'google'
  | 'google_hk'
  | 'duckduckgo'
  | 'yahoo'
  | 'startpage'
  | 'brave'
  | 'ecosia'
  | 'qwant'
  | 'wolfram'

export interface EngineDef {
  id: EngineId
  region: 'cn' | 'global'
  /** 首页（拉会话 cookie） */
  homeUrl: string
  /** 允许请求的主机（含 www / 无 www 变体） */
  hosts: readonly string[]
}

export const ENGINE_DEFS: Record<EngineId, EngineDef> = {
  baidu: {
    id: 'baidu',
    region: 'cn',
    homeUrl: 'https://www.baidu.com/',
    hosts: ['www.baidu.com', 'baidu.com'],
  },
  bing_cn: {
    id: 'bing_cn',
    region: 'cn',
    homeUrl: 'https://cn.bing.com/',
    hosts: ['cn.bing.com', 'www.bing.com', 'bing.com'],
  },
  bing_int: {
    id: 'bing_int',
    region: 'cn',
    homeUrl: 'https://cn.bing.com/',
    hosts: ['cn.bing.com', 'www.bing.com', 'bing.com'],
  },
  so360: {
    id: 'so360',
    region: 'cn',
    homeUrl: 'https://www.so.com/',
    hosts: ['www.so.com', 'so.com'],
  },
  sogou: {
    id: 'sogou',
    region: 'cn',
    homeUrl: 'https://www.sogou.com/',
    hosts: ['www.sogou.com', 'sogou.com'],
  },
  sogou_weixin: {
    id: 'sogou_weixin',
    region: 'cn',
    homeUrl: 'https://wx.sogou.com/',
    hosts: ['wx.sogou.com'],
  },
  shenma: {
    id: 'shenma',
    region: 'cn',
    homeUrl: 'https://m.sm.cn/',
    hosts: ['m.sm.cn', 'sm.cn'],
  },
  google: {
    id: 'google',
    region: 'global',
    homeUrl: 'https://www.google.com/',
    hosts: ['www.google.com', 'google.com'],
  },
  google_hk: {
    id: 'google_hk',
    region: 'global',
    homeUrl: 'https://www.google.com.hk/',
    hosts: ['www.google.com.hk', 'google.com.hk'],
  },
  duckduckgo: {
    id: 'duckduckgo',
    region: 'global',
    homeUrl: 'https://html.duckduckgo.com/',
    hosts: ['html.duckduckgo.com', 'duckduckgo.com', 'www.duckduckgo.com'],
  },
  yahoo: {
    id: 'yahoo',
    region: 'global',
    homeUrl: 'https://search.yahoo.com/',
    hosts: ['search.yahoo.com'],
  },
  startpage: {
    id: 'startpage',
    region: 'global',
    homeUrl: 'https://www.startpage.com/',
    hosts: ['www.startpage.com', 'startpage.com'],
  },
  brave: {
    id: 'brave',
    region: 'global',
    homeUrl: 'https://search.brave.com/',
    hosts: ['search.brave.com'],
  },
  ecosia: {
    id: 'ecosia',
    region: 'global',
    homeUrl: 'https://www.ecosia.org/',
    hosts: ['www.ecosia.org', 'ecosia.org'],
  },
  qwant: {
    id: 'qwant',
    region: 'global',
    homeUrl: 'https://www.qwant.com/',
    hosts: ['www.qwant.com', 'qwant.com'],
  },
  wolfram: {
    id: 'wolfram',
    region: 'global',
    homeUrl: 'https://www.wolframalpha.com/',
    hosts: ['www.wolframalpha.com', 'wolframalpha.com'],
  },
}

/** 国内默认批次（优先可解析引擎） */
const CN_BATCH: EngineId[] = ['bing_cn', 'baidu', 'so360', 'sogou']
/** 国际默认批次：DDG HTML 为主路径 */
const GLOBAL_BATCH: EngineId[] = ['duckduckgo', 'brave', 'ecosia', 'yahoo']

const ALLOWED_HOSTS = new Set<string>()
for (const def of Object.values(ENGINE_DEFS)) {
  for (const h of def.hosts) ALLOWED_HOSTS.add(h.toLowerCase())
}

export function isAllowedSearchHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname.toLowerCase())
}

/** 含汉字 → 中文意图 */
export function queryLooksChinese(query: string): boolean {
  return /[\u4e00-\u9fff]/.test(query)
}

export function resolveRegion(region: SearchRegion | undefined, query: string): 'cn' | 'global' {
  if (region === 'cn') return 'cn'
  if (region === 'global') return 'global'
  return queryLooksChinese(query) ? 'cn' : 'global'
}

export function selectEngines(region: 'cn' | 'global', count = 4): EngineDef[] {
  const ids = region === 'cn' ? CN_BATCH : GLOBAL_BATCH
  return ids.slice(0, Math.min(4, Math.max(3, count))).map(id => ENGINE_DEFS[id])
}

/** Google tbs=qdr:*；其它引擎尽量塞进 query */
export function googleTbs(time?: TimeWindow): string | undefined {
  if (!time) return undefined
  const map: Record<TimeWindow, string> = {
    h: 'qdr:h',
    d: 'qdr:d',
    w: 'qdr:w',
    m: 'qdr:m',
    y: 'qdr:y',
  }
  return map[time]
}

export function composeQuery(opts: {
  query: string
  site?: string
  time?: TimeWindow
  /** 是否把 time 写进 query（非 Google 类） */
  embedTimeInQuery?: boolean
}): string {
  let q = opts.query.trim()
  const site = opts.site?.trim()
  if (site && !/\bsite:/i.test(q)) {
    q = `site:${site.replace(/^https?:\/\//i, '').replace(/\/$/, '')} ${q}`
  }
  if (opts.embedTimeInQuery && opts.time) {
    const hint: Record<TimeWindow, string> = {
      h: 'past hour',
      d: 'past day',
      w: 'past week',
      m: 'past month',
      y: 'past year',
    }
    if (!/\bpast (hour|day|week|month|year)\b/i.test(q)) {
      q = `${q} ${hint[opts.time]}`
    }
  }
  return q.trim()
}

export function buildSearchUrl(
  engine: EngineDef,
  query: string,
  opts?: { site?: string; time?: TimeWindow },
): string {
  const isGoogle = engine.id === 'google' || engine.id === 'google_hk'
  const q = composeQuery({
    query,
    site: opts?.site,
    time: opts?.time,
    embedTimeInQuery: !isGoogle,
  })
  const enc = encodeURIComponent(q)

  switch (engine.id) {
    case 'baidu':
      return `https://www.baidu.com/s?wd=${enc}`
    case 'bing_cn':
      return `https://cn.bing.com/search?q=${enc}&ensearch=0`
    case 'bing_int':
      return `https://cn.bing.com/search?q=${enc}&ensearch=1`
    case 'so360':
      return `https://www.so.com/s?q=${enc}`
    case 'sogou':
      return `https://www.sogou.com/web?query=${enc}`
    case 'sogou_weixin':
      return `https://wx.sogou.com/weixin?type=2&query=${enc}`
    case 'shenma':
      return `https://m.sm.cn/s?q=${enc}`
    case 'google': {
      const tbs = googleTbs(opts?.time)
      return `https://www.google.com/search?q=${enc}${tbs ? `&tbs=${tbs}` : ''}`
    }
    case 'google_hk': {
      const tbs = googleTbs(opts?.time)
      return `https://www.google.com.hk/search?q=${enc}${tbs ? `&tbs=${tbs}` : ''}`
    }
    case 'duckduckgo':
      return `https://html.duckduckgo.com/html/?q=${enc}`
    case 'yahoo':
      return `https://search.yahoo.com/search?p=${enc}`
    case 'startpage':
      return `https://www.startpage.com/sp/search?query=${enc}`
    case 'brave':
      return `https://search.brave.com/search?q=${enc}`
    case 'ecosia':
      return `https://www.ecosia.org/search?q=${enc}`
    case 'qwant':
      return `https://www.qwant.com/?q=${enc}`
    case 'wolfram':
      return `https://www.wolframalpha.com/input?i=${enc}`
    default:
      return `https://html.duckduckgo.com/html/?q=${enc}`
  }
}
