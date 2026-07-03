import type { MarketDataStore } from '../store.js'
import { normalizeStockCode } from '../utils.js'

const YI_YUAN = 1e8
export const ETF_SCORECARD_NAME = 'ETF决策雷达'

export interface EtfScorecardDimension {
  key: string
  label: string
  weight: number
  score: number | null
  value: string | null
  hint: string | null
}

export interface EtfScorecardResult {
  code: string
  name: string
  scorecard: typeof ETF_SCORECARD_NAME
  total_score: number | null
  grade: string | null
  dimensions: EtfScorecardDimension[]
  highlights: string[]
  risks: string[]
  source: 'local'
  data_as_of: string | null
}

const DIMENSIONS: { key: string; label: string; weight: number }[] = [
  { key: 'premium', label: '折溢价', weight: 0.25 },
  { key: 'scale_liquidity', label: '规模与流动性', weight: 0.25 },
  { key: 'expense', label: '费率', weight: 0.15 },
  { key: 'nav_stability', label: '净值稳健', weight: 0.20 },
  { key: 'peer_rank', label: '同类相对', weight: 0.15 },
]

function clampScore(v: number): number {
  return Math.round(Math.min(10, Math.max(0, v)) * 10) / 10
}

function gradeFromScore(total: number | null): string | null {
  if (total == null || Number.isNaN(total)) return null
  if (total >= 80) return 'A'
  if (total >= 70) return 'B+'
  if (total >= 60) return 'B'
  if (total >= 50) return 'C'
  return 'D'
}

function scorePremium(premium: number | null): { score: number | null; value: string | null; hint: string | null } {
  if (premium == null || Number.isNaN(premium)) {
    return { score: null, value: null, hint: '暂无溢价率数据' }
  }
  const abs = Math.abs(premium)
  let score = 2
  if (abs <= 0.3) score = 10
  else if (abs <= 0.5) score = 8
  else if (abs <= 1) score = 6
  else if (abs <= 2) score = 4
  const label = premium >= 0 ? `溢价 ${premium.toFixed(2)}%` : `折价 ${Math.abs(premium).toFixed(2)}%`
  const hint = abs <= 0.5
    ? '折溢价接近净值，买卖成本较低'
    : abs <= 1.5
      ? '折溢价适中，留意短期波动'
      : '折溢价偏离较大，注意交易时机'
  return { score: clampScore(score), value: label, hint }
}

function scoreExpense(ratio: number | null): { score: number | null; value: string | null; hint: string | null } {
  if (ratio == null || Number.isNaN(ratio)) {
    return { score: null, value: null, hint: '暂无管理费数据' }
  }
  let score = 2
  if (ratio <= 0.15) score = 10
  else if (ratio <= 0.3) score = 8
  else if (ratio <= 0.5) score = 6
  else if (ratio <= 1) score = 4
  return {
    score: clampScore(score),
    value: `${ratio.toFixed(2)}%/年`,
    hint: ratio <= 0.5 ? '费率较低，长期持有更友好' : '费率偏高，宜与同类对比',
  }
}

function scoreScaleLiquidity(
  scaleYi: number | null,
  amount: number | null,
): { score: number | null; value: string | null; hint: string | null } {
  let scaleScore: number | null = null
  if (scaleYi != null && Number.isFinite(scaleYi)) {
    if (scaleYi >= 100) scaleScore = 10
    else if (scaleYi >= 50) scaleScore = 8
    else if (scaleYi >= 20) scaleScore = 7
    else if (scaleYi >= 10) scaleScore = 6
    else if (scaleYi >= 5) scaleScore = 4
    else scaleScore = 2
  }
  let liqScore: number | null = null
  if (amount != null && Number.isFinite(amount)) {
    const yi = amount / YI_YUAN
    if (yi >= 5) liqScore = 10
    else if (yi >= 2) liqScore = 8
    else if (yi >= 0.5) liqScore = 6
    else if (yi >= 0.1) liqScore = 4
    else liqScore = 2
  }
  if (scaleScore == null && liqScore == null) {
    return { score: null, value: null, hint: '暂无规模或成交数据' }
  }
  const parts: number[] = []
  if (scaleScore != null) parts.push(scaleScore)
  if (liqScore != null) parts.push(liqScore)
  const score = clampScore(parts.reduce((a, b) => a + b, 0) / parts.length)
  const valueParts: string[] = []
  if (scaleYi != null) valueParts.push(`规模 ${scaleYi.toFixed(1)} 亿`)
  if (amount != null) valueParts.push(`日成交 ${(amount / YI_YUAN).toFixed(2)} 亿`)
  return {
    score,
    value: valueParts.join(' · ') || null,
    hint: score >= 7 ? '规模与成交较活跃，进出相对方便' : '规模或流动性一般，大额交易需留意冲击',
  }
}

function scoreNavStability(
  navRows: { changePct: number | null }[],
): { score: number | null; value: string | null; hint: string | null } {
  const changes = navRows
    .map(r => r.changePct)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .slice(0, 20)
  if (changes.length < 5) {
    return { score: null, value: null, hint: '净值历史不足，无法评估波动' }
  }
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length
  const variance = changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length
  const std = Math.sqrt(variance)
  let score = 6
  if (std <= 0.8) score = 10
  else if (std <= 1.2) score = 8
  else if (std <= 2) score = 6
  else if (std <= 3) score = 4
  else score = 2
  return {
    score: clampScore(score),
    value: `近 ${changes.length} 日波动 σ≈${std.toFixed(2)}%`,
    hint: std <= 1.5 ? '净值走势相对平稳' : '净值波动偏大，适合风险承受能力较高的配置',
  }
}

function percentileRank(value: number, values: number[], higherIsBetter: boolean): number {
  if (!values.length || !Number.isFinite(value)) return 5
  const sorted = [...values].sort((a, b) => a - b)
  let rank = 0
  for (const v of sorted) {
    if (higherIsBetter ? v <= value : v >= value) rank++
  }
  return clampScore((rank / sorted.length) * 10)
}

function scorePeerRank(
  premium: number | null,
  scaleYi: number | null,
  peers: { premium: number | null; scaleYi: number | null }[],
): { score: number | null; value: string | null; hint: string | null } {
  if (peers.length < 10) {
    return { score: null, value: null, hint: '同类 ETF 样本不足' }
  }
  const premAbs = premium != null ? Math.abs(premium) : null
  const premPeers = peers.map(p => p.premium).filter((v): v is number => v != null).map(Math.abs)
  const scalePeers = peers.map(p => p.scaleYi).filter((v): v is number => v != null && v > 0)

  const parts: number[] = []
  if (premAbs != null && premPeers.length >= 10) {
    parts.push(percentileRank(premAbs, premPeers, false))
  }
  if (scaleYi != null && scalePeers.length >= 10) {
    parts.push(percentileRank(scaleYi, scalePeers, true))
  }
  if (!parts.length) {
    return { score: null, value: null, hint: '缺少可比数据' }
  }
  const score = clampScore(parts.reduce((a, b) => a + b, 0) / parts.length)
  return {
    score,
    value: `在 ${peers.length} 只本地 ETF 中相对位置`,
    hint: score >= 7 ? '折溢价与规模在同类中较优' : '同类对比一般，可结合跟踪指数再筛选',
  }
}

function buildHighlightsRisks(dims: EtfScorecardDimension[]): { highlights: string[]; risks: string[] } {
  const highlights: string[] = []
  const risks: string[] = []
  for (const d of dims) {
    if (d.score == null) continue
    if (d.score >= 8 && d.hint) highlights.push(`${d.label}：${d.hint}`)
    if (d.score <= 4 && d.hint) risks.push(`${d.label}：${d.hint}`)
  }
  if (!highlights.length && dims.some(d => d.score != null)) {
    highlights.push('各维度表现中等，建议结合跟踪指数与配置目标判断')
  }
  return { highlights: highlights.slice(0, 4), risks: risks.slice(0, 4) }
}

function loadEtfContext(store: MarketDataStore, code: string) {
  const normalized = normalizeStockCode(code)
  const inst = store.db.prepare(`
    SELECT code, name FROM instruments
    WHERE code = ? AND asset_class = 'ETF' AND market = 'CN'
  `).get(normalized) as { code: string; name: string } | undefined

  const profile = store.getEtfProfile(normalized)
  const navRows = store.getEtfNavHistory(normalized, 30)
  const latestNav = navRows[0] ?? null

  const quoteRow = store.db.prepare(`
    SELECT close, amount, trade_date FROM stock_quotes_daily
    WHERE code = ? ORDER BY trade_date DESC LIMIT 1
  `).get(normalized) as { close: number | null; amount: number | null; trade_date: string } | undefined

  const premium = latestNav?.premiumRate
    ?? (profile?.premiumRate as number | null | undefined)
    ?? null

  const nav = latestNav?.nav ?? (profile?.nav as number | null | undefined) ?? null
  const scaleRaw = (profile?.scale as number | null | undefined)
    ?? ((profile?.totalShares as number | null | undefined) != null && nav != null
      ? Number(profile!.totalShares) * nav
      : null)
  const scaleYi = scaleRaw != null && Number.isFinite(scaleRaw) ? scaleRaw / YI_YUAN : null

  const expenseRatio = profile?.expenseRatio as number | null | undefined ?? null

  return {
    inst,
    profile,
    navRows,
    latestNav,
    premium,
    scaleYi,
    expenseRatio,
    amount: quoteRow?.amount ?? null,
    dataAsOf: latestNav?.date ?? quoteRow?.trade_date ?? null,
  }
}

function loadPeerSnapshot(store: MarketDataStore): { premium: number | null; scaleYi: number | null }[] {
  const rows = store.db.prepare(`
    SELECT
      i.code,
      ln.premium_rate,
      COALESCE(
        NULLIF(json_extract(p.profile_json, '$.scale'), 0),
        NULLIF(json_extract(p.profile_json, '$.totalShares'), 0) * NULLIF(ln.nav, 0)
      ) / ${YI_YUAN} AS scale_yi
    FROM instruments i
    LEFT JOIN etf_profiles p ON p.code = i.code
    LEFT JOIN (
      SELECT code, nav, premium_rate,
        ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
      FROM etf_nav_daily
    ) ln ON ln.code = i.code AND ln.rn = 1
    WHERE i.asset_class = 'ETF' AND i.market = 'CN' AND i.status = 'active'
  `).all() as { premium_rate: number | null; scale_yi: number | null }[]
  return rows.map(r => ({ premium: r.premium_rate, scaleYi: r.scale_yi }))
}

export function computeEtfScorecard(store: MarketDataStore, code: string): EtfScorecardResult | null {
  const ctx = loadEtfContext(store, code)
  if (!ctx.inst) return null

  const peers = loadPeerSnapshot(store)
  const dimScores: Record<string, ReturnType<typeof scorePremium>> = {
    premium: scorePremium(ctx.premium),
    scale_liquidity: scoreScaleLiquidity(ctx.scaleYi, ctx.amount),
    expense: scoreExpense(ctx.expenseRatio),
    nav_stability: scoreNavStability(ctx.navRows),
    peer_rank: scorePeerRank(ctx.premium, ctx.scaleYi, peers),
  }

  const dimensions: EtfScorecardDimension[] = DIMENSIONS.map(d => ({
    key: d.key,
    label: d.label,
    weight: d.weight,
    score: dimScores[d.key]?.score ?? null,
    value: dimScores[d.key]?.value ?? null,
    hint: dimScores[d.key]?.hint ?? null,
  }))

  let total = 0
  let wsum = 0
  for (const d of dimensions) {
    if (d.score != null) {
      total += d.score * d.weight
      wsum += d.weight
    }
  }
  const totalScore = wsum > 0 ? Math.round((total / wsum) * 10) : null
  const { highlights, risks } = buildHighlightsRisks(dimensions)

  return {
    code: ctx.inst.code,
    name: ctx.inst.name,
    scorecard: ETF_SCORECARD_NAME,
    total_score: totalScore,
    grade: gradeFromScore(totalScore),
    dimensions,
    highlights,
    risks,
    source: 'local',
    data_as_of: ctx.dataAsOf,
  }
}

export function buildEtfScorecardSchema() {
  return {
    name: ETF_SCORECARD_NAME,
    description: '基于本地 ETF 净值、规模、费率、流动性与同类对比的决策雷达（0–100 分）',
    prerequisite: '需先完成 etf_list / etf_nav 同步；有行情截面时流动性维度更准确',
    dimensions: DIMENSIONS.map(d => ({ key: d.key, label: d.label, weight: d.weight })),
    grades: {
      A: '≥80 综合较优',
      'B+': '≥70 良好',
      B: '≥60 中等偏上',
      C: '≥50 一般',
      D: '<50 偏弱',
    },
  }
}
