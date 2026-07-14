import type { InstrumentRef } from './market-data.js'
import { resolveInstrumentAnalyticsProfile } from './instrument-analytics.js'
import { crossMarketNewsHints } from './news-source-hints.js'
import { buildToolPackCatalogPrompt } from './tool-packs.js'

/** 投研答复档位：L1 事实快答 / L2 结构化解读 / L3 深度备忘录 */
export type ResearchTier = 'L1' | 'L2' | 'L3'

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
  'balance_sheet', 'cash_flow', 'income_statement',
  'stock_list', 'instrument_search', 'sector_list', 'index_constituents', 'trade_calendar',
  'etf_list', 'etf_nav', 'etf_holdings', 'etf_snapshot',
] as const

/** Agent 工具与标准能力的映射提示 */
export function buildStandardInstrumentApiPlaybook(): string {
  return [
    '【标准 Instrument API — 优先使用，对应 get_instrument_* / search_instruments】',
    `- 能力：${STANDARD_INSTRUMENT_API_CAPABILITIES.join('、')}`,
    '- 搜索：search_instruments（在线名录，唯一搜索入口）；命中 code/ref_label 为命名空间，instrument 含完整 ref',
    '- 能力探测：get_instrument_capabilities → 仅调用返回 capabilities 中的工具',
    '- 行情：get_instrument_quotes；快照：get_instrument_snapshot；K 线：get_instrument_chart（优先在线 Provider）',
    '- 基本面事实表（属 fundamentals pack）：get_instrument_profile / get_instrument_financials / get_instrument_income_statement / get_instrument_balance_sheet / get_instrument_cash_flow / get_instrument_financial_indicators / get_instrument_shareholders / get_instrument_dividend',
    '- A 股批量截面：batch_instrument_snapshots（须已有代码列表）；评估/信号：evaluate_instrument、get_instrument_strategy_signal',
    '- ETF：search_instruments（markets=["CN"]）→ get_instrument_snapshot / get_etf_list / get_etf_nav / get_etf_holdings；评估用 evaluate_instrument（技术分析）',
    '- 日股/韩股（JP/KR）暂未接入标准 API，勿调用行情/快照/K 线类工具',
  ].join('\n')
}

/** 基本面事实表路径 — fundamentals pack 已加载时注入 */
export function buildFundamentalsPlaybook(): string {
  return [
    '【基本面事实表 — profile / financials / 三表 / financial_indicators / shareholders / dividend】',
    '1) 公司概况/概念/主业：get_instrument_profile（单只 InstrumentRef）',
    '2) 营收利润/ROE/同比：get_instrument_financials（report_type 默认 all）；引用具体 reportDate',
    '2b) 利润表：get_instrument_income_statement；资产负债表：get_instrument_balance_sheet；现金流量表：get_instrument_cash_flow',
    '2c) 财务指标树：get_instrument_financial_indicators（须 report，如 2024Q3；依赖同花顺）',
    '3) 十大股东/股本：get_instrument_shareholders',
    '4) 分红派息史：get_instrument_dividend',
    '5) 禁止：用 evaluate_instrument 黑盒代替财务核实；禁止 invoke_provider_custom_method 调 sinaFinancialPivot 等重复标准能力',
    '6) 深度备忘录（L3）：至少覆盖「概况或财务」一维；不可用时声明缺口而非跳过',
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
    '5) 禁止用自定义方法替代已有标准能力（如 ETF 净值用 get_etf_nav；财务用 get_instrument_financials；概况用 get_instrument_profile）',
    '6) 同一任务对同一 method 最多调用 1 次；失败时换 provider 或说明数据不可用，勿编造',
  ].join('\n')
}

/** 聊天 Agent — 按标的类型的分析工具路径（由浅入深） */
export function buildInstrumentAnalysisPlaybook(): string {
  return [
    '【标的分析路径 — 先识别 market + assetClass，再选工具】',
    '0) 不确定时：search_instruments → 用返回 instrument 或 code（CN:SZ.xxx）→ get_instrument_capabilities',
    '1) CN 股票（EQUITY）：search_instruments 定位 → get_instrument_snapshot → get_instrument_financials / get_instrument_profile（事实表）→ get_instrument_chart → evaluate_instrument（评分卡）→ get_instrument_strategy_signal → get_instrument_institution_rating → get_instrument_cyq',
    '2) CN ETF：search_instruments（markets=["CN"]）→ get_instrument_snapshot → evaluate_instrument（技术分析）→ get_instrument_strategy_signal；净值/持仓用 get_etf_nav / get_etf_holdings',
    '3) 美股/港股：search_instruments → get_instrument_snapshot / get_instrument_financials（若可用）/ get_instrument_chart → get_instrument_indicators → evaluate_instrument（技术面）→ get_instrument_strategy_signal；verify_instrument_strategy 仅对核心标的',
    '4) 日股/韩股（JP/KR）：暂未接入行情与快照；可读相关资讯，勿调用 get_instrument_* 行情类工具',
    '5) Crypto：search_instruments → get_instrument_quotes / get_instrument_chart → get_instrument_indicators → evaluate_instrument / get_instrument_strategy_signal；7×24 波动大，结论注明时效',
    '6) 禁止对非 CN 股票调用 get_instrument_institution_rating、get_instrument_cyq；禁止对 Crypto 用 A 股专用工具',
  ].join('\n')
}

/** 单只标的分析路径摘要 — 用于用户已点名代码时 */
export function instrumentAnalysisStepsForRef(ref: InstrumentRef): string {
  if (ref.market === 'JP' || ref.market === 'KR') {
    return '日股/韩股暂未接入标准 API；可读相关资讯，勿调用行情/快照/K 线/评估工具'
  }
  const profile = resolveInstrumentAnalyticsProfile(ref)
  if (profile.mode === 'cn_factor_scorecard') {
    return '建议顺序：get_instrument_snapshot → get_instrument_financials / get_instrument_profile → evaluate_instrument → get_instrument_strategy_signal → get_instrument_institution_rating（可选）→ get_instrument_cyq（可选）'
  }
  if (profile.mode === 'cn_etf_scorecard') {
    return '建议顺序：get_instrument_snapshot → evaluate_instrument（技术分析）→ get_instrument_strategy_signal；净值/持仓用 get_etf_nav / get_etf_holdings'
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
    '1b) 个股官方公告列表：get_instrument_notices（InstrumentRef）→ 对条目 url 调 get_notice_content；勿与 RSS list_news_articles 混淆',
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
    '【市场与关注 — get_market_regime / get_market_dynamics / get_trade_calendar / get_dragon_tiger / get_limit_updown / get_market_sentiment / get_cn_market_special / get_watchlist / get_trend_brief / get_instrument_money_flow / get_market_session】',
    '1) 宏观背景：get_market_regime（A 股默认 cn，美股 profile_scope=us）→ 解读牛熊/风险偏好后再谈个股',
    '2) 市场全景：get_market_dynamics → 指数、全球市场、涨跌榜、龙虎榜摘要；适合复盘或解释板块轮动；勿再同轮重复拉 get_dragon_tiger',
    '2a) 专项：交易日历 get_trade_calendar；仅龙虎榜明细/指定日 get_dragon_tiger；涨跌停池 get_limit_updown；情绪 get_market_sentiment',
    '2b) 同花顺独有专题（连板天梯/飙升/热股/异动/概念目录）：get_cn_market_special(kind=…)；成分股改 get_index_constituents；财务指标改 get_instrument_financial_indicators',
    '2c) 个股资金流向：get_instrument_money_flow（CN）；勿用 dynamics 代替单只净流入',
    '2d) 是否开盘/交易时段：get_market_session；精确休市用 get_trade_calendar',
    '3) 关注池：get_watchlist → 对重点标的 get_instrument_quotes / get_instrument_snapshot / evaluate_instrument',
    '4) A 股趋势一句话：get_trend_brief（code 必填，可选 holding_cost）→ 需要深度时 evaluate_instrument / get_instrument_chart',
    '5) 跨市场搜索：唯一入口 search_instruments（可用 markets 过滤 CN/US/HK/CRYPTO）；A 股主题扩池用 industry_mining + search_instruments',
  ].join('\n')
}

/** 聊天 Agent — 行业分析路径（产业链 → 代表公司核实） */
export function buildIndustryAnalysisPlaybook(): string {
  return [
    '【行业与板块 — industry_mining / get_sector_list / get_sector_constituents / get_index_constituents】',
    '1) 产业链与代表公司叙事：industry_mining（industry 名称尽量具体，如「半导体」「新能源车」）',
    '2) 板块/行业目录：get_sector_list（kind=industries|boards）→ 拿到 board_key / industry_code',
    '3) 板块成分：get_sector_constituents（须 board_key 或 industry_code）；勿用 ETF holdings 代替',
    '3b) 指数成分（沪深300/同花顺概念等）：get_index_constituents(index_code)',
    '4) 需 mindmap：industry_mermaid；核实代表公司：search_instruments → snapshot / evaluate',
    '5) 宏观/板块背景：get_market_regime / get_market_dynamics',
  ].join('\n')
}

/**
 * 投研认识论常驻薄层 — 准确性/科学性底线（与具体工具名解耦，始终注入）。
 */
export function buildResearchEpistemicPlaybook(): string {
  return [
    '【投研证据纪律 — 始终遵守】',
    '1) 分层：工具返回 = 事实层；你的文字 = 推断层。禁止把推断写成「已证实」。',
    '2) 禁编造：未调用工具或工具报错/空数据时，明确写「数据不可用/未拉取」，禁止用训练记忆补行情、评分、新闻正文或精确数字。',
    '3) 引用来源：关键数字（价、涨跌幅、评分、净值、持仓权重等）尽量带单位，并暗示依据（如「据 snapshot」「据 evaluate」）；冲突时并列说明，勿 silently 取更好看的一侧。',
    '4) 时效：本轮 system 含【会话时钟】时必须以其为「截至」基准（含时区），勿臆造日期；仅当用户明确追问「现在几点」或需二次核对时间时才调用 get_current_time。资讯用文章发布日相对会话时钟判断新旧；Crypto 注明高时效波动。',
    '5) 证据类型标签（书写时区分）：价量事实 / 模型评分或技术指标 / 机构观点 / 新闻叙事 / 宏观背景。宏观是背景不是个股因果证明。',
    '6) 不确定性：深度结论用条件句或概率口吻（「在…前提下更支持…」）；给出至少一条否证/风险条件。',
    '7) 合规：不给出具体买卖点、仓位或「必涨/必跌」判断；可做情景对照（上/下/震荡）与数据解读。',
  ].join('\n')
}

/**
 * 按研究档位的输出骨架 — 全面性与可读性。
 */
export function buildResearchOutputPlaybook(tier: ResearchTier = 'L2'): string {
  if (tier === 'L1') {
    return [
      '【答复档位 L1 — 事实快答】',
      '- 结构：直接答案（1–3 句）→ 关键数字与截至时间 → 一句边界（未覆盖的不展开）',
      '- 工具：沿选型卡最短路径，通常 1–2 次调用即停；勿主动评价「值不值得」',
    ].join('\n')
  }
  if (tier === 'L3') {
    return [
      '【答复档位 L3 — 深度投研备忘录】',
      '按下列骨架组织（某一维无数据则写「本维未覆盖：原因」，禁止脑补）：',
      '1) 问题界定：标的（命名空间）/ 市场与资产类型 / 分析时间范围',
      '2) 关键事实：价量或核心截面（工具 + 截至）',
      '3) 分维解读：基本面事实（financials/profile，若已加载）→ 模型或技术（评分/指标/信号）→ 市场环境（若已取）→ 事件/披露（若已取）→ 行业位置（若已取）',
      '4) 综合判断：条件化结论 + 主要风险与否证条件',
      '5) 数据缺口：列出仍缺的维度或未加载工具包',
      '- 每一维最多一个主证据工具；「全面」不等于堆砌重复工具',
      '- 声称全面分析前：缺 fundamentals/market/news 等能力时先 activate_tool_pack，或明示缺口',
    ].join('\n')
  }
  return [
    '【答复档位 L2 — 结构化解读】',
    '- 结构：结论摘要 → 事实依据（工具+时点）→ 简短解读 → 主要风险一句',
    '- 工具：首选路径取证据后停止；用户未要求则不升维到 L3 全备忘录',
  ].join('\n')
}

/**
 * 会话时钟块 — 由 Engine 每轮注入权威本地时间，避免 LLM 猜日期或多余调 tool。
 */
export function buildSessionClockPlaybook(clock: {
  iso: string
  local: string
  timezone: string
  weekday?: string
  unix_ms?: number
}): string {
  const weekday = clock.weekday ? `；${clock.weekday}` : ''
  return [
    '【会话时钟 — 本轮权威时间基准】',
    `- 本地：${clock.local}（${clock.timezone}${weekday}）`,
    `- ISO：${clock.iso}`,
    clock.unix_ms != null ? `- unix_ms：${clock.unix_ms}` : '',
    '- 做「截至」与数据时效判断时必须引用上述时间；勿用训练记忆中的「今天」',
    '- 不必为此再调 get_current_time（除非用户明确问时刻，或本轮时钟明显过期需复核）',
  ].filter(Boolean).join('\n')
}

/** 按已加载 pack 选择性注入 playbook，避免提示未暴露的工具 */
export interface AgentSystemRulesOptions {
  /** 本轮已加载 pack；省略则注入全部 playbook（兼容旧行为） */
  activePacks?: readonly string[]
  /** 本轮选型卡正文（由 agent buildRoundRoutePlaybook 生成） */
  routePlaybook?: string
  /** 本轮已暴露工具名（用于提示「仅限列表」） */
  activeToolNames?: readonly string[]
  /** 本轮投研答复档位 */
  researchTier?: ResearchTier
  /** 本轮权威时钟正文（buildSessionClockPlaybook） */
  sessionClock?: string
}

function packSet(activePacks?: readonly string[]): Set<string> | null {
  if (!activePacks?.length) return null
  return new Set(activePacks)
}

function packLoaded(set: Set<string> | null, id: string): boolean {
  return set == null || set.has(id)
}

/** 聊天 Agent 完整 system 规则正文（不含角色行） */
export function buildAgentSystemRules(opts?: AgentSystemRulesOptions): string {
  const packs = packSet(opts?.activePacks)
  const tier = opts?.researchTier ?? 'L2'
  const sections: string[] = [
    '规则：',
    '- 需要数据时必须先调用工具，禁止编造数字或臆测行情',
    '- 跨市场标的统一用 Stock-index 命名空间（CN:SZ.000009）或 search 返回的 instrument 对象',
    '- 仅使用当前会话已加载的 MCP 工具（见 tools 列表）；缺能力时 list_tool_packs → activate_tool_pack',
  ]

  if (opts?.sessionClock) {
    sections.push(opts.sessionClock)
  }

  sections.push(
    buildResearchEpistemicPlaybook(),
    buildResearchOutputPlaybook(tier),
  )

  if (opts?.routePlaybook) {
    sections.push(opts.routePlaybook)
  }

  sections.push(buildToolPackCatalogPrompt())
  sections.push(buildInstrumentNamespacePlaybook())

  // core 能力路径始终相关
  if (packLoaded(packs, 'core')) {
    sections.push(buildStandardInstrumentApiPlaybook())
  }
  if (packLoaded(packs, 'fundamentals')) {
    sections.push(buildFundamentalsPlaybook())
  }
  if (packLoaded(packs, 'instrument_analytics') || packLoaded(packs, 'core')) {
    sections.push(buildInstrumentAnalysisPlaybook())
  }
  if (packLoaded(packs, 'industry')) {
    sections.push(buildIndustryAnalysisPlaybook())
  }
  if (packLoaded(packs, 'market') || packLoaded(packs, 'portfolio')) {
    sections.push(buildMarketContextPlaybook())
  }
  if (packLoaded(packs, 'provider_ext')) {
    sections.push(buildProviderCustomMethodPlaybook())
  }
  sections.push(buildUserInteractionPlaybook())
  if (packLoaded(packs, 'news')) {
    sections.push(buildNewsRetrievalPlaybook())
  }

  if (opts?.activeToolNames?.length) {
    sections.push(
      `- 本轮可用工具（共 ${opts.activeToolNames.length} 个）：${opts.activeToolNames.slice(0, 40).join(', ')}${opts.activeToolNames.length > 40 ? '…' : ''}`,
    )
  }

  sections.push(
    '- 每个已加载工具描述含【何时使用】【调用规范】，严格遵守；以本轮选型卡与证据纪律为首要决策依据',
    '- 不推荐具体买卖，仅提供研究与数据解读',
    '- L1 走最短正确路径；L3 按备忘录骨架覆盖并声明缺口；禁止为堆砌而重复调用',
    '- 禁止 Shell 执行、任意文件读写或未提供的工具能力',
  )

  return sections.join('\n')
}
