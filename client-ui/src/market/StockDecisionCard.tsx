import { useState, type ReactNode } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowClockwiseRegular, ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import type { WatchlistItem } from '../types/market'
import type { HoldingSnapshot } from './useFollowPortfolio'
import type { StockMoneyFlowItem } from '../types/market'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import {
  INSTITUTION_LEGEND,
  SCORE_GRADE_LEGEND,
  STRATEGY_SUMMARY_LEGEND,
  VALUATION_LEGEND,
} from './scoreGrade'
import { buildStockResearchContext, type DiscussTopic } from './decisionCardLogic'
import {
  type DecisionMetricTone,
  flowMetricTone,
  holdingMetricTone,
  institutionMetricTone,
  scoreMetricTone,
  signalDirectionTone,
  strategyMetricTone,
  valuationMetricTone,
} from './decisionCardTone'
import { useStockDecisionCard } from './useStockDecisionCard'
import { resolveWatchlistInstrument } from './instrument'
import { useStockAnalysis, type AnalysisStep } from './useStockAnalysis'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 650,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  metricGrid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '4px',
  },
  metric: {
    padding: '5px 6px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  },
  metricLabel: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.2,
  },
  metricValue: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  toneExcellent: { color: '#248A3D' },
  toneGood: { color: opptrixCssVars.success },
  toneNeutral: { color: opptrixCssVars.textPrimary },
  toneCaution: { color: opptrixCssVars.warning },
  toneRisk: { color: opptrixCssVars.error },
  toneBullish: { color: '#FF3B30' },
  toneBearish: { color: '#34C759' },
  toneMuted: { color: opptrixCssVars.textTertiary },
  bulletList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  bullet: {
    fontSize: '11px',
    lineHeight: 1.55,
    color: opptrixCssVars.textSecondary,
    paddingLeft: '10px',
    position: 'relative',
    '::before': {
      content: '"·"',
      position: 'absolute',
      left: 0,
      color: opptrixCssVars.textTertiary,
    },
  },
  bulletPositive: {
    color: '#248A3D',
    '::before': { color: opptrixCssVars.success },
  },
  bulletRisk: {
    color: '#C93400',
    '::before': { color: opptrixCssVars.error },
  },
  signalRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '6px',
    alignItems: 'center',
    padding: '5px 6px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  signalName: {
    fontSize: '10px',
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  signalDir: {
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  signalConf: {
    fontSize: '10px',
    color: opptrixCssVars.textSecondary,
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  actions: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    paddingTop: '2px',
  },
  actionBtn: {
    flex: '1 1 auto',
    minWidth: '0',
    fontSize: '11px',
    minHeight: '30px',
    paddingTop: '5px',
    paddingBottom: '5px',
  },
  guideBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '6px 8px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  guideText: {
    fontSize: '10px',
    lineHeight: 1.55,
    color: opptrixCssVars.textSecondary,
  },
  guideHighlight: {
    color: opptrixCssVars.textPrimary,
    fontWeight: 600,
  },
  guideValue: {
    fontWeight: 600,
  },
  emptyHint: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    padding: '2px',
  },
  error: {
    fontSize: '11px',
    color: opptrixCssVars.error,
    padding: '2px',
  },
  headRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: '16px',
  },
  idleCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  idleTitle: {
    fontSize: '12px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
  },
  idleDesc: {
    fontSize: '10px',
    lineHeight: 1.55,
    color: opptrixCssVars.textSecondary,
  },
  stepBanner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  stepHead: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
  },
  stepHeadText: {
    flex: 1,
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stepHeadTextError: {
    color: opptrixCssVars.error,
  },
  stepBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '9px',
    color: opptrixCssVars.textSecondary,
  },
  stepDone: { color: '#248A3D' },
  stepRunning: { color: opptrixCssVars.textPrimary, fontWeight: 600 },
  stepError: { color: opptrixCssVars.error },
})

export interface StockDiscussPayload {
  code: string
  name: string
  topic: DiscussTopic
  contextText: string
  prompt: string
}

interface Props {
  stock: WatchlistItem
  price: number | null
  quotePe?: number | null
  quotePb?: number | null
  holding?: HoldingSnapshot | null
  moneyFlow?: StockMoneyFlowItem | null
  onDiscuss?: (payload: StockDiscussPayload) => void
}

function toneClass(s: ReturnType<typeof useStyles>, tone?: DecisionMetricTone): string | undefined {
  if (!tone || tone === 'neutral') return undefined
  const map: Record<Exclude<DecisionMetricTone, 'neutral'>, keyof ReturnType<typeof useStyles>> = {
    excellent: 'toneExcellent',
    good: 'toneGood',
    caution: 'toneCaution',
    risk: 'toneRisk',
    bullish: 'toneBullish',
    bearish: 'toneBearish',
    muted: 'toneMuted',
  }
  const key = map[tone as Exclude<DecisionMetricTone, 'neutral'>]
  return key ? s[key] : undefined
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: DecisionMetricTone
}) {
  const s = useStyles()
  return (
    <div className={s.metric}>
      <span className={s.metricLabel}>{label}</span>
      <span className={mergeClasses(s.metricValue, toneClass(s, tone))} title={value}>
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const s = useStyles()
  return (
    <div className={s.section}>
      <Text className={s.sectionTitle}>{title}</Text>
      {children}
    </div>
  )
}

function GuideLine({
  label,
  value,
  suffix,
  valueTone,
}: {
  label: string
  value?: string | null
  suffix: string
  valueTone?: DecisionMetricTone
}) {
  const s = useStyles()
  return (
    <Text className={s.guideText}>
      <span className={s.guideHighlight}>{label}：</span>
      {value ? (
        <>
          当前{' '}
          <span className={mergeClasses(s.guideValue, toneClass(s, valueTone))}>{value}</span>。
        </>
      ) : null}
      {suffix}
    </Text>
  )
}

function AnalysisStepBanner({
  steps,
  percent,
  status,
  error,
  expanded,
  onToggle,
  onRetry,
}: {
  steps: AnalysisStep[]
  percent: number
  status: 'running' | 'error'
  error: string
  expanded: boolean
  onToggle: () => void
  onRetry?: () => void
}) {
  const s = useStyles()
  const runningStep = steps.find(step => step.status === 'running')
  const label = status === 'error'
    ? (error || '分析未能全部完成')
    : `正在分析 ${percent}%${runningStep ? ` · ${runningStep.label}` : ''}`

  return (
    <div className={s.stepBanner}>
      <button type="button" className={s.stepHead} aria-expanded={expanded} onClick={onToggle}>
        {status === 'running' && <Spinner size="tiny" />}
        <Text className={mergeClasses(s.stepHeadText, status === 'error' && s.stepHeadTextError)} block>
          {label}
        </Text>
        {expanded
          ? <ChevronDownRegular fontSize={12} color={opptrixCssVars.textTertiary} />
          : <ChevronRightRegular fontSize={12} color={opptrixCssVars.textTertiary} />}
      </button>
      {expanded && (
        <div className={s.stepBody}>
          {steps.map(step => (
            <div
              key={step.id}
              className={mergeClasses(
                s.stepRow,
                step.status === 'done' && s.stepDone,
                step.status === 'running' && s.stepRunning,
                step.status === 'error' && s.stepError,
              )}
            >
              <span>{step.label}</span>
              <span>
                {step.message ?? (step.status === 'pending' ? '排队中' : step.status === 'done' ? '完成' : '')}
              </span>
            </div>
          ))}
          {status === 'error' && onRetry && (
            <OpptrixButton variant="secondary" onClick={onRetry}>
              重试
            </OpptrixButton>
          )}
        </div>
      )}
    </div>
  )
}

export default function StockDecisionCard({
  stock,
  price,
  quotePe,
  quotePb,
  holding,
  moneyFlow,
  onDiscuss,
}: Props) {
  const s = useStyles()
  const [stepsExpanded, setStepsExpanded] = useState(false)
  const analysis = useStockAnalysis(stock.code, resolveWatchlistInstrument(stock))
  const { data } = useStockDecisionCard(stock, analysis.raw, holding, price, moneyFlow, quotePe, quotePb)

  const handleDiscuss = (topic: DiscussTopic) => {
    if (!data || !onDiscuss) return
    const contextText = buildStockResearchContext({
      stock,
      topic,
      vm: data.vm,
      evalData: data.evalData,
      strategy: data.strategy,
      institution: data.institution,
    })
    const prompt = topic === 'buy'
      ? `请结合以下投研摘要，讨论 ${stock.name}（${stock.code}）的买入时机、仓位与风险。`
      : `请结合以下投研摘要，讨论 ${stock.name}（${stock.code}）是否适合减仓或卖出，以及关键价位。`
    onDiscuss({ code: stock.code, name: stock.name, topic, contextText, prompt })
  }

  if (analysis.status === 'idle') {
    return (
      <div className={mergeClasses(s.panel, 'opptrix-stock-decision-card')}>
        <div className={s.idleCard}>
          <Text className={s.idleTitle} block>投研摘要</Text>
          <Text className={s.idleDesc} block>
            综合评分、多空倾向、研报观点与估值评估，完整分析约需半分钟。
          </Text>
          <OpptrixButton variant="primary" onClick={() => { void analysis.start(true) }}>
            开始分析
          </OpptrixButton>
        </div>
      </div>
    )
  }

  if (analysis.status === 'running' || analysis.status === 'error') {
    return (
      <div className={mergeClasses(s.panel, 'opptrix-stock-decision-card')}>
        <AnalysisStepBanner
          steps={analysis.steps}
          percent={analysis.percent}
          status={analysis.status}
          error={analysis.error}
          expanded={stepsExpanded}
          onToggle={() => setStepsExpanded(v => !v)}
          onRetry={analysis.status === 'error' ? () => { void analysis.start(true) } : undefined}
        />
      </div>
    )
  }

  if (!data) return null

  const { vm, strategy } = data
  const scoreTone = scoreMetricTone(vm.totalScore)
  const strategyTone = strategyMetricTone(vm.strategySummary)
  const valuationToneVal = valuationMetricTone(vm.valuationLabel)
  const institutionTone = institutionMetricTone(vm.institutionLabel)

  const contextMetrics = [
    vm.holdingLabel
      ? { label: '持仓', value: vm.holdingLabel, tone: holdingMetricTone(vm.holdingLabel) }
      : null,
    vm.cyqLabel ? { label: '筹码', value: vm.cyqLabel, tone: 'neutral' as const } : null,
    vm.flowLabel
      ? { label: '资金', value: vm.flowLabel.replace(/^主力\s*/, ''), tone: flowMetricTone(vm.flowLabel) }
      : null,
  ].filter((item): item is { label: string; value: string; tone: DecisionMetricTone } => item != null)

  return (
    <div className={mergeClasses(s.panel, 'opptrix-stock-decision-card')}>
      <div className={s.headRow}>
        <OpptrixButton
          variant="icon"
          icon={<ArrowClockwiseRegular fontSize={14} />}
          aria-label="重新分析"
          onClick={() => { void analysis.start(true) }}
        />
      </div>

      <Section title="核心结论">
        <div className={s.metricGrid3}>
          <Metric
            label={vm.gbmLabel ? 'G=B+M 评分' : '综合评分'}
            value={vm.gbmLabel ? `${vm.scoreSummary}（${vm.gbmLabel}）` : vm.scoreSummary}
            tone={scoreTone}
          />
          <Metric label="多空倾向" value={vm.strategySummary ?? '—'} tone={strategyTone} />
          <Metric label="研报观点" value={vm.institutionLabel ?? '—'} tone={institutionTone} />
          <Metric label="估值高低" value={vm.valuationLabel ?? '—'} tone={valuationToneVal} />
          <Metric label="现价" value={vm.priceLabel || '—'} />
          {stock.note ? <Metric label="我的备注" value={stock.note} /> : null}
        </div>
        <div className={s.guideBox}>
          <Text className={s.guideText}>
            <span className={s.guideHighlight}>{vm.gbmLabel ? 'G=B+M 评分：' : '综合评分：'}</span>
            <span className={mergeClasses(s.guideValue, toneClass(s, scoreTone))}>
              {vm.scoreSummary}
            </span>
            {vm.gbmLabel ? ` · ${vm.gbmLabel}` : null}
            {' — '}
            {vm.scoreExplanation ?? SCORE_GRADE_LEGEND}
          </Text>
          <GuideLine
            label="多空倾向"
            value={vm.strategySummary}
            valueTone={strategyTone}
            suffix={vm.strategySummary ? STRATEGY_SUMMARY_LEGEND : `暂无多空倾向结论。${STRATEGY_SUMMARY_LEGEND}`}
          />
          <GuideLine
            label="估值高低"
            value={vm.valuationLabel}
            valueTone={valuationToneVal}
            suffix={vm.valuationLabel ? VALUATION_LEGEND : `暂无历史分位，可参考市盈率、市净率绝对值。${VALUATION_LEGEND}`}
          />
          <Text className={s.guideText}>
            <span className={s.guideHighlight}>研报观点：</span>
            {INSTITUTION_LEGEND}
          </Text>
        </div>
      </Section>

      {contextMetrics.length > 0 && (
        <Section title="持仓 · 筹码 · 资金">
          <div className={s.metricGrid3}>
            {contextMetrics.map(item => (
              <Metric key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </div>
        </Section>
      )}

      <Section title="看好理由">
        {vm.thesis.length > 0 ? (
          <div className={s.bulletList}>
            {vm.thesis.map(item => (
              <div key={item} className={mergeClasses(s.bullet, s.bulletPositive)}>{item}</div>
            ))}
          </div>
        ) : (
          <Text className={s.emptyHint}>暂无明显利好因素，建议结合自己的判断</Text>
        )}
      </Section>

      <Section title="需要注意">
        {vm.risks.length > 0 ? (
          <div className={s.bulletList}>
            {vm.risks.map(item => (
              <div key={item} className={mergeClasses(s.bullet, s.bulletRisk)}>{item}</div>
            ))}
          </div>
        ) : (
          <Text className={s.emptyHint}>暂未列出显著风险点</Text>
        )}
      </Section>

      {strategy?.signals?.length ? (
        <Section title="各策略看法">
          <div className={s.bulletList}>
            {strategy.signals.slice(0, 6).map(sig => {
              const dirTone = signalDirectionTone(sig.direction)
              return (
                <div key={sig.name} className={s.signalRow}>
                  <span className={s.signalName} title={sig.name}>{sig.name}</span>
                  <span className={mergeClasses(s.signalDir, toneClass(s, dirTone))}>{sig.direction}</span>
                  <span className={s.signalConf}>{Math.round(sig.confidence * 100)}%</span>
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {onDiscuss && (
        <div className={s.actions}>
          <OpptrixButton className={s.actionBtn} variant="primary" onClick={() => handleDiscuss('buy')}>
            和 AI 讨论买入
          </OpptrixButton>
          <OpptrixButton className={s.actionBtn} variant="pill" onClick={() => handleDiscuss('sell')}>
            和 AI 讨论卖出
          </OpptrixButton>
        </div>
      )}
    </div>
  )
}
