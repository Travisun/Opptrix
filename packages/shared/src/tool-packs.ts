/**
 * Agent MCP 工具包（Tool Pack）注册表 — 聊天路由加载的单一事实源。
 *
 * 约定：每个工具恰好属于一个主 pack；core / meta 每轮始终加载。
 * Discover 挖掘组可引用同一 pack 定义，避免双源漂移。
 */

export const TOOL_PACK_IDS = [
  'core',
  'meta',
  'instrument_analytics',
  'fundamentals',
  'market',
  'etf',
  'portfolio',
  'industry',
  'news',
  'browser',
  'workspace',
  'strategy_extra',
  'provider_ext',
  'automation',
  'artifacts',
] as const

export type ToolPackId = (typeof TOOL_PACK_IDS)[number]

export interface ToolPackDef {
  id: ToolPackId
  title: string
  /** 一句话说明（system pack 目录） */
  description: string
  /** 何时 activate / 何时播种 */
  whenToUse: string
  /** 每轮始终加载 */
  alwaysOn?: boolean
}

export const TOOL_PACK_DEFS: readonly ToolPackDef[] = [
  {
    id: 'core',
    title: '核心查询',
    description: '搜索、快照、行情、能力探测、时间与交互确认',
    whenToUse: '几乎所有投研问题的入口',
    alwaysOn: true,
  },
  {
    id: 'meta',
    title: '工具包管理',
    description: '列出与按需激活其它工具包与工作流技能；管理外部 MCP Server（列表/启用/暂停/安装确认）',
    whenToUse: '当前工具不足、需深挖专题、启用工作流技能，或管理用户外部 MCP 数据源时',
    alwaysOn: true,
  },
  {
    id: 'instrument_analytics',
    title: '标的深度分析',
    description: '评估、策略信号、指标、筹码、机构评级等',
    whenToUse: '分析某只股票/标的优劣、信号、技术面',
  },
  {
    id: 'fundamentals',
    title: '基本面事实',
    description: '公司概况、财务摘要、三表明细、财务指标、股东结构、季报机构持仓、分红历史',
    whenToUse: '营收利润、ROE、利润表/资产负债/现金流、财务指标、主业概念、十大股东、机构持仓、分红派息',
  },
  {
    id: 'market',
    title: '宏观与市场',
    description: '宏观序列（CPI/国外/行业/油价）、牛熊状态、市场动态、开闭市报告、资金流、交易日历、龙虎榜/涨跌停/情绪、A 股专题',
    whenToUse: '宏观数据、大盘、板块、早报复盘、交易日、龙虎榜涨停、连板天梯与热股异动',
  },
  {
    id: 'etf',
    title: 'ETF 专题',
    description: 'ETF 列表、净值、持仓权重',
    whenToUse: 'ETF/基金净值、成分、溢价',
  },
  {
    id: 'portfolio',
    title: '组合与关注',
    description: '关注列表、持仓、交易流水、组合暴露',
    whenToUse: '我的持仓、关注、组合分析',
  },
  {
    id: 'industry',
    title: '产业链',
    description: '行业透视、板块目录/成分、指数成分股',
    whenToUse: '产业链、板块成分、指数成分（沪深300/同花顺概念等）',
  },
  {
    id: 'news',
    title: '资讯公告',
    description: '新闻中心列表/正文、订阅与分组管理、标的公告列表与公告内容',
    whenToUse: '资讯、新闻、公告、研报订阅、添加/导入/管理订阅源、上市公司披露',
  },
  {
    id: 'browser',
    title: '网页浏览',
    description: '打开外部网页、读取页面快照、点击与输入、截图',
    whenToUse: '用户给出 URL 或要查看/操作外部网站（非内置资讯源）',
  },
  {
    id: 'workspace',
    title: '工作区与文件',
    description:
      '读写本地工作区与公共复用区、本地数据目录、扶摇 dump、受控 HTTP、文件夹授权、隔离环境运行代码；内置/已匹配工具不够或无匹配能力时，可在沙盒写脚本完成计算与处理，并可与其它 pack 取数结合',
    whenToUse:
      '保存/读取报告与数据文件、公共包复用、离线 Parquet、下载附件、调用开放 API、访问用户授权的文件夹、运行 python/node 脚本或安装依赖；找文件/看树优先 workspace_glob（shell ls/find 仅后备）；搜内容优先 workspace_grep（shell rg 仅管道/复杂场景后备）；读/改/写文本只用 workspace_*，禁止 opptrix_run 用 cat/sed/echo>/heredoc 等读或改文件内容；建目录用 opptrix_run(mkdir -p) 或 workspace_write；不知 root 时 list_workspace_grants 至多一次；标准投研工具覆盖不了的计算/清洗/自定义处理时作沙盒兜底（可先取数再沙盒计算）。path/cwd 永远相对 root_id；连续同类失败须改策略勿空转',
    alwaysOn: true,
  },
  {
    id: 'strategy_extra',
    title: '策略重计算',
    description: '回测与单股策略报告',
    whenToUse: '回测、IC、策略报告',
  },
  {
    id: 'provider_ext',
    title: '数据源扩展',
    description: '自定义 Provider 方法',
    whenToUse: '标准 API 不够、需调自定义数据源',
  },
  {
    id: 'automation',
    title: '计划任务',
    description: '创建与管理定时智能体任务与受控脚本',
    whenToUse: '定时提醒、定期分析、自动执行重复投研流程',
  },
  {
    id: 'artifacts',
    title: '画布、脑图与网页',
    description: '创建/更新/读取可预览的投研画布、脑图与 HTML 网页制品',
    whenToUse:
      '可视化报告、画布排版、多标的对比表/走势图/一页式结论；脑图/思维导图/主题树；产业链/股东/主题等关系梳理或流程示意（关系类用 create_mindmap，勿虚构知识图谱工具）；可交互 HTML/离线图表页用 create_web（仅 /opptrix-vendor，禁 CDN）',
  },
] as const

/** 工具名 → 主 pack（恰好一个） */
export const TOOL_PACK_MEMBERSHIP: Readonly<Record<string, ToolPackId>> = {
  // core
  search_instruments: 'core',
  get_instrument_capabilities: 'core',
  get_instrument_snapshot: 'core',
  get_instrument_quotes: 'core',
  batch_instrument_snapshots: 'core',
  ask_user: 'core',
  run_subagent: 'core',
  list_subagents: 'core',
  cancel_subagent: 'core',
  get_subagent: 'core',
  reclaim_subagent: 'core',
  get_current_time: 'core',
  schedule_turn_wake: 'core',
  cancel_job: 'core',
  list_jobs: 'core',
  get_system_info: 'core',
  get_app_settings: 'core',
  get_project_info: 'core',
  get_integration_status: 'core',
  list_session_documents: 'core',
  search_library: 'core',
  search_document: 'core',
  read_document: 'core',

  // meta
  list_tool_packs: 'meta',
  activate_tool_pack: 'meta',
  list_agent_skills: 'meta',
  activate_agent_skill: 'meta',
  update_research_checklist: 'meta',
  get_agent_skill: 'meta',
  get_agent_skill_file: 'meta',
  create_agent_skill: 'meta',
  import_agent_skill: 'meta',
  delete_agent_skill: 'meta',
  list_mcp_servers: 'meta',
  enable_mcp_server: 'meta',
  disable_mcp_server: 'meta',
  edit_mcp_server: 'meta',
  install_mcp_server: 'meta',
  uninstall_mcp_server: 'meta',
  reorder_mcp_servers: 'meta',

  // instrument_analytics
  get_instrument_chart: 'instrument_analytics',
  evaluate_instrument: 'instrument_analytics',
  get_instrument_strategy_signal: 'instrument_analytics',
  get_instrument_indicators: 'instrument_analytics',
  verify_instrument_strategy: 'instrument_analytics',
  get_instrument_latest_evaluation: 'instrument_analytics',
  get_instrument_cyq: 'instrument_analytics',
  get_instrument_institution_rating: 'instrument_analytics',
  get_instrument_institution_report: 'instrument_analytics',

  // fundamentals
  get_instrument_profile: 'fundamentals',
  get_instrument_financials: 'fundamentals',
  get_instrument_balance_sheet: 'fundamentals',
  get_instrument_cash_flow: 'fundamentals',
  get_instrument_income_statement: 'fundamentals',
  get_instrument_shareholders: 'fundamentals',
  get_instrument_institution_holdings: 'fundamentals',
  get_instrument_dividend: 'fundamentals',
  get_instrument_financial_indicators: 'fundamentals',

  // market
  get_market_regime: 'market',
  get_market_dynamics: 'market',
  get_trend_brief: 'market',
  get_instrument_money_flow: 'market',
  get_market_session: 'market',
  get_cn_market_special: 'market',
  get_trade_calendar: 'market',
  get_macro_series: 'market',
  get_dragon_tiger: 'market',
  get_limit_updown: 'market',
  get_market_sentiment: 'market',

  // etf
  get_etf_list: 'etf',
  get_etf_nav: 'etf',
  get_etf_holdings: 'etf',
  get_etf_profile: 'etf',

  // portfolio
  get_watchlist: 'portfolio',
  get_portfolio_holdings: 'portfolio',
  portfolio_trades: 'portfolio',
  portfolio_summary: 'portfolio',
  analyze_portfolio: 'portfolio',

  // industry
  get_sector_list: 'industry',
  get_sector_constituents: 'industry',
  get_index_constituents: 'industry',

  // news
  get_news_center_status: 'news',
  list_news_groups: 'news',
  list_news_sources: 'news',
  list_news_articles: 'news',
  get_news_article: 'news',
  add_news_source: 'news',
  delete_news_source: 'news',
  import_news_sources: 'news',
  create_news_group: 'news',
  update_news_group: 'news',
  delete_news_group: 'news',
  move_news_source: 'news',
  validate_news_source: 'news',
  list_rsshub_categories: 'news',
  list_rsshub_domains: 'news',
  search_rsshub_routes: 'news',
  get_rsshub_domain_routes: 'news',
  get_notice_content: 'news',
  get_instrument_notices: 'news',

  // browser
  browser_navigate: 'browser',
  browser_snapshot: 'browser',
  browser_click: 'browser',
  browser_type: 'browser',
  browser_screenshot: 'browser',
  browser_close: 'browser',

  // workspace
  workspace_glob: 'workspace',
  workspace_grep: 'workspace',
  workspace_read: 'workspace',
  workspace_write: 'workspace',
  workspace_replace_lines: 'workspace',
  workspace_apply_patch: 'workspace',
  workspace_delete: 'workspace',
  download_file: 'workspace',
  http_fetch: 'workspace',
  request_folder_access: 'workspace',
  list_workspace_grants: 'workspace',
  resolve_workspace_path_uri: 'workspace',

  shell_platform_status: 'workspace',
  opptrix_run: 'workspace',
  code_preflight: 'workspace',
  python_env_status: 'workspace',
  ensure_python: 'workspace',
  list_local_data_apis: 'workspace',
  get_local_data_catalog: 'workspace',
  prepare_fuyao_dump: 'workspace',
  request_session_lan_access: 'workspace',
  request_secret: 'workspace',
  list_vault_secrets: 'workspace',
  grant_session_secret: 'workspace',
  revoke_session_secret: 'workspace',
  delete_vault_secret: 'workspace',

  // strategy_extra
  run_backtest: 'strategy_extra',
  strategy_report: 'strategy_extra',

  // provider_ext
  list_enabled_providers: 'provider_ext',
  list_provider_custom_methods: 'provider_ext',
  invoke_provider_custom_method: 'provider_ext',

  // automation
  list_scheduled_jobs: 'automation',
  get_scheduled_job: 'automation',
  create_scheduled_job: 'automation',
  update_scheduled_job: 'automation',
  enable_scheduled_job: 'automation',
  disable_scheduled_job: 'automation',
  delete_scheduled_job: 'automation',
  run_scheduled_job_now: 'automation',
  list_scheduled_job_runs: 'automation',

  // artifacts
  create_canvas: 'artifacts',
  update_canvas: 'artifacts',
  read_canvas: 'artifacts',
  create_mindmap: 'artifacts',
  update_mindmap: 'artifacts',
  read_mindmap: 'artifacts',
  create_web: 'artifacts',
  update_web: 'artifacts',
  read_web: 'artifacts',
  list_web_vendor: 'artifacts',
}

export function isToolPackId(value: string): value is ToolPackId {
  return (TOOL_PACK_IDS as readonly string[]).includes(value)
}

export function packIdForTool(toolName: string): ToolPackId | null {
  return TOOL_PACK_MEMBERSHIP[toolName] ?? null
}

export function toolsInPack(packId: ToolPackId): string[] {
  return Object.entries(TOOL_PACK_MEMBERSHIP)
    .filter(([, id]) => id === packId)
    .map(([name]) => name)
}

export function alwaysOnPackIds(): ToolPackId[] {
  return TOOL_PACK_DEFS.filter(p => p.alwaysOn).map(p => p.id)
}

/** 会话冻结 Broker 用：全部 pack（always-on + 业务） */
export function allToolPackIds(): ToolPackId[] {
  return [...TOOL_PACK_IDS]
}

/** 非 always-on 的业务 pack（会话首次 chat 一次性激活） */
export function businessPackIds(): ToolPackId[] {
  return TOOL_PACK_DEFS.filter(p => !p.alwaysOn).map(p => p.id)
}

/** system 提示用的简短 pack 目录（替代长 TOOL_ROUTING 表） */
export function buildToolPackCatalogPrompt(): string {
  const lines = [
    '## 工具包目录（按需加载）',
    '会话首次进入 chat 时全量加载所有工具包（core + meta + workspace + 全部业务 pack）；tools 列表本会话冻结不变。',
    'activate_tool_pack 为 no-op（已加载）；缺能力时先看本轮尾注「工具选型卡」选首选工具，勿重复 activate。',
    '',
    '| pack_id | 标题 | 何时激活 |',
    '|---------|------|----------|',
  ]
  for (const p of TOOL_PACK_DEFS) {
    const flag = p.alwaysOn ? '（始终加载）' : ''
    lines.push(`| ${p.id} | ${p.title}${flag} | ${p.whenToUse} |`)
  }
  lines.push('')
  lines.push('### 调用纪律')
  lines.push('- 仅调用本轮 tools 列表中存在的工具名；勿虚构未加载工具')
  lines.push('- 同一任务对同一工具最多调用 2 次')
  lines.push('- 用户已明确代码时跳过搜索直接分析；跨市场先 search_instruments')
  lines.push('- A 股专用工具（机构评级、筹码等）勿用于非 A 股')
  lines.push('- 标准 API 可用时禁止用自定义 Provider 方法替代；标准工具能做的禁止先上沙盒瞎写')
  lines.push(
    '- 编程意图：读/改/写文件用专用 workspace_*（勿用 opptrix_run 改或读文件内容）；跑命令/装依赖用 opptrix_run；找搜优先 workspace_glob/grep，shell 仅后备；可与投研工具并用；禁止用行情、财务、评估工具代替读写文件；多文件改动可用 workspace_apply_patch',
  )
  lines.push(
    '- 缺能力：先判断是否有业务 pack 可 activate；若标准工具仍覆盖不了 → 本轮已默认加载 workspace，直接用 workspace_* 改文件 + opptrix_run / code_preflight 跑命令（ensure_python 仅失败兜底），勿空转反复 activate 无关 pack，勿直接声称无法完成',
  )
  lines.push(
    '- 可结合：先用标准投研工具取数，再在沙盒里计算/汇总；消息内图表用 ```chart```（→ @opptrix/canvas Chart），禁止沙盒出图代替围栏',
  )
  lines.push(
    '- 目标 pack 已加载、或选型卡首选工具已在本轮 tools 中时：禁止仅为「开工」再 activate_tool_pack',
  )
  lines.push('- 外部 MCP：已绑定工具由引擎优先外部再本地兜底；独有工具名形如 serverId__tool；安装/卸载须用户确认')
  return lines.join('\n')
}
