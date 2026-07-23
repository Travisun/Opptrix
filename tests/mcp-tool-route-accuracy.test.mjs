/**
 * MCP 工具路由准确率 — 多维度测试
 *
 * 维度：
 *  D1 首推精确率 — intent → preferredTools[0]
 *  D2 可见性召回 — 首选工具必须在本轮 activeNames
 *  D3 易混消歧 — prefer/avoid 对
 *  D4 选型卡一致性 — playbook 只提已加载工具
 *  D5 提示词精简 — 未加载 pack 不注入其 playbook
 *  D6 过播种抑制 — 寒暄不加载业务重工具
 *  D7 工具排序 — preferred 排在 openAiTools 前列
 *  D8 激活回补 — activate 后首选进入可见集
 *  D9 标的线索 — 有代码/公司名时保证 analytics 可见
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentSystemRules } from '../packages/shared/dist/agent-prompt-guide.js'
import {
  resolveToolRoutePlan,
  buildRoundRoutePlaybook,
  orderToolsByPreference,
  TOOL_CONFUSION_PAIRS,
} from '../packages/agent/dist/mcp/tool-route-plan.js'
import {
  ToolPackSessionStore,
  resolveActivePackIds,
  toolNamesForPacks,
} from '../packages/agent/dist/mcp/tool-pack-session.js'

/** D1 黄金用例：用户问句 → 必须命中的首推工具 */
const PRIMARY_CASES = [
  { message: '茅台现价多少', expectPrimary: 'get_instrument_quotes', intent: 'price_only' },
  { message: '600519 最新价和涨跌幅', expectPrimary: 'get_instrument_quotes', intent: 'price_only' },
  { message: '帮我深度分析一下 600519', expectPrimary: 'get_instrument_snapshot', intent: 'depth_analysis' },
  { message: '分析一下贵州茅台好不好', expectPrimary: 'get_instrument_snapshot', intent: 'depth_analysis' },
  { message: '茅台最近几年营收和净利润同比', expectPrimary: 'get_instrument_financials', intent: 'financials' },
  { message: '600519 最新资产负债表', expectPrimary: 'get_instrument_balance_sheet', intent: 'balance_sheet' },
  { message: '看下经营现金流和现金流量表', expectPrimary: 'get_instrument_cash_flow', intent: 'cash_flow_statement' },
  { message: '茅台利润表明细', expectPrimary: 'get_instrument_income_statement', intent: 'income_statement' },
  { message: '2026 年 A 股交易日历休市日', expectPrimary: 'get_trade_calendar', intent: 'trade_calendar' },
  { message: '沪深300成分股有哪些', expectPrimary: 'get_index_constituents', intent: 'index_constituents' },
  { message: '今天龙虎榜', expectPrimary: 'get_dragon_tiger', intent: 'dragon_tiger' },
  { message: '今天龙虎榜营业部席位', expectPrimary: 'get_dragon_tiger', intent: 'dragon_tiger' },
  { message: '今日涨停池列表', expectPrimary: 'get_limit_updown', intent: 'limit_updown' },
  { message: '今天连板天梯晋级之路', expectPrimary: 'get_cn_market_special', intent: 'cn_market_special' },
  { message: '同花顺概念板块目录', expectPrimary: 'get_cn_market_special', intent: 'cn_market_special' },
  { message: '茅台 2024Q3 财务指标树', expectPrimary: 'get_instrument_financial_indicators', intent: 'financial_indicators' },
  { message: '600519 的主营业务和所属概念', expectPrimary: 'get_instrument_profile', intent: 'profile' },
  { message: '看下十大股东持股', expectPrimary: 'get_instrument_shareholders', intent: 'shareholders' },
  { message: '历史分红派息记录', expectPrimary: 'get_instrument_dividend', intent: 'dividend' },
  { message: '茅台主力资金净流入怎么样', expectPrimary: 'get_instrument_money_flow', intent: 'money_flow' },
  { message: '查看 600519 最新公告列表', expectPrimary: 'get_instrument_notices', intent: 'instrument_notices' },
  { message: 'A 股有哪些申万行业目录', expectPrimary: 'get_sector_list', intent: 'sector_list' },
  { message: '这个板块成分股列表有哪些', expectPrimary: 'get_sector_constituents', intent: 'sector_constituents' },
  { message: '这只 ETF 跟踪指数和费率档案', expectPrimary: 'get_etf_profile', intent: 'etf_profile' },
  { message: '现在开盘了吗交易时段', expectPrimary: 'get_market_session', intent: 'market_session' },
  { message: '这只 ETF 净值和溢价率', expectPrimary: 'get_etf_nav', intent: 'etf_nav' },
  { message: '看下 ETF 持仓权重成分', expectPrimary: 'get_etf_holdings', intent: 'etf_holdings' },
  { message: '我的持仓盈亏怎么样', expectPrimary: 'get_portfolio_holdings', intent: 'portfolio_holdings' },
  { message: '读一下我的关注列表', expectPrimary: 'get_watchlist', intent: 'watchlist' },
  { message: '最近有什么重要资讯', expectPrimary: 'list_news_articles', intent: 'news_browse' },
  { message: '打开 https://example.com 看看内容', expectPrimary: 'browser_navigate', intent: 'web_browse' },
  { message: '今天涨跌榜和龙虎榜', expectPrimary: 'get_market_dynamics', intent: 'market_dynamics' },
  { message: '最近几个月 CPI 同比多少', expectPrimary: 'get_macro_series', intent: 'macro_series' },
  { message: '现在是牛市还是熊市', expectPrimary: 'get_market_regime', intent: 'market_regime' },
  { message: '梳理半导体产业链', expectPrimary: 'industry_mining', intent: 'industry' },
  { message: '看下筹码分布', expectPrimary: 'get_instrument_cyq', intent: 'cyq' },
  { message: '机构评级和目标价', expectPrimary: 'get_instrument_institution_rating', intent: 'institution' },
  { message: '给个交易信号', expectPrimary: 'get_instrument_strategy_signal', intent: 'strategy_signal' },
  { message: 'MACD 和 RSI 怎么样', expectPrimary: 'get_instrument_indicators', intent: 'indicators' },
  { message: '做一下评分卡回测', expectPrimary: 'run_backtest', intent: 'backtest' },
  { message: '搜一下浪潮信息代码', expectPrimary: 'search_instruments', intent: 'search' },
  { message: '开盘早报', expectPrimary: 'get_morning_brief', intent: 'morning_brief' },
  { message: '收盘报告', expectPrimary: 'get_closing_report', intent: 'closing_report' },
]

test('D1 primary tool precision across intent goldens', () => {
  let hit = 0
  for (const c of PRIMARY_CASES) {
    const plan = resolveToolRoutePlan({ message: c.message })
    const primary = plan.preferredTools[0]
    assert.equal(primary, c.expectPrimary, `${c.message} → got ${primary}, want ${c.expectPrimary}`)
    assert.equal(plan.intent, c.intent, `${c.message} intent`)
    hit++
  }
  assert.equal(hit, PRIMARY_CASES.length)
})

test('D2 preferred tool visibility recall — activeNames contains primary', () => {
  const store = new ToolPackSessionStore()
  for (const c of PRIMARY_CASES) {
    const packs = resolveActivePackIds(store, `d2-${c.intent}`, { message: c.message })
    const names = toolNamesForPacks(packs)
    assert.ok(
      names.includes(c.expectPrimary),
      `recall fail: "${c.message}" primary ${c.expectPrimary} not in active tools`,
    )
  }
})

test('D3 confusion pairs — prefer wins over avoid in route plan', () => {
  const cases = [
    {
      message: '只要现价不要评分',
      prefer: 'get_instrument_quotes',
      avoid: 'evaluate_instrument',
    },
    {
      message: 'ETF 净值溢价率走势',
      prefer: 'get_etf_nav',
      avoid: 'get_instrument_quotes',
    },
    {
      message: '我的实盘持仓明细',
      prefer: 'get_portfolio_holdings',
      avoid: 'get_watchlist',
    },
    {
      message: 'ETF 成分股权重',
      prefer: 'get_etf_holdings',
      avoid: 'get_portfolio_holdings',
    },
    {
      message: '大盘牛熊怎么判断',
      prefer: 'get_market_regime',
      avoid: 'get_trend_brief',
    },
  ]

  for (const c of cases) {
    const plan = resolveToolRoutePlan({ message: c.message })
    assert.ok(plan.preferredTools.includes(c.prefer), `${c.message} should prefer ${c.prefer}`)
    assert.equal(plan.preferredTools[0], c.prefer)
    // avoid 不应排在 prefer 之前
    const pi = plan.preferredTools.indexOf(c.prefer)
    const ai = plan.preferredTools.indexOf(c.avoid)
    if (ai >= 0) assert.ok(pi < ai, `${c.message}: prefer before avoid`)
    assert.ok(
      plan.avoidTools.includes(c.avoid) || !plan.preferredTools.includes(c.avoid),
      `${c.message}: ${c.avoid} should be avoided or not preferred`,
    )
  }

  assert.ok(TOOL_CONFUSION_PAIRS.length >= 8)
})

test('D4 route playbook only names loaded tools', () => {
  const plan = resolveToolRoutePlan({ message: '分析 600519' })
  const store = new ToolPackSessionStore()
  const packs = resolveActivePackIds(store, 'd4', { message: '分析 600519' })
  const names = toolNamesForPacks(packs)
  const card = buildRoundRoutePlaybook(plan, names)

  assert.match(card, /本轮工具选型卡/)
  assert.match(card, /get_instrument_snapshot/)
  assert.ok(!card.includes('run_backtest') || names.includes('run_backtest'))

  // 未加载 news 时，选型卡不应把 news 工具写成首选（若 plan 不含）
  const cold = resolveToolRoutePlan({ message: '你好' })
  const coldNames = toolNamesForPacks(resolveActivePackIds(store, 'd4b', { message: '你好' }))
  const coldCard = buildRoundRoutePlaybook(cold, coldNames)
  assert.ok(!coldCard.includes('list_news_articles') || coldNames.includes('list_news_articles'))
})

test('D5 conditional playbooks — unloaded packs omitted from system rules', () => {
  const slim = buildAgentSystemRules({
    activePacks: ['core', 'meta'],
    activeToolNames: ['search_instruments', 'list_tool_packs'],
    routePlaybook: '【本轮工具选型卡】\n- 测试卡',
  })
  assert.match(slim, /本轮工具选型卡/)
  assert.ok(!slim.includes('industry_mining') || slim.includes('工具包目录'), 'industry playbook body should be absent')
  assert.ok(!slim.includes('【资讯调阅'))
  assert.ok(!slim.includes('【数据源扩展'))
  assert.ok(!slim.includes('【基本面事实表'))

  const withNews = buildAgentSystemRules({
    activePacks: ['core', 'meta', 'news'],
    routePlaybook: '【本轮工具选型卡】\n- news',
  })
  assert.match(withNews, /【资讯调阅/)

  const withFund = buildAgentSystemRules({
    activePacks: ['core', 'meta', 'fundamentals'],
    routePlaybook: '【本轮工具选型卡】\n- fund',
  })
  assert.match(withFund, /【基本面事实表/)
})

test('D6 over-seed suppression on greeting', () => {
  const store = new ToolPackSessionStore()
  const packs = resolveActivePackIds(store, 'd6', { message: '你好' })
  const names = toolNamesForPacks(packs)
  assert.ok(!names.includes('evaluate_instrument'))
  assert.ok(!names.includes('run_backtest'))
  assert.ok(!names.includes('list_news_articles'))
  assert.ok(names.includes('search_instruments'))
  assert.ok(names.includes('activate_tool_pack'))
})

test('D7 orderToolsByPreference puts primary first', () => {
  const tools = [
    { function: { name: 'evaluate_instrument' } },
    { function: { name: 'get_instrument_quotes' } },
    { function: { name: 'search_instruments' } },
    { function: { name: 'ask_user' } },
  ]
  const ordered = orderToolsByPreference(tools, ['get_instrument_quotes', 'search_instruments'])
  assert.equal(ordered[0].function.name, 'get_instrument_quotes')
  assert.equal(ordered[1].function.name, 'search_instruments')
})

test('D7b orderToolsByPreference remoteFirst puts namespaced remote tools ahead of local', () => {
  const tools = [
    { function: { name: 'get_instrument_quotes' } }, // local
    { function: { name: 'srv__search_instruments' } }, // remote, not preferred
    { function: { name: 'srv__get_instrument_quotes' } }, // remote, preferred base name
    { function: { name: 'evaluate_instrument' } }, // local
  ]
  const ordered = orderToolsByPreference(
    tools,
    ['get_instrument_quotes', 'search_instruments'],
    { remoteFirst: true },
  )
  const names = ordered.map(t => t.function.name)
  // 远程工具整体在前，且组内 preferred 基础名优先
  assert.equal(names[0], 'srv__get_instrument_quotes')
  assert.equal(names[1], 'srv__search_instruments')
  // 本地工具在后
  assert.ok(names.indexOf('get_instrument_quotes') > 1)
  assert.ok(names.indexOf('evaluate_instrument') > 1)
})

test('D8 activate backfill makes preferred tool visible', () => {
  const store = new ToolPackSessionStore()
  const before = toolNamesForPacks(resolveActivePackIds(store, 'd8', { message: '你好' }))
  assert.ok(!before.includes('list_news_articles'))

  store.activate('d8', ['news'])
  const after = toolNamesForPacks(resolveActivePackIds(store, 'd8', { message: '你好' }))
  assert.ok(after.includes('list_news_articles'))

  const plan = resolveToolRoutePlan({ message: '最近有什么重要资讯' })
  assert.equal(plan.preferredTools[0], 'list_news_articles')
  const names = toolNamesForPacks(resolveActivePackIds(store, 'd8b', { message: '最近有什么重要资讯' }))
  assert.ok(names.includes('list_news_articles'))
})

test('D9 instrument cue ensures analytics pack for company/code', () => {
  const store = new ToolPackSessionStore()
  for (const msg of ['CN:SH.600519 怎么看', '看看宁德时代', 'US:AAPL 分析']) {
    const packs = resolveActivePackIds(store, `d9-${msg}`, { message: msg })
    const names = toolNamesForPacks(packs)
    assert.ok(
      names.includes('evaluate_instrument') || names.includes('get_instrument_snapshot'),
      `should expose analytics for: ${msg}`,
    )
  }
})

test('D1+D2 aggregate accuracy score ≥ 95% on goldens', () => {
  const store = new ToolPackSessionStore()
  let primaryOk = 0
  let recallOk = 0
  for (const c of PRIMARY_CASES) {
    const plan = resolveToolRoutePlan({ message: c.message })
    if (plan.preferredTools[0] === c.expectPrimary) primaryOk++
    const names = toolNamesForPacks(resolveActivePackIds(store, `agg-${c.intent}`, { message: c.message }))
    if (names.includes(c.expectPrimary)) recallOk++
  }
  const primaryRate = primaryOk / PRIMARY_CASES.length
  const recallRate = recallOk / PRIMARY_CASES.length
  assert.ok(primaryRate >= 0.95, `primary precision ${primaryRate}`)
  assert.ok(recallRate >= 0.95, `visibility recall ${recallRate}`)
})
