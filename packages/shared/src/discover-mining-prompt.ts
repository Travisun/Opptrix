import type { DiscoverStrategyProfile } from './discover-profile-types.js'
import { getDiscoverProfileDefinition } from './discover-profile-registry.js'
import { discoverMiningToolNamesForProfile } from './discover-mining-tools.js'
import { discoverPrescreenMode } from './discover-profiles.js'
import { buildInstrumentAnalysisPlaybook, buildInstrumentNamespacePlaybook, buildNewsRetrievalPlaybook, buildProviderCustomMethodPlaybook } from './agent-prompt-guide.js'

/** 策略解析 / 执行提示中的资产类型描述 */
export function discoverProfileAssetLabel(profile: DiscoverStrategyProfile): string {
  const def = getDiscoverProfileDefinition(profile)
  if (!def) return 'A 股股票'
  if (profile === 'cn_etf') return 'A 股 ETF（折溢价%、规模亿元）'
  if (def.prescreenMode === 'list_filter') {
    const online = def.readinessCountKey == null
    return `${def.label}（${online ? 'StockIndex 在线列表' : '本地列表'} keyword / industry_contains）`
  }
  return 'A 股股票'
}

const CN_ONLY_ANALYTICS = 'institution_rating、get_instrument_cyq'

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
  const toolLine = tools.length ? `可调用：${tools.join('、')}` : '该资产类型暂无可用数据工具（日股/韩股暂未接入）'

  const footer = [
    '禁止编造数字；只能从候选列表中选股。',
    '最终必须输出严格 JSON：',
    outputSchema,
    `最终 items 不超过 ${finalTopN}，按 match_score 降序。不要推荐买卖，仅研究与数据解读。`,
  ].join('\n')

  if (def?.prescreenMode === 'blocked') {
    return [
      `你是 Opptrix ${def.label}挖掘 Agent。${def.label}标准行情与挖掘能力暂未接入。`,
      '请勿调用行情/快照/K 线类工具；可向用户说明暂不支持，或仅结合资讯做背景解读。',
      buildNewsRetrievalPlaybook(),
      footer,
    ].join('\n')
  }

  if (mode === 'etf_screen') {
    return [
      '你是 Opptrix ETF 挖掘 Agent。策略条件已完成 ETF 初选。',
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
        : group === 'hk_equity'
          ? `仅使用上方可调用列表；勿对港股调用 ${CN_ONLY_ANALYTICS}。shortlisted 候选可用 get_instrument_snapshot / get_instrument_quotes / get_instrument_chart 补全行情；${analyticsHint}。`
          : `仅使用上方可调用列表；勿对非 A 股调用 ${CN_ONLY_ANALYTICS}。`
    return [
      `你是 Opptrix ${packHint}挖掘 Agent。候选来自名录初选。`,
      buildInstrumentNamespacePlaybook(),
      toolLine,
      extra,
      footer,
    ].join('\n')
  }

  if (mode === 'factor_screen') {
    return [
      '你是 Opptrix 研究 Agent。仅分析候选列表内标的。',
      toolLine,
      buildInstrumentNamespacePlaybook(),
      buildInstrumentAnalysisPlaybook(),
      buildProviderCustomMethodPlaybook(),
      buildNewsRetrievalPlaybook(),
      '禁止编造数字；禁止对全部候选逐只 get_instrument_snapshot。',
      footer.replace('必须输出严格 JSON', '必须输出严格 JSON（可用 ```json 包裹）'),
    ].join('\n')
  }

  throw new Error('该资产类型暂不支持挖掘')
}
