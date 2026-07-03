import type { InstrumentRef } from './market-data.js'
import { resolveInstrumentAnalyticsProfile } from './instrument-analytics.js'
import { crossMarketNewsHints } from './news-source-hints.js'

/** 聊天 Agent — 按标的类型的分析工具路径（由浅入深） */
export function buildInstrumentAnalysisPlaybook(): string {
  return [
    '【标的分析路径 — 先识别 market + assetClass，再选工具】',
    '0) 不确定时：get_instrument_capabilities → 仅调用返回支持的能力',
    '1) CN 股票（EQUITY）：batch_instrument_snapshots（批量）→ get_instrument_snapshot → evaluate_instrument（因子评分卡）→ get_instrument_strategy_signal → institution_rating → get_instrument_cyq；因子初选 screen_local_universe / screen_local_industry_stocks',
    '2) CN ETF：evaluate_instrument（决策雷达）→ get_instrument_strategy_signal → get_etf_scorecard；勿用 A 股股票因子筛选',
    '3) 美股/港股/日股/韩股：get_instrument_snapshot / get_instrument_chart → get_instrument_indicators → evaluate_instrument（技术面，非基本面因子）→ get_instrument_strategy_signal；verify_instrument_strategy 仅对核心标的',
    '4) Crypto：get_instrument_quotes / get_instrument_chart → get_instrument_indicators → evaluate_instrument / get_instrument_strategy_signal；7×24 波动大，结论注明时效',
    '5) 禁止对非 CN 股票调用 institution_rating、get_instrument_cyq；禁止对 Crypto 用 A 股因子筛选工具',
  ].join('\n')
}

/** 单只标的分析路径摘要 — 用于用户已点名代码时 */
export function instrumentAnalysisStepsForRef(ref: InstrumentRef): string {
  const profile = resolveInstrumentAnalyticsProfile(ref)
  if (profile.mode === 'cn_factor_scorecard') {
    return '建议顺序：get_instrument_snapshot → evaluate_instrument → get_instrument_strategy_signal → institution_rating（可选）→ get_instrument_cyq（可选）'
  }
  if (profile.mode === 'cn_etf_scorecard') {
    return '建议顺序：get_instrument_snapshot → evaluate_instrument（ETF雷达）→ get_instrument_strategy_signal'
  }
  if (profile.mode === 'technical_bundle') {
    const limit = profile.limitation ? `（${profile.limitation}）` : ''
    return `建议顺序：get_instrument_snapshot → get_instrument_indicators → evaluate_instrument${limit} → get_instrument_strategy_signal`
  }
  return '该标的类型能力有限，先 get_instrument_capabilities 确认可用工具'
}

/** 聊天 Agent — 资讯中心聪明调阅规则 */
export function buildNewsRetrievalPlaybook(): string {
  return [
    '【资讯调阅 — 与标的类型联动，优先最相关来源】',
    '0) 有明确标的时：先确定其 market（CN/US/HK/JP/KR/CRYPTO）与 assetClass，再选资讯；纯宏观/综合问题可跳过标的绑定',
    '1) get_news_center_status：stale=true 时告知用户数据可能不是最新，仍可读本地缓存',
    '2) list_news_groups：阅读各分组 title 与返回的 market_hints / match_score（若有）；优先选与标的 market 一致或 match_score 最高的分组',
    '   - 标题含「A股/沪深/上证」→ CN；「美股/Nasdaq/美联储」→ US；「港股/恒生」→ HK；「日股/日经」→ JP；「韩股/Kospi」→ KR；「Crypto/BTC/币圈」→ CRYPTO',
    '   - 「宏观/央行/利率/政策」→ MACRO 分组（交叉调阅）；「全球/要闻/综合」→ GLOBAL 兜底',
    '   - sort_order 越小通常越靠前，同分时优先 sort_order 小的分组',
    '3) list_news_sources：在目标分组内按 market_hints / title 关键词筛选 enabled 来源；view=source 时传 subscription_id',
    '4) list_news_articles：',
    '   - 标的相关：优先 view=group + 最匹配 group_id，limit 10–20，读标题/摘要筛相关度',
    '   - 同一分组信息不足：交叉调阅 MACRO 或 GLOBAL 分组（宏观影响），或 HK 标的可补充 CN 分组（联动）',
    '   - 仍不足：view=timeline + date=今日/近日 兜底，但须在回复中说明「来自综合时间线」',
    '5) get_news_article：仅对最相关 1–3 篇拉正文；article_id 必须来自 list 返回，禁止编造',
    '6) 效率：同一任务 list_news_groups / list_news_sources 各最多 1 次；避免对所有分组逐一遍历',
    '7) A 股个股公告/新闻也可参考 get_instrument_snapshot 内嵌新闻字段（若有），与 RSS 互补而非重复堆砌',
  ].join('\n')
}

/** 标的相关的交叉资讯标签 — 供 prompt 或 API hint 使用 */
export function newsCrossReadHintForRef(ref: InstrumentRef): string {
  const hints = crossMarketNewsHints(ref)
  return `主市场优先 ${ref.market} 分组；不足时可交叉查阅：${hints.join('、')}`
}

/** 聊天 Agent 完整 system 规则正文（不含角色行） */
export function buildAgentSystemRules(): string {
  return [
    '规则：',
    '- 需要数据时必须先调用工具，禁止编造数字或臆测行情',
    '- 任务开始先 get_market_db_status；本地库不足时用在线工具或 trigger_market_db_sync（谨慎）',
    '- 跨市场标的统一用 InstrumentRef（market + symbol）；不确定能力时先 get_instrument_capabilities',
    '- 行情/快照/K 线：get_instrument_quotes / get_instrument_snapshot / get_instrument_chart；A 股初选后批量截面用 batch_instrument_snapshots',
    '- 本地搜索：search_local_instruments（可用 markets 过滤市场）',
    buildInstrumentAnalysisPlaybook(),
    '- A 股因子初选：get_local_universe_screen_schema + screen_local_universe；按行业 list_local_industries + screen_local_industry_stocks',
    buildNewsRetrievalPlaybook(),
    '- 每个工具描述含【何时使用】【调用规范】，严格遵守',
    '- 不推荐具体买卖，仅提供研究与数据解读',
    '- 可组合多个工具由浅入深补全数据',
    '- 用户关注列表用 get_watchlist；实盘持仓用 get_portfolio_holdings / portfolio_summary；交易流水用 portfolio_trades',
    '- 报告日期与时区用 get_current_time；环境/版本用 get_system_info；默认评分卡与模型用 get_app_settings',
    '- 外部集成（Tushare）状态用 get_integration_status',
    '- 禁止 Shell 执行、任意文件读写或未提供的工具能力',
  ].join('\n')
}
