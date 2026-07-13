import type { DiscoverStrategyProfile } from '@opptrix/shared'
import {
  defaultDiscoverProfile,
  discoverFactorsForProfile,
  discoverPrescreenMode,
  getDiscoverProfileDefinition,
  resolveDiscoverScorecard,
  buildDiscoverMiningSystemPrompt,
  discoverProfileAssetLabel,
  type DiscoverProfileReadiness,
} from '@opptrix/shared'
import type { ResearchHub } from '@opptrix/research-hub'
import type { ToolRegistry } from './tools.js'
import { McpToolBroker } from './mcp/broker.js'
import type { ProviderRegistry } from './llm/providers.js'
import type { ChatMessage } from './llm/provider.js'
import {
  getDiscoverStrategy,
  buildStrategyExecutionPrompt,
  primaryDiscoverProfile,
  strategyToPlan,
} from './discover-strategies.js'
import { discoverMiningToolNames } from './tool-meta.js'

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
  profile: DiscoverStrategyProfile
  /** 美股 / Crypto 本地列表筛选（keyword、quote 等） */
  screen_params?: Record<string, string>
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

function isFilterDiscoverProfile(profile: DiscoverStrategyProfile): boolean {
  return discoverPrescreenMode(profile) === 'list_filter'
}

function miningOutputExample(profile: DiscoverStrategyProfile): {
  code: string
  name: string
  highlights: string[]
  risks: string[]
} {
  const group = getDiscoverProfileDefinition(profile)?.miningToolGroup
  if (profile === 'cn_etf' || group === 'cn_etf') {
    return {
      code: '510300',
      name: '沪深300ETF',
      highlights: ['折溢价 0.2%', '规模 800亿'],
      risks: ['跟踪误差'],
    }
  }
  if (group === 'us_equity') {
    return {
      code: 'AAPL',
      name: 'Apple',
      highlights: ['Technology', '大市值'],
      risks: ['汇率与宏观波动'],
    }
  }
  if (group === 'crypto_spot') {
    return {
      code: 'BTC/USDT',
      name: 'Bitcoin',
      highlights: ['USDT 计价', '高流动性'],
      risks: ['7×24 高波动'],
    }
  }
  if (group === 'jp_equity') {
    return { code: '7203', name: 'Toyota', highlights: ['汽车龙头', '大市值'], risks: ['汇率与宏观波动'] }
  }
  if (group === 'kr_equity') {
    return { code: '005930', name: 'Samsung', highlights: ['半导体', '大市值'], risks: ['行业周期波动'] }
  }
  if (group === 'hk_equity') {
    return { code: '00700', name: 'Tencent', highlights: ['互联网龙头', '大市值'], risks: ['政策与流动性'] }
  }
  return {
    code: '600519',
    name: '贵州茅台',
    highlights: ['PE 18x', 'ROE 30%'],
    risks: ['行业景气波动'],
  }
}

function extractScreenParams(
  raw: Record<string, unknown>,
  profile: DiscoverStrategyProfile,
): Record<string, string> {
  const allowed = new Set(discoverFactorsForProfile(profile))
  const out: Record<string, string> = {}
  if (raw.screen_params && typeof raw.screen_params === 'object') {
    for (const [key, value] of Object.entries(raw.screen_params as Record<string, unknown>)) {
      const trimmed = String(value ?? '').trim()
      if (allowed.has(key) && trimmed) out[key] = trimmed
    }
  }
  return out
}

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

function normalizePlan(
  raw: Record<string, unknown>,
  prompt: string,
  profile: DiscoverStrategyProfile = defaultDiscoverProfile(),
): DiscoverParsedPlan {
  const prescreen_top_n = Math.min(120, Math.max(20, Number(raw.prescreen_top_n) || 60))
  const final_top_n = Math.min(30, Math.max(5, Number(raw.final_top_n) || 15))
  const base = {
    strategy_title: String(raw.strategy_title ?? '').trim() || prompt.slice(0, 24) || '定制选股',
    prescreen_top_n,
    final_top_n,
    refinement_notes: String(raw.refinement_notes ?? raw.refinement_focus ?? '').trim() || prompt,
    profile,
  }

  if (isFilterDiscoverProfile(profile)) {
    const screen_params = extractScreenParams(raw, profile)
    if (!Object.keys(screen_params).length) {
      throw new Error('AI 未生成有效筛选条件')
    }
    return { ...base, conditions: [], screen_params }
  }

  const allowedFactors = new Set(discoverFactorsForProfile(profile))
  const conditions: DiscoverScreenCondition[] = []
  if (Array.isArray(raw.conditions)) {
    for (const c of raw.conditions) {
      if (!c || typeof c !== 'object') continue
      const row = c as Record<string, unknown>
      const factor = String(row.factor ?? '').trim()
      const op = String(row.op ?? '').trim() as DiscoverScreenCondition['op']
      const value = Number(row.value)
      if (!allowedFactors.has(factor) || !ALLOWED_OPS.has(op) || !Number.isFinite(value)) continue
      conditions.push({ factor, op, value })
    }
  }

  if (!conditions.length) {
    throw new Error('AI 未生成有效筛选条件')
  }

  return { ...base, conditions }
}

function etfConditionsToQuery(
  conditions: DiscoverScreenCondition[],
  topN: number,
): Record<string, unknown> {
  const q: Record<string, unknown> = { top_n: topN, sort_by: 'premium_rate', sort_order: 'asc' }
  for (const c of conditions) {
    if (c.factor === 'premium_rate') {
      if (c.op === '<=' || c.op === '<') q.max_premium_rate = c.value
      if (c.op === '>=' || c.op === '>') q.min_premium_rate = c.value
    }
    if (c.factor === 'scale_yi') {
      if (c.op === '>=' || c.op === '>') q.min_scale_yi = c.value
      if (c.op === '<=' || c.op === '<') q.max_scale_yi = c.value
    }
  }
  return q
}

function formatEquityCandidateTable(
  rows: Array<{
    code: string
    name: string
    industry: string | null
    total_score: number | null
    pe: number | null
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

function formatEtfCandidateTable(
  rows: Array<{
    code: string
    name: string
    premium_rate: number | null
    scale_yi: number | null
    key_factors: Record<string, number>
  }>,
): string {
  return rows.map((r, i) => {
    const prem = r.premium_rate != null ? `${r.premium_rate.toFixed(2)}%` : '—'
    const scale = r.scale_yi != null ? `${r.scale_yi.toFixed(1)}亿` : '—'
    const score = r.key_factors.etf_score != null ? `雷达${r.key_factors.etf_score.toFixed(0)}` : '—'
    return `${i + 1}. ${r.code} ${r.name} | 雷达:${score} | 折溢价:${prem} | 规模:${scale}`
  }).join('\n')
}

function formatUsCandidateTable(
  rows: Array<{ code: string; name: string; exchange: string | null }>,
): string {
  return rows.map((r, i) => `${i + 1}. ${r.code} ${r.name ?? '—'} | ${r.exchange ?? '—'}`).join('\n')
}

function formatCryptoCandidateTable(
  rows: Array<{ code: string; name: string; base: string; quote: string }>,
): string {
  return rows.map((r, i) => `${i + 1}. ${r.code} ${r.name ?? '—'} | ${r.base}/${r.quote}`).join('\n')
}

function localScreenParamsFromPlan(plan: DiscoverParsedPlan): Record<string, unknown> {
  return {
    top_n: plan.prescreen_top_n,
    sort_by: 'code',
    sort_order: 'asc',
    ...plan.screen_params,
  }
}

function prescreenProgressMessage(plan: DiscoverParsedPlan): string {
  const profile = plan.profile ?? defaultDiscoverProfile()
  if (profile === 'cn_etf') {
    return `ETF 初选：${plan.conditions.length} 条条件 + 决策雷达评分，最多 ${plan.prescreen_top_n} 只…`
  }
  if (profile === 'us_equity') {
    const filters = Object.entries(plan.screen_params ?? {}).map(([k, v]) => `${k}=${v}`).join('、') || '广谱列表'
    return `美股初选：${filters}，最多 ${plan.prescreen_top_n} 只…`
  }
  if (profile === 'crypto_spot') {
    const filters = Object.entries(plan.screen_params ?? {}).map(([k, v]) => `${k}=${v}`).join('、') || '广谱列表'
    return `Crypto 初选：${filters}，最多 ${plan.prescreen_top_n} 对…`
  }
  if (isFilterDiscoverProfile(profile)) {
    const label = getDiscoverProfileDefinition(profile)?.label ?? profile
    const filters = Object.entries(plan.screen_params ?? {}).map(([k, v]) => `${k}=${v}`).join('、') || '广谱列表'
    return `${label}初选：${filters}，最多 ${plan.prescreen_top_n} 只…`
  }
  return `本地因子初选：${plan.conditions.length} 条日 K 衍生条件，最多 ${plan.prescreen_top_n} 只…`
}

type PrescreenCandidate = {
  code: string
  name: string
  total_score: number
  key_factors: Record<string, number>
  exchange?: string | null
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

    const profile = primaryDiscoverProfile(strategy)
    await this.assertProfileReady(profile)

    const llm = this.registry.createLlm(modelRef)
    if (!llm) throw new Error('LLM 未配置，请在设置中添加模型提供商')

    let plan: DiscoverParsedPlan
    if (strategy.planMode === 'builtin') {
      onProgress({
        phase: 'parsing',
        message: `加载策略「${strategy.name}」筛选条件…`,
        percent: 10,
      })
      plan = strategyToPlan(strategy)
    } else {
      onProgress({
        phase: 'parsing',
        message: `AI 解析策略「${strategy.name}」…`,
        percent: 10,
      })
      const executionPrompt = buildStrategyExecutionPrompt(strategy)
      plan = await this.resolvePlan(llm, executionPrompt, profile, {
        strategy_title: strategy.name,
        prescreen_top_n: strategy.prescreen_top_n,
        final_top_n: strategy.final_top_n,
      })
    }
    const prompt = `${strategy.name}：${strategy.description}`

    return this.executePlan({
      strategyId,
      plan,
      prompt,
      llm,
      scorecard: resolveDiscoverScorecard(profile, strategy.scorecard) ?? strategy.scorecard,
      onProgress,
      signal,
    })
  }

  /** 自由文本策略；profile 默认 A 股股票 */
  async run(
    prompt: string,
    onProgress: (p: DiscoverProgress) => void,
    modelRef?: string,
    signal?: AbortSignal,
    profile: DiscoverStrategyProfile = defaultDiscoverProfile(),
  ): Promise<DiscoverResult> {
    const text = prompt.trim()
    if (!text) throw new Error('请输入选股策略描述')

    await this.assertProfileReady(profile)

    const llm = this.registry.createLlm(modelRef)
    if (!llm) throw new Error('LLM 未配置，请在设置中添加模型提供商')

    onProgress({ phase: 'parsing', message: 'AI 解析策略为可执行条件…', percent: 8 })

    const plan = await this.resolvePlan(llm, text, profile)

    return this.executePlan({
      strategyId: null,
      plan,
      prompt: text,
      llm,
      scorecard: resolveDiscoverScorecard(profile) ?? '综合评估',
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
    const profile = plan.profile ?? defaultDiscoverProfile()
    const effectiveScorecard = resolveDiscoverScorecard(profile, scorecard) ?? scorecard

    const throwIfAborted = () => {
      if (signal?.aborted) throw new Error('已取消')
    }

    onProgress({
      phase: 'prescreen',
      message: prescreenProgressMessage(plan),
      percent: 25,
    })
    throwIfAborted()

    const mode = discoverPrescreenMode(profile)
    const prescreenResult = mode === 'etf_screen'
      ? await this.prescreenEtf(plan, msg => onProgress({ phase: 'prescreen', message: msg, percent: 32 }))
      : mode === 'list_filter'
        ? await this.prescreenListFilter(profile, plan)
        : mode === 'factor_screen'
          ? await this.prescreenEquity(plan, effectiveScorecard)
          : (() => { throw new Error('该资产类型暂不支持挖掘初选') })()
    const { screenData, candidates } = prescreenResult
    throwIfAborted()

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
      pct => onProgress({ phase: 'mining', message: 'Agent 调用在线数据技能分析…', percent: pct }),
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

  private async prescreenEquity(plan: DiscoverParsedPlan, scorecard: string) {
    const screenResp = await this.hub.dispatch('screening', {
      conditions: plan.conditions,
      scorecard,
      top_n: plan.prescreen_top_n,
    })
    if (!screenResp.success || !screenResp.data) {
      throw new Error(screenResp.message || '本地初选失败')
    }
    const screenData = screenResp.data as {
      total_scanned: number
      passed: number
      source?: 'local' | 'live'
      trade_date?: string | null
      items: PrescreenCandidate[]
    }
    return { screenData, candidates: screenData.items ?? [] }
  }

  private async assertProfileReady(profile: DiscoverStrategyProfile) {
    const resp = await this.hub.dispatch('discover_profile_readiness', { profile })
    if (!resp.success || !resp.data) {
      throw new Error(resp.message || '无法检查挖掘数据就绪状态')
    }
    const row = resp.data as DiscoverProfileReadiness
    if (!row.ready) {
      throw new Error(row.action ? `${row.message}。${row.action}` : row.message)
    }
  }

  private async prescreenEtf(plan: DiscoverParsedPlan, onMsg?: (message: string) => void) {
    const listResp = await this.hub.dispatch('etf_list', {})
    if (!listResp.success || !listResp.data) {
      throw new Error(listResp.message || 'ETF 列表获取失败')
    }
    const all = (listResp.data as Array<{ code: string; name: string }>) ?? []
    const query = etfConditionsToQuery(plan.conditions, plan.prescreen_top_n * 3)
    const maxPremium = query.max_premium_rate as number | undefined
    const minPremium = query.min_premium_rate as number | undefined
    const minScale = query.min_scale_yi as number | undefined
    const maxScale = query.max_scale_yi as number | undefined

    onMsg?.(`在线 ETF 名录 ${all.length} 只，按条件初筛…`)

    const screened: Array<{
      code: string
      name: string
      premium_rate: number | null
      scale_yi: number | null
    }> = []

    for (const item of all.slice(0, 120)) {
      let premiumRate: number | null = null
      let scaleYi: number | null = null
      try {
        const snapResp = await this.hub.dispatch('etf_snapshot', { code: item.code })
        if (snapResp.success && snapResp.data && typeof snapResp.data === 'object') {
          const snap = snapResp.data as { premium_rate?: number | null; scale_yi?: number | null }
          premiumRate = snap.premium_rate ?? null
          scaleYi = snap.scale_yi ?? null
        }
      } catch { /* optional */ }

      if (maxPremium != null && premiumRate != null && premiumRate > maxPremium) continue
      if (minPremium != null && premiumRate != null && premiumRate < minPremium) continue
      if (minScale != null && scaleYi != null && scaleYi < minScale) continue
      if (maxScale != null && scaleYi != null && scaleYi > maxScale) continue
      screened.push({
        code: item.code,
        name: item.name,
        premium_rate: premiumRate,
        scale_yi: scaleYi,
      })
      if (screened.length >= plan.prescreen_top_n * 2) break
    }

    onMsg?.(`ETF 条件命中 ${screened.length} 只，在线评分中…`)

    const scored: PrescreenCandidate[] = []
    for (const item of screened) {
      let totalScore = 50
      const key_factors: Record<string, number> = {}
      if (item.premium_rate != null) key_factors.premium_rate = item.premium_rate
      if (item.scale_yi != null) key_factors.scale_yi = item.scale_yi

      try {
        const scResp = await this.hub.dispatch('instrument_evaluation', {
          instrument: { market: 'CN', assetClass: 'ETF', symbol: item.code },
          scorecard: 'ETF决策雷达',
        })
        if (scResp.success && scResp.data) {
          const card = scResp.data as {
            total_score: number | null
            grade: string | null
            name?: string
          }
          if (card.total_score != null && Number.isFinite(card.total_score)) {
            totalScore = card.total_score
            key_factors.etf_score = card.total_score
          }
          scored.push({
            code: item.code,
            name: card.name ?? item.name,
            total_score: totalScore,
            key_factors,
          })
          continue
        }
      } catch { /* fallback below */ }

      if (item.premium_rate != null) {
        totalScore = Math.max(0, 100 - Math.abs(item.premium_rate) * 10)
        key_factors.etf_score = totalScore
      }
      scored.push({
        code: item.code,
        name: item.name,
        total_score: totalScore,
        key_factors,
      })
    }

    scored.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
    const candidates = scored.slice(0, plan.prescreen_top_n)
    const screenData = {
      total_scanned: all.length,
      passed: screened.length,
      trade_date: null as string | null,
      source: 'live' as const,
    }
    return { screenData, candidates }
  }

  private async prescreenListFilter(profile: DiscoverStrategyProfile, plan: DiscoverParsedPlan) {
    const def = getDiscoverProfileDefinition(profile)
    const feature = def?.localScreenFeature
    if (!feature) throw new Error('缺少本地筛选接口')
    const screenResp = await this.hub.dispatch(feature, localScreenParamsFromPlan(plan))
    if (!screenResp.success || !screenResp.data) {
      throw new Error(screenResp.message || `${def?.label ?? profile}初选失败`)
    }
    const data = screenResp.data as {
      total_universe: number
      passed: number
      items: Array<{ code: string; name: string | null; exchange?: string | null }>
    }
    const candidates: PrescreenCandidate[] = (data.items ?? []).map(item => ({
      code: item.code,
      name: item.name ?? item.code,
      total_score: 50,
      key_factors: {},
      exchange: item.exchange,
    }))
    return {
      screenData: {
        total_scanned: data.total_universe,
        passed: data.passed,
        trade_date: null as string | null,
        source: 'live' as const,
      },
      candidates,
    }
  }

  private async prescreenUs(plan: DiscoverParsedPlan) {
    return this.prescreenListFilter('us_equity', plan)
  }

  private async prescreenCrypto(plan: DiscoverParsedPlan) {
    const screenResp = await this.hub.dispatch('local_crypto_screen', localScreenParamsFromPlan(plan))
    if (!screenResp.success || !screenResp.data) {
      throw new Error(screenResp.message || 'Crypto 初选失败')
    }
    const data = screenResp.data as {
      total_universe: number
      passed: number
      items: Array<{ code: string; name: string | null; base: string; quote: string }>
    }
    const candidates: PrescreenCandidate[] = (data.items ?? []).map(item => ({
      code: item.code,
      name: item.name ?? item.code,
      total_score: 50,
      key_factors: {},
    }))
    return {
      screenData: {
        total_scanned: data.total_universe,
        passed: data.passed,
        trade_date: null as string | null,
        source: 'live' as const,
      },
      candidates,
    }
  }

  private async resolvePlan(
    llm: NonNullable<ReturnType<ProviderRegistry['createLlm']>>,
    prompt: string,
    profile: DiscoverStrategyProfile = defaultDiscoverProfile(),
    hints?: { strategy_title?: string; prescreen_top_n?: number; final_top_n?: number },
  ): Promise<DiscoverParsedPlan> {
    const errors: string[] = []
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const userPrompt = attempt === 0
          ? prompt
          : `${prompt}\n\n上次解析未得到有效 conditions，请严格输出 1-5 条可用因子条件 JSON。`
        const plan = await this.parsePlan(llm, userPrompt, profile)
        if (isFilterDiscoverProfile(profile)) {
          if (!plan.screen_params || !Object.keys(plan.screen_params).length) {
            throw new Error('screen_params 为空')
          }
        } else if (!plan.conditions.length) {
          throw new Error('conditions 为空')
        }
        return {
          ...plan,
          strategy_title: plan.strategy_title || hints?.strategy_title || prompt.slice(0, 24) || '定制选股',
          prescreen_top_n: plan.prescreen_top_n || hints?.prescreen_top_n || 60,
          final_top_n: plan.final_top_n || hints?.final_top_n || 15,
          profile,
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    throw new Error(`策略 AI 解析失败：${errors.join('；')}`)
  }

  private async parsePlan(
    llm: NonNullable<ReturnType<ProviderRegistry['createLlm']>>,
    prompt: string,
    profile: DiscoverStrategyProfile = defaultDiscoverProfile(),
  ): Promise<DiscoverParsedPlan> {
    const factorList = discoverFactorsForProfile(profile).join(', ')
    const assetLabel = discoverProfileAssetLabel(profile)
    const jsonHint = isFilterDiscoverProfile(profile)
      ? '{"strategy_title":"标题","screen_params":{"keyword":"AAPL"},"prescreen_top_n":60,"final_top_n":15,"refinement_notes":"挖掘侧重点"}'
      : '{"strategy_title":"标题","conditions":[{"factor":"momentum_3m","op":">=","value":10}],"prescreen_top_n":60,"final_top_n":15,"refinement_notes":"挖掘侧重点"}'
    const rules = isFilterDiscoverProfile(profile)
      ? `screen_params 至少 1 项；可用字段：${factorList}；不要输出 conditions。`
      : 'conditions 1-5 条；op 为 > >= < <= =；数值为合理量化近似；参考因子示例可调整但需符合策略意图。'
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          `你是 ${assetLabel}解析器。将用户或预置策略描述转为 JSON，不要输出其它文字。`,
          '必须根据策略语义推导筛选条件，禁止套用与策略无关的固定模板。',
          isFilterDiscoverProfile(profile)
            ? `可用筛选字段：${factorList}`
            : `可用因子：${factorList}`,
          'JSON 格式：',
          jsonHint,
          `规则：${rules}`,
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ]
    const turn = await llm.chat(messages)
    const content = turn.message.content ?? ''
    const json = extractJsonObject(content)
    if (!json) throw new Error('策略解析失败')
    return normalizePlan(json, prompt, profile)
  }

  private async mineWithAgent(
    llm: NonNullable<ReturnType<ProviderRegistry['createLlm']>>,
    prompt: string,
    plan: DiscoverParsedPlan,
    candidates: PrescreenCandidate[],
    toolsUsed: string[],
    onPct: (n: number) => void,
    signal?: AbortSignal,
  ): Promise<{ strategy_summary: string; items: Array<Partial<DiscoverFinalItem> & { code: string; name: string }> }> {
    const profile = plan.profile ?? defaultDiscoverProfile()
    const def = getDiscoverProfileDefinition(profile)
    const prescreenMode = discoverPrescreenMode(profile)
    const miningGroup = def?.miningToolGroup

    let candidateTable: string
    if (prescreenMode === 'etf_screen') {
      candidateTable = formatEtfCandidateTable(candidates.map(c => ({
        code: c.code,
        name: c.name,
        premium_rate: c.key_factors.premium_rate ?? null,
        scale_yi: c.key_factors.scale_yi ?? null,
        key_factors: c.key_factors,
      })))
    } else if (prescreenMode === 'list_filter') {
      if (miningGroup === 'crypto_spot') {
        candidateTable = formatCryptoCandidateTable(candidates.map(c => {
          const parts = c.code.includes('/') ? c.code.split('/') : [c.code, 'USDT']
          return {
            code: c.code,
            name: c.name,
            base: parts[0] ?? c.code,
            quote: parts[1] ?? 'USDT',
          }
        }))
      } else if (miningGroup === 'us_equity' || miningGroup === 'jp_equity'
        || miningGroup === 'kr_equity' || miningGroup === 'hk_equity') {
        candidateTable = formatUsCandidateTable(candidates.map(c => ({
          code: c.code,
          name: c.name,
          exchange: c.exchange ?? null,
        })))
      } else {
        throw new Error('该资产类型暂不支持挖掘初选')
      }
    } else if (prescreenMode === 'factor_screen') {
      const codes = candidates.map(c => c.code)
      let enriched = candidates.map(c => ({
        ...c,
        industry: null as string | null,
        pe: c.key_factors.pe ?? null,
      }))

      try {
        const snapResp = await this.hub.dispatch('instrument_batch_snapshots', {
          instruments: codes.map(code => ({ market: 'CN', assetClass: 'EQUITY', symbol: code })),
        })
        const payload = snapResp.success && snapResp.data && typeof snapResp.data === 'object'
          ? snapResp.data as {
            items?: Array<{ code: string; industry: string | null; pe: number | null }>
            discover_items?: Array<{ code: string; industry: string | null; pe: number | null }>
          }
          : null
        const rows = Array.isArray(payload?.discover_items)
          ? payload.discover_items
          : Array.isArray(payload?.items)
            ? payload.items
            : []
        if (rows.length) {
          const byCode = new Map(rows.map(r => [r.code, r]))
          enriched = candidates.map(c => {
            const s = byCode.get(c.code)
            return {
              ...c,
              industry: s?.industry ?? null,
              pe: s?.pe ?? c.key_factors.pe ?? null,
            }
          })
        }
      } catch { /* optional enrichment */ }

      candidateTable = formatEquityCandidateTable(enriched)
    } else {
      throw new Error('该资产类型暂不支持挖掘初选')
    }

    const example = miningOutputExample(profile)
    const outputSchema = JSON.stringify({
      strategy_summary: '策略执行摘要',
      items: [{
        rank: 1,
        code: example.code,
        name: example.name,
        match_score: 90,
        thesis: '符合策略的核心逻辑',
        highlights: example.highlights,
        risks: example.risks,
      }],
    }, null, 0)

    const systemPrompt = buildDiscoverMiningSystemPrompt({
      profile,
      finalTopN: plan.final_top_n,
      outputSchema,
    })

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

    const broker = await McpToolBroker.create(this.tools, discoverMiningToolNames(profile))
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

  private fallbackMine(plan: DiscoverParsedPlan, candidates: PrescreenCandidate[]) {
    const sorted = [...candidates].sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
    const items = sorted.slice(0, plan.final_top_n).map((c, idx) => ({
      rank: idx + 1,
      code: c.code,
      name: c.name,
      match_score: Math.round(c.total_score ?? 50),
      thesis: '按初选条件排序（Agent 未返回结构化结果时的本地回退）',
      highlights: Object.entries(c.key_factors).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(1)}`),
      risks: [] as string[],
    }))
    return {
      strategy_summary: plan.refinement_notes,
      items,
    }
  }
}
