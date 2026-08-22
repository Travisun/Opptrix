/**
 * 本地/标准层数据 API 目录 — list 索引 + get 按需详情。
 * system 提示只挂索引句；详情靠 get_local_data_catalog。
 */

export type LocalDataCatalogCategory =
  | 'instrument_standard'
  | 'agent_tools'
  | 'hub_features'
  | 'shared_packages'
  | 'fuyao_dump'
  | 'workspace_fs'

export type LocalDataAccess =
  | 'agent_tool'
  | 'hub_feature'
  | 'standard_capability'
  | 'workspace'
  | 'shared'

export interface LocalDataApiIndexEntry {
  api_id: string
  category: LocalDataCatalogCategory
  title: string
  summary: string
  access: LocalDataAccess
}

export interface LocalDataApiDetail extends LocalDataApiIndexEntry {
  how_to_call: string
  params?: Array<{ name: string; type: string; required?: boolean; description: string }>
  examples?: string[]
  layer_entry?: string
  notes?: string[]
}

const INSTRUMENT_CAPS: Array<{
  id: string
  title: string
  summary: string
  how: string
  example?: string
}> = [
  {
    id: 'cap.realtime',
    title: '实时行情',
    summary: '单标的最新价与涨跌',
    how: 'Agent: get_instrument_quotes；标准层: queryInstrumentData(ref, "realtime")',
    example: 'get_instrument_quotes({ code: "600519" })',
  },
  {
    id: 'cap.kline',
    title: 'K 线',
    summary: 'OHLCV 序列',
    how: 'Agent: get_instrument_chart；标准层: queryInstrumentData(ref, "kline", { period, count })',
    example: 'get_instrument_chart({ code: "600519", period: "daily", count: 60 })',
  },
  {
    id: 'cap.snapshot',
    title: '综合快照',
    summary: '行情 + 资料摘要',
    how: 'Agent: get_instrument_snapshot；标准层: queryInstrumentData(ref, "snapshot")',
  },
  {
    id: 'cap.profile',
    title: '公司概况',
    summary: '主业、概念、基本档案',
    how: 'Agent: get_instrument_profile；标准层: queryInstrumentData(ref, "profile")',
  },
  {
    id: 'cap.financials',
    title: '财务摘要',
    summary: '营收利润等摘要',
    how: 'Agent: get_instrument_financials；标准层: queryInstrumentData(ref, "financials")',
  },
  {
    id: 'cap.balance_sheet',
    title: '资产负债表',
    summary: '资产负债明细',
    how: 'Agent: get_instrument_balance_sheet；标准层: queryInstrumentData(ref, "balance_sheet")',
  },
  {
    id: 'cap.cash_flow',
    title: '现金流量表',
    summary: '经营/投资/筹资现金流',
    how: 'Agent: get_instrument_cash_flow；标准层: queryInstrumentData(ref, "cash_flow")',
  },
  {
    id: 'cap.income_statement',
    title: '利润表',
    summary: '利润表明细',
    how: 'Agent: get_instrument_income_statement；标准层: queryInstrumentData(ref, "income_statement")',
  },
  {
    id: 'cap.stock_list',
    title: '股票列表',
    summary: '市场股票目录/分页',
    how: '标准层: queryInstrumentData(ref, "stock_list", { page, pageSize, boardKey })；Hub 本地摘要见 hub.local_instruments_summary',
  },
  {
    id: 'cap.instrument_search',
    title: '标的搜索',
    summary: '按关键词搜代码/名称',
    how: 'Agent: search_instruments；标准层: queryInstrumentData(ref, "instrument_search", { keyword })',
  },
  {
    id: 'cap.sector_list',
    title: '板块目录',
    summary: '行业/概念板块列表',
    how: 'Agent: get_sector_list；标准层: queryInstrumentData(ref, "sector_list")',
  },
  {
    id: 'cap.index_constituents',
    title: '指数成分',
    summary: '指数或板块成分股',
    how: 'Agent: get_index_constituents / get_sector_constituents；标准层: queryInstrumentData(ref, "index_constituents", { indexCode })',
  },
  {
    id: 'cap.trade_calendar',
    title: '交易日历',
    summary: '休市/交易日',
    how: 'Agent: get_trade_calendar；标准层: queryInstrumentData(ref, "trade_calendar", { year })',
  },
  {
    id: 'cap.etf_list',
    title: 'ETF 列表',
    summary: 'ETF 目录',
    how: 'Agent: get_etf_list；标准层: queryInstrumentData(ref, "etf_list")',
  },
  {
    id: 'cap.etf_profile',
    title: 'ETF 档案',
    summary: '跟踪指数、费率等',
    how: 'Agent: get_etf_profile；标准层: queryInstrumentData(ref, "etf_profile")',
  },
  {
    id: 'cap.etf_nav',
    title: 'ETF 净值',
    summary: '净值与溢价',
    how: 'Agent: get_etf_nav；标准层: queryInstrumentData(ref, "etf_nav")',
  },
  {
    id: 'cap.etf_holdings',
    title: 'ETF 持仓',
    summary: '持仓权重',
    how: 'Agent: get_etf_holdings；标准层: queryInstrumentData(ref, "etf_holdings")',
  },
  {
    id: 'cap.fund_list',
    title: '场外基金列表',
    summary: '场外基金目录',
    how: 'Agent: get_fund_list；标准层: queryInstrumentData(ref, "fund_list")',
  },
  {
    id: 'cap.fund_profile',
    title: '场外基金档案',
    summary: '类型、经理、费率等',
    how: 'Agent: get_fund_profile；标准层: queryInstrumentData(ref, "fund_profile")',
  },
  {
    id: 'cap.fund_nav',
    title: '场外基金净值',
    summary: '历史净值序列',
    how: 'Agent: get_fund_nav；标准层: queryInstrumentData(ref, "fund_nav")',
  },
  {
    id: 'cap.fund_holdings',
    title: '场外基金持仓',
    summary: '季报重仓',
    how: 'Agent: get_fund_holdings；标准层: queryInstrumentData(ref, "fund_holdings")',
  },
  {
    id: 'cap.etf_snapshot',
    title: 'ETF 快照',
    summary: 'ETF 综合快照',
    how: '标准层: queryInstrumentData(ref, "etf_snapshot")',
  },
  {
    id: 'cap.dividend',
    title: '分红',
    summary: '分红派息历史',
    how: 'Agent: get_instrument_dividend；标准层: queryInstrumentData(ref, "dividend")',
  },
  {
    id: 'cap.news',
    title: '资讯',
    summary: '标的相关资讯',
    how: '标准层: queryInstrumentData(ref, "news")；本地资讯中心用 list_news_articles',
  },
  {
    id: 'cap.notices',
    title: '公告',
    summary: '上市公司公告列表',
    how: 'Agent: get_instrument_notices；标准层: queryInstrumentData(ref, "notices")',
  },
  {
    id: 'cap.shareholders',
    title: '股东',
    summary: '十大股东等',
    how: 'Agent: get_instrument_shareholders；标准层: queryInstrumentData(ref, "shareholders")',
  },
  {
    id: 'cap.money_flow',
    title: '资金流',
    summary: '主力资金等',
    how: 'Agent: get_instrument_money_flow；标准层: queryInstrumentData(ref, "money_flow")',
  },
  {
    id: 'cap.technical_analysis',
    title: '技术分析',
    summary: '技术指标相关能力',
    how: 'Agent: get_instrument_indicators；标准层: queryInstrumentData(ref, "technical_analysis")',
  },
]

const AGENT_TOOLS: Array<{
  id: string
  title: string
  summary: string
  how: string
  example?: string
}> = [
  {
    id: 'tool.search_instruments',
    title: 'search_instruments',
    summary: '跨市场搜标的',
    how: 'Agent tool search_instruments',
    example: 'search_instruments({ query: "茅台" })',
  },
  {
    id: 'tool.get_instrument_quotes',
    title: 'get_instrument_quotes',
    summary: '实时报价',
    how: 'Agent tool get_instrument_quotes',
  },
  {
    id: 'tool.get_instrument_snapshot',
    title: 'get_instrument_snapshot',
    summary: '深度快照入口',
    how: 'Agent tool get_instrument_snapshot',
  },
  {
    id: 'tool.get_instrument_chart',
    title: 'get_instrument_chart',
    summary: 'K 线/图表',
    how: 'Agent tool get_instrument_chart',
  },
  {
    id: 'tool.list_local_data_apis',
    title: 'list_local_data_apis',
    summary: '本地/标准 API 索引',
    how: 'Agent tool list_local_data_apis({ category? })',
  },
  {
    id: 'tool.get_local_data_catalog',
    title: 'get_local_data_catalog',
    summary: '按 api_id 取调用详情',
    how: 'Agent tool get_local_data_catalog({ api_id, include_examples? })',
  },
  {
    id: 'tool.prepare_fuyao_dump',
    title: 'prepare_fuyao_dump',
    summary: '服务端取扶摇 dump 到 shared；冷下载异步 job；full/incr 就绪自动写 offline-k-meta',
    how: 'Agent tool prepare_fuyao_dump({ dump_kind, mode?, force_refresh? })；若 status=preparing+job_id 则系统通常自动挂起并终态续跑；必要时 prepare_fuyao_dump({ job_id })；无 job 事件时才 schedule_turn_wake（禁止传 job_id）',
    example: 'prepare_fuyao_dump({ dump_kind: "incremental", mode: "local_path" })',
  },
  {
    id: 'tool.schedule_turn_wake',
    title: 'schedule_turn_wake',
    summary: '无 job 事件时的纯延时续跑',
    how: 'Agent tool schedule_turn_wake({ seconds, prompt, reason? })；seconds∈[5,1800]；禁止 job_id；仅无可靠后台任务事件时使用；有 preparing+job_id 时依赖自动挂起与终态续跑',
    example: 'schedule_turn_wake({ seconds: 90, prompt: "检查准备是否就绪并继续" })',
  },
  {
    id: 'tool.request_session_lan_access',
    title: 'request_session_lan_access',
    summary: '本对话申请局域网访问',
    how: 'Agent tool request_session_lan_access（内部 ask_user）',
  },
  {
    id: 'tool.opptrix_run',
    title: 'opptrix_run',
    summary: '沙盒运行 node/python/npm',
    how: 'Agent tool opptrix_run；须已 activate workspace',
  },
  {
    id: 'tool.http_fetch',
    title: 'http_fetch',
    summary: '受控 HTTP；会话 LAN 时可访问局域网',
    how: 'Agent tool http_fetch；需 LAN 时先 ask_user / request_session_lan_access',
  },
  {
    id: 'tool.workspace_glob',
    title: 'workspace_glob',
    summary: '按模式找文件/看树（亦可 opptrix_run ls/find）',
    how: 'Agent tool workspace_glob({ root_id, glob_pattern, path? })；公共区 root_id=shared',
  },
  {
    id: 'tool.list_workspace_grants',
    title: 'list_workspace_grants',
    summary: '不知 root 时查本对话可访问目录（至多一次）',
    how: 'Agent tool list_workspace_grants；已知 root 直接 glob/grep/run',
  },
]

const HUB_FEATURES: Array<{
  id: string
  title: string
  summary: string
  how: string
  notes?: string[]
}> = [
  {
    id: 'hub.search_local_instruments',
    title: 'search_local_instruments',
    summary: '本地标的库关键词搜索（Hub）',
    how: 'Hub.dispatch("search_local_instruments", { keyword, limit? })；当前无薄 Agent tool，catalog 收录备查',
    notes: ['access=hub_feature', '行情主路径仍优先标准 Agent tools / queryInstrumentData'],
  },
  {
    id: 'hub.local_instruments_summary',
    title: 'local_instruments_summary',
    summary: '本地标的库规模摘要（Hub）',
    how: 'Hub.dispatch("local_instruments_summary", {})',
    notes: ['access=hub_feature'],
  },
]

const SHARED_PACKAGES: LocalDataApiDetail = {
  api_id: 'shared.packages',
  category: 'shared_packages',
  title: '公共复用包',
  summary: '跨对话共享脚本/包（packages/<name>）',
  access: 'shared',
  how_to_call:
    'workspace_glob({ root_id: "shared", glob_pattern: "packages/**/README.md" }) 或 opptrix_run(ls packages) → 读 packages/<name>/README.md；可复用则 opptrix_run cwd 指向该包',
  layer_entry: 'resolveSharedWorkspaceRoot()/packages',
  notes: [
    '写回新包须含 README（目的/入口/入参出参/依赖/示例）',
    '勿存 API Key',
  ],
  examples: [
    'workspace_glob({ root_id: "shared", glob_pattern: "packages/**/README.md" })',
    'workspace_read({ root_id: "shared", path: "packages/demo/README.md" })',
  ],
}

/** 内置模板；ensureSharedWorkspaceLayout 时自动落到 shared/packages/cn-offline-daily-k/ */
const CN_OFFLINE_DAILY_K: LocalDataApiDetail = {
  api_id: 'shared.packages.cn-offline-daily-k',
  category: 'shared_packages',
  title: 'cn-offline-daily-k',
  summary: 'A 股离线十年日 K：prepare_fuyao_dump 部署到公共区，查询/筛选/板块挖掘（不写主库）',
  access: 'shared',
  how_to_call:
    '初始化 shared 时自动落到 packages/cn-offline-daily-k（内置模板，不覆盖用户已改文件）。'
    + '先 decideDumpKind（>10 日未成功更新则 full）→ prepare_fuyao_dump（冷下载可能 preparing+job_id，系统通常自动挂起并终态续跑；full|incremental + local_path 就绪后自动写 data/cache/offline-k-meta.json）→ 计算全市场指标落盘 data/cache/indicators/ → query/screen；'
    + 'markUpdateSuccess 仅作手动补写保留',
  layer_entry: 'templates/cn-offline-daily-k → shared/packages/cn-offline-daily-k（auto-seed）',
  params: [
    { name: 'dump_kind', type: 'string', required: true, description: 'full（≈10y）| incremental（≈10d）；由 decideDumpKind 决定' },
    { name: 'meta_path', type: 'string', description: '仅 shared/data/cache/offline-k-meta.json' },
  ],
  notes: [
    '禁止 market sync / importDailyKDump / 写 App 主行情库',
    '禁止 API Key 进沙盒；扶摇鉴权仅经 prepare_fuyao_dump',
    '冷下载非同步：status=preparing+job_id 时依赖自动挂起与终态续跑；无 job 事件时才 schedule_turn_wake（禁止传 job_id）；勿 poll/sleep',
    '元数据只写 shared/data/cache/offline-k-meta.json',
    '本地指标缓存约定：shared/data/cache/indicators/（按标的或指标族 Parquet/JSON；Agent 自行计算，非包内引擎）',
  ],
  examples: [
    'get_local_data_catalog({ api_id: "shared.packages.cn-offline-daily-k" })',
    'prepare_fuyao_dump({ dump_kind: "full" })',
    'prepare_fuyao_dump({ job_id: "<from preparing>" })',
    'schedule_turn_wake({ seconds: 90, prompt: "无 job 事件时检查 dump 是否就绪并继续" })',
    'workspace_glob({ root_id: "shared", glob_pattern: "packages/cn-offline-daily-k/**" })',
  ],
}

const FUYAO_DUMP: LocalDataApiDetail = {
  api_id: 'fuyao.dump',
  category: 'fuyao_dump',
  title: '扶摇 Parquet Dump',
  summary: '全量/增量日 K、复权因子包；服务端持 Key 落盘 shared；冷下载异步 job',
  access: 'agent_tool',
  how_to_call:
    'prepare_fuyao_dump({ dump_kind: "full"|"incremental"|"adjustment_factors", mode: "local_path"|"presigned_url", force_refresh? })；'
    + '冷下载立即 preparing+job_id，系统通常自动挂起并终态续跑；无 job 事件时才 schedule_turn_wake（禁止传 job_id；勿 poll/sleep）',
  params: [
    { name: 'dump_kind', type: 'string', required: true, description: 'full | incremental | adjustment_factors（轮询时可不传）' },
    { name: 'mode', type: 'string', description: 'local_path（默认）| presigned_url' },
    { name: 'force_refresh', type: 'boolean', description: '忽略缓存强制重下' },
    { name: 'job_id', type: 'string', description: '冷下载 preparing 后轮询用' },
  ],
  layer_entry: 'shared/data/dumps via prepareFuyaoDumpForAgent',
  notes: [
    '禁止向沙盒注入 API Key；勿引导 market sync / dailyDump',
    '缓存命中/presigned_url 可同步 ready；local_path 冷下载为异步 preparing+job_id，依赖自动挂起与终态续跑；无 job 事件时才 schedule_turn_wake；勿 poll/sleep',
    '成功返回 root_id=shared + relative_path',
    'full|incremental + local_path 就绪后服务端自动写 shared/data/cache/offline-k-meta.json（meta_written）；adjustment_factors / presigned_url 不写',
  ],
  examples: [
    'prepare_fuyao_dump({ dump_kind: "incremental" })',
    'prepare_fuyao_dump({ job_id: "<from preparing>" })',
    'schedule_turn_wake({ seconds: 120, prompt: "无 job 事件时检查 prepare_fuyao_dump 是否就绪并继续" })',
    'prepare_fuyao_dump({ dump_kind: "full", mode: "presigned_url" })',
  ],
}

const WORKSPACE_FS: LocalDataApiDetail[] = [
  {
    api_id: 'workspace.default',
    category: 'workspace_fs',
    title: '本对话工作区',
    summary: '会话专属读写目录',
    access: 'workspace',
    how_to_call: 'workspace_* 工具，root_id=default',
    layer_entry: 'sessions/<sessionId>',
    notes: ['clearSession 会删除会话目录'],
  },
  {
    api_id: 'workspace.shared',
    category: 'workspace_fs',
    title: '公共复用区',
    summary: '跨对话 packages/data/docs；会话结束不删',
    access: 'shared',
    how_to_call: 'workspace_* / opptrix_run，root_id=shared；dumps 用 prepare_fuyao_dump',
    layer_entry: '~/.opptrix/agent-workspace/shared（对用户脱敏）',
    notes: ['自动 grant rw', 'clearSession 不删 shared'],
    examples: [
      'list_workspace_grants()',
      'workspace_glob({ root_id: "shared", glob_pattern: "data/dumps/**" })',
    ],
  },
]

function buildCatalog(): LocalDataApiDetail[] {
  const out: LocalDataApiDetail[] = []

  for (const c of INSTRUMENT_CAPS) {
    out.push({
      api_id: c.id,
      category: 'instrument_standard',
      title: c.title,
      summary: c.summary,
      access: 'standard_capability',
      how_to_call: c.how,
      layer_entry: 'engine.queryInstrumentData(ref, capability, opts?)',
      examples: c.example ? [c.example] : undefined,
    })
  }

  for (const t of AGENT_TOOLS) {
    out.push({
      api_id: t.id,
      category: 'agent_tools',
      title: t.title,
      summary: t.summary,
      access: 'agent_tool',
      how_to_call: t.how,
      examples: t.example ? [t.example] : undefined,
    })
  }

  for (const h of HUB_FEATURES) {
    out.push({
      api_id: h.id,
      category: 'hub_features',
      title: h.title,
      summary: h.summary,
      access: 'hub_feature',
      how_to_call: h.how,
      notes: h.notes,
    })
  }

  out.push(SHARED_PACKAGES)
  out.push(CN_OFFLINE_DAILY_K)
  out.push(FUYAO_DUMP)
  out.push(...WORKSPACE_FS)
  return out
}

const CATALOG = buildCatalog()

export function listLocalDataApis(opts?: { category?: string }): {
  index_hint: string
  categories: LocalDataCatalogCategory[]
  items: LocalDataApiIndexEntry[]
} {
  const cat = opts?.category?.trim()
  const items = CATALOG
    .filter(e => !cat || e.category === cat)
    .map(({ api_id, category, title, summary, access }) => ({
      api_id,
      category,
      title,
      summary,
      access,
    }))
  return {
    index_hint:
      '本地数据目录索引；详情请 get_local_data_catalog({ api_id })。编程前先查目录 → 公共包 → npm/pip → 自写回写。',
    categories: [
      'instrument_standard',
      'agent_tools',
      'hub_features',
      'shared_packages',
      'fuyao_dump',
      'workspace_fs',
    ],
    items,
  }
}

export function getLocalDataCatalog(opts: {
  api_id: string
  include_examples?: boolean
}): LocalDataApiDetail | { error: string } {
  const id = String(opts.api_id ?? '').trim()
  if (!id) return { error: 'api_id 不能为空' }
  const entry = CATALOG.find(e => e.api_id === id)
  if (!entry) {
    return {
      error: `未知 api_id: ${id}；请先 list_local_data_apis 查看索引`,
    }
  }
  if (opts.include_examples === false) {
    const { examples: _ex, ...rest } = entry
    void _ex
    return rest
  }
  return { ...entry }
}

/** system 提示用的短索引句（不含详情） */
export function buildLocalDataCatalogIndexHint(): string {
  return [
    '【本地数据目录 — 渐进加载】',
    '- 先 list_local_data_apis（可按 category 过滤）拿索引，再 get_local_data_catalog({ api_id }) 取调用方式/参数/示例',
    '- 分类：instrument_standard / agent_tools / hub_features / shared_packages / fuyao_dump / workspace_fs',
    '- 勿在 system 臆造未加载的调用细节；离线大数据用 prepare_fuyao_dump，勿 sync/dailyDump、勿把密钥注入沙盒',
  ].join('\n')
}
