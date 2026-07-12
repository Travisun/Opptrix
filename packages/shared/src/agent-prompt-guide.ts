import type { InstrumentRef } from './market-data.js'
import { resolveInstrumentAnalyticsProfile } from './instrument-analytics.js'
import { crossMarketNewsHints } from './news-source-hints.js'
import { TOOL_ROUTING } from './tool-routing.js'

/** Stock-index 统一命名空间 — Agent/搜索/关注列表的全局标的 ID */
export function buildInstrumentNamespacePlaybook(): string {
  return [
    '【标的命名空间 — Stock-index 全局唯一 ID，查询时必须遵循】',
    '- 格式：CN:交易所.代码（如 CN:SZ.000009、CN:SH.600519）、US:AAPL、HK:00700、CRYPTO:BINANCE.BTC/USDT',
    '- 命名空间仅含 market + exchange + symbol，不含 INDEX/ETF 等业务分类；同码异名靠 exchange 区分（例：CN:SZ.000977=浪潮信息，CN:SH.000977=内地低碳）',
    '- 不熟悉代码时：先 search_instruments → 使用返回的 instrument 对象（market/symbol/exchange）或 code/ref_label 命名空间调用 get_instrument_*',
    '- 推荐传参：instrument:{market,symbol,exchange}（symbol 为裸代码）；或平铺 code:"CN:SZ.000009"',
    '- A 股禁止仅用裸 6 位码（如 000977）调用快照/行情，须先搜索拿到带 exchange 的命中',
    '- 勿把命名空间字符串塞进 instrument.symbol 字段；symbol 始终是裸代码，exchange 单独字段',
  ].join('\n')
}

/** 标准 Instrument API 能力清单 — 与 data-layer InstrumentDataCapability 对齐 */
export const STANDARD_INSTRUMENT_API_CAPABILITIES = [
  'realtime', 'kline', 'snapshot', 'profile', 'financials',
  'stock_list', 'instrument_search', 'sector_list',
  'etf_list', 'etf_nav', 'etf_holdings', 'etf_snapshot',
] as const

/** Agent 工具与标准能力的映射提示 */
export function buildStandardInstrumentApiPlaybook(): string {
  return [
    '【标准 Instrument API — 优先使用，对应 get_instrument_* / search_instruments】',
    `- 能力：${STANDARD_INSTRUMENT_API_CAPABILITIES.join('、')}`,
    '- 搜索：search_instruments（跨市场 keyword，可 markets 过滤）；命中 code/ref_label 为命名空间，instrument 含完整 ref',
    '- 能力探测：get_instrument_capabilities → 仅调用返回 capabilities 中的工具',
    '- 行情：get_instrument_quotes；快照：get_instrument_snapshot；K 线：get_instrument_chart',
    '- A 股批量截面：batch_instrument_snapshots；评估/信号：evaluate_instrument、get_instrument_strategy_signal',
    '- ETF：search_etfs / get_etf_list / get_etf_snapshot / get_etf_nav / get_etf_holdings / get_etf_scorecard（或 instrument ETF ref + evaluate_instrument）',
    '- 日股/韩股（JP/KR）暂未接入标准 API，勿调用行情/快照/K 线类工具',
  ].join('\n')
}

/** 数据源自定义方法调用路径 */
export function buildProviderCustomMethodPlaybook(): string {
  return [
    '【数据源扩展 — 仅当标准 API 无覆盖时使用】',
    '0) 板块概念、宏观序列、情绪榜单、龙虎榜等「非标准能力」→ 自定义方法',
    '1) list_enabled_providers：确认 baostock / zzshare / stockindex / akshare 等是否可用',
    '2) list_provider_custom_methods：必须带 provider_id 或 keyword；akshare 方法多，禁止无过滤全量拉取',
    '3) invoke_provider_custom_method：provider_id + method + args（JSON 数组，顺序与 params 一致）',
    '4) args 中的 code/symbol 可传命名空间（CN:SZ.000009）、InstrumentRef、600519.SH、sh600519 等；引擎自动转为 Provider 裸代码格式',
    '5) 禁止用自定义方法替代已有标准能力（如 ETF 净值用 get_etf_nav，勿调 sinaEtfNav）',
    '6) 同一任务对同一 method 最多调用 1 次；失败时换 provider 或说明数据不可用，勿编造',
  ].join('\n')
}

/** 聊天 Agent — 按标的类型的分析工具路径（由浅入深） */
export function buildInstrumentAnalysisPlaybook(): string {
  return [
    '【标的分析路径 — 先识别 market + assetClass，再选工具】',
    '0) 不确定时：search_instruments → 用返回 instrument 或 code（CN:SZ.xxx）→ get_instrument_capabilities',
    '1) CN 股票（EQUITY）：search_instruments / screen_stocks 定位 → batch_instrument_snapshots（批量）→ get_instrument_snapshot → evaluate_instrument（因子评分卡）→ get_instrument_strategy_signal → institution_rating → get_instrument_cyq',
    '2) CN ETF：search_etfs → get_etf_snapshot → evaluate_instrument（决策雷达）→ get_instrument_strategy_signal；勿用 A 股股票因子筛选',
    '3) 美股/港股：get_instrument_snapshot / get_instrument_chart → get_instrument_indicators → evaluate_instrument（技术面）→ get_instrument_strategy_signal；verify_instrument_strategy 仅对核心标的',
    '4) 日股/韩股（JP/KR）：暂未接入行情与快照；可读相关资讯，勿调用 get_instrument_* 行情类工具',
    '5) Crypto：get_instrument_quotes / get_instrument_chart → get_instrument_indicators → evaluate_instrument / get_instrument_strategy_signal；7×24 波动大，结论注明时效',
    '6) 禁止对非 CN 股票调用 institution_rating、get_instrument_cyq；禁止对 Crypto 用 A 股因子筛选工具',
  ].join('\n')
}

/** 单只标的分析路径摘要 — 用于用户已点名代码时 */
export function instrumentAnalysisStepsForRef(ref: InstrumentRef): string {
  if (ref.market === 'JP' || ref.market === 'KR') {
    return '日股/韩股暂未接入标准 API；可读相关资讯，勿调用行情/快照/K 线/评估工具'
  }
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

/** 聊天 Agent — 用户交互确认（ask_user 工具） */
export function buildUserInteractionPlaybook(): string {
  return [
    '【用户确认 — ask_user 内置交互工具】',
    '- 当分析方向、标的范围、时间窗口、偏好（短线/中线、是否含资讯等）存在多种合理路径且无法从上下文推断时，调用 ask_user 而非在正文里罗列选项让用户打字回复',
    '- 参数：prompt 写一句面向投资者的问题；options 提供 2–5 个互斥或常见选项（id 英文/数字，label 中文简短）；allow_multiple 仅在「可多选」时设为 true',
    '- 界面会在输入框上方展示题目；最后一项为「自行输入」，用户可直接打字后按 Enter 提交',
    '- 收到返回的 selected_labels / custom_text 后再继续拉数与分析；同一轮对话最多调用 1 次 ask_user',
    '- 禁止用于索要 API Key、密码等敏感信息；禁止在已有明确用户指令时重复确认',
  ].join('\n')
}

/** 聊天 Agent — 市场宏观与关注池 */
export function buildMarketContextPlaybook(): string {
  return [
    '【市场与关注 — get_market_regime / get_market_dynamics / get_watchlist_radar / get_trend_brief】',
    '1) 宏观背景：get_market_regime（A 股默认 cn，美股 profile_scope=us）→ 解读牛熊/风险偏好后再谈个股',
    '2) 市场全景：get_market_dynamics → 指数、全球市场、涨跌榜、龙虎榜；适合复盘或解释板块轮动',
    '3) 关注池速览：get_watchlist → get_watchlist_radar（可省略 codes 用关注列表）→ 对重点标的 get_instrument_snapshot',
    '4) A 股趋势一句话：get_trend_brief（code 必填，可选 holding_cost）→ 需要深度时 evaluate_instrument / get_instrument_chart',
    '5) 跨市场名录初选：screen_us_universe / screen_hk_universe / screen_crypto_universe 或 search_instruments（markets 过滤）',
  ].join('\n')
}

/** 聊天 Agent — 行业分析路径（列表 → 统计 → 成分股 → 产业链） */
export function buildIndustryAnalysisPlaybook(): string {
  return [
    '【A 股行业分析 — list_local_industries / get_industry_stats / get_local_industry_stocks / industry_mining】',
    '1) 不确定行业名：list_local_industries（keyword 模糊，如「半导体」）→ 用返回的精确 industry 名继续',
    '2) 行业强弱/估值对比：get_industry_stats → 读涨跌家数、均 PE/PB、均评分',
    '3) 行业成分与龙头：get_local_industry_stocks（industry 须与列表一致）→ 对重点标的 get_instrument_snapshot / evaluate_instrument',
    '4) 产业链与代表公司：industry_mining；需 mindmap 展示时用 industry_mermaid',
    '5) 条件选股：screen_stocks（在线因子筛选）；本地因子筛选已停用',
    '6) 本地行业库无数据时：get_local_data_status 确认后改 search_instruments + screen_stocks，并告知用户',
  ].join('\n')
}

/** 聊天 Agent 完整 system 规则正文（不含角色行） */
export function buildAgentSystemRules(): string {
  return [
    '规则：',
    '- 需要数据时必须先调用工具，禁止编造数字或臆测行情',
    '- 跨市场标的统一用 Stock-index 命名空间（CN:SZ.000009）或 search 返回的 instrument 对象',
    TOOL_ROUTING,
    buildInstrumentNamespacePlaybook(),
    buildStandardInstrumentApiPlaybook(),
    buildInstrumentAnalysisPlaybook(),
    buildIndustryAnalysisPlaybook(),
    buildMarketContextPlaybook(),
    buildProviderCustomMethodPlaybook(),
    buildUserInteractionPlaybook(),
    buildNewsRetrievalPlaybook(),
    '- 每个工具描述含【何时使用】【何时不用】双面约束，严格遵守',
    '- 不推荐具体买卖，仅提供研究与数据解读',
    '- 可组合多个工具由浅入深补全数据',
    '- 禁止 Shell 执行、任意文件读写或未提供的工具能力',
  ].join('\n')
}
