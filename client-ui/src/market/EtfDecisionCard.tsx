import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowClockwiseRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import type { EtfScorecardData } from '../types/market'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { formatScoreSummary, formatScorecardDisplayName, getScoreGradeInfo } from './scoreGrade'
import { scoreMetricTone, type DecisionMetricTone } from './decisionCardTone'
import { listRowKey } from '../utils/listRowKey'

const ETF_SCORE_LEGEND =
  '基于折溢价、规模与成交、管理费、净值波动及同类对比的本地评分（0–100 分），供挑选与换仓参考，不构成买卖建议。'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  headRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
  },
  headMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  title: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
  },
  scoreLine: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.3,
  },
  meta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  legend: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 650,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
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
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.2,
  },
  metricValue: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  metricSub: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  toneExcellent: { color: '#248A3D' },
  toneGood: { color: opptrixCssVars.success },
  toneNeutral: { color: opptrixCssVars.textPrimary },
  toneCaution: { color: opptrixCssVars.warning },
  toneRisk: { color: opptrixCssVars.error },
  toneMuted: { color: opptrixCssVars.textTertiary },
  bulletList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  bullet: {
    fontSize: 'var(--opptrix-font-sm)',
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
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 8px',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-md)',
    gap: '8px',
  },
  error: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.error,
    lineHeight: 1.45,
  },
})

function toneClass(s: ReturnType<typeof useStyles>, tone: DecisionMetricTone) {
  switch (tone) {
    case 'excellent': return s.toneExcellent
    case 'good': return s.toneGood
    case 'neutral': return s.toneNeutral
    case 'caution': return s.toneCaution
    case 'risk': return s.toneRisk
    default: return s.toneMuted
  }
}

function formatDimScore(score: number | null): string {
  if (score == null || Number.isNaN(score)) return '—'
  return `${score.toFixed(1)}/10`
}

interface Props {
  data: EtfScorecardData | null
  loading: boolean
  error: string
  onRefresh: () => void
}

function normalizeScorecardError(msg: string): string {
  return msg.replace(/决策雷达/g, '综合评分')
}

export default function EtfDecisionCard({ data, loading, error, onRefresh }: Props) {
  const s = useStyles()

  if (loading && !data) {
    return (
      <div className={s.center}>
        <Spinner size="small" label="正在计算综合评分…" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={s.panel}>
        <Text className={s.error} block>{normalizeScorecardError(error)}</Text>
        <OpptrixButton variant="secondary" onClick={onRefresh}>重试</OpptrixButton>
      </div>
    )
  }

  if (!data) return null

  const scoreTone = scoreMetricTone(data.total_score)
  const gradeInfo = getScoreGradeInfo(data.total_score)

  return (
    <div className={mergeClasses(s.panel, 'opptrix-etf-decision-card')}>
      <div className={s.headRow}>
        <div className={s.headMain}>
          <Text className={s.title} block>{formatScorecardDisplayName(data.scorecard)}</Text>
          <span className={mergeClasses(s.scoreLine, toneClass(s, scoreTone))}>
            {formatScoreSummary(data.total_score)}
          </span>
          {gradeInfo && (
            <Text className={s.meta} block>{gradeInfo.description}</Text>
          )}
          {data.data_as_of && (
            <Text className={s.meta} block>数据截至 {data.data_as_of}</Text>
          )}
        </div>
        <OpptrixButton
          variant="icon"
          icon={<ArrowClockwiseRegular fontSize={14} />}
          aria-label="刷新评分"
          onClick={onRefresh}
          disabled={loading}
        />
      </div>

      <Text className={s.legend} block>{ETF_SCORE_LEGEND}</Text>

      <div>
        <Text className={s.sectionTitle} block>维度评分</Text>
        <div className={s.metricGrid}>
          {data.dimensions.map(dim => {
            const dimTone = scoreMetricTone(dim.score != null ? dim.score * 10 : null)
            return (
              <div key={dim.key} className={s.metric}>
                <span className={s.metricLabel}>{dim.label}</span>
                <span className={mergeClasses(s.metricValue, toneClass(s, dimTone))}>
                  {formatDimScore(dim.score)}
                </span>
                {dim.value && <span className={s.metricSub} title={dim.value}>{dim.value}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {data.highlights.length > 0 && (
        <div>
          <Text className={s.sectionTitle} block>亮点</Text>
          <div className={s.bulletList}>
            {data.highlights.map((item, index) => (
              <span key={listRowKey(index, item)} className={mergeClasses(s.bullet, s.bulletPositive)}>{item}</span>
            ))}
          </div>
        </div>
      )}

      {data.risks.length > 0 && (
        <div>
          <Text className={s.sectionTitle} block>留意</Text>
          <div className={s.bulletList}>
            {data.risks.map((item, index) => (
              <span key={listRowKey(index, item)} className={mergeClasses(s.bullet, s.bulletRisk)}>{item}</span>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className={s.center}>
          <Spinner size="tiny" label="更新中…" />
        </div>
      )}
    </div>
  )
}
