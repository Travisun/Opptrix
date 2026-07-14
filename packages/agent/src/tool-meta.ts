/** 数据层 / 分析工具元数据：用途说明与调用规范（OpenAI tools + MCP 共用） */
import {
  discoverMiningToolNamesForProfile,
  INSTRUMENT_HUB_FEATURE,
  isDiscoverStrategyProfile,
  packIdForTool,
  type ToolPackId,
} from '@opptrix/shared'

/**
 * 工具元数据 — 每个 Agent 工具的使用指南和调用规范。
 *
 * 用途：
 *   1. 注入 LLM 工具描述（formatToolDescription 拼接 usageGuide + compliance）
 *   2. 控制工具在挖掘/聊天场景下的可见性
 *   3. 映射到 ResearchHub.dispatch feature 名称
 *   4. packId：聊天 Tool Pack 路由归属（见 @opptrix/shared TOOL_PACK_MEMBERSHIP）
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
  /**
   * 所属工具包（单一主 pack）。
   * 未显式填写时由 TOOL_PACK_MEMBERSHIP 补全。
   */
  packId?: ToolPackId
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
    usageGuide: '判断 A 股/美股宏观环境（牛熊、风险偏好）；挖掘或组合分析前先了解大盘背景。',
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
  batch_instrument_snapshots: {
    hubFeature: 'instrument_batch_snapshots',
    miningEligible: true,
    usageGuide: `对已有候选代码批量拉取在线聚合快照（行情/概况等）。${INSTRUMENT_REF_USAGE}`,
    compliance: 'instruments 或 codes 一次传入，建议 ≤ 80；禁止对同一列表重复调用。',
  },
  get_watchlist: {
    hubFeature: 'watchlist_list',
    miningEligible: true,
    usageGuide: '需要知道用户已关注哪些股票时调用；再对重点标的用 get_instrument_quotes / get_instrument_snapshot / evaluate_instrument 深入分析。',
    compliance: '只读；无参数；关注列表由客户端同步至服务端。',
  },
  get_etf_list: {
    hubFeature: 'etf_list',
    miningEligible: true,
    usageGuide: '获取 A 股 ETF 全量列表或按 code 验证；定位标的后优先 search_instruments（markets=["CN"]）或直接用代码。',
    compliance: '只读；可选 code 过滤；列表结果用 code 调用 get_instrument_snapshot / get_etf_nav / get_etf_holdings。',
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
  get_etf_profile: {
    hubFeature: 'etf_profile',
    miningEligible: true,
    usageGuide: 'ETF 档案（跟踪指数、费率、规模等）；与净值/持仓区分。',
    compliance: '单只 InstrumentRef/code；经标准 etf_profile；无数据时声明缺口。',
  },
  get_sector_list: {
    hubFeature: 'sector_list',
    miningEligible: true,
    usageGuide: '板块或行业目录；拿 board_key/industry_code 后再 get_sector_constituents；产业链叙事仍用 industry_mining。',
    compliance: '只读；market/kind/plate_type 可选；勿与 industry_mining 混淆。',
  },
  get_sector_constituents: {
    hubFeature: 'sector_constituents',
    miningEligible: true,
    usageGuide: '板块或行业成分股；须先有 board_key 或 industry_code（来自 get_sector_list）。',
    compliance: 'board_key 与 industry_code 二选一；分页 page/page_size；勿编造成分。',
  },
  get_cn_market_special: {
    hubFeature: 'cn_market_special',
    miningEligible: true,
    usageGuide:
      '同花顺独有专题：连板天梯 / 飙升榜 / 历史热股 / 热榜走势 / 异动 / 概念指数目录(ths_index_list)。须 kind。指数成分→get_index_constituents；财务指标→get_instrument_financial_indicators；全景复盘→get_market_dynamics。',
    compliance: '依赖 tonghuashun（富耀）Key；勿用于美股港股；勿替代 dynamics 全景；勿用本工具拉成分/财务指标。',
  },
  get_trade_calendar: {
    hubFeature: 'trade_calendar',
    miningEligible: true,
    usageGuide: 'A 股交易日历（按年）；问休市日/下一交易日时首选；勿用 get_market_session 代替。',
    compliance: 'year 可选，默认当年；只读。',
  },
  get_dragon_tiger: {
    hubFeature: 'dragon_tiger',
    miningEligible: true,
    usageGuide: '龙虎榜明细/指定日上榜列表。与涨跌榜一起的全景复盘用 get_market_dynamics（已含龙虎榜摘要）。',
    compliance: '主要 CN；可带 date；空数据声明缺口；勿与 dynamics 同轮各调一遍做同一件事。',
  },
  get_limit_updown: {
    hubFeature: 'limit_updown',
    miningEligible: true,
    usageGuide: '涨跌停池列表；连板天梯用 get_cn_market_special(kind=limit_up_ladder)。dynamics 不含涨跌停池。',
    compliance: '主要 CN；date 可选。',
  },
  get_market_sentiment: {
    hubFeature: 'market_sentiment',
    miningEligible: true,
    usageGuide: '全市场情绪或个股热度；飙升/热股榜用 get_cn_market_special。dynamics 不含情绪分。',
    compliance: '主要 CN；勿编造分数。',
  },
  get_index_constituents: {
    hubFeature: 'index_constituents',
    miningEligible: true,
    usageGuide: '指数成分（如沪深300）或同花顺概念/板块成分；index_code 必填。目录用 get_cn_market_special(kind=ths_index_list) 或 get_sector_list。',
    compliance: '主要 CN；无数据时声明；勿与 get_sector_constituents / get_cn_market_special 混用拉成分。',
  },
  get_market_session: {
    hubFeature: 'market_session',
    miningEligible: true,
    usageGuide: '问是否开盘/交易时段时使用；精确交易日/休市用 get_trade_calendar。',
    compliance: '只读；market 默认 CN；勿当作完整 calendar。',
  },
  search_instruments: {
    hubFeature: 'instrument_search',
    miningEligible: true,
    usageGuide: '跨市场按代码或名称搜索标的（在线名录）；不熟悉代码或需美股/港股/Crypto/A 股检索时的首选且唯一搜索入口。',
    compliance: 'keyword 必填 ≥1 字符；可用 markets 数组过滤（CN/US/HK/CRYPTO）；命中后用返回的 instrument 或 code 调用 get_instrument_*。',
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
    usageGuide: `单只标的聚合快照（概况、行情、关键序列）；跨市场深度分析首选入口。需要可核验财务/股东事实表时改用 get_instrument_financials / get_instrument_profile。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只 InstrumentRef；capabilities 不含 snapshot 时勿调用；勿对 20+ 只批量 snapshot。',
  },
  get_instrument_profile: {
    hubFeature: 'instrument_profile',
    miningEligible: true,
    usageGuide: `公司/标的概况事实表（主业、行业、概念、上市信息）；问「做什么的/所属概念」时首选。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；经标准 profile capability；勿用 invoke_provider_custom_method 替代；无数据时声明缺口。',
  },
  get_instrument_financials: {
    hubFeature: 'instrument_financials',
    miningEligible: true,
    usageGuide: `财务摘要多期事实表（营收/利润/ROE/同比）；问增速、盈利质量、财报数字时首选；资产负债/现金流明细改用 get_instrument_balance_sheet / get_instrument_cash_flow。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；report_type 默认 all；引用具体 reportDate；无数据时声明缺口，禁止编造。',
  },
  get_instrument_balance_sheet: {
    hubFeature: 'instrument_balance_sheet',
    miningEligible: true,
    usageGuide: `资产负债表多期事实表；问总资产/负债/权益、资产负债率明细时首选。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；经标准 balance_sheet；勿用 evaluate 或自定义方法替代；无数据时声明缺口。',
  },
  get_instrument_cash_flow: {
    hubFeature: 'instrument_cash_flow',
    miningEligible: true,
    usageGuide: `现金流量表多期事实表；问经营/投资/筹资现金流时首选。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；经标准 cash_flow；勿用财务摘要的 operatingCashFlow 单字段敷衍完整表。',
  },
  get_instrument_income_statement: {
    hubFeature: 'instrument_income_statement',
    miningEligible: true,
    usageGuide: `利润表多期事实表；问营收/成本/费用明细时首选，勿仅用财务摘要代替。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；经标准 income_statement；勿用 evaluate 替代。',
  },
  get_instrument_financial_indicators: {
    hubFeature: 'instrument_financial_indicators',
    miningEligible: true,
    usageGuide: `同花顺财务指标树；须 report=2024Q3 等。三表明细用 income/balance/cash 专用工具。${INSTRUMENT_REF_USAGE}`,
    compliance: '须启用 tonghuashun；report 必填；无 Key 时声明缺口。',
  },
  get_instrument_shareholders: {
    hubFeature: 'instrument_shareholders',
    miningEligible: true,
    usageGuide: `股东结构事实表；问十大股东、股权集中度、机构持仓时使用。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；部分市场可能无数据；勿编造股东名单。',
  },
  get_instrument_dividend: {
    hubFeature: 'instrument_dividend',
    miningEligible: true,
    usageGuide: `分红派息历史事实表；问分红政策、历史派息时使用。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；港股可带 page；无记录时声明，勿臆造股息率时间序列。',
  },
  get_instrument_money_flow: {
    hubFeature: 'instrument_money_flow',
    miningEligible: true,
    usageGuide: `个股资金流向事实表；问主力/北向/资金进出时首选；勿用 get_market_dynamics 笼统代替。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；主要支持 CN；空数据时声明缺口，禁止编造净流入数字。',
  },
  get_instrument_notices: {
    hubFeature: 'instrument_notices',
    miningEligible: false,
    usageGuide: `按标的拉官方公告/披露列表；用户问公告、年报披露列表时首选。正文用 get_notice_content(url)。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；page/page_size 可选；列表无正文；url 必须来自本工具返回再调 get_notice_content。',
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
    usageGuide: `验证趋势、动量、技术形态；A 股日 K 优先读本地 DuckDB，在线 Provider 补充实时；策略含动量/突破/均线逻辑时使用。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只 InstrumentRef；count ≤ 240；仅对 shortlisted 标的调用；本地无 K 线时会尝试在线拉取。',
  },
  evaluate_instrument: {
    hubFeature: 'instrument_evaluation',
    miningEligible: true,
    usageGuide: `单只标的在线评估：A 股股票为评分卡，CN ETF 与外盘为技术分析 bundle；已有代码且需要量化依据时使用。${INSTRUMENT_REF_USAGE}`,
    compliance: '单只；A 股股票可指定 scorecard；非 CN 股票市场先 get_instrument_capabilities 确认支持。',
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
  analyze_portfolio: {
    hubFeature: 'portfolio_analysis',
    miningEligible: true,
    usageGuide: '按自定义权重分析组合因子暴露；无本地持仓记录或需假设权重时使用。',
    compliance: '需 holdings 权重数组；有实盘持仓时优先 get_portfolio_holdings / portfolio_summary。',
  },
  run_backtest: {
    hubFeature: 'backtest',
    miningEligible: true,
    usageGuide: '对已知代码列表做评分卡 IC 回测。',
    compliance: 'codes 必填；小样本验证；计算密集，非挖掘必经路径。',
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
    usageGuide: '产业链透视、上下游代表公司；行业主题深度分析时使用，不依赖本地行业库。',
    compliance: 'industry 名称需具体（如「半导体」「新能源车」）；不替代单股财务核实；代表公司可用 search_instruments → get_instrument_snapshot / evaluate_instrument 核实。',
  },
  industry_mermaid: {
    hubFeature: 'industry_mermaid',
    miningEligible: true,
    usageGuide: '输出产业链 Mermaid mindmap 源码；用户需要可视化产业链结构时使用。',
    compliance: '展示用；不依赖本地行业库；分析逻辑仍须 industry_mining 或单股工具支撑。',
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
    usageGuide: '用户要读某条上市公司公告/年报全文时使用；url 来自 get_instrument_notices、get_instrument_snapshot 公告列表或用户提供的链接。',
    compliance: 'url 必填；支持 HTML 与 PDF；正文已压缩；truncated=true 时可增大 max_chars；只读。',
  },
  get_current_time: {
    miningEligible: true,
    usageGuide: '仅当用户明确问「现在几点/星期几」或需二次核对时间时调用；日常「截至」时效请用 system【会话时钟】，勿每轮必调。',
    compliance: '只读；与会话时钟重复时优先会话时钟。',
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
  list_tool_packs: {
    packId: 'meta',
    usageGuide: '查看可用工具包目录与当前已加载状态；需要未暴露的能力时先 list 再 activate。',
    compliance: '只读；无参数；返回 id/title/description/tool_count/loaded，不含完整 schema。',
  },
  activate_tool_pack: {
    packId: 'meta',
    usageGuide: '按需激活业务工具包，使本轮及后续轮次可调用该包内工具；当前 tools 不足时使用。',
    compliance: 'pack_ids 为字符串数组（如 ["news","instrument_analytics"]）；同会话累积激活；无效 id 会出现在 skipped。',
  },
}

/** 为 TOOL_META 条目补全 packId（单一事实源仍是 TOOL_PACK_MEMBERSHIP） */
export function resolveToolPackId(toolName: string, meta?: ToolMeta): ToolPackId | null {
  return meta?.packId ?? packIdForTool(toolName)
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
      pack_id: resolveToolPackId(t.name, meta),
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
