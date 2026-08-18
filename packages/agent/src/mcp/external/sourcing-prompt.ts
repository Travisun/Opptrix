/**
 * 聊天 system 用的外部 MCP 数据源目录（同步读 registry 缓存，不 RPC listTools）。
 */
import type { ExternalMcpRegistry } from './registry.js'

const MCP_FIRST_GENERIC = [
  '外部 MCP 按优先级轮询；精确工具优先于问数；不足再本地。',
  '外部 MCP 优先级与稳定性优于本地 MCP/本地工具；同一能力先远程，远程失败/熔断再本地。',
  '若本轮 tools 列表出现 `[MCP:` 标注或 `serverId__tool` 命名空间工具，同一能力必须先调远程。',
  'search_instruments 仅当标的代码歧义（同码多市场/多交易所），或外部 MCP 未启用/连接失败/调用报错时才允许；禁止用于名称搜索/选股/问数。',
].join('\n')

/** 从已启用 server 的缓存 toolNames 挑若干展示名（namespaced） */
function pickSampleTools(
  serverId: string,
  names: readonly string[],
  prefer: readonly string[],
  max = 4,
): string[] {
  const set = new Set(names)
  const out: string[] = []
  for (const p of prefer) {
    if (set.has(p)) out.push(`${serverId}__${p}`)
    if (out.length >= max) return out
  }
  for (const n of names) {
    const ns = `${serverId}__${n}`
    if (!out.includes(ns)) out.push(ns)
    if (out.length >= max) break
  }
  return out
}

/**
 * 基于 hydrate 后缓存生成「本会话已启用外部 MCP」附录。
 * 无启用 server 时仅返回通用 MCP 优先规则（不假装有问财等）。
 */
export function buildExternalMcpSourcingAppendix(registry: ExternalMcpRegistry): string {
  try {
    const enabled = registry
      .listPublic()
      .filter(s => s.enabled && !s.paused)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    if (!enabled.length) {
      return ['【外部 MCP — 本会话】', '当前无已启用的外部 MCP。', MCP_FIRST_GENERIC].join('\n')
    }

    const lines: string[] = [
      '【外部 MCP — 本会话已启用（优先于本地同能力工具）】',
    ]

    const byId = new Map(enabled.map(s => [s.id, s]))
    const hasIwencai = byId.has('iwencai')
    const fuyaoServers = enabled.filter(s => s.id.startsWith('fuyao-'))
    const hasMx = byId.has('mx-ds-mcp')

    for (const s of enabled) {
      const names = registry.cachedToolNames(s.id)
      const samples = pickSampleTools(s.id, names, [
        'query2data',
        'news_search',
        'announcement_search',
        'report_search',
      ])
      const sampleText = samples.length
        ? `；示例：${samples.join('、')}`
        : names.length === 0
          ? '（工具名待连接缓存）'
          : ''
      lines.push(`- ${s.id}（${s.title}）${sampleText}`)
    }

    lines.push('【能力映射 — 仅当对应 server 已启用时遵守】')
    if (hasIwencai) {
      const iw = registry.cachedToolNames('iwencai')
      const has = (n: string) => !iw.length || iw.includes(n)
      if (has('query2data')) {
        lines.push(
          '- 问数/选股/财务/宏观/指数/行业/快照 get_instrument_snapshot → 优先 `iwencai__query2data`；本地 get_instrument_* / get_macro_* 为补充',
        )
        lines.push(
          '- 榜单/全景/日历开盘/情绪市况（涨跌停/龙虎榜/连板天梯/热榜/市场概况/交易日历/是否开盘/情绪/牛熊）→ 优先 `iwencai__query2data`；本地 get_limit_updown / get_dragon_tiger / get_cn_market_special / get_market_dynamics / get_trade_calendar / get_market_session / get_market_sentiment / get_market_regime 为补充',
        )
        lines.push(
          '- 评分/策略/回测/风格评级与关注列表/持仓为本机独有，勿用问财代替',
        )
      }
      if (has('news_search')) {
        lines.push('- 新闻/舆情 → 优先 `iwencai__news_search`，再才用 `list_news_*`（本机 RSS 订阅）')
      }
      if (has('announcement_search')) {
        lines.push(
          '- 公告检索 → 优先 `iwencai__announcement_search`；`get_instrument_notices` 为精确公告列表/正文补充',
        )
      }
      if (has('report_search')) {
        lines.push(
          '- 网上研报 → 优先 `iwencai__report_search`；`search_library` 仅跨会话已入库文档；28 家风格雷达仍用本地 get_instrument_institution_rating',
        )
      }
    }
    if (fuyaoServers.length || hasMx) {
      const fuyaoHint = fuyaoServers.length
        ? fuyaoServers.map(s => `\`${s.id}__*\``).join(' / ')
        : ''
      const mxHint = hasMx ? '`mx-ds-mcp__*`' : ''
      const remote = [fuyaoHint, mxHint].filter(Boolean).join(' 与 ')
      lines.push(
        `- 行情/价格/K线/指标/成分/快照 → 优先已启用 ${remote} 中对应工具；本地 get_instrument_quotes/snapshot/chart/indicators 仅 MCP 无该能力或失败后`,
      )
    }
    lines.push(MCP_FIRST_GENERIC)
    return lines.join('\n')
  } catch {
    return MCP_FIRST_GENERIC
  }
}
