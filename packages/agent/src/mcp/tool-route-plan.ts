/**
 * 分层 MCP 工具路由计划 — 意图 → 首选工具 + 必需 pack。
 *
 * 设计对齐常见领先做法（分层路由 + 消歧，非向量检索）：
 * 1. Stage A：用户意图 → 首选/次选工具（精排）
 * 2. Stage B：工具 → 所属 pack（保证可见）
 * 3. Stage C：提示词注入「本轮选型卡」+ 易混对消歧（降低错选）
 *
 * 可审计、确定性；与 ToolPackResolver 播种互补：播种管召回，本模块管精确选型。
 */

import {
  type ToolPackId,
  packIdForTool,
  alwaysOnPackIds,
  type ResearchTier,
} from '@opptrix/shared'
import type { SessionContextRef } from '../sessions.js'
import { resolveSeedPacks, MAX_SEEDED_BUSINESS_PACKS } from './tool-pack-resolver.js'

export type RouteConfidence = 'high' | 'medium' | 'low'

export interface ToolRoutePlan {
  /** 本轮建议优先调用的工具（有序；越靠前越优先） */
  preferredTools: string[]
  /** 易与首选混淆、应避免优先的工具 */
  avoidTools: string[]
  /** 为保证首选可见而必须加载的业务 pack（不含 always-on） */
  requiredPacks: ToolPackId[]
  /** 最终建议加载的业务 pack（required ∪ 播种，≤ max） */
  seedPacks: ToolPackId[]
  confidence: RouteConfidence
  /** 短标签：price | depth_analysis | etf_nav | ... */
  intent: string
  /** 注入 system 的选型说明 */
  routeHint: string
  /** 投研答复档位 */
  researchTier: ResearchTier
}

export interface ToolRouteResolveInput {
  message: string
  contextRef?: SessionContextRef | null
}

interface IntentRule {
  intent: string
  patterns: RegExp[]
  /** 越高越优先匹配 */
  priority: number
  preferredTools: string[]
  avoidTools?: string[]
  confidence: RouteConfidence
  hint: string
}

/**
 * 意图规则表：从具体到宽泛排序（同 message 取最高 priority 命中）。
 * preferredTools[0] 为「尽可能最正确」的首推工具。
 */
const INTENT_RULES: IntentRule[] = [
  {
    intent: 'etf_nav',
    priority: 100,
    patterns: [/净值|溢价率|折价率|IOPV/i],
    preferredTools: ['get_etf_nav', 'get_instrument_snapshot'],
    avoidTools: ['get_etf_holdings', 'evaluate_instrument', 'get_instrument_quotes'],
    confidence: 'high',
    hint: '问净值/溢价 → 首选 get_etf_nav；勿用持仓权重或仅用实时价代替净值序列',
  },
  {
    intent: 'etf_holdings',
    priority: 98,
    patterns: [/ETF.*(?:持仓|成分|权重)|(?:持仓|成分|权重).*ETF|基金持仓|跟踪指数成分/i],
    preferredTools: ['get_etf_holdings', 'get_etf_list'],
    avoidTools: ['get_portfolio_holdings', 'get_etf_nav'],
    confidence: 'high',
    hint: '问 ETF 成分/权重 → 首选 get_etf_holdings；勿与用户个人持仓 get_portfolio_holdings 混淆',
  },
  {
    intent: 'portfolio_holdings',
    priority: 96,
    patterns: [/我的持仓|实盘持仓|持仓明细|仓位盈亏|持仓成本|浮盈|浮动盈亏/],
    preferredTools: ['get_portfolio_holdings', 'portfolio_summary'],
    avoidTools: ['get_etf_holdings', 'get_watchlist', 'analyze_portfolio'],
    confidence: 'high',
    hint: '问个人持仓/浮盈 → 首选 get_portfolio_holdings；勿调 ETF 成分或仅读关注列表',
  },
  {
    intent: 'watchlist',
    priority: 94,
    patterns: [/关注列表|自选股|我的自选|watchlist/i],
    preferredTools: ['get_watchlist', 'batch_instrument_snapshots'],
    avoidTools: ['get_portfolio_holdings'],
    confidence: 'high',
    hint: '问关注/自选 → 首选 get_watchlist；需要行情时再 batch_instrument_snapshots',
  },
  {
    intent: 'portfolio_trades',
    priority: 92,
    patterns: [/交易流水|买卖记录|成交记录|账本/],
    preferredTools: ['portfolio_trades', 'portfolio_summary'],
    avoidTools: ['get_portfolio_holdings'],
    confidence: 'high',
    hint: '问买卖流水 → 首选 portfolio_trades',
  },
  {
    intent: 'portfolio_analysis',
    priority: 90,
    patterns: [/组合分析|组合暴露|持仓分析|因子分析.*组合/],
    preferredTools: ['analyze_portfolio', 'get_portfolio_holdings'],
    avoidTools: ['evaluate_instrument'],
    confidence: 'high',
    hint: '问组合暴露/因子分析 → 首选 analyze_portfolio',
  },
  {
    intent: 'news_article',
    priority: 88,
    patterns: [/读.*(?:新闻|资讯|文章)|资讯正文|这篇(新闻|资讯)|公告全文|年报正文/],
    preferredTools: ['get_news_article', 'get_notice_content', 'list_news_articles'],
    avoidTools: ['get_instrument_snapshot'],
    confidence: 'high',
    hint: '要正文 → list 拿到 id 后 get_news_article / get_notice_content；勿只用 snapshot 新闻字段敷衍',
  },
  {
    intent: 'news_browse',
    priority: 86,
    patterns: [/资讯|新闻|公告|研报|新闻中心|RSS|订阅源/i],
    preferredTools: ['list_news_articles', 'list_news_groups', 'get_news_center_status'],
    avoidTools: ['get_instrument_snapshot', 'evaluate_instrument'],
    confidence: 'high',
    hint: '浏览资讯 → list_news_groups/list_news_articles；深度分析标的勿替代资讯工具',
  },
  {
    intent: 'market_regime',
    priority: 84,
    patterns: [/牛熊|风险偏好|市场状态|宏观环境|现在是牛市|熊市吗/],
    preferredTools: ['get_market_regime', 'get_market_dynamics'],
    avoidTools: ['get_trend_brief', 'evaluate_instrument'],
    confidence: 'high',
    hint: '问宏观牛熊 → 首选 get_market_regime；勿用单股 trend_brief 代替',
  },
  {
    intent: 'market_dynamics',
    priority: 82,
    patterns: [/涨跌榜|龙虎榜|板块轮动|市场全景|复盘|全球市场|市场动态/],
    preferredTools: ['get_market_dynamics', 'get_market_regime'],
    avoidTools: ['get_instrument_snapshot'],
    confidence: 'high',
    hint: '问涨跌榜/龙虎榜/全景 → 首选 get_market_dynamics',
  },
  {
    intent: 'morning_brief',
    priority: 80,
    patterns: [/早报|开盘简报|盘前/],
    preferredTools: ['get_morning_brief', 'get_market_regime'],
    avoidTools: ['get_closing_report'],
    confidence: 'high',
    hint: '早报/盘前 → get_morning_brief；勿用收盘报告',
  },
  {
    intent: 'closing_report',
    priority: 80,
    patterns: [/收盘报告|收盘复盘|尾盘总结/],
    preferredTools: ['get_closing_report', 'get_market_dynamics'],
    avoidTools: ['get_morning_brief'],
    confidence: 'high',
    hint: '收盘复盘 → get_closing_report',
  },
  {
    intent: 'trend_brief',
    priority: 78,
    patterns: [/走势怎么看|趋势一句话|均线怎么看|相对强弱/],
    preferredTools: ['get_trend_brief', 'get_instrument_chart'],
    avoidTools: ['get_market_regime'],
    confidence: 'high',
    hint: 'A 股单股趋势快评 → get_trend_brief；深度评分再用 evaluate_instrument',
  },
  {
    intent: 'industry',
    priority: 76,
    patterns: [/产业链|上下游|行业透视|主题观察池|行业图谱|mermaid/i],
    preferredTools: ['industry_mining', 'industry_mermaid'],
    avoidTools: ['search_instruments'],
    confidence: 'high',
    hint: '产业链/上下游 → 首选 industry_mining；图谱用 industry_mermaid；代表公司再 search',
  },
  {
    intent: 'cyq',
    priority: 74,
    patterns: [/筹码|成本分布|获利盘/],
    preferredTools: ['get_instrument_cyq', 'get_instrument_snapshot'],
    avoidTools: ['get_instrument_indicators'],
    confidence: 'high',
    hint: '筹码分布 → get_instrument_cyq（仅 A 股）',
  },
  {
    intent: 'institution',
    priority: 72,
    patterns: [/机构评级|目标价|券商评级|机构观点/],
    preferredTools: ['get_instrument_institution_rating', 'get_instrument_institution_report'],
    avoidTools: ['evaluate_instrument'],
    confidence: 'high',
    hint: '机构评级 → rating 概览，详报用 report；勿用评分卡代替',
  },
  {
    intent: 'strategy_signal',
    priority: 70,
    patterns: [/交易信号|买卖点|策略信号|多空信号/],
    preferredTools: ['get_instrument_strategy_signal', 'evaluate_instrument'],
    avoidTools: ['get_instrument_quotes'],
    confidence: 'high',
    hint: '策略/买卖信号 → get_instrument_strategy_signal',
  },
  {
    intent: 'indicators',
    priority: 68,
    patterns: [/MACD|RSI|KDJ|布林|技术指标|均线系统/i],
    preferredTools: ['get_instrument_indicators', 'get_instrument_chart'],
    avoidTools: ['get_instrument_quotes'],
    confidence: 'high',
    hint: '具体技术指标 → get_instrument_indicators；配 K 线用 get_instrument_chart',
  },
  {
    intent: 'backtest',
    priority: 66,
    patterns: [/回测|IC\b|因子有效性|backtest/i],
    preferredTools: ['run_backtest', 'strategy_report'],
    avoidTools: ['evaluate_instrument'],
    confidence: 'high',
    hint: '回测/IC → run_backtest；单股策略报告用 strategy_report',
  },
  {
    intent: 'financials',
    priority: 72,
    patterns: [/营收|净利润|ROE|财报|财务|同比|毛利率|每股收益|\bEPS\b|利润表|资产负债/i],
    preferredTools: ['get_instrument_financials', 'get_instrument_snapshot', 'get_instrument_profile'],
    avoidTools: ['evaluate_instrument', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '财务数字核实 → 首选 get_instrument_financials；勿用 evaluate 黑盒代替事实表',
  },
  {
    intent: 'profile',
    priority: 70,
    patterns: [/公司简介|主营业务|所属概念|所属行业|做什么的|公司概况|F10|基本资料/],
    preferredTools: ['get_instrument_profile', 'get_instrument_snapshot'],
    avoidTools: ['evaluate_instrument', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '公司概况/概念 → get_instrument_profile',
  },
  {
    intent: 'shareholders',
    priority: 68,
    patterns: [/十大股东|股东结构|股东持股|股权结构|流通股东|谁持股/],
    preferredTools: ['get_instrument_shareholders', 'get_instrument_snapshot'],
    avoidTools: ['evaluate_instrument'],
    confidence: 'high',
    hint: '股东结构 → get_instrument_shareholders',
  },
  {
    intent: 'dividend',
    priority: 66,
    patterns: [/分红|派息|股息|股利|分红历史|分红方案/],
    preferredTools: ['get_instrument_dividend', 'get_instrument_snapshot'],
    avoidTools: ['evaluate_instrument'],
    confidence: 'high',
    hint: '分红派息 → get_instrument_dividend',
  },
  {
    intent: 'price_only',
    priority: 64,
    patterns: [/现价|最新价|多少钱|涨跌幅|实时行情|报价|现报/],
    preferredTools: ['get_instrument_quotes', 'get_instrument_snapshot'],
    avoidTools: ['evaluate_instrument', 'get_instrument_chart', 'get_instrument_indicators'],
    confidence: 'high',
    hint: '只需现价/涨跌 → 首选 get_instrument_quotes；勿一上来 evaluate',
  },
  {
    intent: 'chart',
    priority: 62,
    patterns: [/K线|走势图|蜡烛图|日线|周线/i],
    preferredTools: ['get_instrument_chart', 'get_instrument_quotes'],
    avoidTools: ['evaluate_instrument'],
    confidence: 'high',
    hint: '要 K 线/走势图 → get_instrument_chart',
  },
  {
    intent: 'search',
    priority: 60,
    patterns: [/搜一下|帮我找|叫什么代码|代码是多少|查一下.*是哪只|模糊搜索/],
    preferredTools: ['search_instruments', 'get_instrument_snapshot'],
    avoidTools: ['evaluate_instrument'],
    confidence: 'high',
    hint: '不确定代码 → 必须先 search_instruments',
  },
  {
    intent: 'capabilities',
    priority: 58,
    patterns: [/能查什么|有哪些能力|支持什么数据|capabilities/i],
    preferredTools: ['get_instrument_capabilities', 'list_tool_packs'],
    avoidTools: [],
    confidence: 'high',
    hint: '问标的能力 → get_instrument_capabilities；问工具包 → list_tool_packs',
  },
  {
    intent: 'provider_ext',
    priority: 56,
    patterns: [/自定义方法|invoke_provider|akshare|baostock|list_provider/i],
    preferredTools: ['list_enabled_providers', 'list_provider_custom_methods', 'invoke_provider_custom_method'],
    avoidTools: ['get_instrument_snapshot'],
    confidence: 'medium',
    hint: '自定义数据源 → list_enabled_providers → list_provider_custom_methods → invoke',
  },
  {
    intent: 'depth_analysis',
    priority: 40,
    patterns: [/分析|评估|评分|打分|值得买|好不好|深度|怎么看|研究一下|全面看看/],
    preferredTools: [
      'search_instruments',
      'get_instrument_snapshot',
      'get_instrument_financials',
      'get_instrument_profile',
      'evaluate_instrument',
      'get_instrument_strategy_signal',
    ],
    avoidTools: ['get_instrument_quotes'],
    confidence: 'medium',
    hint: '深度分析：已知代码可跳过 search → snapshot → financials/profile 事实表 → evaluate；仅报价不够',
  },
  {
    intent: 'etf_general',
    priority: 38,
    patterns: [/\bETF\b|场内基金|联接基金/i],
    preferredTools: ['search_instruments', 'get_instrument_snapshot', 'get_etf_nav', 'get_etf_holdings'],
    avoidTools: ['get_portfolio_holdings'],
    confidence: 'medium',
    hint: 'ETF 综合：search/snapshot；明确净值用 get_etf_nav，成分用 get_etf_holdings',
  },
]

/** 易混对 — 全局消歧（仅当两侧工具均已加载时注入） */
export const TOOL_CONFUSION_PAIRS: ReadonlyArray<{
  prefer: string
  avoid: string
  when: string
}> = [
  { prefer: 'get_instrument_quotes', avoid: 'evaluate_instrument', when: '只需现价/涨跌，不需要评分' },
  { prefer: 'get_instrument_financials', avoid: 'evaluate_instrument', when: '核实营收/利润/ROE 等财务数字' },
  { prefer: 'get_instrument_profile', avoid: 'evaluate_instrument', when: '只要公司概况/概念，不做评分' },
  { prefer: 'get_instrument_financials', avoid: 'invoke_provider_custom_method', when: '标准 financials 已覆盖' },
  { prefer: 'get_instrument_snapshot', avoid: 'get_instrument_quotes', when: '需要综合快照（行情+概况），不止最新价' },
  { prefer: 'evaluate_instrument', avoid: 'get_trend_brief', when: '需要评分卡/系统评估，而非一句话趋势' },
  { prefer: 'get_trend_brief', avoid: 'evaluate_instrument', when: '只要 A 股趋势快评' },
  { prefer: 'get_etf_nav', avoid: 'get_instrument_quotes', when: '问 ETF 净值/溢价序列' },
  { prefer: 'get_etf_holdings', avoid: 'get_portfolio_holdings', when: '问 ETF 成分而非个人持仓' },
  { prefer: 'get_portfolio_holdings', avoid: 'get_watchlist', when: '问实盘持仓而非关注列表' },
  { prefer: 'get_market_regime', avoid: 'get_trend_brief', when: '问大盘牛熊而非单股' },
  { prefer: 'list_news_articles', avoid: 'get_instrument_snapshot', when: '主任务是读资讯而非个股快照' },
  { prefer: 'industry_mining', avoid: 'search_instruments', when: '先做产业链，再搜代表公司' },
  { prefer: 'search_instruments', avoid: 'evaluate_instrument', when: '代码未确认时禁止先评估' },
]

const CN_CODE_RE = /(?:^|[^\d])([036]\d{5})(?:[^\d]|$)/
const NS_REF_RE = /\b(?:CN|US|HK|CRYPTO):[A-Z0-9./]+\b/i
const COMPANY_NAME_RE = /茅台|宁德|比亚迪|腾讯|苹果|阿里|bitcoin|比特币|贵州茅台|招商银行|美团|小米/i

function hasInstrumentCue(message: string): boolean {
  return CN_CODE_RE.test(message) || NS_REF_RE.test(message) || COMPANY_NAME_RE.test(message)
}

const L1_INTENTS = new Set([
  'price_only',
  'search',
  'capabilities',
  'general',
  'watchlist',
  'portfolio_trades',
  'financials',
  'profile',
  'shareholders',
  'dividend',
])

const L3_INTENTS = new Set([
  'depth_analysis',
  'instrument_cue',
  'industry',
  'backtest',
  'portfolio_analysis',
  'etf_general',
])

/** 显式要求全面/深度 → 强制 L3 */
const L3_UPGRADE_RE = /全面|深度分析|深度研究|系统分析|完整复盘|投研备忘|综合评估|怎么研究/

/**
 * 由意图 + 话术确定研究档位（可测、确定性）。
 */
export function resolveResearchTier(intent: string, message: string): ResearchTier {
  const text = message.trim()
  if (L3_UPGRADE_RE.test(text)) return 'L3'
  if (L3_INTENTS.has(intent)) return 'L3'
  if (L1_INTENTS.has(intent)) return 'L1'
  return 'L2'
}

function packsForTools(tools: string[]): ToolPackId[] {
  const packs = new Set<ToolPackId>()
  const always = new Set(alwaysOnPackIds())
  for (const t of tools) {
    const p = packIdForTool(t)
    if (p && !always.has(p)) packs.add(p)
  }
  return [...packs]
}

function matchIntent(message: string): IntentRule | null {
  const text = message.trim()
  if (!text) return null
  let best: IntentRule | null = null
  for (const rule of INTENT_RULES) {
    if (!rule.patterns.some(re => re.test(text))) continue
    if (!best || rule.priority > best.priority) best = rule
  }
  return best
}

/**
 * 解析本轮工具路由计划（确定性）。
 */
export function resolveToolRoutePlan(input: ToolRouteResolveInput): ToolRoutePlan {
  const message = input.message.trim()
  const matched = matchIntent(message)
  const seeded = resolveSeedPacks({ message, contextRef: input.contextRef })

  const finish = (
    partial: Omit<ToolRoutePlan, 'researchTier'>,
  ): ToolRoutePlan => ({
    ...partial,
    researchTier: resolveResearchTier(partial.intent, message),
  })

  if (!matched) {
    // 有标的线索但无明确意图 → 轻量深度路径
    if (hasInstrumentCue(message)) {
      const preferredTools = ['get_instrument_snapshot', 'evaluate_instrument', 'search_instruments']
      const requiredPacks = packsForTools(preferredTools)
      const seedPacks = mergePackBudget(requiredPacks, seeded)
      return finish({
        preferredTools,
        avoidTools: ['get_instrument_quotes'],
        requiredPacks,
        seedPacks,
        confidence: 'medium',
        intent: 'instrument_cue',
        routeHint: '已识别标的线索：优先 get_instrument_snapshot，需要评分再 evaluate_instrument；代码不确定时先 search_instruments',
      })
    }
    if (input.contextRef?.kind === 'article') {
      const preferredTools = ['get_news_article', 'list_news_articles']
      const requiredPacks = packsForTools(preferredTools)
      return finish({
        preferredTools,
        avoidTools: ['evaluate_instrument'],
        requiredPacks,
        seedPacks: mergePackBudget(requiredPacks, seeded),
        confidence: 'high',
        intent: 'article_context',
        routeHint: '引用资讯上下文：用资讯工具阅读/扩展，勿改走个股评估',
      })
    }
    return finish({
      preferredTools: ['search_instruments', 'ask_user', 'list_tool_packs'],
      avoidTools: [],
      requiredPacks: [],
      seedPacks: seeded,
      confidence: 'low',
      intent: 'general',
      routeHint: '意图不明确：可 search_instruments 澄清标的，或 list_tool_packs / ask_user；勿盲目 evaluate',
    })
  }

  let preferredTools = [...matched.preferredTools]
  // 深度分析且代码未知 → 确保 search 在前
  if (matched.intent === 'depth_analysis' && !hasInstrumentCue(message)) {
    preferredTools = ['search_instruments', ...preferredTools.filter(t => t !== 'search_instruments')]
  }
  // 深度分析且已有代码 → search 降为可选末位
  if (matched.intent === 'depth_analysis' && hasInstrumentCue(message)) {
    preferredTools = preferredTools.filter(t => t !== 'search_instruments')
    preferredTools = [
      'get_instrument_snapshot',
      'get_instrument_financials',
      'get_instrument_profile',
      'evaluate_instrument',
      ...preferredTools.filter(
        t =>
          t !== 'get_instrument_snapshot'
          && t !== 'get_instrument_financials'
          && t !== 'get_instrument_profile'
          && t !== 'evaluate_instrument',
      ),
    ]
  }

  let requiredPacks = packsForTools(preferredTools)
  // L3 且用户要「全面」时：预算扩到 3，以同时容纳 analytics + fundamentals + market
  const tierPreview = resolveResearchTier(matched.intent, message)
  const packBudget =
    tierPreview === 'L3' && L3_UPGRADE_RE.test(message)
      ? Math.max(MAX_SEEDED_BUSINESS_PACKS, 3)
      : MAX_SEEDED_BUSINESS_PACKS
  if (tierPreview === 'L3' && L3_UPGRADE_RE.test(message) && !requiredPacks.includes('market')) {
    requiredPacks = mergePackBudget([...requiredPacks, 'market'], seeded, packBudget)
  }
  const seedPacks = mergePackBudget(requiredPacks, seeded, packBudget)

  return finish({
    preferredTools,
    avoidTools: matched.avoidTools ?? [],
    requiredPacks,
    seedPacks,
    confidence: matched.confidence,
    intent: matched.intent,
    routeHint: matched.hint,
  })
}

/** required 优先占预算，再用播种补足 */
function mergePackBudget(
  required: ToolPackId[],
  seeded: ToolPackId[],
  max = MAX_SEEDED_BUSINESS_PACKS,
): ToolPackId[] {
  const out: ToolPackId[] = []
  const seen = new Set<ToolPackId>()
  for (const p of [...required, ...seeded]) {
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}

/**
 * 生成本轮选型卡（仅引用已加载工具，避免提示未暴露工具）。
 */
export function buildRoundRoutePlaybook(
  plan: ToolRoutePlan,
  activeToolNames: readonly string[],
): string {
  const loaded = new Set(activeToolNames)
  const preferred = plan.preferredTools.filter(t => loaded.has(t))
  const avoid = plan.avoidTools.filter(t => loaded.has(t))
  const confusions = TOOL_CONFUSION_PAIRS.filter(
    p => loaded.has(p.prefer) && loaded.has(p.avoid),
  )

  const lines = [
    '【本轮工具选型卡 — 必须优先遵守】',
    `- 意图标签：${plan.intent}（置信度 ${plan.confidence}）`,
    `- 研究档位：${plan.researchTier}`,
    `- 选型说明：${plan.routeHint}`,
  ]

  if (preferred.length) {
    lines.push(`- 首选调用顺序：${preferred.join(' → ')}`)
    if (plan.researchTier === 'L1') {
      lines.push('- L1：证据足够即停，禁止为「看起来专业」继续堆工具')
    } else {
      lines.push('- 若首选结果已足够回答用户，停止继续堆工具；不足再沿顺序下调')
    }
  } else {
    lines.push('- 当前 tools 列表中尚无意图对应工具：先 list_tool_packs，再 activate_tool_pack 加载后重试')
  }

  if (avoid.length) {
    lines.push(`- 本轮勿优先：${avoid.join('、')}（除非用户明确要求）`)
  }

  if (confusions.length) {
    lines.push('- 易混消歧：')
    for (const c of confusions.slice(0, 6)) {
      lines.push(`  · ${c.when} → 用 ${c.prefer}，不用 ${c.avoid}`)
    }
  }

  if (plan.researchTier === 'L3') {
    lines.push('- L3 覆盖检查（缺则 activate_tool_pack 或声明「本维未覆盖」）：')
    lines.push('  · 身份：search / capabilities（已消歧可跳过）')
    lines.push(`  · 价量事实：${loaded.has('get_instrument_snapshot') ? 'snapshot' : loaded.has('get_instrument_quotes') ? 'quotes' : '需加载 core 工具'}`)
    lines.push(`  · 模型/技术：${loaded.has('evaluate_instrument') || loaded.has('get_instrument_indicators') ? 'evaluate/indicators 可用' : '需 activate instrument_analytics'}`)
    lines.push(`  · 市场环境：${loaded.has('get_market_regime') ? 'regime 可用' : '未加载则声明未拉宏观，或 activate market'}`)
    lines.push(`  · 事件披露：${loaded.has('list_news_articles') || loaded.has('get_notice_content') ? 'news/notice 可用' : '用户问事件时再 activate news；勿臆造催化'}`)
  }

  lines.push('- 禁止调用未出现在本轮 tools 参数中的工具名；缺能力时 activate_tool_pack')
  return lines.join('\n')
}

/**
 * 将首选工具排到 OpenAI tools 列表前面（部分模型对靠前 schema 更敏感）。
 */
export function orderToolsByPreference<T extends { function?: { name?: string }; name?: string }>(
  tools: T[],
  preferredTools: readonly string[],
): T[] {
  if (!preferredTools.length) return tools
  const rank = new Map(preferredTools.map((n, i) => [n, i]))
  return [...tools].sort((a, b) => {
    const na = a.function?.name ?? a.name ?? ''
    const nb = b.function?.name ?? b.name ?? ''
    const ra = rank.has(na) ? rank.get(na)! : 1000
    const rb = rank.has(nb) ? rank.get(nb)! : 1000
    return ra - rb || na.localeCompare(nb)
  })
}
