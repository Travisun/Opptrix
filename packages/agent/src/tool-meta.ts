/** 数据层 / 分析工具元数据：用途说明与调用规范（OpenAI tools + MCP 共用） */
import { discoverMiningToolNamesForProfile, INSTRUMENT_HUB_FEATURE, isDiscoverStrategyProfile } from '@opptrix/shared'

/**
 * 工具元数据 — 每个 Agent 工具的使用指南和调用规范。
 *
 * 用途：
 *   1. 注入 LLM 工具描述（formatToolDescription 拼接 usageGuide + compliance）
 *   2. 控制工具在挖掘/聊天场景下的可见性
 *   3. 映射到 ResearchHub.dispatch feature 名称
 */
export interface ToolMeta {
  /** 何时使用此工具的指导说明（如"初选后批量获取候选截面"） */
  usageGuide: string
  /** 调用规范与约束（如"codes ≤80、禁止重复调用"） */
  compliance: string
  /** 选股挖掘阶段是否开放给 Agent，默认 false 隐藏 */
  miningEligible?: boolean
  /** 对应 ResearchHub.dispatch feature 名称，用于 hub 层路由 */
  hubFeature?: string
}

const INSTRUMENT_REF_USAGE = [
  '标的标识（Stock-index 命名空间）：',
  '首选 search_instruments 返回的 instrument 对象（market + symbol + exchange）或 code/ref_label（如 CN:SZ.000009）',
  'A 股 CN 须带 exchange 消歧：{market:"CN", symbol:"000009", exchange:"SZ"} 或 code:"CN:SZ.000009"',
  '美股 US:AAPL / 港股 HK:00700 / Crypto CRYPTO:BINANCE.BTC/USDT',
  'instrument.symbol 为裸代码，勿写入 CN:SZ.xxx 命名空间；不熟悉时先 search_instruments。',
].join(' ')

export const TOOL_META: Record<string, ToolMeta> = {
  get_market_regime: {
    hubFeature: 'market_regime',
    miningEligible: true,
    usageGuide: '判断 A 股/美股宏观环境（牛熊、风险偏好、建议策略方向）；挖掘或组合分析前先了解大盘背景时使用。',
    compliance: '只读；profile_scope 默认 cn；us 需 TickFlow/在线 K 线可用；勿重复调用。',
  },
  get_market_dynamics: {
    hubFeature: 'market_dynamics',
    miningEligible: true,
    usageGuide: '需要市场全景（指数、全球市场、涨跌榜、龙虎榜）时使用；适合开盘/收盘复盘或解释板块异动背景。',
    compliance: '只读；无参数；响应较大，同一轮对话调用一次即可。',
  },
  get_trend_brief: {
    hubFeature: 'trend_brief',
    miningEligible: true,
    usageGuide: 'A 股单股趋势一句话研判（均线、相对沪深300、可选持仓盈亏）；用户问「走势怎么看」且已有代码时使用。',
    compliance: '仅 CN 股票；code 必填；holding_cost 可选；深度分析仍须 get_instrument_snapshot / evaluate_instrument。',
  },
  screen_stocks: {
    hubFeature: 'screening',
    miningEligible: true,
    usageGuide: 'A 股在线因子条件筛选；扩大/收紧候选池的首选工具（本地因子筛选已停用）。',
    compliance: 'conditions 必填；top_n 默认 20、挖掘建议 ≤ 80；勿编造 factor 名。',
  },
  screen_us_universe: {
    hubFeature: 'local_us_screen',
    miningEligible: true,
    usageGuide: '美股名录在线 keyword 筛选；挖掘或主题研究扩大美股候选时使用。',
    compliance: 'top_n ≤ 200；结果 symbol 用于 get_instrument_snapshot；勿与 search_instruments 重复相同 keyword。',
  },
  screen_hk_universe: {
    hubFeature: 'local_hk_screen',
    miningEligible: true,
    usageGuide: '港股名录在线 keyword 筛选；挖掘或主题研究扩大港股候选时使用。',
    compliance: 'top_n ≤ 200；结果 code 用于 get_instrument_snapshot（market=HK）；勿调用 A 股专用工具。',
  },
  screen_crypto_universe: {
    hubFeature: 'local_crypto_screen',
    miningEligible: true,
    usageGuide: 'Crypto 交易对名录筛选（keyword/quote/base_contains）；7×24 市场初选时使用。',
    compliance: 'top_n ≤ 200；结果 pair 用于 get_instrument_snapshot（market=CRYPTO）。',
  },
  list_local_industries: {
    hubFeature: 'local_industry_list',
    miningEligible: true,
    usageGuide: '行业主题分析前获取可用行业名称；keyword 模糊查找（如「半导体」「银行」）。',
    compliance: '只读；行业名须原样传入 get_local_industry_stocks / industry_mining；无数据时改 search_instruments + screen_stocks。',
  },
  get_local_industry_stocks: {
    hubFeature: 'market_industry_stocks',
    miningEligible: true,
    usageGuide: '列出某行业成分股（价量、综合评分）；行业对比后锁定龙头或扩散分析时使用。',
    compliance: 'industry 必填且为精确名称；limit ≤200；深度分析再对单股 evaluate_instrument / get_instrument_snapshot。',
  },
  get_industry_stats: {
    hubFeature: 'market_industry_stats',
    miningEligible: true,
    usageGuide: '行业涨跌对比、估值水平、均评分；解释候选股所处行业强弱或选强势/弱势行业时使用。',
    compliance: '只读；可选 trade_date；行业级聚合，不替代单股 get_instrument_snapshot。',
  },
  batch_instrument_snapshots: {
    hubFeature: 'instrument_batch_snapshots',
    miningEligible: true,
    usageGuide: `初选后批量获取候选截面（行业、评分、PE/PB、关键因子）；A 股挖掘首选。${INSTRUMENT_REF_USAGE}`,
    compliance: 'instruments 或 codes 一次传入，建议 ≤ 80；禁止对同一列表重复调用。',
  },
  get_watchlist: {
    hubFeature: 'watchlist_list',
    miningEligible: true,
    usageGuide: '需要知道用户已关注哪些股票时调用；可与 get_watchlist_radar 组合做关注池分析。',
    compliance: '只读；无参数；关注列表由客户端同步至服务端。',
  },
  get_watchlist_radar: {
    hubFeature: 'watchlist_radar',
    miningEligible: true,
    usageGuide: '快速获取关注股或多股雷达摘要（估值分位、主力净流入、评分卡）；codes 省略则自动使用用户关注列表。',
    compliance: 'codes 批量或省略；适合 5–30 只 A 股；深度分析仍须 get_instrument_snapshot。',
  },
  get_local_data_status: {
    hubFeature: 'market_db_status',
    miningEligible: false,
    usageGuide: '需确认本地行业名录/截面是否就绪时使用；local_offline_screening_enabled 恒为 false。',
    compliance: '只读；勿用于触发同步；选股请用 screen_stocks / search_instruments。',
  },
  get_etf_list: {
    hubFeature: 'etf_list',
    miningEligible: true,
    usageGuide: '获取 A 股 ETF 全量列表或按 code 验证；ETF 主题挖掘前定位标的。',
    compliance: '只读；可选 code 过滤；列表结果用 code 调用 get_etf_snapshot / get_etf_scorecard。',
  },
  search_etfs: {
    hubFeature: 'search_etfs',
    miningEligible: true,
    usageGuide: '按代码或名称搜索 ETF；用户提到宽基/行业/红利 ETF 时定位标的。',
    compliance: 'keyword 必填 ≥1 字符；结果须用 code 调用 get_etf_snapshot。',
  },
  get_etf_snapshot: {
    hubFeature: 'etf_snapshot',
    miningEligible: true,
    usageGuide: '单只 ETF 聚合：概况、最新净值、实时行情；分析 ETF 首选入口。',
    compliance: '单只 code；深度持仓/历史净值用 get_etf_holdings / get_etf_nav。',
  },
  get_etf_nav: {
    hubFeature: 'etf_nav',
    miningEligible: true,
    usageGuide: 'ETF 历史净值与溢价率序列；判断折溢价、净值趋势时使用。',
    compliance: '单只 code；在线拉取。',
  },
  get_etf_holdings: {
    hubFeature: 'etf_holdings',
    miningEligible: true,
    usageGuide: 'ETF 最新披露持仓与权重；了解底层资产或行业暴露时使用。',
    compliance: '单只 code；持仓按季报更新，勿臆造成分股。',
  },
  get_etf_scorecard: {
    hubFeature: 'etf_scorecard',
    miningEligible: true,
    usageGuide: '单只 ETF 决策雷达：折溢价、规模流动性、费率、净值波动与同类对比（0–100 分）；与 evaluate_instrument(ETF) 等价。',
    compliance: '单只 code；缺数据时部分维度为空。',
  },
  search_instruments: {
    hubFeature: 'instrument_search',
    miningEligible: true,
    usageGuide: '跨市场在线搜索标的（CN/US/HK/Crypto 等）；不熟悉代码或需多市场检索时的首选入口。',
    compliance: 'keyword 必填 ≥1 字符；可用 markets 数组过滤；命中 code/ref_label 为命名空间（CN:SZ.xxx），后续 get_instrument_* 须用返回的 instrument 或 code。',
  },
  get_instrument_capabilities: {
    hubFeature: 'instrument_capabilities',
    miningEligible: true,
    usageGuide: `查询标的可用数据能力（快照、行情、K 线、评估等）；跨市场分析未知代码或新市场时的第一步。${INSTRUMENT_REF_USAGE}`,
    compliance: '只读；须传 instrument 或 market+symbol；按返回 capabilities 选择后续工具。',
  },
  get_instrument_snapshot: {
    hubFeature: 'instrument_snapshot',
    miningEligible: true,
    usageGuide: `单只标的聚合快照（概况、行情、关键序列）；跨市场深度分析首选入口。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只 InstrumentRef；capabilities 不含 snapshot 时勿调用；勿对 20+ 只批量 snapshot。',
  },
  get_instrument_quotes: {
    hubFeature: 'instrument_quotes',
    miningEligible: true,
    usageGuide: `批量最新价、涨跌幅、量比等；初选后快速更新多只候选行情。${INSTRUMENT_REF_USAGE}`,
    compliance: 'instruments 数组一次传入，建议 ≤ 30；禁止逐只循环调用。',
  },
  get_instrument_chart: {
    hubFeature: 'instrument_chart',
    miningEligible: true,
    usageGuide: `验证趋势、动量、技术形态；策略含动量/突破/均线逻辑时使用。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只 InstrumentRef；count ≤ 240；仅对 shortlisted 标的调用。',
  },
  evaluate_instrument: {
    hubFeature: 'instrument_evaluation',
    miningEligible: true,
    usageGuide: `单只标的评估打分：A 股为因子评分卡，其他市场为技术分析 bundle；需要量化 match_score 依据时使用。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；A 股可指定 scorecard；非 CN 市场先 get_instrument_capabilities 确认支持。',
  },
  get_instrument_strategy_signal: {
    hubFeature: 'instrument_strategy_signal',
    miningEligible: true,
    usageGuide: `9 策略融合方向信号，辅助判断多空倾向。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只 InstrumentRef；信号为研究参考，非买卖指令。',
  },
  get_instrument_indicators: {
    hubFeature: 'instrument_indicators',
    miningEligible: true,
    usageGuide: `读取技术指标 bundle（均线、动量、波动等），辅助趋势与形态判断。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只 InstrumentRef；仅对 shortlisted 候选调用；计算较轻于完整 evaluate_instrument。',
  },
  verify_instrument_strategy: {
    hubFeature: 'instrument_strategy_verify',
    miningEligible: false,
    usageGuide: `验证历史策略信号胜率与 forward 收益，支撑 thesis 可信度。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；计算较重；仅对核心 1–3 只候选使用。',
  },
  get_instrument_latest_evaluation: {
    hubFeature: 'latest_evaluation',
    miningEligible: false,
    usageGuide: `读取已缓存的最近一次评估，避免重复 evaluate_instrument。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只只读；无缓存时再调用 evaluate_instrument。',
  },
  get_instrument_cyq: {
    hubFeature: INSTRUMENT_HUB_FEATURE.cyq,
    miningEligible: true,
    usageGuide: `A 股筹码分布（获利盘、成本区）；仅 CN 市场。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只 InstrumentRef；market 须为 CN；仅对最终 3–8 只候选调用。',
  },
  get_instrument_institution_rating: {
    hubFeature: INSTRUMENT_HUB_FEATURE.institution_rating,
    miningEligible: true,
    usageGuide: `28 家机构风格共识；基本面/估值研究需外部观点时使用；仅 A 股。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只 InstrumentRef；market 须为 CN；可选 groups 过滤；勿编造机构观点。',
  },
  get_instrument_institution_report: {
    hubFeature: INSTRUMENT_HUB_FEATURE.institution_report,
    miningEligible: false,
    usageGuide: `机构评级完整文本报告；仅 A 股。${INSTRUMENT_REF_USAGE}`,
    compliance: '长文本；仅用户明确要求深度报告时调用；market 须为 CN。',
  },
  institution_rating: {
    hubFeature: INSTRUMENT_HUB_FEATURE.institution_rating,
    miningEligible: true,
    usageGuide: 'A 股 28 家机构风格共识（CN 六位 code 快捷写法）；跨市场请用 get_instrument_institution_rating。',
    compliance: '单股 CN code；可选 groups 过滤；勿编造机构观点。',
  },
  institution_report: {
    hubFeature: INSTRUMENT_HUB_FEATURE.institution_report,
    miningEligible: true,
    usageGuide: 'A 股机构评级完整文本报告（CN 六位 code 快捷写法）。',
    compliance: '长文本；仅用户明确要求深度报告时调用。',
  },
  analyze_portfolio: {
    hubFeature: 'portfolio_analysis',
    miningEligible: true,
    usageGuide: '按自定义权重分析组合因子暴露；无本地持仓记录或需假设权重时使用。',
    compliance: '需 holdings 权重数组；有实盘持仓时优先 get_portfolio_holdings / portfolio_summary。',
  },
  run_backtest: {
    hubFeature: 'backtest',
    miningEligible: true,
    usageGuide: '因子 IC 回测验证。',
    compliance: '多股 codes；计算密集，非挖掘必经路径。',
  },
  get_closing_report: {
    hubFeature: 'market_report',
    miningEligible: true,
    usageGuide: '大盘收盘报告。',
    compliance: '市场级；单股挖掘不必调用。',
  },
  get_morning_brief: {
    hubFeature: 'market_report',
    miningEligible: true,
    usageGuide: '大盘早报。',
    compliance: '市场级。',
  },
  industry_mining: {
    hubFeature: 'industry_mining',
    miningEligible: true,
    usageGuide: '产业链透视、上下游代表公司；配合 list_local_industries / get_industry_stats 做行业主题深度分析。',
    compliance: 'industry 名称需具体；不替代单股财务核实；可与 get_local_industry_stocks 交叉验证代表公司。',
  },
  industry_mermaid: {
    hubFeature: 'industry_mermaid',
    miningEligible: true,
    usageGuide: '输出产业链 Mermaid mindmap 源码；用户需要可视化产业链结构时使用。',
    compliance: '展示用；分析逻辑仍须 industry_mining 或单股工具支撑。',
  },
  strategy_report: {
    hubFeature: 'strategy_report',
    miningEligible: true,
    usageGuide: '单股 T 策略综合分析长文（A 股 CN code）。',
    compliance: '文本报告；非结构化挖掘首选；跨市场策略验证用 verify_instrument_strategy。',
  },
  get_portfolio_holdings: {
    hubFeature: 'portfolio_holdings',
    miningEligible: true,
    usageGuide: '读取用户实盘持仓（股数、成本、市值、浮盈）；含 A 股/港股/美股；分析持仓、对比策略候选或排除已持仓时使用。',
    compliance: '只读；无参数；返回每条含 market 字段；数据来自本地交易账本。',
  },
  portfolio_trades: {
    hubFeature: 'portfolio_trades',
    miningEligible: true,
    usageGuide: '查询买卖流水；核实成本、交易历史或复盘时使用。过滤单只时港/美须带 market（如 market=HK, code=00700）。',
    compliance: '只读；可选 code/market 过滤；勿编造交易记录。',
  },
  portfolio_summary: {
    hubFeature: 'portfolio_summary',
    miningEligible: true,
    usageGuide: '持仓盈亏汇总 + 明细（含 market）；需要组合层面 PnL 时使用。',
    compliance: '只读；比 get_portfolio_holdings 更重；二选一即可，勿重复调用。',
  },
  get_news_center_status: {
    hubFeature: 'news_center_status',
    miningEligible: false,
    usageGuide: '用户询问订阅资讯、RSS 要闻或新闻中心内容前调用；确认数据是否已刷新、订阅规模与文章总量。',
    compliance: '只读；无参数；stale=true 时告知用户列表可能不是最新，勿编造文章。',
  },
  list_news_groups: {
    hubFeature: 'news_groups_list',
    miningEligible: false,
    usageGuide: '按标的类型选资讯分组：阅读返回的 market_hints 与 relevance，优先与标的 market 一致的分组。',
    compliance: '只读；分组 id 须原样传入 list_news_articles；未分组订阅用 group_id=__ungrouped__；同一任务最多调用 1 次。',
  },
  list_news_sources: {
    hubFeature: 'news_sources_list',
    miningEligible: false,
    usageGuide: '在已选分组内按 market_hints / title 关键词筛选 enabled 来源。',
    compliance: '只读；subscription_id 须来自本工具返回；同一任务最多调用 1 次。',
  },
  list_news_articles: {
    hubFeature: 'news_articles_list',
    miningEligible: false,
    usageGuide: '标的相关资讯：优先 view=group + 最匹配 group_id；信息不足时交叉调阅 MACRO/GLOBAL 分组或 view=timeline 兜底。',
    compliance: '只读；limit ≤50；view=group 须 group_id，view=source 须 subscription_id；列表无正文，禁止臆造 article_id。',
  },
  get_news_article: {
    hubFeature: 'news_article_detail',
    miningEligible: false,
    usageGuide: '仅对 list 筛出的最相关 1–3 篇拉正文做深度解读；用户点名某条资讯时使用。',
    compliance: 'article_id 必填且须来自 list_news_articles；只读；正文已压缩空白。',
  },
  get_notice_content: {
    hubFeature: 'notice_content',
    miningEligible: false,
    usageGuide: '用户要读某条上市公司公告/年报全文时使用；url 来自 get_instrument_snapshot 公告列表或用户提供的链接。',
    compliance: 'url 必填；支持 HTML 与 PDF；正文已压缩；truncated=true 时可增大 max_chars；只读。',
  },
  get_current_time: {
    miningEligible: true,
    usageGuide: '需要时间戳、时区、报告日期或交易日上下文时调用。',
    compliance: '只读。',
  },
  get_system_info: {
    miningEligible: false,
    usageGuide: '需要确认运行环境、桌面/服务端模式、时区或排查环境问题时调用。',
    compliance: '只读；不含密钥。',
  },
  get_app_settings: {
    miningEligible: false,
    usageGuide: '需要默认评分卡、TopN、可用 LLM 模型列表或确认 LLM 是否已配置时调用。',
    compliance: '只读；不返回 API Key。',
  },
  get_project_info: {
    miningEligible: false,
    usageGuide: '需要数据根目录、关注列表文件、会话存储或项目根路径时调用。',
    compliance: '只读；仅返回路径元数据，不读取文件内容。',
  },
  get_integration_status: {
    miningEligible: false,
    usageGuide: '需要确认 Tushare 等外部集成是否已配置时调用。',
    compliance: '只读；不返回 Token/Secret。',
  },
  ask_user: {
    miningEligible: false,
    usageGuide: '分析前需用户确认方向、范围或偏好，且上下文无法推断时调用；会在聊天输入框上方展示选择题，用户点选或自行输入后继续。',
    compliance: 'prompt 必填、面向投资者；options 2–5 项且 id 唯一；allow_multiple 默认 false；同一轮对话最多 1 次；禁止索要密钥。',
  },
  list_enabled_providers: {
    hubFeature: 'provider_list',
    miningEligible: false,
    usageGuide: '调用自定义方法前确认数据源已启用；返回 provider_id、优先级与支持能力摘要。',
    compliance: '只读；无参数；自定义方法调用前建议先调用一次。',
  },
  list_provider_custom_methods: {
    hubFeature: 'provider_custom_methods',
    miningEligible: false,
    usageGuide: '查找非标准 API（板块、宏观、情绪、龙虎榜等）；须带 provider_id 或 keyword，akshare 禁止无过滤全量拉取。',
    compliance: '只读；provider_id 如 baostock、zzshare、stockindex、akshare；keyword 匹配方法名/描述；limit 默认 40。',
  },
  invoke_provider_custom_method: {
    hubFeature: 'provider_invoke_custom',
    miningEligible: false,
    usageGuide: '执行 list_provider_custom_methods 查到的自定义方法；标准 get_instrument_* 能覆盖的需求勿调用。',
    compliance: 'provider_id + method 必填；args 为 JSON 数组；code/symbol 可传命名空间 CN:SZ.000009 或 InstrumentRef；同一 method 每任务最多 1 次。',
  },
}

export const DATA_LAYER_MINING_TOOL_NAMES = Object.entries(TOOL_META)
  .filter(([, m]) => m.miningEligible)
  .map(([name]) => name) as readonly string[]

export function discoverMiningToolNames(profile: string): readonly string[] {
  if (isDiscoverStrategyProfile(profile)) {
    const names = discoverMiningToolNamesForProfile(profile)
    if (names.length) return names
    return []
  }
  return DATA_LAYER_MINING_TOOL_NAMES
}

export function formatToolDescription(
  description: string,
  meta?: ToolMeta,
): string {
  if (!meta) return description
  return [
    description,
    `【何时使用】${meta.usageGuide}`,
    `【调用规范】${meta.compliance}`,
  ].join('\n')
}

export function mcpToolCatalog(registry: { list: () => Array<{ name: string; description: string; category: string; parameters: unknown }> }) {
  return registry.list().map(t => {
    const meta = TOOL_META[t.name]
    return {
      name: t.name,
      category: t.category,
      hub_feature: meta?.hubFeature ?? null,
      mining_eligible: Boolean(meta?.miningEligible),
      description: t.description,
      usage_guide: meta?.usageGuide ?? '',
      compliance: meta?.compliance ?? '',
      parameters: t.parameters,
      full_description: formatToolDescription(t.description, meta),
    }
  })
}
