import { type ReactNode } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import InnoButton from '../components/inno/InnoButton'
import type { WatchlistItem } from '../types/market'
import type { HoldingSnapshot } from './useFollowPortfolio'
import type { StockMoneyFlowItem } from '../types/market'
import { innoTokens } from '../theme/tokens'
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
    color: innoTokens.textTertiary,
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
    borderRadius: innoTokens.radiusSm,
    backgroundColor: innoTokens.canvas,
    border: `1px solid ${innoTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  },
  metricLabel: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
    lineHeight: 1.2,
  },
  metricValue: {
    fontSize: '11px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  toneExcellent: { color: '#248A3D' },
  toneGood: { color: innoTokens.success },
  toneNeutral: { color: innoTokens.textPrimary },
  toneCaution: { color: innoTokens.warning },
  toneRisk: { color: innoTokens.error },
  toneBullish: { color: '#FF3B30' },
  toneBearish: { color: '#34C759' },
  toneMuted: { color: innoTokens.textTertiary },
  bulletList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  bullet: {
    fontSize: '11px',
    lineHeight: 1.55,
    color: innoTokens.textSecondary,
    paddingLeft: '10px',
    position: 'relative',
    '::before': {
      content: '"·"',
      position: 'absolute',
      left: 0,
      color: innoTokens.textTertiary,
    },
  },
  bulletPositive: {
    color: '#248A3D',
    '::before': { color: innoTokens.success },
  },
  bulletRisk: {
    color: '#C93400',
    '::before': { color: innoTokens.error },
  },
  signalRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '6px',
    alignItems: 'center',
    padding: '5px 6px',
    borderRadius: innoTokens.radiusSm,
    backgroundColor: innoTokens.canvas,
    border: `1px solid ${innoTokens.separator}`,
  },
  signalName: {
    fontSize: '10px',
    color: innoTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  signalDir: {
    fontSize: '10px',
    fontWeight: 600,
    color: innoTokens.textSecondary,
    flexShrink: 0,
  },
  signalConf: {
    fontSize: '10px',
    color: innoTokens.textSecondary,
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
    borderRadius: innoTokens.radiusSm,
    backgroundColor: innoTokens.canvas,
    border: `1px solid ${innoTokens.separator}`,
  },
  guideText: {
    fontSize: '10px',
    lineHeight: 1.55,
    color: innoTokens.textSecondary,
  },
  guideHighlight: {
    color: innoTokens.textPrimary,
    fontWeight: 600,
  },
  guideValue: {
    fontWeight: 600,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 0',
    color: innoTokens.textTertiary,
  },
  emptyHint: {
    fontSize: '11px',
    color: innoTokens.textTertiary,
    padding: '2px',
  },
  error: {
    fontSize: '11px',
    color: innoTokens.textTertiary,
    padding: '2px',
  },
  headRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: '16px',
  },
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
      <span
        className={mergeClasses(s.metricValue, toneClass(s, tone))}
        title={value}
      >
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
          当前
          {' '}
          <span className={mergeClasses(s.guideValue, toneClass(s, valueTone))}>{value}</span>
          。
        </>
      ) : null}
      {suffix}
    </Text>
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
  const { data, loading, error } = useStockDecisionCard(stock, holding, price, moneyFlow, quotePe, quotePb)

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
      ? `请基于分析卡数据，分析 ${stock.name}（${stock.code}）的买入时机、仓位与风险。`
      : `请基于分析卡数据，分析 ${stock.name}（${stock.code}）是否应减仓/卖出及关键价位。`
    onDiscuss({ code: stock.code, name: stock.name, topic, contextText, prompt })
  }

  if (loading && !data) {
    return (
      <div className={mergeClasses(s.panel, 'inno-stock-decision-card')}>
        <div className={s.loading}><Spinner size="small" label="加载分析…" /></div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={mergeClasses(s.panel, 'inno-stock-decision-card')}>
        <Text className={s.error}>{error}</Text>
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
    <div className={mergeClasses(s.panel, 'inno-stock-decision-card')}>
      {loading && (
        <div className={s.headRow}>
          <Spinner size="tiny" label="刷新中" />
        </div>
      )}

      <Section title="核心研判">
        <div className={s.metricGrid3}>
          <Metric label="综合评分" value={vm.scoreSummary} tone={scoreTone} />
          <Metric label="策略倾向" value={vm.strategySummary ?? '—'} tone={strategyTone} />
          <Metric label="机构共识" value={vm.institutionLabel ?? '—'} tone={institutionTone} />
          <Metric label="估值分位" value={vm.valuationLabel ?? '—'} tone={valuationToneVal} />
          <Metric label="现价" value={vm.priceLabel || '—'} />
          {stock.note ? <Metric label="关注备注" value={stock.note} /> : null}
        </div>
        <div className={s.guideBox}>
          <Text className={s.guideText}>
            <span className={s.guideHighlight}>综合评分：</span>
            <span className={mergeClasses(s.guideValue, toneClass(s, scoreTone))}>
              {vm.scoreSummary}
            </span>
            {' — '}
            {vm.scoreExplanation ?? SCORE_GRADE_LEGEND}
          </Text>
          <GuideLine
            label="策略倾向"
            value={vm.strategySummary}
            valueTone={strategyTone}
            suffix={vm.strategySummary ? STRATEGY_SUMMARY_LEGEND : `暂无策略信号。${STRATEGY_SUMMARY_LEGEND}`}
          />
          <GuideLine
            label="估值分位"
            value={vm.valuationLabel}
            valueTone={valuationToneVal}
            suffix={vm.valuationLabel ? VALUATION_LEGEND : `暂无分位数据，可参考 PE/PB 绝对值。${VALUATION_LEGEND}`}
          />
          <Text className={s.guideText}>
            <span className={s.guideHighlight}>机构共识：</span>
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

      <Section title="投资逻辑">
        {vm.thesis.length > 0 ? (
          <div className={s.bulletList}>
            {vm.thesis.map(item => (
              <div key={item} className={mergeClasses(s.bullet, s.bulletPositive)}>{item}</div>
            ))}
          </div>
        ) : (
          <Text className={s.emptyHint}>暂无显著正向因子，需结合定性判断</Text>
        )}
      </Section>

      <Section title="风险提示">
        {vm.risks.length > 0 ? (
          <div className={s.bulletList}>
            {vm.risks.map(item => (
              <div key={item} className={mergeClasses(s.bullet, s.bulletRisk)}>{item}</div>
            ))}
          </div>
        ) : (
          <Text className={s.emptyHint}>暂无显著风险项</Text>
        )}
      </Section>

      {strategy?.signals?.length ? (
        <Section title="策略信号">
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
          <InnoButton
            className={s.actionBtn}
            variant="primary"
            onClick={() => handleDiscuss('buy')}
          >
            研讨买入点
          </InnoButton>
          <InnoButton
            className={s.actionBtn}
            variant="pill"
            onClick={() => handleDiscuss('sell')}
          >
            研讨卖出点
          </InnoButton>
        </div>
      )}
    </div>
  )
}
