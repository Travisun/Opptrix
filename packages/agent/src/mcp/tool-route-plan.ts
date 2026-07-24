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
  parseNamespacedMcpTool,
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
    intent: 'etf_profile',
    priority: 99,
    patterns: [/ETF.*(?:档案|概况|费率|跟踪指数|规模)|(?:档案|费率|跟踪指数).*ETF|基金档案|ETF.*(?:是什么|简介)/i],
    preferredTools: ['get_etf_profile', 'get_etf_nav', 'get_instrument_snapshot'],
    avoidTools: ['get_etf_holdings', 'get_instrument_profile'],
    confidence: 'high',
    hint: '问 ETF 档案/跟踪指数/费率 → get_etf_profile；净值用 get_etf_nav，成分用 get_etf_holdings',
  },
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
    intent: 'web_browse',
    priority: 87,
    patterns: [
      /https?:\/\//i,
      /打开(?:一下|下)?(?:网页|网站|页面|链接)/,
      /访问(?:网页|网站|页面|链接|这个网址)/,
      /浏览(?:一下|下)?(?:网页|网站|外部网站)/,
      /网页截图|页面截图|网站截图/,
      /去.*(?:官网|网站)看看/,
    ],
    preferredTools: ['browser_navigate', 'browser_snapshot'],
    avoidTools: ['get_news_article', 'get_notice_content', 'list_news_articles'],
    confidence: 'high',
    hint: '外部网页 URL → browser_navigate + browser_snapshot；勿用资讯/公告工具代替网页正文',
  },
  {
    intent: 'web_snapshot_only',
    priority: 86,
    patterns: [
      /当前页面|页面快照|网页内容|页面内容|看看这个页面|读取页面/,
    ],
    preferredTools: ['browser_snapshot'],
    avoidTools: ['get_instrument_snapshot'],
    confidence: 'high',
    hint: '已打开的外部网页 → browser_snapshot；勿用 get_instrument_snapshot',
  },
  {
    intent: 'workspace_shell_install',
    priority: 90,
    patterns: [
      /pip\s+install|npm\s+install|npm\s+ci|安装(?:python|py|node|npm|pip)?(?:包|依赖)/i,
      /shell_install/i,
    ],
    preferredTools: ['shell_install', 'shell_run', 'shell_platform_status'],
    avoidTools: ['workspace_write', 'http_fetch'],
    confidence: 'high',
    hint: '安装依赖 → shell_install（装进工作区）；联网需用户确认',
  },
  {
    intent: 'workspace_shell',
    priority: 89,
    patterns: [
      /运行(?:一下|这段)?\s*(?:python|py|node|js|脚本|代码)/i,
      /执行(?:命令|shell|终端)/i,
      /shell_run/i,
    ],
    preferredTools: ['shell_run', 'shell_install', 'shell_platform_status'],
    avoidTools: ['workspace_write', 'http_fetch'],
    confidence: 'high',
    hint: '运行代码 → shell_run（系统隔离）；先 shell_platform_status 若环境未知',
  },
  {
    intent: 'workspace_files',
    priority: 88,
    patterns: [
      /工作区|保存(?:到|成)?(?:文件|报告|csv|json)|写入(?:文件|报告)|读取(?:本地|工作区)?文件/,
      /列出(?:目录|文件夹|文件)|创建文件夹|删除(?:文件|目录)/,
      /下载(?:到|保存).*(?:文件|pdf|附件)|download/i,
    ],
    preferredTools: ['workspace_list', 'workspace_write', 'download_file'],
    avoidTools: ['browser_navigate'],
    confidence: 'high',
    hint: '本地工作区读写/下载 → workspace_* / download_file；先 activate workspace pack',
  },
  {
    intent: 'http_api',
    priority: 92,
    patterns: [
      /调用(?:开放|公开)?\s*api/i,
      /http(?:s)?\s*请求/i,
      /\bfetch\b/i,
      /获取(?:远程|外部)\s*json/i,
      /restful/i,
    ],
    preferredTools: ['http_fetch'],
    avoidTools: ['browser_navigate', 'download_file'],
    confidence: 'high',
    hint: '结构化 HTTP API → http_fetch；大文件落盘用 download_file',
  },
  {
    intent: 'folder_access',
    priority: 93,
    patterns: [
      /可访问(?:哪些|什么)?(?:目录|文件夹|路径)|能(?:读|访问|打开)(?:哪些|什么)?(?:目录|文件夹)/,
      /(?:本对话|当前对话|本会话).*(?:授权|可访问).*(?:工作区|目录|文件夹)/,
      /授权(?:访问|读取|写入)?(?:文件夹|目录)|访问(?:我的|本地)(?:文件夹|目录)/,
      /request_folder|list_workspace_grants/i,
    ],
    preferredTools: ['list_workspace_grants', 'request_folder_access'],
    avoidTools: ['get_project_info', 'get_system_info', 'workspace_write'],
    confidence: 'high',
    hint: '问可访问目录 → 首选 list_workspace_grants；勿用 get_project_info 的 paths；需要额外目录再 request_folder_access',
  },
  {
    intent: 'market_regime',
    priority: 84,
    patterns: [/牛熊|风险偏好|市场状态|宏观环境|现在是牛市|熊市吗/],
    preferredTools: ['get_market_regime', 'get_market_dynamics'],
    avoidTools: ['get_trend_brief', 'evaluate_instrument', 'get_macro_series'],
    confidence: 'high',
    hint: '问宏观牛熊叙事 → get_market_regime；CPI/LPR 等数字序列用 get_macro_series',
  },
  {
    intent: 'macro_series',
    priority: 87,
    patterns: [
      /\bCPI\b|\bPPI\b|\bPMI\b|\bGDP\b|\bLPR\b|\bSHIBOR\b|居民消费价格|生产者物价|采购经理人|贷款市场报价|社融|货币供应|存款准备金|社零|进出口|固投|外储|油价|成品油/i,
      /宏观数据|宏观经济指标|通胀率|降准|降息|国外宏观|行业指数|ISM制造业/,
    ],
    preferredTools: ['get_macro_series', 'get_market_regime'],
    avoidTools: ['get_market_dynamics', 'evaluate_instrument', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '宏观数字序列 → get_macro_series(scope/kind；中国翻页带 page)；勿用 regime 代替事实表；勿直接 invoke eastmoney emMacro*',
  },
  {
    intent: 'market_dynamics',
    // 高于 dragon_tiger(85)：同时问涨跌榜+龙虎榜时走全景，勿拆成 get_dragon_tiger
    priority: 86,
    patterns: [
      /涨跌榜|板块轮动|市场全景|全球市场|市场动态|盘面概览|今日复盘|盘面复盘|全景复盘/,
      /涨跌榜.{0,8}龙虎|龙虎榜.{0,8}涨跌/,
    ],
    preferredTools: ['get_market_dynamics', 'get_market_regime'],
    avoidTools: ['get_instrument_snapshot', 'get_dragon_tiger', 'get_limit_updown'],
    confidence: 'high',
    hint: '问涨跌榜/全景复盘 → get_market_dynamics（已含龙虎榜摘要）；专问龙虎榜明细才用 get_dragon_tiger',
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
    intent: 'sector_constituents',
    priority: 82,
    patterns: [/板块成分|行业成分|成分股列表|板块里有哪些|同板块股票|行业成分股/],
    preferredTools: ['get_sector_constituents', 'get_sector_list', 'search_instruments'],
    avoidTools: ['industry_mining', 'get_etf_holdings'],
    confidence: 'high',
    hint: '板块/行业成分 → get_sector_constituents（须 board_key/industry_code）；勿用 industry_mining 叙事代替',
  },
  {
    intent: 'sector_list',
    priority: 80,
    patterns: [/板块列表|行业列表|有哪些板块|申万行业|板块目录|行业分类目录/],
    preferredTools: ['get_sector_list', 'get_sector_constituents', 'industry_mining'],
    avoidTools: ['get_market_dynamics'],
    confidence: 'high',
    hint: '板块/行业目录 → get_sector_list；产业链上下游叙事仍用 industry_mining',
  },
  {
    intent: 'market_session',
    priority: 78,
    patterns: [/现在(开盘|休市|交易中)吗|是否开盘|交易时段|盘前还是盘后|市场开了吗|现在是盘中吗/],
    preferredTools: ['get_market_session', 'get_trade_calendar', 'get_current_time'],
    avoidTools: ['get_market_dynamics', 'get_morning_brief'],
    confidence: 'high',
    hint: '问是否开盘/时段 → get_market_session；完整交易日/休市 → get_trade_calendar',
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
    intent: 'balance_sheet',
    priority: 74,
    patterns: [/资产负债表|资产负债明细|总资产|总负债|股东权益|所有者权益|负债率明细/],
    preferredTools: ['get_instrument_balance_sheet', 'get_instrument_financials', 'get_instrument_snapshot'],
    avoidTools: ['evaluate_instrument', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '资产负债表 → 首选 get_instrument_balance_sheet；勿只用摘要 financials 代替完整表',
  },
  {
    intent: 'cash_flow_statement',
    priority: 74,
    patterns: [/现金流量表|经营现金流|筹资现金流|投资现金流|现金流明细|自由现金流/],
    preferredTools: ['get_instrument_cash_flow', 'get_instrument_financials', 'get_instrument_snapshot'],
    avoidTools: ['evaluate_instrument', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '现金流量表 → 首选 get_instrument_cash_flow',
  },
  {
    intent: 'income_statement',
    priority: 75,
    patterns: [/利润表|损益表|营业收入明细|营业成本|费用明细|三表/],
    preferredTools: [
      'get_instrument_income_statement',
      'get_instrument_balance_sheet',
      'get_instrument_cash_flow',
      'get_instrument_financials',
    ],
    avoidTools: ['evaluate_instrument', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '利润表/三表 → get_instrument_income_statement（及资产负债/现金流）；摘要不够时勿只调 financials',
  },
  {
    intent: 'financial_indicators',
    priority: 73,
    patterns: [/财务指标|盈利能力指标|偿债能力|营运能力|杜邦|roe明细|毛利率明细/i],
    preferredTools: ['get_instrument_financial_indicators', 'get_instrument_financials'],
    avoidTools: ['evaluate_instrument', 'get_cn_market_special', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '财务指标树 → get_instrument_financial_indicators（须 report）；勿走 get_cn_market_special',
  },
  {
    intent: 'trade_calendar',
    priority: 81,
    patterns: [/交易日历|交易日|休市日|下一交易日|哪天开市|节假日休市|A股日历/],
    preferredTools: ['get_trade_calendar', 'get_market_session', 'get_current_time'],
    avoidTools: ['get_morning_brief', 'get_market_dynamics'],
    confidence: 'high',
    hint: '交易日/休市 → get_trade_calendar；仅问是否盘中用 get_market_session',
  },
  {
    intent: 'index_constituents',
    priority: 83,
    patterns: [/指数成分|沪深300成分|上证50成分|中证500成分|指数里有哪些股|成分指数|同花顺概念成分/],
    preferredTools: ['get_index_constituents', 'get_sector_constituents', 'search_instruments'],
    avoidTools: ['get_etf_holdings', 'get_cn_market_special'],
    confidence: 'high',
    hint: '指数/同花顺概念成分 → get_index_constituents；目录用 get_cn_market_special(ths_index_list)',
  },
  {
    intent: 'dragon_tiger',
    priority: 85,
    patterns: [/龙虎榜|龙虎榜明细|龙虎榜营业部|营业部席位|游资席位|机构席位上榜|上龙虎榜的股/],
    preferredTools: ['get_dragon_tiger', 'get_market_dynamics'],
    avoidTools: ['get_instrument_snapshot'],
    confidence: 'high',
    hint: '专问龙虎榜 → get_dragon_tiger；若同时问涨跌榜/全景则优先 get_market_dynamics',
  },
  {
    intent: 'limit_updown',
    priority: 84,
    patterns: [/涨停池|跌停池|涨跌停列表|今日涨停股|涨停股有哪些|跌停股列表/],
    preferredTools: ['get_limit_updown', 'get_cn_market_special'],
    avoidTools: ['get_instrument_snapshot', 'get_market_dynamics'],
    confidence: 'high',
    hint: '涨跌停池 → get_limit_updown；连板天梯 → get_cn_market_special(kind=limit_up_ladder)',
  },
  {
    intent: 'market_sentiment',
    priority: 79,
    patterns: [/市场情绪|情绪指标|个股热度|热度得分|人气值/],
    preferredTools: ['get_market_sentiment', 'get_cn_market_special'],
    avoidTools: ['evaluate_instrument', 'get_market_dynamics'],
    confidence: 'high',
    hint: '情绪/热度 → get_market_sentiment；飙升榜用 get_cn_market_special(kind=skyrocket)',
  },
  {
    intent: 'cn_market_special',
    priority: 83,
    patterns: [
      /连板天梯|连板梯队|晋级之路|热度飙升|飙升榜|历史热股|热股榜|热榜走势|个股异动|异动原因|涨停异动|同花顺概念|同花顺板块|同花顺指数/,
    ],
    preferredTools: ['get_cn_market_special', 'get_sector_list'],
    avoidTools: [
      'get_instrument_snapshot',
      'evaluate_instrument',
      'get_instrument_financial_indicators',
      'get_index_constituents',
      'get_market_dynamics',
    ],
    confidence: 'high',
    hint: '连板天梯/热股/异动/同花顺概念目录 → get_cn_market_special；成分股改 get_index_constituents',
  },
  {
    intent: 'financials',
    priority: 72,
    patterns: [/营收|净利润|ROE|财报|财务|同比|毛利率|每股收益|\bEPS\b/i],
    preferredTools: [
      'get_instrument_financials',
      'get_instrument_income_statement',
      'get_instrument_balance_sheet',
      'get_instrument_cash_flow',
      'get_instrument_snapshot',
    ],
    avoidTools: ['evaluate_instrument', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '财务摘要 → get_instrument_financials；明细三表与指标用专用工具',
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
    avoidTools: ['evaluate_instrument', 'get_instrument_institution_holdings'],
    confidence: 'high',
    hint: '十大股东/股本 → get_instrument_shareholders；季报机构持仓改 get_instrument_institution_holdings',
  },
  {
    intent: 'institution_holdings',
    priority: 70,
    patterns: [
      /机构持仓|基金持仓|QFII|社保持仓|券商持仓|保险持仓|信托持仓|主力数据|持股明细|机构持股一览/i,
      /公募持仓|机构汇总持仓/,
    ],
    preferredTools: ['get_instrument_institution_holdings', 'get_instrument_shareholders'],
    avoidTools: ['evaluate_instrument', 'invoke_provider_custom_method'],
    confidence: 'high',
    hint: '季报机构持仓 → get_instrument_institution_holdings(scope=overview|detail)；勿用十大股东代替',
  },
  {
    intent: 'money_flow',
    priority: 69,
    patterns: [/资金流|资金净流入|主力.*净流入|北向资金|资金进出|散户资金/],
    preferredTools: ['get_instrument_money_flow', 'get_instrument_snapshot', 'get_market_dynamics'],
    avoidTools: ['evaluate_instrument'],
    confidence: 'high',
    hint: '个股资金流向 → get_instrument_money_flow；全市场资金概况才用 get_market_dynamics',
  },
  {
    intent: 'instrument_notices',
    priority: 90,
    patterns: [/公告列表|公司公告|披露公告|最新公告|年报.*公告|临时公告|查看公告|标的公告|个股公告/],
    preferredTools: ['get_instrument_notices', 'get_notice_content', 'get_instrument_snapshot'],
    avoidTools: ['list_news_articles', 'evaluate_instrument'],
    confidence: 'high',
    hint: '标的公告列表 → get_instrument_notices；读全文再用 get_notice_content(url)',
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
    hint: '自定义数据源 → list → invoke；标准三表/日历勿走 custom',
  },
  {
    intent: 'depth_analysis',
    priority: 40,
    patterns: [/分析|评估|评分|打分|值得买|好不好|深度|怎么看|研究一下|全面看看/],
    preferredTools: [
      'search_instruments',
      'get_instrument_snapshot',
      'get_instrument_financials',
      'get_instrument_income_statement',
      'get_instrument_balance_sheet',
      'get_instrument_cash_flow',
      'get_instrument_profile',
      'evaluate_instrument',
      'get_instrument_strategy_signal',
    ],
    avoidTools: ['get_instrument_quotes'],
    confidence: 'medium',
    hint: '深度分析：snapshot → 三表/摘要/profile 事实表 → evaluate',
  },
  {
    intent: 'etf_general',
    priority: 38,
    patterns: [/\bETF\b|场内基金|联接基金/i],
    preferredTools: ['search_instruments', 'get_instrument_snapshot', 'get_etf_profile', 'get_etf_nav', 'get_etf_holdings'],
    avoidTools: ['get_portfolio_holdings'],
    confidence: 'medium',
    hint: 'ETF 综合：search/snapshot/profile；明确净值用 get_etf_nav，成分用 get_etf_holdings',
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
  { prefer: 'get_instrument_balance_sheet', avoid: 'get_instrument_financials', when: '要资产负债表明细而非摘要' },
  { prefer: 'get_instrument_cash_flow', avoid: 'get_instrument_financials', when: '要现金流量表明细而非摘要字段' },
  { prefer: 'get_instrument_income_statement', avoid: 'get_instrument_financials', when: '要利润表明细而非摘要' },
  { prefer: 'get_trade_calendar', avoid: 'get_market_session', when: '要交易日/休市列表而非仅是否盘中' },
  { prefer: 'get_index_constituents', avoid: 'get_sector_constituents', when: '问指数成分而非申万/板块 key 成分' },
  { prefer: 'get_index_constituents', avoid: 'get_cn_market_special', when: '问成分股而非同花顺专题/目录' },
  { prefer: 'get_dragon_tiger', avoid: 'get_market_dynamics', when: '专问龙虎榜明细/指定日，而非涨跌榜+全景' },
  { prefer: 'get_market_dynamics', avoid: 'get_dragon_tiger', when: '同时要涨跌榜/全景摘要（已含龙虎榜）' },
  { prefer: 'get_limit_updown', avoid: 'get_cn_market_special', when: '要涨跌停池而非连板天梯' },
  { prefer: 'get_market_sentiment', avoid: 'get_cn_market_special', when: '要情绪摘要而非飙升/热股榜' },
  { prefer: 'get_instrument_financial_indicators', avoid: 'get_cn_market_special', when: '财务指标树用专用工具' },
  { prefer: 'get_instrument_profile', avoid: 'evaluate_instrument', when: '只要公司概况/概念，不做评分' },
  { prefer: 'get_instrument_financials', avoid: 'invoke_provider_custom_method', when: '标准 financials 已覆盖' },
  { prefer: 'get_instrument_balance_sheet', avoid: 'invoke_provider_custom_method', when: '标准 balance_sheet 已覆盖' },
  { prefer: 'get_instrument_cash_flow', avoid: 'invoke_provider_custom_method', when: '标准 cash_flow 已覆盖' },
  { prefer: 'get_instrument_income_statement', avoid: 'invoke_provider_custom_method', when: '标准 income_statement 已覆盖' },
  { prefer: 'get_cn_market_special', avoid: 'get_market_dynamics', when: '问连板天梯/热股/异动而非全景涨跌榜' },
  { prefer: 'get_sector_list', avoid: 'get_cn_market_special', when: '标准申万/板块目录而非同花顺概念指数' },
  { prefer: 'get_instrument_money_flow', avoid: 'get_market_dynamics', when: '问单只资金流向而非大盘全景' },
  { prefer: 'get_instrument_notices', avoid: 'list_news_articles', when: '问该标的官方公告列表而非 RSS 资讯' },
  { prefer: 'get_instrument_snapshot', avoid: 'get_instrument_quotes', when: '需要综合快照（行情+概况），不止最新价' },
  { prefer: 'evaluate_instrument', avoid: 'get_trend_brief', when: '需要评分卡/系统评估，而非一句话趋势' },
  { prefer: 'get_trend_brief', avoid: 'evaluate_instrument', when: '只要 A 股趋势快评' },
  { prefer: 'get_etf_nav', avoid: 'get_instrument_quotes', when: '问 ETF 净值/溢价序列' },
  { prefer: 'get_etf_holdings', avoid: 'get_portfolio_holdings', when: '问 ETF 成分而非个人持仓' },
  { prefer: 'get_etf_profile', avoid: 'get_instrument_profile', when: '问 ETF 档案而非股票公司概况' },
  { prefer: 'get_sector_list', avoid: 'industry_mining', when: '只要板块/行业目录而非产业链叙事' },
  { prefer: 'get_sector_constituents', avoid: 'get_etf_holdings', when: '问股票板块成分而非 ETF 持仓' },
  { prefer: 'get_market_session', avoid: 'get_morning_brief', when: '只问是否开盘/时段' },
  { prefer: 'get_portfolio_holdings', avoid: 'get_watchlist', when: '问实盘持仓而非关注列表' },
  { prefer: 'get_macro_series', avoid: 'get_market_regime', when: '要 CPI/PPI/LPR/社零/国外宏观等数字序列而非牛熊叙事' },
  { prefer: 'get_macro_series', avoid: 'invoke_provider_custom_method', when: '宏观序列有标准 get_macro_series（含国外/行业/油价）' },
  { prefer: 'get_market_regime', avoid: 'get_macro_series', when: '问牛熊/风险偏好而非具体宏观指标数字' },
  { prefer: 'get_market_regime', avoid: 'get_trend_brief', when: '问大盘牛熊而非单股' },
  { prefer: 'list_news_articles', avoid: 'get_instrument_snapshot', when: '主任务是读资讯而非个股快照' },
  { prefer: 'industry_mining', avoid: 'search_instruments', when: '先做产业链，再搜代表公司' },
  { prefer: 'search_instruments', avoid: 'evaluate_instrument', when: '代码未确认时禁止先评估' },
  { prefer: 'list_workspace_grants', avoid: 'get_project_info', when: '问可访问目录/授权工作区而非运行环境' },
  { prefer: 'list_workspace_grants', avoid: 'get_system_info', when: '问文件访问范围而非系统信息' },
  { prefer: 'browser_navigate', avoid: 'list_news_articles', when: '用户给出外部 URL 而非读订阅资讯' },
  { prefer: 'browser_snapshot', avoid: 'get_instrument_snapshot', when: '读取外部网页而非标的快照' },
  { prefer: 'browser_snapshot', avoid: 'get_news_article', when: '外部网页内容而非 RSS 资讯正文' },
  { prefer: 'list_news_articles', avoid: 'browser_navigate', when: '浏览订阅资讯而非任意 URL' },
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
  'balance_sheet',
  'cash_flow_statement',
  'income_statement',
  'financial_indicators',
  'trade_calendar',
  'macro_series',
  'index_constituents',
  'dragon_tiger',
  'limit_updown',
  'market_sentiment',
  'profile',
  'shareholders',
  'institution_holdings',
  'dividend',
  'money_flow',
  'instrument_notices',
  'market_session',
  'cn_market_special',
  'sector_list',
  'sector_constituents',
  'etf_profile',
  'etf_nav',
  'etf_holdings',
  'web_snapshot_only',
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
 *
 * @param opts.remoteFirst 远程 MCP（命名空间 `server__tool`）工具整体排在本地工具之前，
 *   仅在组内应用 preferred 排序；命名空间工具用其基础工具名匹配 preferred。
 *   本地工具是兜底，故永远排在远程之后。
 */
export function orderToolsByPreference<T extends { function?: { name?: string }; name?: string }>(
  tools: T[],
  preferredTools: readonly string[],
  opts?: { remoteFirst?: boolean },
): T[] {
  const remoteFirst = opts?.remoteFirst ?? false
  if (!preferredTools.length && !remoteFirst) return tools
  const rank = new Map(preferredTools.map((n, i) => [n, i]))
  const nameOf = (t: T) => t.function?.name ?? t.name ?? ''
  // 命名空间工具（server__tool）视为远程；用基础工具名匹配 preferred。
  const baseName = (full: string) => parseNamespacedMcpTool(full)?.toolName ?? full
  const isRemote = (full: string) => parseNamespacedMcpTool(full) != null
  const rankOf = (full: string) => {
    if (rank.has(full)) return rank.get(full)!
    const base = baseName(full)
    return rank.has(base) ? rank.get(base)! : 1000
  }
  return [...tools].sort((a, b) => {
    const na = nameOf(a)
    const nb = nameOf(b)
    if (remoteFirst) {
      const ga = isRemote(na) ? 0 : 1
      const gb = isRemote(nb) ? 0 : 1
      if (ga !== gb) return ga - gb
    }
    return rankOf(na) - rankOf(nb) || na.localeCompare(nb)
  })
}
