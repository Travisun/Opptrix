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
    intent: 'session_documents',
    priority: 97,
    patterns: [
      /(?:这份|这两份|附件|本会话|本对话|刚上传|拖入).*(?:研报|研究报告|PDF|报告)/,
      /(?:研报|研究报告|PDF|报告).*(?:这份|这两份|附件|本会话|本对话|刚上传|拖入)/,
      /对比.*(?:PDF|研报|报告)|(?:PDF|研报|报告).*对比/,
      /(?:评级|目标价).*(?:这份|附件).*(?:研报|报告|PDF)|(?:这份|附件).*(?:研报|报告|PDF).*(?:评级|目标价)/,
      /(?:阅读|分析|解读).*(?:这份|这两份|附件).*(?:研报|PDF|报告)/,
      /list_session_documents|search_document|read_document/i,
    ],
    preferredTools: ['list_session_documents', 'search_document', 'read_document'],
    avoidTools: ['workspace_read', 'browser_navigate', 'get_instrument_institution_report', 'search_library'],
    confidence: 'high',
    hint: '分析/对比本会话附件研报 → 先 list_session_documents，再 search_document / read_document；引用时带文件名与页码；勿灌全文',
  },
  {
    intent: 'library_search',
    priority: 98,
    patterns: [
      /主题摘要|相关主题|知识关联|关联主题|主题关联/,
      /跨.*(?:研报|资讯|文档)|(?:研报|资讯).*(?:关联|串联|打通)/,
      /全库|知识库.*(?:检索|搜索|找)/,
      /哪些(?:研报|报告|文档).*(?:提到|涉及|谈到|关于)/,
      /(?:提到|涉及|谈到).*(?:哪些|哪些份).*(?:研报|报告|文档)/,
      /关联(?:公司|标的|股票|主题)/,
      /同主题|相同主题/,
      /(?:实体|知识图谱|主题图谱)/,
      /search_library/i,
    ],
    preferredTools: ['search_library', 'read_document'],
    avoidTools: ['list_news_articles', 'workspace_read', 'list_session_documents', 'search_document'],
    confidence: 'high',
    hint: '跨会话/跨研报 → 先 search_library 找片段；命中后 read_document(document_id) 精读；可换关键词多跳；勿灌全文',
  },
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
    intent: 'create_skill',
    priority: 94,
    patterns: [
      /(?:创建|新建|建|写|定制|制作).*(?:工作流)?技能/,
      /(?:工作流)?技能.*(?:创建|新建|建|写|定制)/,
      /帮我.*(?:一个|个)?(?:工作流)?技能/,
      /create[-\s]?skill/i,
    ],
    preferredTools: ['activate_agent_skill', 'get_agent_skill', 'create_agent_skill'],
    avoidTools: ['list_tool_packs', 'activate_tool_pack', 'import_agent_skill'],
    confidence: 'high',
    hint: '创建工作流技能 → 先 activate_agent_skill(create-skill)；再按技能步骤 create_agent_skill（ask_user + confirmed=true）',
  },
  {
    intent: 'agent_skills',
    priority: 91,
    patterns: [
      /工作流技能|技能目录|激活.*(?:工作流)?技能/,
      /用(?:一下)?工作流/,
      /list_agent_skills|activate_agent_skill/i,
      /agent\s*skills?/i,
    ],
    preferredTools: ['list_agent_skills', 'activate_agent_skill', 'get_agent_skill'],
    avoidTools: ['list_tool_packs', 'activate_tool_pack'],
    confidence: 'high',
    hint: '工作流技能 → list_agent_skills 再 activate_agent_skill；勿与工具包、专家「技能专长」混淆',
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
    intent: 'news_source_delete',
    // 高于 news_browse(86)；与分组删除区分
    priority: 93,
    patterns: [
      /(?:删除|移除).*(?:订阅源|资讯订阅|RSS\s*订阅)/i,
      /(?:订阅源|资讯订阅|RSS\s*订阅).*(?:删除|移除)/i,
      /删除(?:这个|该)?订阅(?!.*分组)/,
      /取消订阅/,
    ],
    preferredTools: ['delete_news_source', 'list_news_sources', 'ask_user'],
    avoidTools: ['delete_news_group', 'list_news_articles', 'get_instrument_snapshot'],
    confidence: 'high',
    hint: '删除订阅 → delete_news_source；须 ask_user 后 confirmed=true；勿删分组',
  },
  {
    intent: 'news_group_delete',
    priority: 93,
    patterns: [
      /(?:删除|移除).*(?:资讯)?分组/,
      /(?:资讯)?分组.*(?:删除|移除)/,
    ],
    preferredTools: ['delete_news_group', 'list_news_groups', 'ask_user'],
    avoidTools: ['delete_news_source', 'list_news_articles'],
    confidence: 'high',
    hint: '删除分组 → delete_news_group；须 ask_user 后 confirmed=true；组内订阅变未分组',
  },
  {
    intent: 'news_sources_import',
    priority: 92,
    patterns: [
      /(?:导入).*(?:订阅|RSS)/i,
      /(?:订阅).*(?:导入)/,
      /批量.*(?:添加|导入).*(?:订阅|RSS)/i,
    ],
    preferredTools: ['import_news_sources', 'list_news_sources', 'ask_user'],
    avoidTools: ['add_news_source', 'list_news_articles'],
    confidence: 'high',
    hint: '批量导入订阅 → import_news_sources；须 ask_user 后 confirmed=true',
  },
  {
    intent: 'news_group_create',
    priority: 91,
    patterns: [
      /(?:创建|新建).*(?:资讯)?分组/,
      /(?:资讯)?分组.*(?:创建|新建)/,
    ],
    preferredTools: ['create_news_group', 'list_news_groups', 'move_news_source'],
    avoidTools: ['add_news_source', 'list_news_articles'],
    confidence: 'high',
    hint: '新建资讯分组 → create_news_group；随后可用 move_news_source 归类',
  },
  {
    intent: 'news_group_update',
    priority: 91,
    patterns: [
      /(?:重命名|改名).*(?:资讯)?分组/,
      /(?:资讯)?分组.*(?:重命名|改名|改叫)/,
      /调整.*(?:资讯)?分组.*排序/,
    ],
    preferredTools: ['update_news_group', 'list_news_groups'],
    avoidTools: ['create_news_group', 'list_news_articles'],
    confidence: 'high',
    hint: '改分组名/排序 → update_news_group',
  },
  {
    intent: 'news_source_move',
    priority: 90,
    patterns: [
      /(?:移动|移到|换到).*(?:订阅|来源)/,
      /(?:订阅|来源).*(?:移动|移到|换组|换到.*分组)/,
      /把.*订阅.*(?:移|放到).*(?:分组|组)/,
    ],
    preferredTools: ['move_news_source', 'list_news_sources', 'list_news_groups'],
    avoidTools: ['list_news_articles', 'create_news_group'],
    confidence: 'high',
    hint: '移动订阅到分组 → move_news_source；先 list 拿到 id',
  },
  {
    intent: 'rsshub_catalog',
    // 高于 news_source_add(90)：问「有哪些 RSS / 路由目录」先查内置目录
    priority: 91,
    patterns: [
      /RSSHub/i,
      /路由目录/,
      /有哪些.*(?:RSSHub|订阅源|RSS\s*源)/i,
      /财联社.*RSS/i,
      /(?:搜|查|找).*(?:RSSHub|路由).*(?:订阅|源|path)/i,
    ],
    preferredTools: [
      'list_rsshub_categories',
      'list_rsshub_domains',
      'get_rsshub_domain_routes',
      'search_rsshub_routes',
    ],
    avoidTools: ['list_news_articles', 'browser_navigate', 'get_instrument_snapshot'],
    confidence: 'high',
    hint: '查 RSS 路由 → 三级漏斗 list_rsshub_categories → list_rsshub_domains → get_rsshub_domain_routes（拉平叶子多选）；用户已点名媒体才用 search_rsshub_routes',
  },
  {
    intent: 'news_source_add',
    priority: 90,
    patterns: [
      /(?:添加|新增|加入).*(?:订阅|RSS|Atom)/i,
      /(?:订阅|RSS).*(?:添加|新增)/i,
      /订阅.*(?:地址|链接|URL)/i,
    ],
    preferredTools: [
      'list_rsshub_categories',
      'list_rsshub_domains',
      'get_rsshub_domain_routes',
      'add_news_source',
      'validate_news_source',
      'list_news_sources',
    ],
    avoidTools: ['import_news_sources', 'list_news_articles', 'get_instrument_snapshot'],
    confidence: 'high',
    hint: '添加订阅：三级漏斗分类→网站→拉平多选订阅项后再 add_news_source；禁止先选路由再选频道；已知 URL 直接 add；批量用 import_news_sources',
  },
  {
    intent: 'news_source_validate',
    priority: 89,
    patterns: [
      /(?:验证|检查).*(?:RSS|订阅).*(?:地址|链接|源|URL)?/i,
      /(?:RSS|订阅).*(?:地址|链接).*(?:验证|检查|能不能用)/i,
    ],
    preferredTools: ['validate_news_source', 'add_news_source'],
    avoidTools: ['list_news_articles'],
    confidence: 'high',
    hint: '验证订阅地址 → validate_news_source（不写入）；通过后再 add_news_source',
  },
  {
    intent: 'news_manage',
    // 宽泛兜底，仍高于 news_browse(86)
    priority: 87,
    patterns: [
      /管理.*(?:订阅|资讯分组)/,
      /(?:订阅源|资讯分组).*(?:管理|设置)/,
    ],
    preferredTools: ['list_news_sources', 'list_news_groups', 'add_news_source'],
    avoidTools: ['list_news_articles', 'get_instrument_snapshot', 'evaluate_instrument'],
    confidence: 'medium',
    hint: '管理订阅/分组：先 list_news_sources/list_news_groups，再选 add/create/delete/move/import',
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
    intent: 'schedule_create',
    priority: 90,
    patterns: [
      /(?:创建|新建|添加).*(?:计划任务|定时任务)/,
      /(?:计划任务|定时任务).*(?:创建|新建|添加)/,
      /每天.*(?:分析|提醒|运行).*(?:计划|定时)/,
    ],
    preferredTools: ['create_scheduled_job', 'list_scheduled_jobs'],
    avoidTools: ['get_instrument_snapshot', 'shell_run'],
    confidence: 'high',
    hint: '新建计划任务 → create_scheduled_job；先确认调度规则与提示词',
  },
  {
    intent: 'schedule_manage',
    priority: 88,
    patterns: [
      /计划任务|定时任务|定时执行|定时分析|定时提醒|自动执行/,
      /(?:删除|暂停|启用|列出|查看).*(?:计划|定时)/,
    ],
    preferredTools: ['list_scheduled_jobs', 'create_scheduled_job', 'get_scheduled_job'],
    avoidTools: ['get_instrument_snapshot', 'shell_run'],
    confidence: 'high',
    hint: '计划任务 → list/create/update/enable/disable；立刻执行用 run_scheduled_job_now；勿用 shell_run 代替',
  },
  {
    intent: 'schedule_run_now',
    priority: 89,
    patterns: [
      /(?:立刻|马上|现在).*(?:执行|运行).*(?:计划|定时)/,
      /(?:跑|执行)一次.*计划任务/,
    ],
    preferredTools: ['run_scheduled_job_now', 'list_scheduled_jobs'],
    avoidTools: ['shell_run', 'evaluate_instrument'],
    confidence: 'high',
    hint: '立即执行计划任务 → run_scheduled_job_now；先 list 拿 job_id',
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
    intent: 'create_canvas',
    priority: 88,
    patterns: [
      /画布|可视化报告|报告可视化|分页报告|投研画布|create_canvas/i,
      /(?:做成|生成|创建).*(?:可视化|画布|可预览).*(?:报告|版面|卡片)/,
      /(?:可视化|画布).*(?:做成|生成|创建)/,
    ],
    preferredTools: ['create_canvas', 'update_canvas', 'read_canvas'],
    avoidTools: ['workspace_write', 'create_mindmap'],
    confidence: 'high',
    hint: '画布/报告可视化 → create_canvas；勿用 workspace_write 代替；用户可在消息中点击预览',
  },
  {
    intent: 'create_mindmap',
    priority: 88,
    patterns: [
      /脑图|思维导图|主题树|知识树|create_mindmap/i,
      /(?:做成|生成|创建).*(?:脑图|思维导图)/,
      /(?:脑图|思维导图).*(?:做成|生成|创建)/,
    ],
    preferredTools: ['create_mindmap', 'update_mindmap', 'read_mindmap'],
    avoidTools: ['workspace_write', 'create_canvas'],
    confidence: 'high',
    hint: '脑图/思维导图 → create_mindmap；勿用 workspace_write 代替',
  },
  {
    intent: 'python_env',
    priority: 92,
    patterns: [
      /python.*环境|检查.*python|python.*版本|有没有.*python|python.*就绪/i,
      /ensure_python|python_env_status/i,
    ],
    preferredTools: ['python_env_status', 'ensure_python', 'shell_platform_status'],
    avoidTools: ['get_system_info'],
    confidence: 'high',
    hint: '问 Python 环境/版本 → python_env_status；运行脚本前 ensure_python（会等待托管安装完成并优先托管）',
  },
  {
    intent: 'workspace_network_latency',
    priority: 91,
    patterns: [
      /测一下.*延迟/,
      /网络延迟/,
      /(?:网站|站点|服务器).*(?:延迟|连通|可达|快慢)/,
      /到.*(?:百度|google|网站).*(?:延迟|连通|速度)/i,
      /连通性(?:测试|检查)?/,
    ],
    preferredTools: ['http_fetch', 'shell_run', 'shell_platform_status', 'activate_tool_pack'],
    avoidTools: ['workspace_write', 'get_instrument_quotes'],
    confidence: 'high',
    hint: '测网站延迟/连通性 → 优先 http_fetch 测 HTTP 耗时；用户明确要求 ICMP 时用 shell_run + ping；先 get_system_info 再按平台组 argv',
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
      /\bping\b/i,
      /\btraceroute\b/i,
      /\btracert\b/i,
      /运行(?:一下|这段)?\s*(?:python|py|node|js|脚本|代码)/i,
      /执行(?:命令|shell|终端|脚本)/i,
      /运行命令/,
      /(?:python|py).*(?:跑|执行)/i,
      /npm\s+install|pip\s+install/i,
      /shell_run/i,
      /\bshell\b/i,
    ],
    preferredTools: ['shell_run', 'http_fetch', 'shell_platform_status', 'activate_tool_pack'],
    avoidTools: ['workspace_write'],
    confidence: 'high',
    hint: '运行命令 → shell_run（系统隔离）；先 get_system_info 再按平台组 argv（darwin/linux ping -c + traceroute；win32 ping -n + tracert）；测网站延迟优先 http_fetch',
  },
  {
    intent: 'local_data_catalog',
    priority: 94,
    patterns: [
      /本地(?:数据|API|能力)(?:目录|清单|有哪些)/,
      /list_local_data_apis|get_local_data_catalog/i,
      /有哪些(?:本地|标准层)(?:数据)?(?:\s)?(?:API|能力|接口|目录|清单)/,
      /公共(?:复用)?包|shared\/packages/i,
    ],
    preferredTools: ['list_local_data_apis', 'get_local_data_catalog', 'list_workspace_grants'],
    avoidTools: ['get_project_info', 'get_system_info'],
    confidence: 'high',
    hint: '查本地/标准 API → list_local_data_apis → get_local_data_catalog；公共包扫 shared/packages',
  },
  {
    intent: 'fuyao_dump',
    priority: 94,
    patterns: [
      /扶摇.*(?:dump|数据包|parquet)/i,
      /(?:全量|增量).*(?:日K|K线).*(?:包|dump|parquet)/i,
      /prepare_fuyao_dump|adjustment_factors|复权因子.*(?:包|dump)/i,
      /下载.*(?:parquet|离线(?:行情|K线))/i,
    ],
    preferredTools: ['prepare_fuyao_dump', 'list_local_data_apis', 'workspace_list'],
    avoidTools: ['http_fetch', 'shell_run'],
    confidence: 'high',
    hint: '扶摇离线 dump → prepare_fuyao_dump 落盘 shared；禁止 Key 进沙盒，勿 sync/dailyDump',
  },
  {
    intent: 'session_lan',
    priority: 93,
    patterns: [
      /局域网|内网(?:访问|API|地址)|NAS|192\.168\./i,
      /request_session_lan_access|allow_lan_session/i,
      /本对话.*(?:允许|授权).*局域网/,
    ],
    preferredTools: ['request_session_lan_access', 'ask_user', 'http_fetch'],
    avoidTools: ['browser_navigate'],
    confidence: 'high',
    hint: '需局域网 → request_session_lan_access 或 ask_user（allow_lan_session）；有效 LAN=全局||会话',
  },
  {
    intent: 'secret_vault',
    priority: 95,
    patterns: [
      /密钥保险箱|保险箱.*密钥|存入保险箱/,
      /(?:录入|保存|写入).*(?:数据密钥|密钥|口令)/,
      /request_secret|list_vault_secrets|grant_session_secret/i,
      /API\s*密钥|第三方密钥|脚本.*密钥|不要.*粘贴.*密钥/i,
    ],
    preferredTools: ['request_secret', 'list_vault_secrets', 'grant_session_secret'],
    avoidTools: ['ask_user'],
    confidence: 'high',
    hint: '第三方密钥 → request_secret 写入保险箱；已有则 list_vault_secrets + grant_session_secret；禁止 ask_user 收密钥',
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
    intent: 'workspace_message_uri',
    priority: 91,
    patterns: [
      /(?:消息|回复|聊天)(?:里|中)?(?:引用|插入|贴上|展示).*(?:工作区|图片|文件|视频|音频)/,
      /(?:引用|展示).*(?:工作区).*(?:图片|文件|视频|音频)|opptrix-ws:\/\//i,
      /resolve_workspace_path_uri/i,
    ],
    preferredTools: ['resolve_workspace_path_uri', 'workspace_list', 'list_workspace_grants'],
    avoidTools: ['browser_navigate', 'create_canvas'],
    confidence: 'high',
    hint: '消息内引用工作区文件 → resolve_workspace_path_uri 得到 opptrix-ws://；禁止 file:// 与绝对路径',
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
    preferredTools: ['activate_agent_skill', 'list_agent_skills', 'get_market_dynamics'],
    avoidTools: ['get_market_session'],
    confidence: 'high',
    hint: '早报/盘前 → 激活工作流技能 morning-market-brief；勿用 get_market_session 代替',
  },
  {
    intent: 'closing_report',
    priority: 80,
    patterns: [/收盘报告|收盘复盘|尾盘总结/],
    preferredTools: ['activate_agent_skill', 'list_agent_skills', 'get_market_dynamics'],
    avoidTools: ['get_market_session'],
    confidence: 'high',
    hint: '收盘复盘 → 激活工作流技能 closing-market-brief',
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
    avoidTools: ['get_etf_holdings'],
    confidence: 'high',
    hint: '板块/行业成分 → get_sector_constituents（须 board_key/industry_code）；勿用产业链叙事代替',
  },
  {
    intent: 'sector_list',
    priority: 80,
    patterns: [/板块列表|行业列表|有哪些板块|申万行业|板块目录|行业分类目录/],
    preferredTools: ['get_sector_list', 'get_sector_constituents'],
    avoidTools: ['get_market_dynamics'],
    confidence: 'high',
    hint: '板块/行业目录 → get_sector_list；产业链上下游叙事激活工作流技能 industry-chain',
  },
  {
    intent: 'market_session',
    priority: 78,
    patterns: [/现在(开盘|休市|交易中)吗|是否开盘|交易时段|盘前还是盘后|市场开了吗|现在是盘中吗/],
    preferredTools: ['get_market_session', 'get_trade_calendar', 'get_current_time'],
    avoidTools: ['get_market_dynamics'],
    confidence: 'high',
    hint: '问是否开盘/时段 → get_market_session；完整交易日/休市 → get_trade_calendar',
  },
  {
    intent: 'industry',
    priority: 76,
    patterns: [/产业链|上下游|行业透视|主题观察池|行业图谱|mermaid/i],
    preferredTools: ['activate_agent_skill', 'list_agent_skills', 'get_sector_list'],
    avoidTools: ['search_instruments'],
    confidence: 'high',
    hint: '产业链/上下游 → 激活工作流技能 industry-chain（含内置知识库）；代表公司再用 search_instruments',
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
    avoidTools: ['get_market_dynamics'],
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
  { prefer: 'activate_agent_skill', avoid: 'create_agent_skill', when: '用户要新建/定制工作流技能 → 先 activate create-skill 引导，勿直接 create 跳过步骤' },
  { prefer: 'activate_agent_skill', avoid: 'import_agent_skill', when: '从零创建工作流技能 → 用 create-skill 引导，勿直接 import' },
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
  { prefer: 'get_sector_list', avoid: 'activate_agent_skill', when: '只要板块/行业目录而非产业链叙事' },
  { prefer: 'get_sector_constituents', avoid: 'get_etf_holdings', when: '问股票板块成分而非 ETF 持仓' },
  { prefer: 'get_market_session', avoid: 'activate_agent_skill', when: '只问是否开盘/时段' },
  { prefer: 'get_portfolio_holdings', avoid: 'get_watchlist', when: '问实盘持仓而非关注列表' },
  { prefer: 'get_macro_series', avoid: 'get_market_regime', when: '要 CPI/PPI/LPR/社零/国外宏观等数字序列而非牛熊叙事' },
  { prefer: 'get_macro_series', avoid: 'invoke_provider_custom_method', when: '宏观序列有标准 get_macro_series（含国外/行业/油价）' },
  { prefer: 'get_market_regime', avoid: 'get_macro_series', when: '问牛熊/风险偏好而非具体宏观指标数字' },
  { prefer: 'get_market_regime', avoid: 'get_trend_brief', when: '问大盘牛熊而非单股' },
  { prefer: 'list_news_articles', avoid: 'get_instrument_snapshot', when: '主任务是读资讯而非个股快照' },
  { prefer: 'activate_agent_skill', avoid: 'search_instruments', when: '先做产业链（industry-chain 技能），再搜代表公司' },
  { prefer: 'search_instruments', avoid: 'evaluate_instrument', when: '代码未确认时禁止先评估' },
  { prefer: 'list_workspace_grants', avoid: 'get_project_info', when: '问可访问目录/授权工作区而非运行环境' },
  { prefer: 'list_workspace_grants', avoid: 'get_system_info', when: '问文件访问范围而非系统信息' },
  { prefer: 'browser_navigate', avoid: 'list_news_articles', when: '用户给出外部 URL 而非读订阅资讯' },
  { prefer: 'browser_snapshot', avoid: 'get_instrument_snapshot', when: '读取外部网页而非标的快照' },
  { prefer: 'browser_snapshot', avoid: 'get_news_article', when: '外部网页内容而非 RSS 资讯正文' },
  { prefer: 'list_news_articles', avoid: 'browser_navigate', when: '浏览订阅资讯而非任意 URL' },
  { prefer: 'list_scheduled_jobs', avoid: 'shell_run', when: '管理或查看计划任务而非临时跑脚本' },
  { prefer: 'run_scheduled_job_now', avoid: 'shell_run', when: '执行已登记的计划任务' },
  { prefer: 'create_scheduled_job', avoid: 'shell_run', when: '用户要定时重复执行而非一次性命令' },
  { prefer: 'search_library', avoid: 'search_document', when: '跨会话/跨研报检索 → search_library，勿用 search_document 单篇检索' },
  { prefer: 'search_library', avoid: 'list_session_documents', when: '问哪些研报提到某标的/跨研报主题 → search_library，非本会话附件列表' },
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
  'create_canvas',
  'create_mindmap',
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
    lines.push('- 首选工具已在本轮 tools 中：直接调用，勿仅为开工再 activate_tool_pack；结果不够再扩业务 pack，或 activate workspace 用沙盒编程补齐')
    if (plan.researchTier === 'L1') {
      lines.push('- L1：证据足够即停，禁止为「看起来专业」继续堆工具')
    } else {
      lines.push('- 若首选结果已足够回答用户，停止继续堆工具；不足再沿顺序下调')
    }
  } else {
    lines.push('- 当前 tools 列表中尚无意图对应工具，按阶梯处理：')
    lines.push('  1) list_tool_packs 查看是否有匹配的业务 pack')
    lines.push('  2) 有则 activate_tool_pack 加载对应 pack 后重试')
    lines.push(
      '  3) 仍无匹配或激活后仍不够 → activate_tool_pack([\'workspace\'])，用 shell_run / ensure_python / workspace_* 编程完成（可与已有数据工具结合）；勿空转 activate 无关 pack，勿直接声称无法完成',
    )
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

  lines.push(
    '- 禁止调用未出现在本轮 tools 参数中的工具名；缺能力时先 activate 对应业务 pack，标准工具仍不够则 activate workspace 用沙盒编程实现',
  )
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
