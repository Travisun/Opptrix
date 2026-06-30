import type { ResearchHub } from '@opptrix/research-hub'
import type { ToolRegistry } from './tools.js'
import { McpToolBroker } from './mcp/broker.js'
import type { ProviderRegistry } from './llm/providers.js'
import type { ChatMessage } from './llm/provider.js'
import { getDiscoverStrategy, buildStrategyExecutionPrompt } from './discover-strategies.js'
import { DATA_LAYER_MINING_TOOL_NAMES } from './tool-meta.js'

export type DiscoverPhase = 'parsing' | 'prescreen' | 'mining' | 'done' | 'error'

export interface DiscoverProgress {
  phase: DiscoverPhase
  message: string
  percent: number
}

export interface DiscoverScreenCondition {
  factor: string
  op: '>' | '<' | '>=' | '<=' | '='
  value: number
}

export interface DiscoverParsedPlan {
  strategy_title: string
  conditions: DiscoverScreenCondition[]
  prescreen_top_n: number
  final_top_n: number
  refinement_notes: string
}

export interface DiscoverFinalItem {
  rank: number
  code: string
  name: string
  match_score: number
  thesis: string
  highlights: string[]
  risks: string[]
  key_factors: Record<string, number>
}

export interface DiscoverResult {
  strategy_id: string | null
  strategy_title: string
  strategy_summary: string
  prompt: string
  plan: DiscoverParsedPlan
  prescreen: {
    scanned: number
    passed: number
    trade_date: string | null
    source: 'local' | 'live'
  }
  items: DiscoverFinalItem[]
  tools_used: string[]
}

const ALLOWED_OPS = new Set(['>', '<', '>=', '<=', '='])
const SCREEN_PACK_FACTORS = [
  'pe', 'pb', 'roe', 'debt_ratio', 'gross_margin', 'net_profit_yoy', 'profit_cagr_3y',
  'roe_trend', 'peg', 'momentum_1m', 'momentum_3m', 'momentum_6m', 'volume_ratio',
] as const
const ALLOWED_FACTORS = new Set<string>(SCREEN_PACK_FACTORS)

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch { /* fall through */ }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim()) as Record<string, unknown>
    } catch { /* fall through */ }
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    } catch { /* fall through */ }
  }
  return null
}

function normalizePlan(raw: Record<string, unknown>, prompt: string): DiscoverParsedPlan {
  const conditions: DiscoverScreenCondition[] = []
  if (Array.isArray(raw.conditions)) {
    for (const c of raw.conditions) {
      if (!c || typeof c !== 'object') continue
      const row = c as Record<string, unknown>
      const factor = String(row.factor ?? '').trim()
      const op = String(row.op ?? '').trim() as DiscoverScreenCondition['op']
      const value = Number(row.value)
      if (!ALLOWED_FACTORS.has(factor) || !ALLOWED_OPS.has(op) || !Number.isFinite(value)) continue
      conditions.push({ factor, op, value })
    }
  }

  if (!conditions.length) {
    throw new Error('AI 未生成有效筛选条件')
  }

  const prescreen_top_n = Math.min(120, Math.max(20, Number(raw.prescreen_top_n) || 60))
  const final_top_n = Math.min(30, Math.max(5, Number(raw.final_top_n) || 15))

  return {
    strategy_title: String(raw.strategy_title ?? '').trim() || prompt.slice(0, 24) || '定制选股',
    conditions,
    prescreen_top_n,
    final_top_n,
    refinement_notes: String(raw.refinement_notes ?? raw.refinement_focus ?? '').trim() || prompt,
  }
}

function formatCandidateTable(
  rows: Array<{
    code: string
    name: string
    industry: string | null
    total_score: number | null
    pe: number | null
    pb: number | null
    key_factors: Record<string, number>
  }>,
): string {
  return rows.map((r, i) => {
    const factors = Object.entries(r.key_factors)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(', ')
    return `${i + 1}. ${r.code} ${r.name} | 行业:${r.industry ?? '—'} | 评分:${r.total_score ?? '—'} | PE:${r.pe ?? '—'} | ${factors}`
  }).join('\n')
}

export class DiscoverRunner {
  constructor(
    private hub: ResearchHub,
    private registry: ProviderRegistry,
    private tools: ToolRegistry,
  ) {}

  async runStrategy(
    strategyId: string,
    onProgress: (p: DiscoverProgress) => void,
    modelRef?: string,
    signal?: AbortSignal,
  ): Promise<DiscoverResult> {
    const strategy = getDiscoverStrategy(strategyId)
    if (!strategy) throw new Error(`未知策略: ${strategyId}`)

    const llm = this.registry.createLlm(modelRef)
    if (!llm) throw new Error('LLM 未配置，请在设置中添加模型提供商')

    onProgress({
      phase: 'parsing',
      message: `AI 解析策略「${strategy.name}」…`,
      percent: 10,
    })

    const executionPrompt = buildStrategyExecutionPrompt(strategy)
    const plan = await this.resolvePlan(llm, executionPrompt, {
      strategy_title: strategy.name,
      prescreen_top_n: strategy.prescreen_top_n,
      final_top_n: strategy.final_top_n,
    })
    const prompt = `${strategy.name}：${strategy.description}`

    return this.executePlan({
      strategyId,
      plan,
      prompt,
      llm,
      scorecard: strategy.scorecard,
      onProgress,
      signal,
    })
  }

  /** @deprecated 自由文本策略；发现页请使用 runStrategy */
  async run(
    prompt: string,
    onProgress: (p: DiscoverProgress) => void,
    modelRef?: string,
    signal?: AbortSignal,
  ): Promise<DiscoverResult> {
    const text = prompt.trim()
    if (!text) throw new Error('请输入选股策略描述')

    const llm = this.registry.createLlm(modelRef)
    if (!llm) throw new Error('LLM 未配置，请在设置中添加模型提供商')

    onProgress({ phase: 'parsing', message: 'AI 解析策略为可执行条件…', percent: 8 })

    const plan = await this.resolvePlan(llm, text)

    return this.executePlan({
      strategyId: null,
      plan,
      prompt: text,
      llm,
      scorecard: '综合评估',
      onProgress,
      signal,
    })
  }

  private async executePlan(input: {
    strategyId: string | null
    plan: DiscoverParsedPlan
    prompt: string
    llm: NonNullable<ReturnType<ProviderRegistry['createLlm']>>
    scorecard: string
    onProgress: (p: DiscoverProgress) => void
    signal?: AbortSignal
  }): Promise<DiscoverResult> {
    const { strategyId, plan, prompt, llm, scorecard, onProgress, signal } = input

    const throwIfAborted = () => {
      if (signal?.aborted) throw new Error('已取消')
    }

    onProgress({
      phase: 'prescreen',
      message: `AI 初选：${plan.conditions.length} 条解析因子条件，最多 ${plan.prescreen_top_n} 只…`,
      percent: 25,
    })
    throwIfAborted()

    const screenResp = await this.hub.dispatch('screening', {
      conditions: plan.conditions,
      scorecard,
      top_n: plan.prescreen_top_n,
    })
    throwIfAborted()

    if (!screenResp.success || !screenResp.data) {
      throw new Error(screenResp.message || '本地初选失败')
    }

    const screenData = screenResp.data as {
      total_scanned: number
      passed: number
      source?: 'local' | 'live'
      trade_date?: string | null
      items: Array<{
        code: string
        name: string
        total_score: number
        key_factors: Record<string, number>
      }>
    }

    const candidates = screenData.items ?? []
    if (!candidates.length) {
      return {
        strategy_id: strategyId,
        strategy_title: plan.strategy_title,
        strategy_summary: '初选未找到符合条件的标的。',
        prompt,
        plan,
        prescreen: {
          scanned: screenData.total_scanned,
          passed: screenData.passed,
          trade_date: screenData.trade_date ?? null,
          source: screenData.source ?? 'local',
        },
        items: [],
        tools_used: [],
      }
    }

    onProgress({
      phase: 'mining',
      message: `Agent 挖掘：从 ${candidates.length} 只候选中精选 ${plan.final_top_n} 只…`,
      percent: 45,
    })
    throwIfAborted()

    const toolsUsed: string[] = []
    const mining = await this.mineWithAgent(
      llm,
      prompt,
      plan,
      candidates,
      toolsUsed,
      pct => onProgress({ phase: 'mining', message: 'Agent 调用本地数据技能分析…', percent: pct }),
      signal,
    )
    throwIfAborted()

    const keyByCode = new Map(candidates.map(c => [c.code, c.key_factors ?? {}]))
    const items: DiscoverFinalItem[] = mining.items
      .slice(0, plan.final_top_n)
      .map((item, idx) => ({
        rank: item.rank ?? idx + 1,
        code: item.code,
        name: item.name,
        match_score: item.match_score ?? 0,
        thesis: item.thesis ?? '',
        highlights: item.highlights ?? [],
        risks: item.risks ?? [],
        key_factors: keyByCode.get(item.code) ?? {},
      }))

    onProgress({ phase: 'done', message: `完成，输出 ${items.length} 只`, percent: 100 })

    return {
      strategy_id: strategyId,
      strategy_title: plan.strategy_title,
      strategy_summary: mining.strategy_summary,
      prompt,
      plan,
      prescreen: {
        scanned: screenData.total_scanned,
        passed: screenData.passed,
        trade_date: screenData.trade_date ?? null,
        source: screenData.source ?? 'local',
      },
      items,
      tools_used: toolsUsed,
    }
  }

  private async resolvePlan(
    llm: NonNullable<ReturnType<ProviderRegistry['createLlm']>>,
    prompt: string,
    hints?: { strategy_title?: string; prescreen_top_n?: number; final_top_n?: number },
  ): Promise<DiscoverParsedPlan> {
    const errors: string[] = []
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const userPrompt = attempt === 0
          ? prompt
          : `${prompt}\n\n上次解析未得到有效 conditions，请严格输出 1-5 条可用因子条件 JSON。`
        const plan = await this.parsePlan(llm, userPrompt)
        if (!plan.conditions.length) throw new Error('conditions 为空')
        return {
          ...plan,
          strategy_title: plan.strategy_title || hints?.strategy_title || prompt.slice(0, 24) || '定制选股',
          prescreen_top_n: plan.prescreen_top_n || hints?.prescreen_top_n || 60,
          final_top_n: plan.final_top_n || hints?.final_top_n || 15,
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    throw new Error(`策略 AI 解析失败：${errors.join('；')}`)
  }

  private async parsePlan(llm: NonNullable<ReturnType<ProviderRegistry['createLlm']>>, prompt: string): Promise<DiscoverParsedPlan> {
    const factorList = SCREEN_PACK_FACTORS.join(', ')
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          '你是 A 股选股策略解析器。将用户或预置策略描述转为 JSON，不要输出其它文字。',
          '必须根据策略语义推导量化条件，禁止套用与策略无关的固定模板。',
          `可用因子：${factorList}`,
          'JSON 格式：',
          '{"strategy_title":"标题","conditions":[{"factor":"pe","op":"<=","value":25}],"prescreen_top_n":60,"final_top_n":15,"refinement_notes":"挖掘侧重点"}',
          '规则：conditions 1-5 条；op 为 > >= < <= =；数值为合理量化近似；参考因子示例可调整但需符合策略意图。',
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ]
    const turn = await llm.chat(messages)
    const content = turn.message.content ?? ''
    const json = extractJsonObject(content)
    if (!json) throw new Error('策略解析失败')
    return normalizePlan(json, prompt)
  }

  private async mineWithAgent(
    llm: NonNullable<ReturnType<ProviderRegistry['createLlm']>>,
    prompt: string,
    plan: DiscoverParsedPlan,
    candidates: Array<{
      code: string
      name: string
      total_score: number
      key_factors: Record<string, number>
    }>,
    toolsUsed: string[],
    onPct: (n: number) => void,
    signal?: AbortSignal,
  ): Promise<{ strategy_summary: string; items: Array<Partial<DiscoverFinalItem> & { code: string; name: string }> }> {
    const codes = candidates.map(c => c.code)
    let enriched = candidates.map(c => ({
      ...c,
      industry: null as string | null,
      pe: c.key_factors.pe ?? null,
      pb: c.key_factors.pb ?? null,
    }))

    try {
      const snapResp = await this.hub.dispatch('batch_stock_snapshots', { codes })
      if (snapResp.success && Array.isArray(snapResp.data)) {
        const byCode = new Map((snapResp.data as Array<{ code: string; industry: string | null; pe: number | null; pb: number | null }>).map(r => [r.code, r]))
        enriched = candidates.map(c => {
          const s = byCode.get(c.code)
          return {
            ...c,
            industry: s?.industry ?? null,
            pe: s?.pe ?? c.key_factors.pe ?? null,
            pb: s?.pb ?? c.key_factors.pb ?? null,
          }
        })
      }
    } catch { /* optional enrichment */ }

    const candidateTable = formatCandidateTable(enriched)

    const outputSchema = JSON.stringify({
      strategy_summary: '策略执行摘要',
      items: [{
        rank: 1,
        code: '600519',
        name: '贵州茅台',
        match_score: 90,
        thesis: '符合策略的核心逻辑',
        highlights: ['PE 18x', 'ROE 30%'],
        risks: ['行业景气波动'],
      }],
    }, null, 0)

    const systemPrompt = [
      '你是 Opptrix 选股页 Agent。策略条件已由 AI 解析并完成因子初选。',
      '你可调用数据层 MCP 工具（见各工具【何时使用】【调用规范】）由浅入深补全数据：',
      '1) get_market_db_status → list_local_industries（行业名）→ screen_local_industry_stocks / screen_local_universe → batch_stock_snapshots',
      '2) 不足时对 shortlisted 单股：get_stock_detail / evaluate_stock / get_strategy_signal / institution_rating',
      '3) 本地库未就绪：get_market_db_sync_state，必要时 trigger_market_db_sync（每任务最多一次）',
      '4) 策略涉及用户持仓/关注：get_watchlist、get_portfolio_holdings、portfolio_trades',
      '禁止编造数字；禁止对全部候选逐只 get_stock_detail。',
      '只能从候选列表中选股。最终必须输出严格 JSON（可用 ```json 包裹），格式：',
      outputSchema,
      `最终 items 数量不超过 ${plan.final_top_n}，按 match_score 降序。`,
      '不要推荐买卖，仅研究与数据解读。',
    ].join('\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `【用户策略】\n${prompt}`,
          `【挖掘侧重】\n${plan.refinement_notes}`,
          `【候选 ${candidates.length} 只】\n${candidateTable}`,
          `请精选最多 ${plan.final_top_n} 只，输出 JSON。`,
        ].join('\n\n'),
      },
    ]

    const broker = await McpToolBroker.create(this.tools, DATA_LAYER_MINING_TOOL_NAMES)
    const openAiTools = await broker.openAiTools()

    const MAX_ROUNDS = 6
    try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (signal?.aborted) throw new Error('已取消')
      onPct(45 + Math.round((round / MAX_ROUNDS) * 50))

      const turn = await llm.chat(messages, openAiTools.length ? openAiTools : undefined)
      if (turn.finishReason === 'error') {
        throw new Error(turn.error ?? turn.message.content ?? 'Agent 请求失败')
      }

      if (turn.finishReason === 'tool_calls' && turn.message.tool_calls?.length) {
        messages.push({
          role: 'assistant',
          content: turn.message.content ?? null,
          tool_calls: turn.message.tool_calls,
        })
        for (const tc of turn.message.tool_calls) {
          toolsUsed.push(tc.function.name)
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
          } catch { /* empty */ }
          let result: unknown
          try {
            result = await broker.call(tc.function.name, args, { signal })
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) }
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: JSON.stringify(result).slice(0, 12000),
          })
        }
        messages.push({
          role: 'user',
          content: `请基于以上工具结果，输出最终 JSON（items 仅从候选列表选择，最多 ${plan.final_top_n} 只）。`,
        })
        continue
      }

      const content = turn.message.content?.trim() ?? ''
      const json = extractJsonObject(content)
      if (json && Array.isArray(json.items)) {
        const allowed = new Set(candidates.map(c => c.code))
        const items = (json.items as Array<Record<string, unknown>>)
          .filter(row => allowed.has(String(row.code ?? '')))
          .map((row, idx) => {
            const code = String(row.code ?? '')
            const base = candidates.find(c => c.code === code)
            return {
              rank: Number(row.rank) || idx + 1,
              code,
              name: String(row.name ?? base?.name ?? code),
              match_score: Number(row.match_score) || 0,
              thesis: String(row.thesis ?? ''),
              highlights: Array.isArray(row.highlights) ? row.highlights.map(String) : [],
              risks: Array.isArray(row.risks) ? row.risks.map(String) : [],
            }
          })
        return {
          strategy_summary: String(json.strategy_summary ?? plan.refinement_notes),
          items,
        }
      }

      if (round === MAX_ROUNDS - 1) break
      messages.push({ role: 'assistant', content })
      messages.push({
        role: 'user',
        content: '请仅输出符合 schema 的 JSON，不要其它说明文字。',
      })
    }

    return this.fallbackMine(plan, candidates)
    } finally {
      await broker.close()
    }
  }

  private fallbackMine(
    plan: DiscoverParsedPlan,
    candidates: Array<{ code: string; name: string; total_score: number; key_factors: Record<string, number> }>,
  ) {
    const sorted = [...candidates].sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
    const items = sorted.slice(0, plan.final_top_n).map((c, idx) => ({
      rank: idx + 1,
      code: c.code,
      name: c.name,
      match_score: Math.round(c.total_score ?? 50),
      thesis: '按综合评分与初选因子条件排序（Agent 未返回结构化结果时的本地回退）',
      highlights: Object.entries(c.key_factors).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(1)}`),
      risks: [] as string[],
    }))
    return {
      strategy_summary: plan.refinement_notes,
      items,
    }
  }
}
