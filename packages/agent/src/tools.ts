import type { ResearchHub } from '@inno-a-stock/research-hub'
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

/** @deprecated 使用 DATA_LAYER_MINING_TOOL_NAMES */
export const DISCOVER_MINING_TOOL_NAMES = DATA_LAYER_MINING_TOOL_NAMES

export interface JsonSchema {
  type: 'object'
  properties: Record<string, { type: string; description?: string; items?: unknown; default?: unknown }>
  required?: string[]
}

export interface ToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
  meta?: ToolMeta
}

export interface McpToolDef {
  name: string
  description: string
  inputSchema: JsonSchema
}

export interface OpenAiTool {
  type: 'function'
  function: { name: string; description: string; parameters: JsonSchema }
}

export class ToolRegistry {
  readonly tools: ToolDef[]
  private appContext: AgentAppContext

  constructor(private hub: ResearchHub, appContext?: AgentAppContext) {
    this.appContext = appContext ?? createDefaultAppContext()
    this.tools = [...this.buildDataTools(), ...this.buildBasicTools()]
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

  systemPrompt() {
    return [
      '你是 innoAStock 专业 A 股投研助手。仅通过已注册的 MCP 投研工具获取真实数据，再基于结果用中文给出简洁、专业的分析。',
      '规则：',
      '- 需要数据时必须先调用工具，禁止编造数字或臆测行情',
      '- 任务开始先 get_market_db_status；本地库不足时用在线工具或 trigger_market_db_sync（谨慎）',
      '- 本地初选列表：先 get_local_universe_screen_schema 了解维度与数值格式，再用 screen_local_universe 组合筛选',
      '- 按行业选股：先 list_local_industries 获取行业名称，再用 screen_local_industry_stocks 在行业内叠加因子/评分条件',
      '- 批量用 codes 数组（batch_stock_snapshots、get_stock_quotes）；单股深度（get_stock_detail）仅对 shortlisted 标的',
      '- 每个工具描述含【何时使用】【调用规范】，严格遵守',
      '- 不推荐具体买卖，仅提供研究与数据解读',
      '- 可组合多个工具由浅入深补全数据',
      '- 用户关注列表用 get_watchlist；实盘持仓用 get_portfolio_holdings / portfolio_summary；交易流水用 portfolio_trades',
      '- 报告日期与时区用 get_current_time；环境/版本用 get_system_info；默认评分卡与模型用 get_app_settings；数据目录与项目路径用 get_project_info',
      '- 外部集成（Tushare）状态用 get_integration_status',
      '- 禁止 Shell 执行、任意文件读写或未提供的工具能力',
    ].join('\n')
  }

  private dispatch(feature: string, params: Record<string, unknown>) {
    return this.hub.dispatch(feature, params)
  }

  private buildDataTools(): ToolDef[] {
    const d = (feature: string, params: Record<string, unknown> = {}) =>
      this.dispatch(feature, params)
    const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
      ({ type: 'object', properties, required })

    return [
      {
        name: 'evaluate_stock', category: '个股分析',
        description: '对单只股票做全面因子评估与评分卡打分',
        parameters: S({
          code: { type: 'string', description: '6位股票代码，如 600519' },
          scorecard: { type: 'string', description: '评分卡名称，默认综合评估' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('stock_diagnosis', { code: a.code, scorecard: a.scorecard ?? '综合评估' }),
      },
      {
        name: 'screen_stocks', category: '选股',
        description: '按因子条件筛选股票（优先本地 L0 初选库，未就绪时在线扫描）',
        parameters: S({
          conditions: { type: 'array', description: '条件数组 [{factor, op, value}]，op 为 > >= < <= =' },
          scorecard: { type: 'string', description: '评分卡' },
          top_n: { type: 'number', description: '返回条数，默认20' },
        }, ['conditions']),
        handler: (a: Record<string, unknown>) => d('screening', { conditions: a.conditions, scorecard: a.scorecard, top_n: a.top_n ?? 20 }),
      },
      {
        name: 'get_market_db_status', category: '本地数据',
        description: '查询本地初选数据库就绪状态、股票数量、因子日期与 bootstrap 覆盖率',
        parameters: S({}),
        handler: () => d('market_db_status', {}),
      },
      {
        name: 'list_local_screen_factors', category: '本地数据',
        description: '列出本地初选库可用于筛选的因子字段（PE/ROE/动量/量比等）',
        parameters: S({}),
        handler: () => d('list_screen_factors', {}),
      },
      {
        name: 'get_local_universe_screen_schema', category: '本地数据',
        description: '获取本地初选多维度筛选说明：因子单位/区间、行业/板块/评分/市值过滤格式与示例',
        parameters: S({}),
        handler: () => d('local_universe_screen_schema', {}),
      },
      {
        name: 'screen_local_universe', category: '本地数据',
        description: '本地初选库多维度组合筛选（因子条件 + 行业/板块/评分/估值/市值 + 排序）',
        parameters: S({
          factor_conditions: {
            type: 'array',
            description: '因子条件 [{factor, op, value}]，op 为 > >= < <= =，AND 组合，最多 8 条',
          },
          industry_contains: { type: 'string', description: '行业关键词模糊匹配' },
          industries: { type: 'array', description: '行业名称精确匹配列表' },
          markets: { type: 'array', description: '交易所板块：SH / SZ / BJ' },
          min_total_score: { type: 'number', description: '综合评分下限 0-100' },
          max_total_score: { type: 'number', description: '综合评分上限 0-100' },
          min_market_cap_yi: { type: 'number', description: '总市值下限（亿元）' },
          max_market_cap_yi: { type: 'number', description: '总市值上限（亿元）' },
          min_pe: { type: 'number', description: 'PE 下限（倍）' },
          max_pe: { type: 'number', description: 'PE 上限（倍）' },
          min_pb: { type: 'number', description: 'PB 下限（倍）' },
          max_pb: { type: 'number', description: 'PB 上限（倍）' },
          exclude_st: { type: 'boolean', description: '是否排除 ST，默认 true' },
          scorecard: { type: 'string', description: '评分卡，默认综合评估' },
          sort_by: { type: 'string', description: '排序字段：total_score / pe / pb / market_cap / 因子名' },
          sort_order: { type: 'string', description: 'asc 或 desc，默认 desc' },
          trade_date: { type: 'string', description: '交易日 YYYY-MM-DD，默认最新' },
          top_n: { type: 'number', description: '返回条数 1-200，默认 40' },
        }),
        handler: (a: Record<string, unknown>) => d('local_universe_screen', a),
      },
      {
        name: 'list_local_industries', category: '本地数据',
        description: '列出本地初选库中的行业名称（含股票数、均分/估值），支持关键词过滤',
        parameters: S({
          keyword: { type: 'string', description: '行业名称关键词，如「半导体」「银行」' },
          trade_date: { type: 'string', description: '交易日 YYYY-MM-DD，默认最新' },
          limit: { type: 'number', description: '返回行业数上限 1-500，默认 200' },
        }),
        handler: (a: Record<string, unknown>) => d('local_industry_list', a),
      },
      {
        name: 'screen_local_industry_stocks', category: '本地数据',
        description: '在指定行业内筛选本地股票（因子条件 + 评分/估值 + 排序），行业名须与 list_local_industries 一致',
        parameters: S({
          industry: { type: 'string', description: '行业精确名称（推荐，来自 list_local_industries）' },
          industries: { type: 'array', description: '多个行业精确匹配（与 industry 可叠加）' },
          industry_contains: { type: 'string', description: '行业关键词模糊匹配（不知精确名时用）' },
          factor_conditions: {
            type: 'array',
            description: '因子条件 [{factor, op, value}]，AND 组合，最多 8 条',
          },
          min_total_score: { type: 'number', description: '综合评分下限 0-100' },
          max_total_score: { type: 'number', description: '综合评分上限 0-100' },
          min_pe: { type: 'number', description: 'PE 下限（倍）' },
          max_pe: { type: 'number', description: 'PE 上限（倍）' },
          min_pb: { type: 'number', description: 'PB 下限（倍）' },
          max_pb: { type: 'number', description: 'PB 上限（倍）' },
          exclude_st: { type: 'boolean', description: '是否排除 ST，默认 true' },
          scorecard: { type: 'string', description: '评分卡，默认综合评估' },
          sort_by: { type: 'string', description: '排序：total_score / pe / pb / market_cap / 因子名' },
          sort_order: { type: 'string', description: 'asc 或 desc，默认 desc' },
          trade_date: { type: 'string', description: '交易日 YYYY-MM-DD' },
          top_n: { type: 'number', description: '返回条数 1-200，默认 40' },
        }),
        handler: (a: Record<string, unknown>) => d('local_industry_screen', a),
      },
      {
        name: 'local_screen_stocks', category: '本地数据',
        description: '使用本地 L0 因子库快速初选，不拉取全市场在线数据',
        parameters: S({
          conditions: { type: 'array', description: '条件数组 [{factor, op, value}]' },
          top_n: { type: 'number', description: '返回条数，默认60' },
        }, ['conditions']),
        handler: (a: Record<string, unknown>) => d('screening', { conditions: a.conditions, scorecard: '综合评估', top_n: a.top_n ?? 60 }),
      },
      {
        name: 'get_local_industry_stocks', category: '本地数据',
        description: '按行业名称获取本地成分股列表（价量、评分），不做因子筛选',
        parameters: S({
          industry: { type: 'string', description: '行业精确名称，来自 list_local_industries' },
          trade_date: { type: 'string', description: '交易日 YYYY-MM-DD' },
          limit: { type: 'number', description: '返回条数 1-200，默认 120' },
        }, ['industry']),
        handler: (a: Record<string, unknown>) => d('market_industry_stocks', a),
      },
      {
        name: 'get_industry_stats', category: '本地数据',
        description: '本地行业截面统计：股票数、均分、均 PE/PB',
        parameters: S({
          trade_date: { type: 'string', description: '可选交易日 YYYY-MM-DD' },
        }),
        handler: (a: Record<string, unknown>) => d('market_industry_stats', { trade_date: a.trade_date }),
      },
      {
        name: 'batch_stock_snapshots', category: '本地数据',
        description: '批量获取候选股的本地截面快照（行业、评分、估值、初选因子）',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表，建议不超过80' },
        }, ['codes']),
        handler: (a: Record<string, unknown>) => d('batch_stock_snapshots', { codes: a.codes }),
      },
      {
        name: 'get_market_db_sync_state', category: '本地数据',
        description: '查询本地数据同步任务进度与最近更新时间',
        parameters: S({}),
        handler: () => d('market_db_sync_state', {}),
      },
      {
        name: 'trigger_market_db_sync', category: '本地数据',
        description: '后台触发本地市场数据同步（resume/bootstrap），用于本地因子库未就绪时',
        parameters: S({
          mode: { type: 'string', description: 'resume 或 bootstrap，默认 resume' },
          background: { type: 'boolean', description: '是否后台执行，默认 true' },
        }),
        handler: (a: Record<string, unknown>) => d('market_db_sync', {
          mode: a.mode ?? 'resume',
          background: a.background ?? true,
        }),
      },
      {
        name: 'get_stock_quotes', category: '本地数据',
        description: '批量获取股票实时行情（价量、涨跌幅）',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表' },
        }, ['codes']),
        handler: (a: Record<string, unknown>) => d('stock_quotes', { codes: a.codes }),
      },
      {
        name: 'get_watchlist', category: '组合管理',
        description: '读取用户关注列表（代码、名称、行业、备注、加入价）',
        parameters: S({}),
        handler: () => d('watchlist_list', {}),
      },
      {
        name: 'get_watchlist_radar', category: '本地数据',
        description: '关注列表雷达：行情 + 策略信号摘要（codes 为空则使用用户关注列表）',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表，省略则读取用户关注列表' },
        }),
        handler: (a: Record<string, unknown>) => d('watchlist_radar', { codes: a.codes }),
      },
      {
        name: 'get_stock_kline', category: '本地数据',
        description: '获取单股日 K 线序列（本地/在线）',
        parameters: S({
          code: { type: 'string', description: '6位股票代码' },
          count: { type: 'number', description: 'K线根数，默认90，最大240' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('stock_kline', { code: a.code, count: a.count ?? 90 }),
      },
      {
        name: 'get_stock_cyq', category: '本地数据',
        description: '获取单股筹码分布（CYQ）',
        parameters: S({ code: { type: 'string', description: '6位股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('stock_cyq', { code: a.code }),
      },
      {
        name: 'get_stock_chart', category: '本地数据',
        description: '获取单股多周期图表数据（日/周/月/分钟）',
        parameters: S({
          code: { type: 'string', description: '6位股票代码' },
          period: { type: 'string', description: '周期：daily/weekly/monthly/1m/5m 等' },
          count: { type: 'number', description: '返回条数，0 为默认' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('stock_chart', { code: a.code, period: a.period ?? 'daily', count: a.count ?? 0 }),
      },
      {
        name: 'get_stock_detail', category: '本地数据',
        description: '获取单股详情：行情、基本面、财务、新闻、资金流等聚合',
        parameters: S({ code: { type: 'string', description: '6位股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('stock_detail', { code: a.code }),
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
        name: 'search_stocks', category: '通用',
        description: '按代码或名称关键词搜索本地股票池（market.db universe）',
        parameters: S({ keyword: { type: 'string', description: '搜索关键词' } }, ['keyword']),
        handler: (a: Record<string, unknown>) => d('search_stocks', { keyword: a.keyword }),
      },
      {
        name: 'get_strategy_signal', category: '策略',
        description: '获取单股 9 策略融合信号（看多/看空/中性）',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('strategy_signal', { code: a.code }),
      },
      {
        name: 'institution_rating', category: '个股分析',
        description: '28 家机构风格综合评级与共识',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          groups: { type: 'array', description: '可选机构分组过滤' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('institution_rating', { code: a.code, groups: a.groups }),
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
        description: '对指定股票列表做因子/评分卡 IC 回测',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表' },
          scorecard: { type: 'string', description: '评分卡' },
          periods: { type: 'number', description: '回测期数' },
        }, ['codes']),
        handler: (a: Record<string, unknown>) => d('backtest', { codes: a.codes, scorecard: a.scorecard, periods: a.periods ?? 5 }),
      },
      {
        name: 'strategy_verify', category: '策略',
        description: '验证策略历史信号胜率与 forward 收益',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          checkpoints: { type: 'number', description: '验证点数' },
          forward_days: { type: 'number', description: '持有天数' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('strategy_verify', {
          code: a.code, checkpoints: a.checkpoints ?? 30, forward_days: a.forward_days ?? 5,
        }),
      },
      {
        name: 'strategy_verify_report', category: '策略',
        description: '策略验证的格式化文本报告',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          checkpoints: { type: 'number', description: '验证点数' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('strategy_verify_report', { code: a.code, checkpoints: a.checkpoints ?? 30 }),
      },
      {
        name: 'strategy_report', category: '策略',
        description: '单股 T 策略综合分析文本报告',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('strategy_report', { code: a.code }),
      },
      {
        name: 'institution_report', category: '个股分析',
        description: '机构评级完整文本报告',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          groups: { type: 'array', description: '机构分组' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('institution_report', { code: a.code, groups: a.groups }),
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
        name: 'get_latest_evaluation', category: '通用',
        description: '读取本地最近一次的因子评估快照',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('latest_evaluation', { code: a.code }),
      },
      {
        name: 'get_portfolio_holdings', category: '组合管理',
        description: '读取当前持仓明细（股数、成本、市值、浮盈）',
        parameters: S({}),
        handler: () => d('portfolio_holdings', {}),
      },
      {
        name: 'portfolio_trades', category: '组合管理',
        description: '查询交易账本记录（买卖流水）',
        parameters: S({ code: { type: 'string', description: '可选，按代码过滤' } }),
        handler: (a: Record<string, unknown>) => d('portfolio_trades', { code: a.code ?? '' }),
      },
      {
        name: 'portfolio_summary', category: '组合管理',
        description: '持仓盈亏与账本汇总（含持仓明细与交易统计）',
        parameters: S({}),
        handler: () => d('portfolio_summary', {}),
      },
    ].map(t => ({ ...t, meta: TOOL_META[t.name] }))
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
            app: 'innoAStock',
            version: '0.6.0',
            runtime: process.env.INNO_DESKTOP === '1' ? 'desktop' : 'node',
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
    ].map(t => ({ ...t, meta: TOOL_META[t.name] }))
  }
}
