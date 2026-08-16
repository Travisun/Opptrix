import type { ResearchHub } from '@opptrix/research-hub'
import type { AgentAppContext } from './app-context.js'
import {
  buildAgentSafeProjectInfo,
  createDefaultAppContext,
  getCurrentTime,
  getSystemInfo,
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
import { buildBrowserTools } from './mcp/browser-tools.js'
import { buildWorkspaceTools } from './mcp/workspace-tools.js'
import { buildScheduleTools } from './mcp/schedule-tools.js'
import { buildDocumentTools } from './document-tools.js'
import { buildCanvasTools } from './canvas-tools.js'
import { buildWebTools } from './web-tools.js'
import { currentToolSessionId } from './mcp/tool-session-context.js'
import { buildRsshubTools } from './rsshub/rsshub-tools.js'
import { resolveInstrumentFromParams, resolveOpptrixAppVersion } from '@opptrix/shared'
import { assembleSystemPrompt } from './experts/prompt-assembler.js'
import { scheduleTurnWake } from './turn-wake.js'
import {
  jobRegistry,
  watchRegistry,
} from './jobs/index.js'
import {
  hostCancelSubagent,
  hostGetSubagent,
  hostListSubagents,
  hostReclaimSubagent,
  hostRunSubagent,
  isSubagentSessionId,
} from './subagents/index.js'

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
  /** 聊天会话的 tool-pack 桥接（list/activate）；按 session+gen 绑定，避免打断重发竞态 */
  private packBridges = new Map<string, {
    bridge: {
      sessionId: string
      listPacks: () => unknown
      activatePacks: (packIds: string[]) => unknown
    }
    gen: number
  }>()
  private packBridgeGenSeq = 0
  /** 会话级 Agent Skills 激活桥接 */
  private skillBridges = new Map<string, {
    bridge: {
      sessionId: string
      activateSkills: (skillNames: string[]) => unknown
      getActivated: () => readonly string[]
    }
    gen: number
  }>()
  private skillBridgeGenSeq = 0

  constructor(private hub: ResearchHub, appContext?: AgentAppContext) {
    this.appContext = appContext ?? createDefaultAppContext()
    this.tools = [
      ...this.buildDataTools(),
      ...this.buildBasicTools(),
      ...this.buildMetaTools(),
      ...buildDocumentTools(),
      ...buildCanvasTools(),
      ...buildWebTools(),
      ...buildBrowserTools(),
      ...buildWorkspaceTools(),
      ...buildScheduleTools(),
    ]
  }

  bindPackSession(bridge: {
    sessionId: string
    listPacks: () => unknown
    activatePacks: (packIds: string[]) => unknown
  }): number {
    const gen = ++this.packBridgeGenSeq
    this.packBridges.set(bridge.sessionId, { bridge, gen })
    return gen
  }

  clearPackSession(sessionId: string, gen: number): void {
    const cur = this.packBridges.get(sessionId)
    if (cur && cur.gen === gen) {
      this.packBridges.delete(sessionId)
    }
  }

  bindSkillSession(bridge: {
    sessionId: string
    activateSkills: (skillNames: string[]) => unknown
    getActivated: () => readonly string[]
  }): number {
    const gen = ++this.skillBridgeGenSeq
    this.skillBridges.set(bridge.sessionId, { bridge, gen })
    return gen
  }

  clearSkillSession(sessionId: string, gen: number): void {
    const cur = this.skillBridges.get(sessionId)
    if (cur && cur.gen === gen) {
      this.skillBridges.delete(sessionId)
    }
  }

  private requirePackBridge(): {
    sessionId: string
    listPacks: () => unknown
    activatePacks: (packIds: string[]) => unknown
  } | null {
    const sessionId = currentToolSessionId()
    if (!sessionId) return null
    return this.packBridges.get(sessionId)?.bridge ?? null
  }

  private requireSkillBridge(): {
    sessionId: string
    activateSkills: (skillNames: string[]) => unknown
    getActivated: () => readonly string[]
  } | null {
    const sessionId = currentToolSessionId()
    if (!sessionId) return null
    return this.skillBridges.get(sessionId)?.bridge ?? null
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
    expert?: import('@opptrix/shared').ExpertDefinition | null
    sessionRolePersona?: string | null
    roleLabel?: string | null
    activePacks?: readonly string[]
    routePlaybook?: string
    activeToolNames?: readonly string[]
    researchTier?: import('@opptrix/shared').ResearchTier
    sessionClock?: string
    dataSourcingPolicy?: string
    agentSkillCatalog?: string
    activatedAgentSkills?: string
  }) {
    return assembleSystemPrompt(opts)
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
        name: 'add_news_source', category: '资讯中心',
        description: '添加 RSS/Atom 订阅来源；会先验证地址再写入',
        parameters: S({
          url: { type: 'string', description: '订阅源 URL' },
          title: { type: 'string', description: '可选显示名称；缺省用源标题' },
          group_id: { type: 'string', description: '可选分组 id；未分组省略或传空' },
          enabled: { type: 'boolean', description: '是否启用，默认 true' },
        }, ['url']),
        handler: (a: Record<string, unknown>) => d('news_source_add', a),
      },
      {
        name: 'delete_news_source', category: '资讯中心',
        description: '删除资讯订阅来源。首次勿传 confirmed；ask_user 确认后再以 confirmed=true 重试',
        parameters: S({
          subscription_id: { type: 'string', description: '订阅 id，来自 list_news_sources' },
          confirmed: { type: 'boolean', description: '用户已确认删除；缺省或 false 时仅返回确认摘要' },
        }, ['subscription_id']),
        handler: async (a: Record<string, unknown>) => {
          const id = String(a.subscription_id ?? a.id ?? '').trim()
          if (!id) return { error: 'subscription_id 必填' }
          if (a.confirmed !== true) {
            const listed = await d('news_sources_list', {})
            const sources = listed.success && listed.data && typeof listed.data === 'object'
              && Array.isArray((listed.data as { sources?: unknown }).sources)
              ? (listed.data as { sources: Array<{ id?: string; title?: string }> }).sources
              : []
            const hit = sources.find(s => s.id === id)
            const label = hit?.title ? `「${hit.title}」` : `（id=${id}）`
            return {
              needs_confirmation: true,
              summary: `将删除资讯订阅${label}，相关文章也会一并清除`,
              hint: '请先用 ask_user 向用户确认；用户同意后以相同参数 + confirmed=true 再调用 delete_news_source',
              subscription_id: id,
            }
          }
          return d('news_source_delete', { subscription_id: id })
        },
      },
      {
        name: 'import_news_sources', category: '资讯中心',
        description: '批量导入订阅。入参与导出一致：schema_version=1 + subscriptions；或仅传 subscriptions 数组。须 confirmed=true',
        parameters: S({
          schema_version: { type: 'number', description: '固定为 1；仅传 subscriptions 时内部按 1 处理' },
          subscriptions: {
            type: 'array',
            description: '订阅项列表，每项含 url，可选 title',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
          payload: { type: 'object', description: '可选：完整导出对象 { schema_version, subscriptions }' },
          confirmed: { type: 'boolean', description: '用户已确认导入；缺省或 false 时仅返回确认摘要' },
        }),
        handler: async (a: Record<string, unknown>) => {
          let count = 0
          if (Array.isArray(a.subscriptions)) count = a.subscriptions.length
          else if (a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload)) {
            const subs = (a.payload as { subscriptions?: unknown }).subscriptions
            if (Array.isArray(subs)) count = subs.length
          }
          if (a.confirmed !== true) {
            return {
              needs_confirmation: true,
              summary: count > 0
                ? `将导入 ${count} 个资讯订阅（已存在的会跳过）`
                : '将导入资讯订阅列表（已存在的会跳过）',
              hint: '请先用 ask_user 向用户确认；用户同意后以相同参数 + confirmed=true 再调用 import_news_sources',
            }
          }
          return d('news_sources_import', a)
        },
      },
      {
        name: 'create_news_group', category: '资讯中心',
        description: '创建资讯分组',
        parameters: S({
          title: { type: 'string', description: '分组名称' },
        }, ['title']),
        handler: (a: Record<string, unknown>) => d('news_group_create', { title: a.title }),
      },
      {
        name: 'update_news_group', category: '资讯中心',
        description: '更新资讯分组名称或排序',
        parameters: S({
          group_id: { type: 'string', description: '分组 id，来自 list_news_groups' },
          title: { type: 'string', description: '新名称' },
          sort_order: { type: 'number', description: '排序权重，越小越靠前' },
        }, ['group_id']),
        handler: (a: Record<string, unknown>) => d('news_group_update', a),
      },
      {
        name: 'delete_news_group', category: '资讯中心',
        description: '删除资讯分组（组内订阅改为未分组，不删订阅）。须 confirmed=true',
        parameters: S({
          group_id: { type: 'string', description: '分组 id，来自 list_news_groups' },
          confirmed: { type: 'boolean', description: '用户已确认删除；缺省或 false 时仅返回确认摘要' },
        }, ['group_id']),
        handler: async (a: Record<string, unknown>) => {
          const id = String(a.group_id ?? a.id ?? '').trim()
          if (!id) return { error: 'group_id 必填' }
          if (a.confirmed !== true) {
            const listed = await d('news_groups_list', {})
            const groups = listed.success && listed.data && typeof listed.data === 'object'
              && Array.isArray((listed.data as { groups?: unknown }).groups)
              ? (listed.data as { groups: Array<{ id?: string; title?: string; subscription_count?: number }> }).groups
              : []
            const hit = groups.find(g => g.id === id)
            const label = hit?.title ? `「${hit.title}」` : `（id=${id}）`
            const count = typeof hit?.subscription_count === 'number' ? hit.subscription_count : undefined
            return {
              needs_confirmation: true,
              summary: count != null
                ? `将删除资讯分组${label}，组内 ${count} 个订阅会改为未分组（订阅本身保留）`
                : `将删除资讯分组${label}，组内订阅会改为未分组（订阅本身保留）`,
              hint: '请先用 ask_user 向用户确认；用户同意后以相同参数 + confirmed=true 再调用 delete_news_group',
              group_id: id,
            }
          }
          return d('news_group_delete', { group_id: id })
        },
      },
      {
        name: 'move_news_source', category: '资讯中心',
        description: '将订阅移入指定分组，或移出为未分组',
        parameters: S({
          subscription_id: { type: 'string', description: '订阅 id，来自 list_news_sources' },
          group_id: {
            type: 'string',
            description: '目标分组 id；未分组传空字符串或省略',
          },
        }, ['subscription_id']),
        handler: (a: Record<string, unknown>) => d('news_source_move_group', {
          subscription_id: a.subscription_id,
          group_id: a.group_id ?? null,
        }),
      },
      {
        name: 'validate_news_source', category: '资讯中心',
        description: '验证 RSS/Atom 订阅地址是否可解析（不写入）',
        parameters: S({
          url: { type: 'string', description: '待验证的订阅源 URL' },
          title: { type: 'string', description: '可选标题提示' },
        }, ['url']),
        handler: (a: Record<string, unknown>) => d('news_source_validate', a),
      },
      ...buildRsshubTools(),
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
        name: 'schedule_turn_wake',
        category: '基础',
        description:
          '无后台任务事件时的纯延时续跑：登记 timer 后结束本轮，到期同会话自动续跑；有 job_id 的异步任务依赖终态自动通知，禁止传 job_id；勿 poll/sleep 查进度；seconds 5–1800；新消息会取消 pending',
        parameters: S({
          seconds: {
            type: 'number',
            description: '延迟秒数，闭区间 [5, 1800]（30 分钟）；超出将钳制',
          },
          prompt: {
            type: 'string',
            description: '到期后注入的续跑说明（必填）；应写清如何继续',
          },
          reason: {
            type: 'string',
            description: '可选：挂起原因（如 waiting_user_action）',
          },
        }, ['seconds', 'prompt']),
        handler: async (args: Record<string, unknown>) => {
          const sessionId = currentToolSessionId()
          if (!sessionId) {
            return { ok: false, error: 'schedule_turn_wake 须在聊天会话工具上下文中调用' }
          }
          if (args.job_id != null && String(args.job_id).trim()) {
            return {
              ok: false,
              error:
                'schedule_turn_wake 不接受 job_id：有后台任务时依赖终态自动续跑；本工具仅用于无任务事件的纯延时',
            }
          }
          return scheduleTurnWake({
            sessionId,
            seconds: args.seconds,
            prompt: String(args.prompt ?? ''),
            reason: args.reason != null ? String(args.reason) : undefined,
          })
        },
      },
      {
        name: 'cancel_job',
        category: '基础',
        description:
          '显式取消可取消的后台任务；多数安装/下载任务不支持取消，仅结束本轮等待请发新消息或 Stop',
        parameters: S({
          job_id: { type: 'string', description: '后台任务 id（必填）' },
        }, ['job_id']),
        handler: async (args: Record<string, unknown>) => {
          const sessionId = currentToolSessionId()
          const jobId = String(args.job_id ?? '').trim()
          if (!jobId) return { ok: false, error: 'job_id 必填' }
          const result = await jobRegistry.requestCancel(jobId)
          if (result.ok && sessionId) {
            watchRegistry.clearByJob(sessionId, jobId)
          }
          return {
            ok: result.ok,
            job_id: jobId,
            cancelled: result.ok,
            error: result.error,
            note: result.ok
              ? '已取消任务'
              : (result.error ?? '无法取消'),
          }
        },
      },
      {
        name: 'list_jobs',
        category: '基础',
        description:
          '列出本对话相关的后台任务（标题、状态、进度、是否可取消）；可按 states/kind/limit 筛选',
        parameters: S({
          states: {
            type: 'array',
            description: '可选状态过滤：queued/accepted/preparing/running/completed/failed/cancelled',
            items: { type: 'string' },
          },
          kind: {
            type: 'string',
            description: '可选类型：shell-command | python-install | fuyao-dump',
          },
          limit: {
            type: 'number',
            description: '最多返回条数，默认 20，上限 50',
          },
        }),
        handler: async (args: Record<string, unknown>) => {
          const sessionId = currentToolSessionId()
          if (!sessionId) {
            return { ok: false, error: 'list_jobs 须在聊天会话工具上下文中调用' }
          }
          const kindRaw = args.kind != null ? String(args.kind).trim() : ''
          const kind = kindRaw === 'shell-command' || kindRaw === 'python-install' || kindRaw === 'fuyao-dump'
            ? kindRaw
            : undefined
          const statesRaw = Array.isArray(args.states) ? args.states : []
          const states = statesRaw
            .map(s => String(s).trim())
            .filter((s): s is 'queued' | 'accepted' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled' =>
              ['queued', 'accepted', 'preparing', 'running', 'completed', 'failed', 'cancelled'].includes(s))
          const limitRaw = typeof args.limit === 'number' ? args.limit : Number(args.limit)
          const limit = Number.isFinite(limitRaw)
            ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
            : 20

          const watched = new Set(watchRegistry.listSession(sessionId).map(w => w.jobId))
          let snaps = jobRegistry.list({
            kind,
            states: states.length ? states : undefined,
          }).filter((snap) => {
            const sid = typeof snap.meta?.session_id === 'string' ? snap.meta.session_id : ''
            if (sid && sid === sessionId) return true
            if (watched.has(snap.jobId)) return true
            return false
          })
          snaps = snaps
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
            .slice(0, limit)

          const jobs = snaps.map((snap) => {
            const stdoutTail = typeof snap.meta?.stdout_tail === 'string'
              ? snap.meta.stdout_tail
              : undefined
            const metaSummary: Record<string, unknown> = {}
            if (typeof snap.meta?.command_summary === 'string') {
              metaSummary.command_summary = snap.meta.command_summary
            }
            if (snap.meta?.exit_code !== undefined) metaSummary.exit_code = snap.meta.exit_code
            if (snap.meta?.dump_kind !== undefined) metaSummary.dump_kind = snap.meta.dump_kind
            return {
              job_id: snap.jobId,
              kind: snap.kind,
              title: snap.title
                ?? (typeof snap.meta?.command_summary === 'string' ? snap.meta.command_summary : undefined)
                ?? undefined,
              label: snap.progress.message,
              state: snap.state,
              percent: snap.progress.percent,
              cancelable: snap.cancelable,
              eta_seconds: snap.progress.etaSeconds ?? undefined,
              stdout_tail: stdoutTail || undefined,
              meta: Object.keys(metaSummary).length ? metaSummary : undefined,
            }
          })
          return { ok: true, jobs, count: jobs.length }
        },
      },
      {
        name: 'get_system_info', category: '基础',
        description: '获取运行环境信息（平台、时区、沙盒 node/python/npm 就绪状态、桌面/服务端模式）',
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
        description: '读取运行环境元数据（版本、运行时、数据是否已配置）；不是可访问目录清单，询问授权目录请用 list_workspace_grants',
        parameters: S({}),
        handler: async () => {
          if (ctx.getProjectInfo) return ctx.getProjectInfo()
          return buildAgentSafeProjectInfo({
            app: 'Opptrix',
            version: resolveOpptrixAppVersion(),
            runtime: process.env.OPPTRIX_DESKTOP === '1' ? 'desktop' : 'node',
          })
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
        description:
          '向用户提问：mode=confirm（或空 options 默认）为拒绝/确认授权；mode=choice + 2–50 options 为选择题；mode=text（或空 options+allow_custom=true）为开放填空。禁止用 confirm 收集开放答案；禁止索要密钥',
        parameters: S({
          title: { type: 'string', description: '可选面板标题；text 模式默认「请补充」，confirm 默认「请确认」' },
          prompt: { type: 'string', description: '要向用户提出的具体问题（面向投资者，避免技术术语）' },
          mode: {
            type: 'string',
            description:
              'confirm | choice | text（亦可用参数别名 interaction）。开放填空用 text；授权/危险操作用 confirm；有限选项用 choice',
          },
          options: {
            type: 'array',
            description:
              '可选。省略/[] 且未设 text/allow_custom → confirm（回传 reject/confirm）；空 options+allow_custom=true → text；选择题须 2–50 项 { id, label }；勿用 emoji',
          },
          allow_multiple: { type: 'boolean', description: '选择题是否允许多选，默认 false；confirm/text 忽略' },
          reject_label: {
            type: 'string',
            description: 'confirm 模式拒绝按钮文案，默认「拒绝」；回传 id 固定为 reject（授权场景可用「不允许」）',
          },
          confirm_label: {
            type: 'string',
            description: 'confirm 模式确认按钮文案，默认「确认」；回传 id 固定为 confirm（授权场景可用「授权使用」）',
          },
          allow_custom: {
            type: 'boolean',
            description:
              '是否允许自行输入；confirm 默认 false，choice 默认 true；空 options 且为 true 时进入 text 开放填空（无授权双钮）',
          },
        }, ['prompt']),
        handler: async () => ({ error: 'ask_user 由 Agent 引擎直接处理' }),
      },
      {
        name: 'run_subagent',
        category: '委派',
        description:
          '高可用委派：role{name,instructions}（instructions 写清禁止编造/荐股/再委派）+ task + result_schema（type:object，含 properties+required，建议强制 summary:string；例 {"type":"object","properties":{"summary":{"type":"string"}},"required":["summary"]}）+ 可选 context 摘要 / label 短中文；mode=background 并行、foreground 串行。创建前可 list_subagents 一次；同 label/role 进行中自动 dedupe；失败优先 restart_run_id 复用同卡。子不可再委派、无 ask_user；禁止 list/get 忙等 poll',
        parameters: S({
          role: {
            type: 'object',
            description:
              '子角色：name、instructions 必填（写清角色纪律与禁止项：编造、荐股、再委派、ask_user）；可选 model（须为已启用的 providerId:model，否则省略以继承父会话）/temperature/max_rounds',
          },
          task: { type: 'string', description: '子任务目标（必填）' },
          context: { type: 'string', description: '可选上下文摘要（勿整篇堆叠）' },
          result_schema: {
            type: 'object',
            description:
              '终态 JSON Schema：type 须为 object；须含 properties+required；建议强制 summary:string。坏例：空 object、无 required、无 summary、嵌套过深',
          },
          mode: {
            type: 'string',
            description: 'background=独立并行（推荐多角色）；foreground=强依赖上一步（默认阻塞）',
          },
          label: { type: 'string', description: '短中文展示名（用户可见）；同 label 进行中会 dedupe' },
          restart_run_id: {
            type: 'string',
            description: '可选。复用 failed/cancelled/needs_parent_action 的 run_id 重启（同 child_session_id），勿堆新卡',
          },
        }, ['role', 'task', 'result_schema']),
        handler: async (args: Record<string, unknown>) => {
          const sessionId = currentToolSessionId()
          if (!sessionId) {
            return { ok: false, error: 'run_subagent 须在聊天会话工具上下文中调用' }
          }
          if (isSubagentSessionId(sessionId)) {
            return { ok: false, error: '子任务不能再委派' }
          }
          const roleRaw = args.role
          if (!roleRaw || typeof roleRaw !== 'object' || Array.isArray(roleRaw)) {
            return { ok: false, error: 'role 须为对象' }
          }
          const roleObj = roleRaw as Record<string, unknown>
          const name = String(roleObj.name ?? '').trim()
          const instructions = String(roleObj.instructions ?? '').trim()
          if (!name || !instructions) {
            return { ok: false, error: 'role.name 与 role.instructions 必填' }
          }
          const task = String(args.task ?? '').trim()
          if (!task) return { ok: false, error: 'task 必填' }
          const schemaRaw = args.result_schema
          if (!schemaRaw || typeof schemaRaw !== 'object' || Array.isArray(schemaRaw)) {
            return { ok: false, error: 'result_schema 须为 object' }
          }
          const resultSchema = schemaRaw as Record<string, unknown>
          if (resultSchema.type !== 'object') {
            return { ok: false, error: 'result_schema.type 须为 "object"' }
          }
          const modeRaw = String(args.mode ?? 'foreground').trim()
          const mode = modeRaw === 'background' ? 'background' as const : 'foreground' as const
          const temperature = typeof roleObj.temperature === 'number' ? roleObj.temperature : undefined
          const maxRounds = typeof roleObj.max_rounds === 'number' ? roleObj.max_rounds : undefined
          return hostRunSubagent(sessionId, {
            role: {
              name,
              instructions,
              model: roleObj.model != null ? String(roleObj.model) : undefined,
              temperature,
              max_rounds: maxRounds,
            },
            task,
            context: args.context != null ? String(args.context) : undefined,
            result_schema: resultSchema as import('./subagents/types.js').SubagentResultSchema,
            mode,
            label: args.label != null ? String(args.label) : undefined,
            restart_run_id: args.restart_run_id != null ? String(args.restart_run_id) : undefined,
          })
        },
      },
      {
        name: 'list_subagents',
        category: '委派',
        description:
          '列出本父会话协作任务（只读）。创建前可调用一次核对；禁止 sleep/忙等轮询；终态会自动续跑；需完整结果时对目标 run 调用一次 get_subagent；失败优先 restart_run_id',
        parameters: S({}),
        handler: async () => {
          const sessionId = currentToolSessionId()
          if (!sessionId) {
            return { ok: false, error: 'list_subagents 须在聊天会话工具上下文中调用', runs: [] }
          }
          if (isSubagentSessionId(sessionId)) {
            return { ok: false, error: '子任务不能使用委派工具', runs: [] }
          }
          return hostListSubagents(sessionId)
        },
      },
      {
        name: 'cancel_subagent',
        category: '委派',
        description: '取消指定 run_id 的子任务',
        parameters: S({
          run_id: { type: 'string', description: '子任务 run_id（必填）' },
        }, ['run_id']),
        handler: async (args: Record<string, unknown>) => {
          const sessionId = currentToolSessionId()
          if (!sessionId) {
            return { ok: false, error: 'cancel_subagent 须在聊天会话工具上下文中调用' }
          }
          if (isSubagentSessionId(sessionId)) {
            return { ok: false, error: '子任务不能使用委派工具' }
          }
          const runId = String(args.run_id ?? '').trim()
          if (!runId) return { ok: false, error: 'run_id 必填' }
          return hostCancelSubagent(sessionId, runId)
        },
      },
      {
        name: 'get_subagent',
        category: '委派',
        description:
          '查询协作任务状态与完整结果（只读）。禁止为等进度反复 get/poll/sleep；只需在需要读结果时调用一次；失败可再 run_subagent',
        parameters: S({
          run_id: { type: 'string', description: '子任务 run_id（必填）' },
        }, ['run_id']),
        handler: async (args: Record<string, unknown>) => {
          const sessionId = currentToolSessionId()
          if (!sessionId) {
            return { ok: false, error: 'get_subagent 须在聊天会话工具上下文中调用' }
          }
          if (isSubagentSessionId(sessionId)) {
            return { ok: false, error: '子任务不能使用委派工具' }
          }
          const runId = String(args.run_id ?? '').trim()
          if (!runId) return { ok: false, error: 'run_id 必填' }
          return hostGetSubagent(runId, sessionId)
        },
      },
      {
        name: 'reclaim_subagent',
        category: '委派',
        description: '回收已结束的子任务（运行中须先 cancel）',
        parameters: S({
          run_id: { type: 'string', description: '子任务 run_id（必填）' },
        }, ['run_id']),
        handler: async (args: Record<string, unknown>) => {
          const sessionId = currentToolSessionId()
          if (!sessionId) {
            return { ok: false, error: 'reclaim_subagent 须在聊天会话工具上下文中调用' }
          }
          if (isSubagentSessionId(sessionId)) {
            return { ok: false, error: '子任务不能使用委派工具' }
          }
          const runId = String(args.run_id ?? '').trim()
          if (!runId) return { ok: false, error: 'run_id 必填' }
          return hostReclaimSubagent(runId, sessionId)
        },
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
          const pack = this.requirePackBridge()
          if (!pack) {
            return { error: 'list_tool_packs 需在聊天会话中调用' }
          }
          return pack.listPacks()
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
          const pack = this.requirePackBridge()
          if (!pack) {
            return { error: 'activate_tool_pack 需在聊天会话中调用' }
          }
          const raw = a.pack_ids ?? a.packIds
          const packIds = Array.isArray(raw)
            ? raw.map(x => String(x))
            : typeof raw === 'string'
              ? [raw]
              : []
          return pack.activatePacks(packIds)
        },
      },
      {
        name: 'list_agent_skills',
        category: '工作流技能',
        description: '列出可用工作流技能（名称/说明/来源）；仅元数据，不含完整步骤正文',
        parameters: S({}),
        handler: async () => {
          const {
            listSkillIndex,
            toPublicIndexEntry,
          } = await import('@opptrix/agent-skills')
          const skill = this.requireSkillBridge()
          const active = skill ? [...skill.getActivated()] : []
          return {
            skills: listSkillIndex().map(e => ({
              ...toPublicIndexEntry(e),
              activated: active.includes(e.name),
            })),
            active_skills: active,
          }
        },
      },
      {
        name: 'activate_agent_skill',
        category: '工作流技能',
        description: '激活一个或多个工作流技能，将完整步骤注入本会话（最多 3 个）；技能正文中的 `@skill:依赖` 会自动递归激活；若技能声明了 allowed-tools / required-packs，会自动挂上对应工具包（本轮即可调用 create_canvas/create_web 等，无需再 activate_tool_pack）',
        parameters: S({
          skill_names: {
            type: 'array',
            description: '技能 name 列表，如 ["morning-market-brief","equity-deep-dive"]',
            items: { type: 'string' },
          },
        }, ['skill_names']),
        handler: async (a: Record<string, unknown>) => {
          const skill = this.requireSkillBridge()
          if (!skill) {
            return { error: 'activate_agent_skill 需在聊天会话中调用' }
          }
          const raw = a.skill_names ?? a.skillNames
          const names = Array.isArray(raw)
            ? raw.map(x => String(x))
            : typeof raw === 'string'
              ? [raw]
              : []
          return skill.activateSkills(names)
        },
      },
      {
        name: 'update_research_checklist',
        category: '工作流技能',
        description: '更新本会话研究步骤清单（替换或合并）；用于多步投研对照进度',
        parameters: S({
          mode: {
            type: 'string',
            description: 'replace=整体替换；merge=按 id 合并（默认）',
          },
          items: {
            type: 'array',
            description: '步骤列表：{ id?, title, status: pending|done|skipped }',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'done', 'skipped'] },
              },
            },
          },
        }, ['items']),
        handler: async (a: Record<string, unknown>) => {
          const sessionId = currentToolSessionId()
          if (!sessionId) {
            return { error: 'update_research_checklist 需在聊天会话中调用' }
          }
          const { updateResearchChecklist } = await import('./loop/research-checklist.js')
          return updateResearchChecklist(sessionId, {
            mode: typeof a.mode === 'string' ? a.mode : undefined,
            items: a.items,
          })
        },
      },
      {
        name: 'get_agent_skill',
        category: '工作流技能',
        description: '读取单个工作流技能的完整说明正文；也可用于预览后再 activate',
        parameters: S({
          skill_name: { type: 'string', description: '技能 name' },
        }, ['skill_name']),
        handler: async (a: Record<string, unknown>) => {
          const { getSkill, toPublicDetail, AgentSkillError } = await import('@opptrix/agent-skills')
          const name = String(a.skill_name ?? a.skillName ?? '').trim()
          if (!name) return { error: 'skill_name 必填' }
          try {
            const detail = getSkill(name)
            if (!detail) return { error: `未找到工作流技能「${name}」` }
            return { skill: toPublicDetail(detail) }
          } catch (e) {
            if (e instanceof AgentSkillError) return { error: e.message }
            return { error: '暂时无法读取该技能' }
          }
        },
      },
      {
        name: 'get_agent_skill_file',
        category: '工作流技能',
        description: '按需读取已激活或已安装技能目录内的附加文件（相对路径）',
        parameters: S({
          skill_name: { type: 'string', description: '技能 name' },
          path: { type: 'string', description: '相对技能根目录的路径，如 references/notes.md' },
        }, ['skill_name', 'path']),
        handler: async (a: Record<string, unknown>) => {
          const { readSkillFile, AgentSkillError } = await import('@opptrix/agent-skills')
          const name = String(a.skill_name ?? a.skillName ?? '').trim()
          const rel = String(a.path ?? '').trim()
          if (!name) return { error: 'skill_name 必填' }
          if (!rel) return { error: 'path 必填' }
          try {
            const content = readSkillFile(name, rel)
            return { skill_name: name, path: rel, content }
          } catch (e) {
            if (e instanceof AgentSkillError) return { error: e.message }
            return { error: '暂时无法读取该文件' }
          }
        },
      },
      {
        name: 'create_agent_skill',
        category: '工作流技能',
        description: '创建用户工作流技能。首次勿传 confirmed；ask_user 确认后再以 confirmed=true 重试',
        parameters: S({
          name: { type: 'string', description: '技能 name（小写+连字符）' },
          description: { type: 'string', description: '何时使用与能力说明（1–1024 字）' },
          body: { type: 'string', description: '技能步骤正文（Markdown）' },
          references: {
            type: 'array',
            description: '可选：frontmatter references 路径列表（如 references/notes.md）',
            items: { type: 'string' },
          },
          files: {
            type: 'array',
            description: '可选：附件 { path, content }，path 须在 references/、scripts/、assets/ 下',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
          confirmed: { type: 'boolean', description: '用户已确认创建；缺省或 false 时仅返回确认摘要' },
        }, ['name', 'description', 'body']),
        handler: async (a: Record<string, unknown>) => {
          const name = String(a.name ?? '').trim()
          const description = String(a.description ?? '').trim()
          const body = String(a.body ?? '')
          const references = Array.isArray(a.references)
            ? a.references.filter((x): x is string => typeof x === 'string')
            : undefined
          const files = Array.isArray(a.files)
            ? a.files
                .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
                .map(x => ({
                  path: String(x.path ?? ''),
                  content: String(x.content ?? ''),
                }))
                .filter(x => x.path.trim())
            : undefined
          if (!name || !description) {
            return { error: '请补充技能名称与说明后再试' }
          }
          if (a.confirmed !== true) {
            return {
              needs_confirmation: true,
              summary: {
                name,
                description,
                body_preview: body.slice(0, 200),
                references_count: references?.length ?? 0,
                files_count: files?.length ?? 0,
                file_paths: files?.map(f => f.path).slice(0, 8),
              },
              hint: '请先用 ask_user 向用户确认；用户同意后以相同参数 + confirmed=true 再调用 create_agent_skill',
            }
          }
          const { createSkill, AgentSkillError, toPublicDetail } = await import('@opptrix/agent-skills')
          try {
            const skill = createSkill({
              name,
              description,
              body,
              references,
              files,
              source: 'agent_created',
            })
            return { ok: true, skill: toPublicDetail(skill) }
          } catch (e) {
            if (e instanceof AgentSkillError) return { error: e.message }
            return { error: '创建技能失败，请检查内容后重试' }
          }
        },
      },
      {
        name: 'import_agent_skill',
        category: '工作流技能',
        description: '从 Markdown 文本导入工作流技能。须 confirmed=true；建议先 ask_user',
        parameters: S({
          markdown: { type: 'string', description: '完整技能说明文本（含元数据区块与正文）' },
          confirmed: { type: 'boolean', description: '用户已确认导入' },
        }, ['markdown']),
        handler: async (a: Record<string, unknown>) => {
          const markdown = String(a.markdown ?? '')
          if (!markdown.trim()) return { error: '请粘贴完整的技能说明后再导入' }
          if (a.confirmed !== true) {
            return {
              needs_confirmation: true,
              summary: { markdown_preview: markdown.slice(0, 240) },
              hint: '请先用 ask_user 向用户确认；用户同意后以相同参数 + confirmed=true 再调用 import_agent_skill',
            }
          }
          const { installSkillFromMarkdown, AgentSkillError, toPublicDetail } = await import('@opptrix/agent-skills')
          try {
            const skill = installSkillFromMarkdown(markdown, { source: 'imported' })
            return { ok: true, skill: toPublicDetail(skill) }
          } catch (e) {
            if (e instanceof AgentSkillError) return { error: e.message }
            return { error: '导入失败，请检查技能说明格式后重试' }
          }
        },
      },
      {
        name: 'delete_agent_skill',
        category: '工作流技能',
        description: '删除用户导入/创建的工作流技能（不可删内置）。须 confirmed=true',
        parameters: S({
          skill_name: { type: 'string', description: '技能 name' },
          confirmed: { type: 'boolean', description: '用户已确认删除' },
        }, ['skill_name']),
        handler: async (a: Record<string, unknown>) => {
          const name = String(a.skill_name ?? a.skillName ?? '').trim()
          if (!name) return { error: 'skill_name 必填' }
          if (a.confirmed !== true) {
            return {
              needs_confirmation: true,
              summary: { skill_name: name },
              hint: '请先用 ask_user 向用户确认；用户同意后以相同参数 + confirmed=true 再调用 delete_agent_skill',
            }
          }
          const { deleteUserSkill, AgentSkillError } = await import('@opptrix/agent-skills')
          try {
            return deleteUserSkill(name)
          } catch (e) {
            if (e instanceof AgentSkillError) return { error: e.message }
            return { error: '删除失败，请稍后重试' }
          }
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
