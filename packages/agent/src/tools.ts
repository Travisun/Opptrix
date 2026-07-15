import type { ResearchHub } from '@opptrix/research-hub'
import type { AgentAppContext } from './app-context.js'
import {
  createDefaultAppContext,
  getCurrentTime,
  getDataLayerPaths,
  getSystemInfo,
  resolveProjectRoot,
} from './app-context.js'
import {
  DATA_LAYER_MINING_TOOL_NAMES,
  TOOL_META,
  formatToolDescription,
  type ToolMeta,
} from './tool-meta.js'
import {
  buildUnifiedInstrumentTools,
  CHAT_MCP_TOOL_NAMES,
} from './unified-mcp-tools.js'
import { buildAgentSystemRules, resolveInstrumentFromParams } from '@opptrix/shared'

/** @deprecated 使用 DATA_LAYER_MINING_TOOL_NAMES */
export const DISCOVER_MINING_TOOL_NAMES = DATA_LAYER_MINING_TOOL_NAMES

/**
 * JSON Schema 对象类型定义 — 工具参数的结构化描述格式。
 *
 * 用途：定义 Agent 工具的输入参数 Schema，供 LLM function calling 和 MCP 协议使用。
 * 格式：遵循 JSON Schema Draft-07 的 object 类型规范。
 */
export interface JsonSchema {
  /** 固定为 "object"，表示参数是一个 JSON 对象 */
  type: 'object'
  /** 参数属性定义，key 为参数名，value 含类型和描述 */
  properties: Record<string, {
    /** 参数类型（如 "string"、"number"、"boolean"、"array"） */
    type: string
    /** 参数描述文本，供 LLM 理解参数含义 */
    description?: string
    /** 当 type="array" 时，描述数组元素的类型 */
    items?: unknown
    /** 参数默认值 */
    default?: unknown
  }>
  /** 必填参数名列表，缺省时所有参数均为可选 */
  required?: string[]
}

/**
 * Agent 工具定义 — 完整的工具注册信息，包含元数据和执行函数。
 *
 * 用途：ToolRegistry 内部存储的工具定义，用于生成 MCP/OpenAI tools 列表和实际调用。
 */
export interface ToolDef {
  /** 工具唯一名称（如 "evaluate_stock"、"get_stock_kline"），全局不可重复 */
  name: string
  /** 工具描述文本，供 LLM 理解工具用途 */
  description: string
  /** 工具分类（如 "个股分析"、"选股"、"本地数据"、"策略"） */
  category: string
  /** 输入参数的 JSON Schema 定义 */
  parameters: JsonSchema
  /** 工具执行函数：接收参数对象，返回 Promise<unknown> */
  handler: (args: Record<string, unknown>) => Promise<unknown>
  /** 工具元数据（用途说明、调用规范、是否用于挖掘等） */
  meta?: ToolMeta
}

/**
 * MCP 协议工具定义 — list_tools 响应格式。
 *
 * 用途：MCP Server 返回给 Client 的工具目录信息。
 */
export interface McpToolDef {
  /** 工具唯一名称 */
  name: string
  /** 工具描述文本 */
  description: string
  /** 输入参数的 JSON Schema 定义（MCP 称为 inputSchema） */
  inputSchema: JsonSchema
}

/**
 * OpenAI function calling 工具格式 — 符合 OpenAI Chat API 的 tools 参数规范。
 *
 * 用途：非 MCP 模式下，直接传给 OpenAI API 的 tools 数组。
 */
export interface OpenAiTool {
  /** 固定为 "function"，表示这是一个函数工具 */
  type: 'function'
  /** 函数定义 */
  function: {
    /** 函数名称（与 ToolDef.name 一致） */
    name: string
    /** 函数描述文本 */
    description: string
    /** 输入参数的 JSON Schema 定义 */
    parameters: JsonSchema
  }
}

export class ToolRegistry {
  readonly tools: ToolDef[]
  private appContext: AgentAppContext
  /** 聊天会话的 tool-pack 桥接（list/activate）；由 AgentEngine 在 chat 前绑定 */
  private packBridge: {
    sessionId: string
    listPacks: () => unknown
    activatePacks: (packIds: string[]) => unknown
  } | null = null

  constructor(private hub: ResearchHub, appContext?: AgentAppContext) {
    this.appContext = appContext ?? createDefaultAppContext()
    this.tools = [...this.buildDataTools(), ...this.buildBasicTools(), ...this.buildMetaTools()]
  }

  bindPackSession(bridge: NonNullable<ToolRegistry['packBridge']>) {
    this.packBridge = bridge
  }

  clearPackSession() {
    this.packBridge = null
  }

  list() { return this.tools }

  get(name: string) { return this.tools.find(t => t.name === name) }

  openAiTools(names?: readonly string[]): OpenAiTool[] {
    /** @deprecated 运行时请经 McpToolBroker（MCP 协议）；此方法仅供目录/文档生成 */
    const allow = names ? new Set(names) : null
    return this.tools
      .filter(t => !allow || allow.has(t.name))
      .map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: formatToolDescription(t.description, t.meta),
          parameters: t.parameters,
        },
      }))
  }

  /** MCP list_tools 格式 */
  mcpTools(names?: readonly string[]): McpToolDef[] {
    const allow = names ? new Set(names) : null
    return this.tools
      .filter(t => !allow || allow.has(t.name))
      .map(t => ({
        name: t.name,
        description: formatToolDescription(t.description, t.meta),
        inputSchema: t.parameters,
      }))
  }

  miningTools(): OpenAiTool[] {
    return this.openAiTools(DATA_LAYER_MINING_TOOL_NAMES)
  }

  chatToolNames(): readonly string[] {
    return CHAT_MCP_TOOL_NAMES(this)
  }

  async call(name: string, args: Record<string, unknown> = {}) {
    const tool = this.get(name)
    if (!tool) return { error: `Unknown tool: ${name}` }
    try {
      const result = await tool.handler(args)
      return result
    } catch (e) {
      return { error: String(e) }
    }
  }

  systemPrompt(opts?: {
    activePacks?: readonly string[]
    routePlaybook?: string
    activeToolNames?: readonly string[]
    researchTier?: import('@opptrix/shared').ResearchTier
    sessionClock?: string
    dataSourcingPolicy?: string
  }) {
    return [
      '你是 Opptrix 多市场投研研究员（非荐股机器人）。仅依据已注册 MCP 投研工具返回的数据作答：区分事实与推断，标注时效与不确定性，按研究档位组织结论；不编造、不荐具体买卖点。',
      '需要用户确认分析方向或偏好时，使用 ask_user 工具在界面展示选择题（含自行输入项），勿让用户在聊天里自行罗列选项。',
      '工具选择必须以「本轮工具选型卡」与 tools 列表为准：先调首选工具取证据，再按档位补维；勿调用未加载工具。',
      '时效判断优先使用 system 中的【会话时钟】，无需每轮调用 get_current_time。',
      opts?.dataSourcingPolicy ?? '',
      buildAgentSystemRules(opts),
    ].filter(Boolean).join('\n')
  }

  private dispatch(feature: string, params: Record<string, unknown>) {
    return this.hub.dispatch(feature, params)
  }

  private buildDataTools(): ToolDef[] {
    const d = (feature: string, params: Record<string, unknown> = {}) =>
      this.dispatch(feature, params)
    const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
      ({ type: 'object', properties, required })

    const tools: Omit<ToolDef, 'meta'>[] = [
      {
        name: 'get_market_regime', category: '市场',
        description: '获取宏观市场状态（牛熊/风险偏好）；A 股默认沪深300，美股用 SPY',
        parameters: S({
          profile_scope: { type: 'string', description: 'cn（默认 A 股）| us（美股）' },
        }),
        handler: (a: Record<string, unknown>) => d('market_regime', a),
      },
      {
        name: 'get_market_dynamics', category: '市场',
        description: '获取市场动态全景：A 股/全球指数、涨跌榜、龙虎榜摘要',
        parameters: S({}),
        handler: () => d('market_dynamics', {}),
      },
      {
        name: 'get_trend_brief', category: '个股分析',
        description: 'A 股单股趋势研判：均线结构、相对强弱、可选持仓成本盈亏',
        parameters: S({
          code: { type: 'string', description: '6 位 A 股代码' },
          holding_cost: { type: 'number', description: '可选，持仓成本价（元）' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('trend_brief', a),
      },
      {
        name: 'get_watchlist', category: '组合管理',
        description: '读取用户关注列表（代码、名称、行业、备注、加入价）',
        parameters: S({}),
        handler: () => d('watchlist_list', {}),
      },
      {
        name: 'get_etf_list', category: '通用',
        description: '获取 A 股 ETF 全量列表，或按 code 过滤单只',
        parameters: S({
          code: { type: 'string', description: '可选，6 位 ETF 代码过滤' },
        }),
        handler: (a: Record<string, unknown>) => d('etf_list', a),
      },
      {
        name: 'get_etf_nav', category: '通用',
        description: 'ETF 历史净值与溢价率',
        parameters: S({ code: { type: 'string', description: '6 位 ETF 代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('etf_nav', { code: a.code }),
      },
      {
        name: 'get_etf_holdings', category: '通用',
        description: 'ETF 最新披露持仓与权重',
        parameters: S({ code: { type: 'string', description: '6 位 ETF 代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('etf_holdings', { code: a.code }),
      },
      {
        name: 'analyze_portfolio', category: '组合管理',
        description: '分析持仓组合的因子暴露与综合评分',
        parameters: S({
          holdings: { type: 'array', description: '持仓 [[code, weight], ...] weight 为 0-1 小数' },
          scorecard: { type: 'string', description: '评分卡' },
        }, ['holdings']),
        handler: (a: Record<string, unknown>) => d('portfolio_analysis', { holdings: a.holdings, scorecard: a.scorecard }),
      },
      {
        name: 'get_closing_report', category: '报告',
        description: '生成 A 股收盘市场报告',
        parameters: S({}),
        handler: () => d('market_report', { type: 'closing' }),
      },
      {
        name: 'get_morning_brief', category: '报告',
        description: '生成 A 股开盘早报',
        parameters: S({}),
        handler: () => d('market_report', { type: 'morning' }),
      },
      {
        name: 'run_backtest', category: '策略',
        description: '对指定股票列表做评分卡 IC 回测',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表' },
          scorecard: { type: 'string', description: '评分卡' },
          periods: { type: 'number', description: '回测期数' },
        }, ['codes']),
        handler: (a: Record<string, unknown>) => d('backtest', { codes: a.codes, scorecard: a.scorecard, periods: a.periods ?? 5 }),
      },
      {
        name: 'strategy_report', category: '策略',
        description: '单股 T 策略综合分析文本报告',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('strategy_report', { code: a.code }),
      },
      {
        name: 'industry_mining', category: '报告',
        description: '产业链透视与代表公司',
        parameters: S({ industry: { type: 'string', description: '行业名称，如 半导体' } }, ['industry']),
        handler: (a: Record<string, unknown>) => d('industry_mining', { industry: a.industry }),
      },
      {
        name: 'industry_mermaid', category: '报告',
        description: '产业链 Mermaid mindmap 源码',
        parameters: S({ industry: { type: 'string', description: '行业名称' } }, ['industry']),
        handler: (a: Record<string, unknown>) => d('industry_mermaid', { industry: a.industry }),
      },
      {
        name: 'get_news_center_status', category: '资讯中心',
        description: '查询新闻中心同步状态、订阅/分组数量与文章索引规模',
        parameters: S({}),
        handler: () => d('news_center_status', {}),
      },
      {
        name: 'list_news_groups', category: '资讯中心',
        description: '列出资讯自定义分组（id、名称、所含订阅数）',
        parameters: S({}),
        handler: () => d('news_groups_list', {}),
      },
      {
        name: 'list_news_sources', category: '资讯中心',
        description: '列出 RSS/Atom 订阅来源（id、名称、分组、启用状态）',
        parameters: S({}),
        handler: () => d('news_sources_list', {}),
      },
      {
        name: 'list_news_articles', category: '资讯中心',
        description: '按时间线/分组/来源分页浏览本地资讯列表（仅标题与短摘要，不含正文）',
        parameters: S({
          view: {
            type: 'string',
            description: 'timeline（默认，全站时间线）| group（按分组）| source（按订阅来源）',
          },
          group_id: {
            type: 'string',
            description: 'view=group 时必填；未分组订阅用 __ungrouped__',
          },
          subscription_id: {
            type: 'string',
            description: 'view=source 时必填；来自 list_news_sources',
          },
          date: {
            type: 'string',
            description: 'view=timeline 时可选，本地日历日 YYYY-MM-DD',
          },
          limit: { type: 'number', description: '每页条数 1-50，默认 20' },
          cursor: { type: 'string', description: '上一页返回的 next_cursor，首页省略' },
        }),
        handler: (a: Record<string, unknown>) => d('news_articles_list', a),
      },
      {
        name: 'get_news_article', category: '资讯中心',
        description: '按本地文章 id 获取资讯正文（HTML 已剥离并压缩空白以节约 token）',
        parameters: S({
          article_id: { type: 'string', description: '文章 id，来自 list_news_articles' },
        }, ['article_id']),
        handler: (a: Record<string, unknown>) => d('news_article_detail', { article_id: a.article_id }),
      },
      {
        name: 'get_notice_content', category: '公告研报',
        description: '按公告 URL 获取正文（自动解析 HTML 页面或 PDF 附件，剥离标签并压缩空白，供阅读年报/公告）',
        parameters: S({
          url: { type: 'string', description: '公告详情页或 PDF 链接（来自标的详情公告列表等）' },
          max_chars: { type: 'number', description: '返回正文最大字符数，默认 16000，最大 40000' },
        }, ['url']),
        handler: (a: Record<string, unknown>) => d('notice_content', {
          url: a.url,
          max_chars: a.max_chars ?? a.maxChars,
        }),
      },
      {
        name: 'get_portfolio_holdings', category: '组合管理',
        description: '读取当前持仓明细（股数、成本、市值、浮盈）',
        parameters: S({}),
        handler: () => d('portfolio_holdings', {}),
      },
      {
        name: 'portfolio_trades', category: '组合管理',
        description: '查询交易账本记录（买卖流水）；可按标的过滤',
        parameters: S({
          code: { type: 'string', description: '可选，按代码过滤（A 股六位、港股五位、美股 ticker）' },
          market: { type: 'string', description: '可选，CN | US | HK；过滤港/美流水时必填' },
          symbol: { type: 'string', description: '可选，与 market 平铺写法（与 code 二选一）' },
        }),
        handler: (a: Record<string, unknown>) => {
          const hasFilter = a.code != null || a.symbol != null || a.market != null || a.instrument != null
          if (!hasFilter) return d('portfolio_trades', {})
          const ref = resolveInstrumentFromParams(a)
          if (ref) {
            return d('portfolio_trades', { code: ref.symbol, market: ref.market })
          }
          return d('portfolio_trades', {
            code: String(a.code ?? a.symbol ?? ''),
            market: a.market != null ? String(a.market) : undefined,
          })
        },
      },
      {
        name: 'portfolio_summary', category: '组合管理',
        description: '持仓盈亏与账本汇总（含持仓明细与交易统计）',
        parameters: S({}),
        handler: () => d('portfolio_summary', {}),
      },
    ]
    const unifiedTools = buildUnifiedInstrumentTools(d, S)
    return [...tools, ...unifiedTools].map(t => ({ ...t, meta: TOOL_META[t.name] }))
  }

  private buildBasicTools(): ToolDef[] {
    const ctx = this.appContext
    const d = (feature: string, params: Record<string, unknown> = {}) =>
      this.dispatch(feature, params)
    const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
      ({ type: 'object', properties, required })

    return [
      {
        name: 'get_current_time', category: '基础',
        description: '获取当前时间（ISO、本地时区、Unix 毫秒、星期）',
        parameters: S({}),
        handler: async () => getCurrentTime(),
      },
      {
        name: 'get_system_info', category: '基础',
        description: '获取运行环境信息（平台、Node 版本、桌面/服务端模式、时区、内存）',
        parameters: S({}),
        handler: async () => getSystemInfo(),
      },
      {
        name: 'get_app_settings', category: '基础',
        description: '读取应用设置（LLM 提供商列表、默认模型/评分卡/TopN；不含 API Key）',
        parameters: S({}),
        handler: async () => ctx.getAppSettings(),
      },
      {
        name: 'get_project_info', category: '基础',
        description: '读取项目与数据层路径（版本、运行时、数据根目录、会话/关注列表/组合路径）',
        parameters: S({}),
        handler: async () => {
          if (ctx.getProjectInfo) return ctx.getProjectInfo()
          return {
            app: 'Opptrix',
            version: '0.6.0',
            runtime: process.env.OPPTRIX_DESKTOP === '1' ? 'desktop' : 'node',
            project_root: resolveProjectRoot(),
            paths: getDataLayerPaths(),
          }
        },
      },
      {
        name: 'get_integration_status', category: '基础',
        description: '读取外部集成配置状态（Tushare Token 等，不含密钥）',
        parameters: S({}),
        handler: async () => {
          const tushare = await d('tushare_config', {})
          return { tushare: tushare.data ?? tushare }
        },
      },
      {
        name: 'ask_user',
        category: '交互',
        description: '向用户发起选择题确认；会在输入框上方展示题目与选项，最后一项可自由输入后回车提交，作答后继续分析',
        parameters: S({
          title: { type: 'string', description: '可选面板标题，如「分析范围确认」' },
          prompt: { type: 'string', description: '要向用户提出的具体问题（面向投资者，避免技术术语）' },
          options: {
            type: 'array',
            description: '2–5 个预置选项，每项为 { id, label }；id 为稳定标识，label 为展示文案',
          },
          allow_multiple: { type: 'boolean', description: '是否允许多选，默认 false' },
        }, ['prompt', 'options']),
        handler: async () => ({ error: 'ask_user 由 Agent 引擎直接处理' }),
      },
    ].map(t => ({ ...t, meta: TOOL_META[t.name] }))
  }

  private buildMetaTools(): ToolDef[] {
    const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
      ({ type: 'object', properties, required })

    return [
      {
        name: 'list_tool_packs',
        category: '工具包',
        description: '列出可用 MCP 工具包（id/标题/说明/工具数/是否已加载），不含完整 schema',
        parameters: S({}),
        handler: async () => {
          if (!this.packBridge) {
            return { error: 'list_tool_packs 需在聊天会话中调用' }
          }
          return this.packBridge.listPacks()
        },
      },
      {
        name: 'activate_tool_pack',
        category: '工具包',
        description: '激活一个或多个业务工具包，使同会话后续（含本轮刷新后）可调用其中工具',
        parameters: S({
          pack_ids: {
            type: 'array',
            description: '工具包 id 列表，如 ["news","etf","instrument_analytics"]',
            items: { type: 'string' },
          },
        }, ['pack_ids']),
        handler: async (a: Record<string, unknown>) => {
          if (!this.packBridge) {
            return { error: 'activate_tool_pack 需在聊天会话中调用' }
          }
          const raw = a.pack_ids ?? a.packIds
          const packIds = Array.isArray(raw)
            ? raw.map(x => String(x))
            : typeof raw === 'string'
              ? [raw]
              : []
          return this.packBridge.activatePacks(packIds)
        },
      },
      {
        name: 'list_mcp_servers',
        category: 'MCP服务器',
        description: '列出用户配置的外部 MCP Server（启用/暂停/健康/工具数/优先级），无密钥',
        parameters: S({}),
        handler: async () => {
          const { getExternalMcpRegistry } = await import('./mcp/external/registry.js')
          const reg = getExternalMcpRegistry()
          await reg.hydrate()
          return { servers: reg.listPublic() }
        },
      },
      {
        name: 'enable_mcp_server',
        category: 'MCP服务器',
        description: '启用外部 MCP Server 并热加载到本轮工具目录（不改 command/url/env）',
        parameters: S({
          server_id: { type: 'string', description: 'MCP Server id' },
        }, ['server_id']),
        handler: async (a: Record<string, unknown>) => {
          const { getExternalMcpRegistry } = await import('./mcp/external/registry.js')
          const id = String(a.server_id ?? a.serverId ?? '').trim()
          if (!id) return { error: 'server_id 必填' }
          const reg = getExternalMcpRegistry()
          if (!reg.getRecord(id)) return { error: `未知服务器: ${id}` }
          reg.save(id, { enabled: true, paused: false })
          await reg.hydrate()
          return { ok: true, server: reg.listPublic().find(s => s.id === id) }
        },
      },
      {
        name: 'disable_mcp_server',
        category: 'MCP服务器',
        description: '禁用外部 MCP Server（保留配置，不参与路由/目录，本地工具兜底）',
        parameters: S({
          server_id: { type: 'string', description: 'MCP Server id' },
        }, ['server_id']),
        handler: async (a: Record<string, unknown>) => {
          const { getExternalMcpRegistry } = await import('./mcp/external/registry.js')
          const id = String(a.server_id ?? a.serverId ?? '').trim()
          if (!id) return { error: 'server_id 必填' }
          const reg = getExternalMcpRegistry()
          if (!reg.getRecord(id)) return { error: `未知服务器: ${id}` }
          reg.save(id, { paused: true })
          await reg.hydrate()
          return { ok: true, server: reg.listPublic().find(s => s.id === id) }
        },
      },
      {
        name: 'edit_mcp_server',
        category: 'MCP服务器',
        description: '编辑已安装 MCP Server 的配置。仅传需要修改的字段，未传字段保持不变。支持修改 title/transport/url/command/args/cwd/env/headers/secrets/capability_bindings。',
        parameters: S({
          server_id: { type: 'string', description: 'MCP Server id（不可改）' },
          title: { type: 'string', description: '新显示名称' },
          transport: { type: 'string', description: 'stdio | http | streamable-http | sse（改传输会重置 transportConfig）' },
          command: { type: 'string', description: 'stdio：新的可执行文件路径' },
          args: { type: 'array', description: 'stdio 新参数列表', items: { type: 'string' } },
          cwd: { type: 'string', description: 'stdio 新工作目录' },
          env: { type: 'object', description: 'stdio 非密钥环境变量（全量替换）' },
          url: { type: 'string', description: 'http/streamable-http/sse：新 endpoint URL' },
          headers: { type: 'object', description: 'http/sse 非密钥 Header（全量替换）' },
          secrets: { type: 'object', description: '鉴权密钥（合并写入：仅更新指定 key，不传不清除，传空字符串清除某 key）' },
          capability_bindings: {
            type: 'object',
            description: '本地工具名→外部工具名（合并写入：仅更新指定绑定）',
          },
        }, ['server_id']),
        handler: async (a: Record<string, unknown>) => {
          const { getExternalMcpRegistry } = await import('./mcp/external/registry.js')
          const id = String(a.server_id ?? a.serverId ?? '').trim()
          if (!id) return { error: 'server_id 必填' }
          const reg = getExternalMcpRegistry()
          const row = reg.getRecord(id)
          if (!row) return { error: `未知服务器: ${id}` }

          const patch: Record<string, unknown> = {}

          // title
          if (a.title != null) {
            const t = String(a.title).trim()
            if (!t) return { error: 'title 不可为空' }
            patch.title = t
          }

          // transport / transportConfig
          const newTransport = a.transport != null ? String(a.transport).trim().toLowerCase() : null
          const validTransports = ['stdio', 'http', 'streamable-http', 'sse']
          if (newTransport && !validTransports.includes(newTransport)) {
            return { error: `transport 须为 ${validTransports.join(' / ')}` }
          }
          if (newTransport) {
            if (newTransport === 'stdio') {
              const cmd = String(a.command ?? '').trim()
              if (!cmd) return { error: '切换为 stdio 须提供 command' }
              const envRaw = a.env && typeof a.env === 'object' && !Array.isArray(a.env)
                ? Object.fromEntries(Object.entries(a.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
                : undefined
              patch.transportConfig = {
                transport: 'stdio',
                command: cmd,
                args: Array.isArray(a.args) ? a.args.map(String) : [],
                cwd: a.cwd != null ? String(a.cwd) : undefined,
                env: envRaw,
              } as import('@opptrix/shared').McpStdioTransportConfig
            } else if (newTransport === 'sse') {
              const url = String(a.url ?? '').trim()
              if (!url) return { error: '切换为 sse 须提供 url' }
              const headersRaw = a.headers && typeof a.headers === 'object' && !Array.isArray(a.headers)
                ? Object.fromEntries(Object.entries(a.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
                : undefined
              patch.transportConfig = {
                transport: 'sse',
                url,
                headers: headersRaw,
              } as import('@opptrix/shared').McpSseTransportConfig
            } else {
              const url = String(a.url ?? '').trim()
              if (!url) return { error: `切换为 ${newTransport} 须提供 url` }
              const headersRaw = a.headers && typeof a.headers === 'object' && !Array.isArray(a.headers)
                ? Object.fromEntries(Object.entries(a.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
                : undefined
              patch.transportConfig = {
                transport: newTransport,
                url,
                headers: headersRaw,
              } as import('@opptrix/shared').McpHttpTransportConfig
            }
          } else {
            // transport 未改但可能改子字段
            const currentT = row.transportConfig.transport
            if (currentT === 'stdio') {
              const cmd = a.command != null ? String(a.command).trim() : undefined
              const args = a.args != null ? (Array.isArray(a.args) ? a.args.map(String) : undefined) : undefined
              const cwd = a.cwd != null ? String(a.cwd) : undefined
              const envRaw = a.env && typeof a.env === 'object' && !Array.isArray(a.env)
                ? Object.fromEntries(Object.entries(a.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
                : undefined
              if (cmd !== undefined || args !== undefined || cwd !== undefined || envRaw !== undefined) {
                patch.transportConfig = {
                  ...row.transportConfig,
                  command: cmd ?? (row.transportConfig as { command: string }).command,
                  args: args ?? (row.transportConfig as { args?: string[] }).args,
                  cwd: cwd ?? (row.transportConfig as { cwd?: string }).cwd,
                  env: envRaw ?? (row.transportConfig as { env?: Record<string, string> }).env,
                }
              }
            } else if (currentT === 'sse' || currentT === 'http' || currentT === 'streamable-http') {
              const url = a.url != null ? String(a.url).trim() : undefined
              const headersRaw = a.headers && typeof a.headers === 'object' && !Array.isArray(a.headers)
                ? Object.fromEntries(Object.entries(a.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
                : undefined
              if (url !== undefined || headersRaw !== undefined) {
                patch.transportConfig = {
                  ...row.transportConfig,
                  url: url ?? (row.transportConfig as { url: string }).url,
                  headers: headersRaw ?? (row.transportConfig as { headers?: Record<string, string> }).headers,
                }
              }
            }
          }

          // secrets（合并写入：空字符串清除）
          if (a.secrets != null && typeof a.secrets === 'object' && !Array.isArray(a.secrets)) {
            const secretsRaw = Object.fromEntries(
              Object.entries(a.secrets as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
            )
            patch.secrets = { ...(row.secrets ?? {}), ...secretsRaw }
            // 显式传空字符串 = 清除
            for (const [k, v] of Object.entries(secretsRaw)) {
              if (v === '') delete (patch.secrets as Record<string, string>)[k]
            }
          }

          // capability_bindings（合并写入）
          const bindingsRaw = a.capability_bindings ?? a.capabilityBindings
          if (bindingsRaw != null && typeof bindingsRaw === 'object' && !Array.isArray(bindingsRaw)) {
            const newBindings = Object.fromEntries(
              Object.entries(bindingsRaw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
            )
            patch.capabilityBindings = { ...(row.capabilityBindings ?? {}), ...newBindings }
            // 显式传空字符串 = 清除
            for (const [k, v] of Object.entries(newBindings)) {
              if (v === '') delete (patch.capabilityBindings as Record<string, string>)[k]
            }
          }

          if (Object.keys(patch).length === 0) {
            return { error: '无可识别的修改字段（需传 title/transport/url/command/args/cwd/env/headers/secrets/capability_bindings 之一）' }
          }

          reg.save(id, patch as import('@opptrix/shared').McpServerPatch)
          await reg.hydrate()
          const test = await reg.testConnection(id)
          return {
            ok: test.ok,
            server: reg.listPublic().find(s => s.id === id),
            test,
          }
        },
      },
      {
        name: 'install_mcp_server',
        category: 'MCP服务器',
        description: '安装（登记）外部 MCP Server。首次调用勿传 confirmed；向用户 ask_user 确认后再以 confirmed=true 重试。支持 stdio / http / streamable-http / sse 四种传输。',
        parameters: S({
          title: { type: 'string', description: '显示名称' },
          transport: { type: 'string', description: 'stdio | http | streamable-http | sse' },
          command: { type: 'string', description: 'stdio：可执行文件路径' },
          args: { type: 'array', description: 'stdio 参数列表', items: { type: 'string' } },
          cwd: { type: 'string', description: 'stdio 工作目录' },
          env: { type: 'object', description: 'stdio 非密钥环境变量，如 {"NODE_PATH": "/usr/lib"}' },
          url: { type: 'string', description: 'http/streamable-http/sse：MCP endpoint URL' },
          headers: { type: 'object', description: 'http/sse 非密钥 Header，如 {"Accept": "text/event-stream"}' },
          secrets: { type: 'object', description: '鉴权密钥（http 自动注入为 Header / stdio 注入为环境变量），如 {"api_key": "xxx"}' },
          server_id: { type: 'string', description: '可选自定义 id（小写字母开头）' },
          capability_bindings: {
            type: 'object',
            description: '本地工具名→外部工具名，如 {"get_instrument_quotes":"get_quotes"}',
          },
          confirmed: { type: 'boolean', description: '用户已确认安装；缺省或 false 时仅返回确认摘要' },
        }, ['title', 'transport']),
        handler: async (a: Record<string, unknown>) => {
          const { getExternalMcpRegistry } = await import('./mcp/external/registry.js')
          const transport = String(a.transport ?? '').trim().toLowerCase()
          const title = String(a.title ?? '').trim()
          if (!title) return { error: 'title 必填' }
          const validTransports = ['stdio', 'http', 'streamable-http', 'sse']
          if (!validTransports.includes(transport)) {
            return { error: `transport 须为 ${validTransports.join(' / ')}` }
          }

          // 解析通用参数
          const headersRaw = a.headers && typeof a.headers === 'object' && !Array.isArray(a.headers)
            ? Object.fromEntries(Object.entries(a.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : {}
          const secretsRaw = a.secrets && typeof a.secrets === 'object' && !Array.isArray(a.secrets)
            ? Object.fromEntries(Object.entries(a.secrets as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : {}
          const bindingsRaw = a.capability_bindings ?? a.capabilityBindings
          const capabilityBindings = bindingsRaw && typeof bindingsRaw === 'object' && !Array.isArray(bindingsRaw)
            ? Object.fromEntries(Object.entries(bindingsRaw as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : {}

          // 按传输类型构造 transportConfig
          let transportConfig: import('@opptrix/shared').McpTransportConfig
          if (transport === 'stdio') {
            const cmd = String(a.command ?? '').trim()
            if (!cmd) return { error: 'stdio 须提供 command' }
            const envRaw = a.env && typeof a.env === 'object' && !Array.isArray(a.env)
              ? Object.fromEntries(Object.entries(a.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
              : {}
            const stdioConfig: import('@opptrix/shared').McpStdioTransportConfig = {
              transport: 'stdio',
              command: cmd,
              args: Array.isArray(a.args) ? a.args.map(String) : [],
              cwd: a.cwd != null ? String(a.cwd) : undefined,
              env: Object.keys(envRaw).length > 0 ? envRaw : undefined,
            }
            transportConfig = stdioConfig
          } else if (transport === 'sse') {
            const url = String(a.url ?? '').trim()
            if (!url) return { error: 'sse 须提供 url' }
            const sseConfig: import('@opptrix/shared').McpSseTransportConfig = {
              transport: 'sse',
              url,
              headers: Object.keys(headersRaw).length > 0 ? headersRaw : undefined,
            }
            transportConfig = sseConfig
          } else {
            // http / streamable-http
            const url = String(a.url ?? '').trim()
            if (!url) return { error: `${transport} 须提供 url` }
            const httpConfig: import('@opptrix/shared').McpHttpTransportConfig = {
              transport: transport === 'streamable-http' ? 'streamable-http' : 'http',
              url,
              headers: Object.keys(headersRaw).length > 0 ? headersRaw : undefined,
            }
            transportConfig = httpConfig
          }

          const draft = {
            id: a.server_id != null ? String(a.server_id).trim() : undefined,
            title,
            transportConfig,
            secrets: Object.keys(secretsRaw).length > 0 ? secretsRaw : undefined,
            capabilityBindings: Object.keys(capabilityBindings).length > 0 ? capabilityBindings : undefined,
            installSource: 'manual' as const,
            enabled: true,
            paused: false,
          }

          if (a.confirmed !== true) {
            const summary = transport === 'stdio'
              ? `安装 MCP「${title}」：${(transportConfig as { command: string }).command} ${((transportConfig as { args?: string[] }).args ?? []).join(' ')}`
              : `安装 MCP「${title}」：${(transportConfig as { url: string }).url}`
            const secretKeys = Object.keys(secretsRaw)
            return {
              needs_confirmation: true,
              summary,
              secrets_note: secretKeys.length > 0
                ? `含 ${secretKeys.length} 个密钥（${secretKeys.join(', ')}），将写入用户配置`
                : undefined,
              hint: '请先用 ask_user 向用户确认安全与来源；用户同意后以相同参数 + confirmed=true 再调用 install_mcp_server',
              draft,
            }
          }
          try {
            const reg = getExternalMcpRegistry()
            const row = reg.create(draft)
            await reg.hydrate()
            const test = await reg.testConnection(row.id)
            return {
              ok: test.ok,
              server: reg.listPublic().find(s => s.id === row.id),
              test,
            }
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) }
          }
        },
      },
      {
        name: 'uninstall_mcp_server',
        category: 'MCP服务器',
        description: '卸载外部 MCP Server。须 confirmed=true；建议先 ask_user 确认。',
        parameters: S({
          server_id: { type: 'string', description: 'MCP Server id' },
          confirmed: { type: 'boolean', description: '用户已确认卸载' },
        }, ['server_id']),
        handler: async (a: Record<string, unknown>) => {
          const { getExternalMcpRegistry } = await import('./mcp/external/registry.js')
          const id = String(a.server_id ?? a.serverId ?? '').trim()
          if (!id) return { error: 'server_id 必填' }
          const reg = getExternalMcpRegistry()
          const row = reg.getRecord(id)
          if (!row) return { error: `未知服务器: ${id}` }
          if (a.confirmed !== true) {
            return {
              needs_confirmation: true,
              summary: `卸载 MCP「${row.title}」(${id})，将断开连接并删除配置`,
              hint: '请先 ask_user 确认，再以 confirmed=true 调用',
            }
          }
          reg.delete(id)
          return { ok: true, uninstalled: id }
        },
      },
      {
        name: 'reorder_mcp_servers',
        category: 'MCP服务器',
        description: '按给定 id 列表重排外部 MCP 优先级（越靠前越优先，本地始终最终兜底）',
        parameters: S({
          server_ids: {
            type: 'array',
            description: '服务器 id 新顺序',
            items: { type: 'string' },
          },
        }, ['server_ids']),
        handler: async (a: Record<string, unknown>) => {
          const { getExternalMcpRegistry } = await import('./mcp/external/registry.js')
          const raw = a.server_ids ?? a.serverIds
          const ids = Array.isArray(raw) ? raw.map(String) : []
          if (!ids.length) return { error: 'server_ids 必填' }
          const reg = getExternalMcpRegistry()
          reg.reorder(ids)
          await reg.hydrate()
          return { ok: true, servers: reg.listPublic() }
        },
      },
    ].map(t => ({ ...t, meta: TOOL_META[t.name] }))
  }
}
