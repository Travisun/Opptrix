import { useState, useEffect } from 'react'
import {
  makeStyles, tokens, Text, SearchBox, Button, Spinner,
  Badge, TabList, Tab, ProgressBar,
} from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import MetricTile from '../components/MetricTile'
import { getConfig, research } from '../api/client'
import type { StockContext } from '../context/AppContext'
import { normalizeInstrumentRefLocal, parseInstrumentInput, toStockContext } from '../market/instrument'
import type { StockDiagnosisData, InstitutionRatingData, StrategySignalData } from '../types/schemas'

const useStyles = makeStyles({
  headerRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  metricsRow: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  section: {
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalM,
  },
  sectionTitle: { marginBottom: tokens.spacingVerticalS },
  factorRow: {
    display: 'flex', alignItems: 'center',
    padding: `${tokens.spacingVerticalXS} 0`,
    gap: tokens.spacingHorizontalS,
  },
  factorName: { width: '120px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  factorValue: { width: '60px', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' },
  progressWrap: { flex: 1 },
  dimRow: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  ratingBar: {
    display: 'flex', gap: tokens.spacingHorizontalXS, padding: `${tokens.spacingVerticalS} 0`,
  },
  signalBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '2px 8px', fontSize: tokens.fontSizeBase200,
  },
  ratingRow: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    fontSize: tokens.fontSizeBase200,
    ':hover': { backgroundColor: tokens.colorNeutralBackground3 },
  },
})

interface Props {
  globalStock: StockContext | null
  setGlobalStock: (s: StockContext | null) => void
}

export default function Diagnosis({ globalStock, setGlobalStock }: Props) {
  const s = useStyles()
  const [code, setCode] = useState(globalStock?.code || '')
  const [loading, setLoading] = useState(false)
  const [diagnosis, setDiagnosis] = useState<StockDiagnosisData | null>(null)
  const [ratings, setRatings] = useState<InstitutionRatingData | null>(null)
  const [signals, setSignals] = useState<StrategySignalData | null>(null)
  const [tab, setTab] = useState('factors')

  useEffect(() => {
    if (globalStock?.code) setCode(globalStock.code)
  }, [globalStock])

  const load = async () => {
    const trimmed = code.trim()
    if (!trimmed) return
    const instrument = globalStock?.instrument && globalStock.code === trimmed
      ? normalizeInstrumentRefLocal(globalStock.instrument)
      : parseInstrumentInput(trimmed)
    setLoading(true)
    try {
      const cfg = await getConfig().catch(() => null)
      const scorecard = cfg?.default_scorecard || 'G=B+M'
      const [d, r, sg] = await Promise.all([
        research.diagnose(instrument, scorecard),
        research.institutionRating(instrument),
        research.strategySignals(instrument).catch(() => null),
      ])
      if (d.success) setDiagnosis(d.data)
      if (r.success) setRatings(r.data)
      if (sg?.success) setSignals(sg.data)
      setGlobalStock(toStockContext({
        code: trimmed,
        name: d.data?.name || globalStock?.name || '',
        instrument,
      }))
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const catColors: Record<string, string> = {
    valuation: '#ff9800', growth: '#4caf50', quality: '#2196f3',
    momentum: '#9c27b0', technical: '#00bcd4', risk: '#f44336',
    cashflow: '#795548', composite: '#607d8b',
  }
  const catLabels: Record<string, string> = {
    valuation: '估值', growth: '成长', quality: '质量',
    momentum: '动量', technical: '技术', risk: '风险',
    cashflow: '现金流', composite: '综合',
  }

  return (
    <>
      {/* ── Search ── */}
      <div className={s.headerRow}>
        <SearchBox
          size="small"
          placeholder="输入股票代码，如 600519"
          value={code}
          onChange={(_, d) => setCode(d.value || '')}
          onKeyDown={(e) => { if (e.key === 'Enter') load() }}
          style={{ width: 260 }}
        />
        <Button size="small" icon={<ArrowSyncRegular />} onClick={load} disabled={loading}>
          查询
        </Button>
        {loading && <Spinner size="tiny" />}
      </div>

      {!diagnosis && !loading && (
        <Text style={{ color: '#888', padding: '20px 0' }}>
          输入股票代码查询全景诊断
        </Text>
      )}

      {diagnosis && (
        <>
          {/* ── Header + Metrics ── */}
          <div className={s.metricsRow}>
            <MetricTile label="综合评分" value={diagnosis.total_score.toFixed(1)} max={10}
              color={diagnosis.total_score >= 7 ? '#4caf50' : diagnosis.total_score >= 5 ? '#ff9800' : '#f44336'}
              tooltip={`${diagnosis.name}(${diagnosis.code}) 综合评估评分`} />
            <MetricTile label="有效因子" value={`${diagnosis.valid_factor_count}/${diagnosis.total_factor_count}`}
              tooltip="有效因子数量/总因子数量" />
            {diagnosis.factors.slice(0, 3).map(f => (
              <MetricTile key={f.name} label={f.name}
                value={f.value != null ? f.value.toFixed(f.category === 'valuation' || f.category === 'momentum' ? 2 : 1) : 'N/A'}
                tooltip={`${f.name} (${catLabels[f.category] || f.category})`} />
            ))}
          </div>

          {/* ── Tabs ── */}
          <div className={s.section}>
            <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as string)}>
              <Tab value="factors">因子详情</Tab>
              <Tab value="ratings">机构评级</Tab>
              <Tab value="signals">策略信号</Tab>
            </TabList>

            {/* ── Factor tab ── */}
            {tab === 'factors' && (
              <div style={{ marginTop: 8 }}>
                {Object.entries(diagnosis.factor_categories).map(([cat, names]) => {
                  const catFactors = diagnosis.factors.filter(f => f.category === cat && f.value != null)
                  if (catFactors.length === 0) return null
                  return (
                    <div key={cat} style={{ marginBottom: 8 }}>
                      <Text size={200} weight="bold"
                        style={{ color: catColors[cat] || '#888', display: 'block', marginBottom: 4 }}>
                        {catLabels[cat] || cat} ({catFactors.length})
                      </Text>
                      {catFactors.slice(0, 6).map(f => (
                        <div key={f.name} className={s.factorRow}>
                          <Text className={s.factorName}>{f.name}</Text>
                          <Text className={s.factorValue}>
                            {f.value != null ? (f.value < 1 && f.value > -1 ? f.value.toFixed(3) : f.value.toFixed(2)) : '-'}
                          </Text>
                          <div className={s.progressWrap}>
                            <ProgressBar
                              value={f.value != null ? Math.max(0, Math.min(1, (f.value + 100) / 200)) : 0.5}
                              color={f.value != null && f.value >= 0 ? 'success' : 'error'}
                              thickness="small"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Ratings tab ── */}
            {tab === 'ratings' && ratings && (
              <div style={{ marginTop: 8 }}>
                <div className={s.metricsRow} style={{ marginBottom: 8 }}>
                  <MetricTile label="共识" value={ratings.consensus_rating_cn}
                    color={ratings.consensus_rating === 'buy' || ratings.consensus_rating === 'strong_buy' ? '#4caf50' : '#ff9800'} />
                  <MetricTile label="平均信心" value={ratings.avg_confidence.toFixed(1)} max={10} />
                  <MetricTile label="一致率" value={`${(ratings.agreement_rate * 100).toFixed(0)}%`} />
                  <MetricTile label="看多/看空" value={`${ratings.bullish_count}/${ratings.bearish_count}`} />
                </div>
                {ratings.ratings.slice(0, 15).map(r => (
                  <div key={r.institution_short} className={s.ratingRow}>
                    <Text style={{ width: 100 }}>{r.institution_short}</Text>
                    <Badge
                      color={r.rating === 'buy' || r.rating === 'strong_buy' ? 'success' :
                             r.rating === 'sell' || r.rating === 'strong_sell' ? 'danger' : 'warning'}
                      size="small"
                    >
                      {r.rating_cn}
                    </Badge>
                    <Text style={{ width: 70, textAlign: 'right' }}>{r.confidence.toFixed(1)}</Text>
                    <div style={{ flex: 1 }}>
                      <ProgressBar
                        value={r.confidence / 10}
                        thickness="small"
                        color={r.confidence >= 7 ? 'success' : r.confidence >= 5 ? 'warning' : 'danger'}
                      />
                    </div>
                    <Text style={{ width: 60, fontSize: 10, color: '#888' }}>
                      {r.model_name.slice(0, 10)}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 10, color: '#888' }}>{r.summary.slice(0, 24)}</Text>
                  </div>
                ))}
              </div>
            )}

            {/* ── Signals tab ── */}
            {tab === 'signals' && signals && (
              <div style={{ marginTop: 8 }}>
                <Text size={200} style={{ display: 'block', marginBottom: 8 }}>
                  综合: {signals.summary}  ({signals.bullish_count}多/{signals.bearish_count}空/{signals.neutral_count}中)
                </Text>
                {signals.signals.map(sig => (
                  <div key={sig.name} className={s.dimRow}>
                    <Text style={{ width: 80 }}>{sig.name}</Text>
                    <Badge size="small"
                      color={sig.direction === '看多' ? 'success' : sig.direction === '看空' ? 'danger' : 'warning'}>
                      {sig.direction}
                    </Badge>
                    <div style={{ flex: 1 }}>
                      <ProgressBar value={sig.confidence} thickness="small" 
                        color={sig.direction === '看多' ? 'success' : sig.direction === '看空' ? 'danger' : 'warning'} />
                    </div>
                    <Text style={{ width: 40, textAlign: 'right', fontSize: 11 }}>
                      {sig.confidence.toFixed(2)}
                    </Text>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
