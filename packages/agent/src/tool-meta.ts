/** 数据层 / 分析工具元数据：用途说明与调用规范（OpenAI tools + MCP 共用） */
import { discoverMiningToolNamesForProfile, isDiscoverStrategyProfile } from '@opptrix/shared'

export interface ToolMeta {
  usageGuide: string
  compliance: string
  /** 选股挖掘阶段是否开放给 Agent */
  miningEligible?: boolean
  /** 对应 ResearchHub.dispatch feature */
  hubFeature?: string
}

export const TOOL_META: Record<string, ToolMeta> = {
  get_market_db_status: {
    hubFeature: 'market_db_status',
    miningEligible: true,
    usageGuide: '任何依赖本地因子/初选的任务开始前先调用，确认 is_ready、因子日期与覆盖率；数据不足时决定是否改用在线工具或缩小范围。',
    compliance: '无参数；只读；不要重复调用（同一轮对话调用一次即可）。',
  },
  get_market_db_sync_state: {
    hubFeature: 'market_db_sync_state',
    miningEligible: true,
    usageGuide: '本地库未就绪或因子过旧时查看同步进度；向用户说明数据时效性。',
    compliance: '只读；不可用于触发同步（使用 trigger_market_db_sync）。',
  },
  trigger_market_db_sync: {
    hubFeature: 'market_db_sync',
    miningEligible: true,
    usageGuide: '仅当 get_market_db_status 显示未就绪且挖掘强依赖本地因子时，可后台触发 resume/bootstrap 同步。',
    compliance: '写操作、耗时长；同一任务最多调用 1 次；须先检查 status；勿在候选已充足时调用。',
  },
  list_local_screen_factors: {
    hubFeature: 'list_screen_factors',
    miningEligible: true,
    usageGuide: '快速查看可用因子字段名；构造筛选条件前更推荐 get_local_universe_screen_schema 获取完整维度、单位与示例。',
    compliance: '只读；factor 名须与 schema 一致。',
  },
  get_local_universe_screen_schema: {
    hubFeature: 'local_universe_screen_schema',
    miningEligible: true,
    usageGuide: '本地初选组合筛选前必读：返回因子列表、单位、典型区间、行业/板块/评分/市值等过滤字段与查询示例。',
    compliance: '只读；同一任务调用一次即可；按 schema 构造 screen_local_universe 参数。',
  },
  screen_local_universe: {
    hubFeature: 'local_universe_screen',
    miningEligible: true,
    usageGuide: '本地 L0 库已就绪时，按多维度组合筛选股票列表（因子 AND + 行业/板块/评分/估值/市值 + 排序）。选股挖掘扩大/收紧候选池的首选工具。',
    compliance: '须先 get_market_db_status 与 get_local_universe_screen_schema；factor_conditions ≤8；top_n ≤200；至少一项条件或过滤；本地库未就绪时勿调用。',
  },
  list_local_industries: {
    hubFeature: 'local_industry_list',
    miningEligible: true,
    usageGuide: '行业选股前获取可用行业名称列表；可用 keyword 模糊查找（如「半导体」「银行」）。返回 industries 数组供 screen_local_industry_stocks 精确匹配。',
    compliance: '只读；须本地库 is_ready；行业名须原样传入后续筛选工具，勿臆造。',
  },
  screen_local_industry_stocks: {
    hubFeature: 'local_industry_screen',
    miningEligible: true,
    usageGuide: '在单一或少数行业内按策略因子/评分/估值筛选候选股；适合「先定行业、再选股」流程。不知行业名时先 list_local_industries。',
    compliance: '须 industry / industries / industry_contains 至少一项；factor_conditions ≤8；top_n ≤200；行业名与 list_local_industries 一致。',
  },
  get_local_industry_stocks: {
    hubFeature: 'market_industry_stocks',
    miningEligible: true,
    usageGuide: '快速列出某行业全部成分股（价量、评分），不做因子过滤；需要策略条件时用 screen_local_industry_stocks。',
    compliance: 'industry 必填且为精确名称；limit ≤200；不替代因子筛选。',
  },
  local_screen_stocks: {
    hubFeature: 'screening',
    miningEligible: true,
    usageGuide: '本地 L0 库已就绪时，按因子条件快速扩大或收紧候选池（比在线全市场扫描更快）。',
    compliance: 'conditions 1-5 条；top_n ≤ 120；优先于 screen_stocks（本地路径）。',
  },
  screen_stocks: {
    hubFeature: 'screening',
    miningEligible: true,
    usageGuide: '本地库不可用或需要评分卡排序的全市场扫描时使用。',
    compliance: 'conditions 必填；top_n 默认 20、挖掘场景建议 ≤ 80；避免与 local_screen_stocks 重复调用相同条件。',
  },
  get_industry_stats: {
    hubFeature: 'market_industry_stats',
    miningEligible: true,
    usageGuide: '行业对比、估值分位判断、解释候选股所处行业位置。',
    compliance: '可选 trade_date；行业级聚合，不替代单股 detail。',
  },
  batch_stock_snapshots: {
    hubFeature: 'batch_stock_snapshots',
    miningEligible: true,
    usageGuide: '初选后批量获取候选截面（行业、评分、PE/PB、关键因子）；挖掘前首选批量工具。',
    compliance: 'codes 数组一次传入，建议 ≤ 80；禁止对同一 codes 列表重复调用。',
  },
  get_stock_quotes: {
    hubFeature: 'stock_quotes',
    miningEligible: true,
    usageGuide: '需要最新价、涨跌幅、量比等盘中字段；snapshots 不含实时价时补充。',
    compliance: '批量 codes；勿逐只循环调用。',
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
    compliance: 'codes 批量或省略；适合 5–30 只；深度分析仍须 get_stock_detail。',
  },
  get_stock_kline: {
    hubFeature: 'stock_kline',
    miningEligible: true,
    usageGuide: '验证趋势、动量、技术形态；策略含动量/突破/均线逻辑时使用。',
    compliance: '单股；count ≤ 240；勿对全部候选逐只拉取，仅对 shortlisted 使用。',
  },
  get_stock_cyq: {
    hubFeature: 'stock_cyq',
    miningEligible: true,
    usageGuide: '筹码分布、获利盘、成本区分析；适合短线/博弈或估值辅助。',
    compliance: '单股深度；仅对最终 3–8 只候选调用。',
  },
  get_stock_chart: {
    hubFeature: 'stock_chart',
    miningEligible: true,
    usageGuide: '需要多周期 K 线（周/月/分钟）时使用；日 K 优先 get_stock_kline。',
    compliance: '单股；指定 period；控制 count 避免超大响应。',
  },
  get_stock_detail: {
    hubFeature: 'stock_detail',
    miningEligible: true,
    usageGuide: 'snapshots/雷达信息不足时的深度聚合：财务、新闻、资金流、股东、F10 摘要等。',
    compliance: '单股重量级；仅对拟入选标的调用；禁止对 20+ 只批量 detail。',
  },
  get_etf_list: {
    hubFeature: 'local_etf_list',
    miningEligible: true,
    usageGuide: '获取 A 股 ETF 列表；本地库已同步时优先读本地，否则在线拉取。',
    compliance: '只读；可选 code 过滤单只；列表用于 ETF 主题筛选或验证代码。',
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
    hubFeature: 'local_etf_nav',
    miningEligible: true,
    usageGuide: 'ETF 历史净值与溢价率序列；判断折溢价、净值趋势时使用。',
    compliance: '单只 code；本地无数据时自动在线回退。',
  },
  get_etf_holdings: {
    hubFeature: 'local_etf_holdings',
    miningEligible: true,
    usageGuide: 'ETF 最新披露持仓与权重；了解底层资产或行业暴露时使用。',
    compliance: '单只 code；持仓按季报更新，勿臆造成分股。',
  },
  get_local_etf_screen_schema: {
    hubFeature: 'local_etf_screen_schema',
    miningEligible: false,
    usageGuide: 'screen_local_etfs 前先读维度说明（溢价率%、规模亿元）。',
    compliance: '只读 schema；需 etf_list/etf_nav 已同步。',
  },
  screen_local_etfs: {
    hubFeature: 'local_etf_screen',
    miningEligible: true,
    usageGuide: '按折溢价率、规模、跟踪指数筛选本地 ETF；适合找低溢价宽基/行业 ETF。',
    compliance: 'top_n ≤200；本地 etf_count=0 时勿调用。',
  },
  get_etf_scorecard: {
    hubFeature: 'etf_scorecard',
    miningEligible: true,
    usageGuide: '单只 ETF 决策雷达：折溢价、规模流动性、费率、净值波动与同类对比（0–100 分）。',
    compliance: '单只 code；需 etf_list/etf_nav 已同步；缺数据时部分维度为空。',
  },
  get_etf_scorecard_schema: {
    hubFeature: 'etf_scorecard_schema',
    miningEligible: false,
    usageGuide: 'get_etf_scorecard 前先读维度与权重说明。',
    compliance: '只读 schema。',
  },
  get_us_stock_quote: {
    hubFeature: 'us_realtime',
    miningEligible: true,
    usageGuide: '获取单只美股实时/近收盘行情（价量、涨跌幅）；需 symbol 如 AAPL。',
    compliance: 'symbol 为美股 ticker；Polygon 未配置时走 Yahoo 回退。',
  },
  get_us_stock_kline: {
    hubFeature: 'us_kline',
    miningEligible: true,
    usageGuide: '美股日 K 线序列；验证趋势或动量时使用。',
    compliance: '单只 symbol；count ≤ 500；勿批量循环。',
  },
  get_us_stock_profile: {
    hubFeature: 'us_profile',
    miningEligible: true,
    usageGuide: '美股公司概况（交易所、行业、市值等）；需 Polygon 已配置。',
    compliance: '单只 symbol；无 Profile 时说明数据源限制。',
  },
  get_us_stock_financials: {
    hubFeature: 'us_financials',
    miningEligible: true,
    usageGuide: '美股财报摘要（Polygon financials）；annual/quarter 可选。',
    compliance: '单只 symbol；需 Polygon API Key；YoY 字段暂为空。',
  },
  get_us_stock_snapshot: {
    hubFeature: 'us_snapshot',
    miningEligible: true,
    usageGuide: '单只美股聚合快照：概况 + 行情 + 近期 K 线；分析美股首选入口。',
    compliance: '单只 symbol；深度财报另待后续 capability。',
  },
  search_us_stocks: {
    hubFeature: 'search_us_stocks',
    miningEligible: true,
    usageGuide: '按 ticker 或公司名搜索美股；本地库已同步时优先本地。',
    compliance: 'keyword ≥1 字符；结果 symbol 用于 get_us_stock_snapshot。',
  },
  get_crypto_quote: {
    hubFeature: 'crypto_realtime',
    miningEligible: true,
    usageGuide: 'Crypto 交易对实时行情（7×24）；如 BTC/USDT。',
    compliance: 'pair 必填；支持 BTC/USDT、BTC-USDT、BTCUSDT 写法。',
  },
  get_crypto_kline: {
    hubFeature: 'crypto_kline',
    miningEligible: true,
    usageGuide: 'Crypto 日 K 线；7×24 市场，缓存 TTL 较短。',
    compliance: 'pair 必填；count 默认 180。',
  },
  get_crypto_snapshot: {
    hubFeature: 'crypto_snapshot',
    miningEligible: true,
    usageGuide: 'Crypto 聚合快照：行情 + 近期 K 线；分析 Crypto 首选入口。',
    compliance: 'pair 必填；无 Profile 层（Crypto MVP）。',
  },
  search_crypto_pairs: {
    hubFeature: 'search_crypto_pairs',
    miningEligible: true,
    usageGuide: '搜索 Crypto 交易对；本地 instruments 已同步时优先本地。',
    compliance: 'keyword ≥1 字符；结果 pair 用于 get_crypto_snapshot。',
  },
  get_local_us_screen_schema: {
    hubFeature: 'local_us_screen_schema',
    miningEligible: false,
    usageGuide: 'screen_local_us_stocks 前先读本地美股筛选维度说明。',
    compliance: '只读 schema；需 us_list 已同步。',
  },
  screen_local_us_stocks: {
    hubFeature: 'local_us_screen',
    miningEligible: true,
    usageGuide: '按 ticker/公司名、行业关键词筛选本地美股列表。',
    compliance: 'top_n ≤200；本地 us_count=0 时勿调用。',
  },
  get_local_crypto_screen_schema: {
    hubFeature: 'local_crypto_screen_schema',
    miningEligible: false,
    usageGuide: 'screen_local_crypto_pairs 前先读本地 Crypto 筛选维度说明。',
    compliance: '只读 schema；需 crypto_list 已同步。',
  },
  screen_local_crypto_pairs: {
    hubFeature: 'local_crypto_screen',
    miningEligible: true,
    usageGuide: '按 keyword、quote（USDT/USDC/BTC 等）、base_contains 筛选本地交易对。',
    compliance: 'top_n ≤200；本地 crypto_count=0 时勿调用。',
  },
  search_stocks: {
    hubFeature: 'search_stocks',
    miningEligible: true,
    usageGuide: '根据名称/代码/行业关键词在本地 universe 中定位标的；需先完成 universe 同步。',
    compliance: 'keyword ≥ 2 字符；结果来自本地 market.db；与候选列表交叉验证。',
  },
  evaluate_stock: {
    hubFeature: 'stock_diagnosis',
    miningEligible: true,
    usageGuide: '对单股做评分卡因子评估与综合打分；需要量化 match_score 依据时使用。',
    compliance: '单股；可指定 scorecard；评估会写本地快照，同股同卡避免重复评估。',
  },
  get_latest_evaluation: {
    hubFeature: 'latest_evaluation',
    miningEligible: true,
    usageGuide: '读取已缓存的最近一次因子评估，避免重复 evaluate_stock。',
    compliance: '单股只读；无缓存时再调用 evaluate_stock。',
  },
  get_strategy_signal: {
    hubFeature: 'strategy_signal',
    miningEligible: true,
    usageGuide: '9 策略融合方向信号，辅助判断多空倾向与策略匹配度。',
    compliance: '单股；信号为研究参考，非买卖指令。',
  },
  strategy_verify: {
    hubFeature: 'strategy_verify',
    miningEligible: true,
    usageGuide: '验证历史信号胜率与 forward 收益，支撑 thesis 可信度。',
    compliance: '单股；计算较重；仅对核心 1–3 只候选使用。',
  },
  strategy_verify_report: {
    hubFeature: 'strategy_verify_report',
    miningEligible: true,
    usageGuide: '需要可读文本版验证报告时使用。',
    compliance: '单股；文本较长，挖掘 JSON 输出阶段慎用。',
  },
  strategy_report: {
    hubFeature: 'strategy_report',
    miningEligible: true,
    usageGuide: '单股 T 策略综合分析长文。',
    compliance: '文本报告；非结构化挖掘首选。',
  },
  institution_rating: {
    hubFeature: 'institution_rating',
    miningEligible: true,
    usageGuide: '28 家机构风格共识；基本面/估值研究需外部观点时使用。',
    compliance: '单股；可选 groups 过滤；勿编造机构观点。',
  },
  institution_report: {
    hubFeature: 'institution_report',
    miningEligible: true,
    usageGuide: '机构评级完整文本报告。',
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
    usageGuide: '产业链透视、上下游代表公司；行业主题策略时补充候选理解。',
    compliance: 'industry 名称需具体；不替代单股财务核实。',
  },
  industry_mermaid: {
    hubFeature: 'industry_mermaid',
    miningEligible: true,
    usageGuide: '输出产业链 mindmap 源码。',
    compliance: '展示用；挖掘 JSON 不必调用。',
  },
  get_portfolio_holdings: {
    hubFeature: 'portfolio_holdings',
    miningEligible: true,
    usageGuide: '读取用户实盘持仓（股数、成本、市值、浮盈）；分析持仓、对比策略候选或排除已持仓时使用。',
    compliance: '只读；无参数；数据来自本地交易账本。',
  },
  portfolio_trades: {
    hubFeature: 'portfolio_trades',
    miningEligible: true,
    usageGuide: '查询买卖流水；核实成本、交易历史或复盘时使用。',
    compliance: '只读；可选 code 过滤；勿编造交易记录。',
  },
  portfolio_summary: {
    hubFeature: 'portfolio_summary',
    miningEligible: true,
    usageGuide: '持仓盈亏汇总 + 明细；需要组合层面 PnL 时使用。',
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
    usageGuide: '需要按用户自定义分组浏览资讯时，先获取 group_id；与 list_news_articles(view=group) 配合。',
    compliance: '只读；分组 id 须原样传入 list_news_articles；未分组订阅用 group_id=__ungrouped__。',
  },
  list_news_sources: {
    hubFeature: 'news_sources_list',
    miningEligible: false,
    usageGuide: '需要按订阅源（Twitter、媒体 RSS 等）筛选文章时，先获取 subscription_id。',
    compliance: '只读；subscription_id 须来自本工具返回；与 list_news_articles(view=source) 配合。',
  },
  list_news_articles: {
    hubFeature: 'news_articles_list',
    miningEligible: false,
    usageGuide: '浏览资讯时间线、某分组或某来源下的文章标题与短摘要；用户问「订阅里有什么」「最近要闻」时使用。需正文再调 get_news_article。',
    compliance: '只读；limit ≤50；view=group 须 group_id，view=source 须 subscription_id；列表无正文，禁止臆造 article_id；翻页用 cursor。',
  },
  get_news_article: {
    hubFeature: 'news_article_detail',
    miningEligible: false,
    usageGuide: '用户点名某条资讯、需要读全文或做深度解读时，用 list 返回的 article_id 拉取正文。',
    compliance: 'article_id 必填且须来自 list_news_articles；只读；正文已压缩空白；无正文时可能仅返回标题。',
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
}

export const DATA_LAYER_MINING_TOOL_NAMES = Object.entries(TOOL_META)
  .filter(([, m]) => m.miningEligible)
  .map(([name]) => name) as readonly string[]

const US_MINING_TOOL_NAMES = [
  'get_market_db_status',
  'get_local_us_screen_schema',
  'screen_local_us_stocks',
  'search_us_stocks',
  'get_us_stock_snapshot',
  'get_us_stock_profile',
  'get_us_stock_financials',
  'get_us_stock_kline',
  'get_us_stock_quote',
] as const

const CRYPTO_MINING_TOOL_NAMES = [
  'get_market_db_status',
  'get_local_crypto_screen_schema',
  'screen_local_crypto_pairs',
  'search_crypto_pairs',
  'get_crypto_snapshot',
  'get_crypto_kline',
  'get_crypto_quote',
] as const

export function discoverMiningToolNames(profile: string): readonly string[] {
  if (isDiscoverStrategyProfile(profile)) {
    return discoverMiningToolNamesForProfile(profile)
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
