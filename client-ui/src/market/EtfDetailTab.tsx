import { useEffect, useMemo, useState } from 'react'
import { Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { research } from '../api/client'
import type {
  EtfHoldingRow,
  EtfNavPoint,
  EtfProfileData,
  EtfScorecardData,
  EtfSnapshotData,
  WatchlistItem,
} from '../types/market'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
  pctTone,
  resolveDisplayStockName,
} from './format'
import TradingViewChart from './TradingViewChart'
import EtfDecisionCard from './EtfDecisionCard'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { listRowKey } from '../utils/listRowKey'

type EtfTab = 'overview' | 'decision' | 'chart' | 'nav' | 'holdings'

const CONTENT_PAD = '15px'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  hero: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD} 5px`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    minWidth: 0,
  },
  titleMain: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    minWidth: 0,
    overflow: 'hidden',
  },
  name: {
    fontSize: '14px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  code: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  badge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  quoteMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  price: {
    fontSize: '20px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  change: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: '#FF3B30' },
  pctDown: { color: '#34C759' },
  pctFlat: { color: opptrixCssVars.textTertiary },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '4px 8px',
    marginTop: '2px',
  },
  heroCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  },
  heroLabel: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
  },
  heroValue: {
    fontSize: '11px',
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subTabs: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: CONTENT_PAD,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '6px 10px',
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  metricLabel: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
  },
  metricValue: {
    fontSize: '11px',
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: '72px minmax(0, 1fr) repeat(2, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  tableHeadWide: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr) repeat(2, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '72px minmax(0, 1fr) repeat(2, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  tableRowWide: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr) repeat(2, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  tableHeadCell: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
  },
  tableCell: {
    fontSize: '10px',
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tableCellName: {
    fontSize: '10px',
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chartWrap: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: `0 ${CONTENT_PAD} ${CONTENT_PAD}`,
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: opptrixCssVars.textTertiary,
    fontSize: '12px',
  },
  emptyHint: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    padding: '8px 2px',
  },
})

interface Props {
  stock: WatchlistItem | null
}

function toneClass(s: ReturnType<typeof useStyles>, tone: ReturnType<typeof pctTone>) {
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

export default function EtfDetailTab({ stock }: Props) {
  const s = useStyles()
  const [tab, setTab] = useState<EtfTab>('overview')
  const [snapshot, setSnapshot] = useState<EtfSnapshotData | null>(null)
  const [navRows, setNavRows] = useState<EtfNavPoint[]>([])
  const [holdings, setHoldings] = useState<EtfHoldingRow[]>([])
  const [scorecard, setScorecard] = useState<EtfScorecardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [navLoading, setNavLoading] = useState(false)
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [scorecardLoading, setScorecardLoading] = useState(false)
  const [scorecardError, setScorecardError] = useState('')

  const stockCode = stock?.code ?? null

  const loadScorecard = (code: string, signal?: { cancelled: boolean }) => {
    setScorecardLoading(true)
    setScorecardError('')
    research.etfScorecard(code)
      .then(resp => {
        if (signal?.cancelled) return
        if (!resp.success || !resp.data) {
          setScorecardError(resp.message || '暂时无法生成决策雷达，请稍后再试')
          setScorecard(null)
          return
        }
        setScorecard(resp.data)
      })
      .catch(e => {
        if (!signal?.cancelled) {
          setScorecardError(e instanceof Error ? e.message : '加载失败')
          setScorecard(null)
        }
      })
      .finally(() => {
        if (!signal?.cancelled) setScorecardLoading(false)
      })
  }

  useEffect(() => {
    if (!stockCode) {
      setSnapshot(null)
      setNavRows([])
      setHoldings([])
      setScorecard(null)
      setError('')
      setScorecardError('')
      return undefined
    }
    let cancelled = false
    setTab('overview')
    setLoading(true)
    setError('')
    research.etfSnapshot(stockCode)
      .then(resp => {
        if (cancelled) return
        if (!resp.success || !resp.data) {
          setError(resp.message || '暂时无法加载 ETF 信息，请稍后再试')
          setSnapshot(null)
          return
        }
        setSnapshot(resp.data)
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败')
          setSnapshot(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [stockCode])

  useEffect(() => {
    if (!stockCode || tab !== 'decision') return undefined
    const signal = { cancelled: false }
    loadScorecard(stockCode, signal)
    return () => { signal.cancelled = true }
  }, [stockCode, tab])

  useEffect(() => {
    if (!stockCode || tab !== 'nav') return undefined
    let cancelled = false
    setNavLoading(true)
    research.etfNav(stockCode)
      .then(resp => {
        if (cancelled) return
        setNavRows(resp.data?.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setNavRows([])
      })
      .finally(() => {
        if (!cancelled) setNavLoading(false)
      })
    return () => { cancelled = true }
  }, [stockCode, tab])

  useEffect(() => {
    if (!stockCode || tab !== 'holdings') return undefined
    let cancelled = false
    setHoldingsLoading(true)
    research.etfHoldings(stockCode)
      .then(resp => {
        if (cancelled) return
        setHoldings(resp.data?.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setHoldings([])
      })
      .finally(() => {
        if (!cancelled) setHoldingsLoading(false)
      })
    return () => { cancelled = true }
  }, [stockCode, tab])

  const profile: EtfProfileData | null = snapshot?.profile ?? null
  const quote = snapshot?.quote
  const latestNav = snapshot?.nav ?? navRows[0] ?? null

  const displayName = useMemo(
    () => resolveDisplayStockName(stockCode ?? '', profile?.name, stock?.name),
    [stockCode, stock?.name, profile],
  )

  if (!stock) {
    return <div className={s.center}>从关注列表或选股结果中选择一只 ETF</div>
  }

  if (loading && !snapshot) {
    return (
      <div className={s.center}>
        <Spinner size="small" label="正在加载 ETF 信息…" />
      </div>
    )
  }

  if (error && !snapshot) {
    return <div className={s.center}>{error}</div>
  }

  const changePct = quote?.changePct ?? profile?.changePct ?? latestNav?.changePct ?? null
  const tone = pctTone(changePct)
  const price = quote?.price ?? profile?.nav ?? latestNav?.nav ?? null

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <div className={s.titleMain}>
            <span className={s.name}>{displayName}</span>
            <span className={s.code}>{stock.code}</span>
          </div>
          <span className={s.badge}>ETF</span>
        </div>
        <div className={s.quoteMain}>
          <span className={mergeClasses(s.price, toneClass(s, tone))}>{formatPrice(price)}</span>
          <span className={mergeClasses(s.change, toneClass(s, tone))}>{formatPct(changePct)}</span>
        </div>
        <div className={s.heroGrid}>
          <div className={s.heroCell}>
            <span className={s.heroLabel}>单位净值</span>
            <span className={s.heroValue}>{formatPrice(latestNav?.nav ?? profile?.nav)}</span>
          </div>
          <div className={s.heroCell}>
            <span className={s.heroLabel}>溢价率</span>
            <span className={s.heroValue}>
              {formatPct(latestNav?.premiumRate ?? profile?.premiumRate ?? null)}
            </span>
          </div>
          <div className={s.heroCell}>
            <span className={s.heroLabel}>跟踪指数</span>
            <span className={s.heroValue} title={profile?.trackingIndex}>
              {profile?.trackingIndex || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className={s.subTabs}>
        <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as EtfTab)}>
          <Tab value="overview">概览</Tab>
          <Tab value="decision">决策</Tab>
          <Tab value="chart">走势</Tab>
          <Tab value="nav">净值</Tab>
          <Tab value="holdings">持仓</Tab>
        </TabList>
      </div>

      {tab === 'chart' ? (
        <div className={s.chartWrap}>
          <TradingViewChart code={stock.code} active={tab === 'chart'} />
        </div>
      ) : (
        <div className={s.body}>
          {tab === 'overview' && (
            <div className={s.section}>
              <Text className={s.sectionTitle}>基金概况</Text>
              <div className={s.metricGrid}>
                <div className={s.metric}>
                  <span className={s.metricLabel}>类型</span>
                  <span className={s.metricValue}>{profile?.fundType || '—'}</span>
                </div>
                <div className={s.metric}>
                  <span className={s.metricLabel}>管理人</span>
                  <span className={s.metricValue}>{profile?.manager || '—'}</span>
                </div>
                <div className={s.metric}>
                  <span className={s.metricLabel}>管理费</span>
                  <span className={s.metricValue}>
                    {profile?.expenseRatio != null ? `${profile.expenseRatio.toFixed(2)}%` : '—'}
                  </span>
                </div>
                <div className={s.metric}>
                  <span className={s.metricLabel}>规模</span>
                  <span className={s.metricValue}>
                    {formatCompactNumber(profile?.scale ?? profile?.totalShares ?? null)}
                  </span>
                </div>
                <div className={s.metric}>
                  <span className={s.metricLabel}>上市日期</span>
                  <span className={s.metricValue}>{profile?.listingDate || '—'}</span>
                </div>
                <div className={s.metric}>
                  <span className={s.metricLabel}>成交额</span>
                  <span className={s.metricValue}>{formatCompactNumber(quote?.amount ?? null)}</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'decision' && stock && (
            <EtfDecisionCard
              data={scorecard}
              loading={scorecardLoading}
              error={scorecardError}
              onRefresh={() => loadScorecard(stock.code)}
            />
          )}

          {tab === 'nav' && (
            navLoading ? (
              <div className={s.center}><Spinner size="small" label="正在拉取净值…" /></div>
            ) : navRows.length === 0 ? (
              <Text className={s.emptyHint}>暂无净值记录，可在设置中触发深度同步后重试</Text>
            ) : (
              <div>
                <div className={s.tableHead}>
                  <span className={s.tableHeadCell}>日期</span>
                  <span className={s.tableHeadCell}>单位净值</span>
                  <span className={s.tableHeadCell}>涨跌幅</span>
                  <span className={s.tableHeadCell}>溢价率</span>
                </div>
                {navRows.slice(0, 60).map((row, index) => (
                  <div key={listRowKey(index, row.date)} className={s.tableRow}>
                    <span className={s.tableCell}>{row.date}</span>
                    <span className={s.tableCell}>{formatPrice(row.nav)}</span>
                    <span className={s.tableCell}>{formatPct(row.changePct ?? null)}</span>
                    <span className={s.tableCell}>{formatPct(row.premiumRate ?? null)}</span>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'holdings' && (
            holdingsLoading ? (
              <div className={s.center}><Spinner size="small" label="正在拉取持仓…" /></div>
            ) : holdings.length === 0 ? (
              <Text className={s.emptyHint}>暂无持仓披露，部分 ETF 需等季报更新</Text>
            ) : (
              <div>
                <div className={s.tableHeadWide}>
                  <span className={s.tableHeadCell}>成分</span>
                  <span className={s.tableHeadCell}>代码</span>
                  <span className={s.tableHeadCell}>占比</span>
                  <span className={s.tableHeadCell}>市值</span>
                </div>
                {holdings.slice(0, 30).map((row, index) => (
                  <div key={listRowKey(index, row.reportDate, row.holdingSymbol)} className={s.tableRowWide}>
                    <span className={s.tableCellName} title={row.holdingName}>
                      {row.holdingName || row.holdingSymbol}
                    </span>
                    <span className={s.tableCell}>{row.holdingSymbol}</span>
                    <span className={s.tableCell}>
                      {row.weight != null ? `${row.weight.toFixed(2)}%` : '—'}
                    </span>
                    <span className={s.tableCell}>{formatCompactNumber(row.marketValue ?? null)}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
