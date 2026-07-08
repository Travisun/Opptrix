import type { DiscoverStrategyProfile } from './discover-profile-types.js'
import { getDiscoverProfileDefinition } from './discover-profile-registry.js'
import { discoverMiningToolNamesForProfile } from './discover-mining-tools.js'
import { discoverPrescreenMode } from './discover-profiles.js'
import { buildInstrumentAnalysisPlaybook, buildNewsRetrievalPlaybook } from './agent-prompt-guide.js'

/** 策略解析 / 执行提示中的资产类型描述 */
export function discoverProfileAssetLabel(profile: DiscoverStrategyProfile): string {
  const def = getDiscoverProfileDefinition(profile)
  if (!def) return 'A 股股票（本地因子库）'
  if (profile === 'cn_etf') return 'A 股 ETF（折溢价%、规模亿元）'
  if (def.prescreenMode === 'list_filter') {
    const online = def.readinessCountKey == null
    return `${def.label}（${online ? 'StockIndex 在线列表' : '本地列表'} keyword / industry_contains）`
  }
  return 'A 股股票（本地因子库）'
}

const CN_EQUITY_FORBIDDEN = [
  'evaluate_stock', 'get_strategy_signal', 'batch_stock_snapshots', 'batch_instrument_snapshots',
  'get_stock_cyq', 'search_stocks',
  'get_stock_detail', 'get_stock_chart', 'screen_local_universe',
  'get_us_stock_snapshot', 'get_us_stock_quote', 'get_us_stock_kline',
  'get_crypto_snapshot', 'get_crypto_quote', 'get_crypto_kline',
].join('、')

/** Agent 挖掘阶段 system prompt — 由 registry + miningToolGroup 驱动 */
export function buildDiscoverMiningSystemPrompt(input: {
  profile: DiscoverStrategyProfile
  finalTopN: number
  outputSchema: string
}): string {
  const { profile, finalTopN, outputSchema } = input
  const def = getDiscoverProfileDefinition(profile)
  const mode = discoverPrescreenMode(profile)
  const tools = discoverMiningToolNamesForProfile(profile)
  const toolLine = tools.length ? `可调用：${tools.join('、')}` : '暂无可用数据工具'

  const footer = [
    '禁止编造数字；只能从候选列表中选股。',
    '最终必须输出严格 JSON：',
    outputSchema,
    `最终 items 不超过 ${finalTopN}，按 match_score 降序。不要推荐买卖，仅研究与数据解读。`,
  ].join('\n')

  if (mode === 'etf_screen') {
    return [
      '你是 Opptrix ETF 挖掘 Agent。策略条件已完成本地 ETF 初选。',
      toolLine,
      footer.replace('选股', '选 ETF'),
    ].join('\n')
  }

  if (mode === 'list_filter') {
    const group = def?.miningToolGroup
    const label = def?.label ?? profile
    const packHint = group === 'crypto_spot'
      ? 'Crypto 交易对'
      : group === 'us_equity'
        ? '美股'
        : label
    const analyticsHint = 'shortlisted 候选按标的 market 选用 evaluate_instrument / get_instrument_strategy_signal / get_instrument_indicators；资讯需求按【资讯调阅】优先匹配分组 market_hints'
    const extra = group === 'crypto_spot'
      ? `7×24 市场波动大，仅做研究解读。 shortlisted 候选可用 get_instrument_snapshot / get_instrument_quotes / get_instrument_chart 补全行情；${analyticsHint}。`
      : group === 'us_equity'
        ? `禁止对全部候选逐只拉取 snapshot。优先对 shortlisted 少量标的用 get_instrument_snapshot / get_instrument_quotes / get_instrument_chart 深入；${analyticsHint}。`
        : group === 'jp_equity' || group === 'kr_equity' || group === 'hk_equity'
          ? `禁止调用 A 股专用工具（${CN_EQUITY_FORBIDDEN} 等）。shortlisted 候选可用 get_instrument_snapshot / get_instrument_quotes / get_instrument_chart 补全行情；${analyticsHint}。`
          : `禁止调用 A 股专用工具（${CN_EQUITY_FORBIDDEN} 等）。`
    return [
      `你是 Opptrix ${packHint}挖掘 Agent。候选来自本地列表初选。`,
      toolLine,
      extra,
      footer,
    ].join('\n')
  }

  if (mode === 'factor_screen') {
    return [
      '你是 Opptrix 选股页 Agent。策略条件已由 AI 解析并完成因子初选。',
      '你可调用数据层 MCP 工具（见各工具【何时使用】【调用规范】）由浅入深补全数据：',
      '1) get_market_db_status → list_local_industries（行业名）→ screen_local_industry_stocks / screen_local_universe → batch_instrument_snapshots',
      '2) 不足时对 shortlisted 单股：get_instrument_snapshot / evaluate_instrument / get_instrument_strategy_signal / institution_rating',
      '3) 本地库未就绪：get_market_db_sync_state，必要时 trigger_market_db_sync（每任务最多一次）',
      '4) 策略涉及用户持仓/关注：get_watchlist、get_portfolio_holdings、portfolio_trades',
      '5) 需要资讯背景：先确定候选为 A 股，再按【资讯调阅】规则 list_news_groups 选 CN/MACRO 相关分组',
      buildInstrumentAnalysisPlaybook(),
      buildNewsRetrievalPlaybook(),
      toolLine,
      '禁止编造数字；禁止对全部候选逐只 get_instrument_snapshot。',
      footer.replace('必须输出严格 JSON', '必须输出严格 JSON（可用 ```json 包裹）'),
    ].join('\n')
  }

  throw new Error('该资产类型暂不支持挖掘')
}
