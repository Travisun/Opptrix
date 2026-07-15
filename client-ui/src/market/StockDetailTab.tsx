import { useEffect, useState, type ReactNode } from 'react'
import { Link, Spinner, Tab, TabList, Text, Badge, makeStyles, mergeClasses } from '@fluentui/react-components'
import { EditRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import type {
  FinancialSummaryData,
  ProfileInstitutionRating,
  ProfilePlateItem,
  StockDetailData,
  StockDividendItem,
  StockMoneyFlowItem,
  StockNewsItem,
  StockProfileData,
  StockShareholderData,
  WatchlistItem,
} from '../types/market'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
  formatSignedNumber,
  formatVolume,
  pctTone,
} from './format'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { openExternalUrl } from '../platform/openUrl'
import TradingViewChart from './TradingViewChart'
import { resolveWatchlistInstrument } from './instrument'
import StockDecisionCard, { type StockDiscussPayload } from './StockDecisionCard'
import StockTrendTab from './StockTrendTab'
import { listRowKey } from '../utils/listRowKey'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

type DetailTab = 'analysis' | 'chart' | 'trend' | 'basic' | 'company' | 'news' | 'f10'

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
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  code: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  quoteMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  manageBtn: {...ghostInteractive,

    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    borderRadius: opptrixTokens.radiusSm,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    padding: '3px 7px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    lineHeight: 1.2,
  },
  price: {
    fontSize: 'var(--opptrix-font-3xl)',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  change: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pct: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: '#FF3B30' },
  pctDown: { color: '#34C759' },
  pctFlat: { color: opptrixCssVars.textTertiary },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '2px 6px',
  },
  heroCell: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '4px',
    minWidth: 0,
  },
  heroLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  heroValue: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  prepBanner: {
    flexShrink: 0,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  prepHead: {...ghostInteractive,

    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: `5px ${CONTENT_PAD}`,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
  },
  prepHeadMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  prepHeadText: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  prepHeadTextError: {
    color: opptrixCssVars.error,
  },
  prepBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: `0 ${CONTENT_PAD} 6px`,
  },
  prepTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  prepHint: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  prepActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  prepSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  prepStep: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textSecondary,
  },
  prepStepDone: {
    color: '#248A3D',
  },
  prepStepRunning: {
    color: opptrixCssVars.textPrimary,
    fontWeight: 600,
  },
  prepStepError: {
    color: opptrixCssVars.error,
  },
  tabBar: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD}`,
    minHeight: '28px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  tabList: {
    minWidth: 'max-content',
  },
  tabBody: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  tabPanel: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  tabPanelHidden: {
    display: 'none',
  },
  chartPanel: {
    flex: 1,
    minHeight: 0,
    padding: `4px ${CONTENT_PAD} 8px`,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  scrollPanel: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `8px ${CONTENT_PAD} 10px`,
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
    fontSize: 'var(--opptrix-font-xs)',
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
  metricGrid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '4px',
  },
  metric: {
    padding: '5px 6px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvasAlt,
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
  prose: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.55,
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'pre-wrap',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  tag: {
    fontSize: 'var(--opptrix-font-xs)',
    padding: '1px 6px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.textSecondary,
  },
  tagHot: {
    backgroundColor: 'rgba(255, 59, 48, 0.10)',
    color: '#C9342B',
    fontWeight: 600,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    borderRadius: opptrixTokens.radiusSm,
    overflow: 'hidden',
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  flatList: {
    display: 'flex',
    flexDirection: 'column',
  },
  annRow: {
    display: 'grid',
    gridTemplateColumns: '58px minmax(0, 1fr)',
    gap: '6px',
    alignItems: 'start',
    padding: '5px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  listDate: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.4,
  },
  listTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
    textDecoration: 'none',
    ':hover': { color: opptrixCssVars.accent },
  },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) repeat(3, minmax(0, 0.75fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  tableHeadCell: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) repeat(3, minmax(0, 0.75fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  tableRowWide: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) repeat(4, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  tableHeadWide: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) repeat(4, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  tableCell: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tableCellName: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    padding: '8px 2px',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-md)',
  },
})

interface Props {
  stock: WatchlistItem | null
  isHolding?: boolean
  holding?: HoldingSnapshot | null
  onManage?: () => void
  onDiscussInChat?: (payload: StockDiscussPayload) => void
}

function Metric({ label, value }: { label: string; value: string }) {
  const s = useStyles()
  return (
    <div className={s.metric}>
      <span className={s.metricLabel}>{label}</span>
      <span className={s.metricValue}>{value}</span>
    </div>
  )
}

function HeroCell({ label, value }: { label: string; value: string }) {
  const s = useStyles()
  return (
    <div className={s.heroCell}>
      <span className={s.heroLabel}>{label}</span>
      <span className={s.heroValue}>{value}</span>
    </div>
  )
}

function MetricSection({ title, children }: { title: string; children: ReactNode }) {
  const s = useStyles()
  return (
    <div className={s.section}>
      <Text className={s.sectionTitle}>{title}</Text>
      {children}
    </div>
  )
}

function NewsPanel({ items }: { items: StockNewsItem[] }) {
  const s = useStyles()
  if (!items.length) {
    return <Text className={s.emptyHint}>暂无公告信息</Text>
  }
  return (
    <div className={s.flatList}>
      {items.map((item, index) => (
        <div key={listRowKey(index, item.date, item.title, item.url)} className={s.annRow}>
          <span className={s.listDate}>{item.date || '—'}</span>
          {item.url ? (
            <Link
              className={s.listTitle}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              onClick={event => openExternalUrl(item.url!, event)}
            >
              {item.title}
            </Link>
          ) : (
            <span className={s.listTitle}>{item.title}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function DividendPanel({ items }: { items: StockDividendItem[] }) {
  const s = useStyles()
  if (!items.length) {
    return <Text className={s.emptyHint}>暂无分红送转记录</Text>
  }
  return (
    <div className={s.flatList}>
      <div className={s.tableHeadWide}>
        <span className={s.tableHeadCell}>方案</span>
        <span className={s.tableHeadCell}>进度</span>
        <span className={s.tableHeadCell}>登记日</span>
        <span className={s.tableHeadCell}>除权日</span>
        <span className={s.tableHeadCell}>派息日</span>
      </div>
      {items.slice(0, 10).map((item, index) => (
        <div key={listRowKey(index, item.exDate, item.plan)} className={s.tableRowWide}>
          <span className={s.tableCellName} title={item.plan}>{item.plan || '—'}</span>
          <span className={s.tableCell}>{item.progress || '—'}</span>
          <span className={s.tableCell}>{item.recordDate || '—'}</span>
          <span className={s.tableCell}>{item.exDate || '—'}</span>
          <span className={s.tableCell}>{item.payDate || '—'}</span>
        </div>
      ))}
    </div>
  )
}

function MoneyFlowPanel({ items }: { items: StockMoneyFlowItem[] }) {
  const s = useStyles()
  if (!items.length) {
    return <Text className={s.emptyHint}>暂无资金流向数据</Text>
  }
  return (
    <div className={s.list}>
      <div className={s.tableHead}>
        <span className={s.tableHeadCell}>日期</span>
        <span className={s.tableHeadCell}>主力净流入</span>
        <span className={s.tableHeadCell}>占比</span>
        <span className={s.tableHeadCell}>涨跌</span>
      </div>
      {[...items].reverse().slice(0, 8).map((item, index) => (
        <div key={listRowKey(index, item.date)} className={s.tableRow}>
          <span className={s.tableCell}>{item.date}</span>
          <span className={s.tableCell}>{formatCompactNumber(item.mainNet ?? null)}</span>
          <span className={s.tableCell}>
            {item.mainNetPct != null ? `${item.mainNetPct.toFixed(2)}%` : '—'}
          </span>
          <span className={s.tableCell}>{formatPct(item.changePct ?? null)}</span>
        </div>
      ))}
    </div>
  )
}

function ShareholderPanel({ data }: { data: StockShareholderData | null | undefined }) {
  const s = useStyles()
  const top10 = data?.top10Shareholders ?? []
  if (!data && !top10.length) {
    return <Text className={s.emptyHint}>暂无股东户数与持股结构</Text>
  }
  return (
    <>
      <div className={s.metricGrid3}>
        <Metric label="报告期" value={data?.reportDate || '—'} />
        <Metric label="股东户数" value={data?.shareholderCount != null ? String(Math.round(data.shareholderCount)) : '—'} />
        <Metric
          label="户数变动"
          value={data?.shareholderCountChange != null ? formatPct(data.shareholderCountChange) : '—'}
        />
        <Metric label="户均持股" value={data?.avgFreeShares != null ? formatCompactNumber(data.avgFreeShares) : '—'} />
        <Metric label="户均市值" value={formatCompactNumber(data?.avgHoldingValue ?? null)} />
        <Metric label="集中度" value={data?.holdFocus || '—'} />
      </div>
      {top10.length > 0 && (
        <div className={s.flatList}>
          <div className={s.tableHead}>
            <span className={s.tableHeadCell}>股东</span>
            <span className={s.tableHeadCell}>持股数</span>
            <span className={s.tableHeadCell}>占比</span>
            <span className={s.tableHeadCell}>变动</span>
          </div>
          {top10.slice(0, 10).map((row, index) => (
            <div key={listRowKey(index, row.rank, row.name)} className={s.tableRow}>
              <span className={s.tableCellName} title={row.name}>{row.name}</span>
              <span className={s.tableCell}>{formatCompactNumber(row.sharesHeld ?? null)}</span>
              <span className={s.tableCell}>
                {row.sharePct != null ? `${row.sharePct.toFixed(2)}%` : '—'}
              </span>
              <span className={s.tableCell}>
                {row.change != null ? formatSignedNumber(row.change, 0) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function formatIndustryLine(profile: StockProfileData | null | undefined, fallback?: string): string {
  const primary = profile?.industry ?? fallback
  const secondary = profile?.industrySecondary
  if (primary && secondary) return `${primary} · ${secondary}`
  return primary ?? '—'
}

function formatRankValue(rank: unknown): string {
  if (rank == null || rank === '') return '—'
  return String(rank)
}

function PlateTags({ title, plates }: { title: string; plates: ProfilePlateItem[] }) {
  const s = useStyles()
  if (!plates.length) return null
  return (
    <MetricSection title={title}>
      <div className={s.tagRow}>
        {plates.slice(0, 20).map((plate, index) => (
          <span
            key={listRowKey(index, title, plate.code, plate.name)}
            className={mergeClasses(s.tag, plate.tag && s.tagHot)}
            title={plate.tag ? `${plate.name} · ${plate.tag}` : plate.name}
          >
            {plate.name}
          </span>
        ))}
      </div>
    </MetricSection>
  )
}

function InstitutionRatingPanel({ rating }: { rating: ProfileInstitutionRating }) {
  const s = useStyles()
  const hasCounts = [rating.buy, rating.outperform, rating.neutral, rating.underperform, rating.sell]
    .some(v => v != null && v > 0)
  const hasTarget = rating.targetPriceAvg || rating.targetPriceHigh || rating.targetPriceLow
  const reports = rating.recentReports ?? []
  if (!hasCounts && !hasTarget && !reports.length) {
    return <Text className={s.emptyHint}>暂无机构评级数据</Text>
  }
  return (
    <>
      {hasCounts && (
        <div className={s.metricGrid3}>
          <Metric label="买入" value={rating.buy != null ? String(rating.buy) : '—'} />
          <Metric label="增持" value={rating.outperform != null ? String(rating.outperform) : '—'} />
          <Metric label="中性" value={rating.neutral != null ? String(rating.neutral) : '—'} />
          <Metric label="减持" value={rating.underperform != null ? String(rating.underperform) : '—'} />
          <Metric label="卖出" value={rating.sell != null ? String(rating.sell) : '—'} />
          {rating.period && <Metric label="统计区间" value={rating.period} />}
        </div>
      )}
      {hasTarget && (
        <div className={s.metricGrid3}>
          <Metric label="目标均价" value={rating.targetPriceAvg ?? '—'} />
          <Metric label="目标最高" value={rating.targetPriceHigh ?? '—'} />
          <Metric label="目标最低" value={rating.targetPriceLow ?? '—'} />
        </div>
      )}
      {reports.length > 0 && (
        <div className={s.flatList}>
          {reports.map((item, index) => (
            <div key={listRowKey(index, item.date, item.title)} className={s.annRow}>
              <span className={s.listDate}>{item.date || '—'}</span>
              <span className={s.listTitle}>
                {item.rating ? `[${item.rating}] ` : ''}{item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function FinancialHistoryPanel({ rows }: { rows: FinancialSummaryData[] }) {
  const s = useStyles()
  if (!rows.length) {
    return <Text className={s.emptyHint}>暂无历史财务数据</Text>
  }
  return (
    <div className={s.flatList}>
      <div className={s.tableHeadWide}>
        <span className={s.tableHeadCell}>报告期</span>
        <span className={s.tableHeadCell}>类型</span>
        <span className={s.tableHeadCell}>营收</span>
        <span className={s.tableHeadCell}>净利</span>
        <span className={s.tableHeadCell}>ROE</span>
      </div>
      {rows.slice(0, 12).map((row, index) => (
        <div key={listRowKey(index, row.reportDate, row.reportType)} className={s.tableRowWide}>
          <span className={s.tableCell}>{row.reportDate || '—'}</span>
          <span className={s.tableCell}>{row.reportType || '—'}</span>
          <span className={s.tableCell}>{formatCompactNumber(row.revenue)}</span>
          <span className={s.tableCell}>{formatCompactNumber(row.netProfit)}</span>
          <span className={s.tableCell}>{row.roe != null ? `${row.roe.toFixed(2)}%` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

export default function StockDetailTab({
  stock,
  isHolding = false,
  holding,
  onManage,
  onDiscussInChat,
}: Props) {
  const s = useStyles()
  const [detailTab, setDetailTab] = useState<DetailTab>('chart')
  const [detail, setDetail] = useState<StockDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailReload, setDetailReload] = useState(0)

  useEffect(() => {
    if (!stock) {
      setDetail(null)
      setError('')
      return undefined
    }

    setDetailTab('chart')
    let cancelled = false
    setLoading(true)
    setError('')

    const ref = resolveWatchlistInstrument(stock)
    research.stockDetail(ref)
      .then(resp => {
        if (cancelled) return
        if (!resp.success || !resp.data) {
          setError(resp.message || '加载失败，请稍后重试')
          setDetail(null)
          return
        }
        setDetail(resp.data)
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败，请稍后重试')
          setDetail(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [stock, detailReload])

  if (!stock) {
    return <div className={s.center}>请在「关注」中选择一只股票</div>
  }

  if (loading && !detail) {
    const pendingName = stock.name && stock.name !== stock.code ? stock.name : stock.code
    return (
      <div className={s.root}>
        <div className={s.hero}>
          <div className={s.titleRow}>
            <div className={s.titleMain}>
              <Text className={s.name}>{pendingName}</Text>
              <span className={s.code}>{stock.code}</span>
            </div>
          </div>
        </div>
        <div className={s.center}><Spinner size="small" label="正在加载行情…" /></div>
      </div>
    )
  }

  if (error && !detail) {
    return <div className={s.center}>{error}</div>
  }

  if (!detail) {
    return <div className={s.center}>暂时无法显示该股数据</div>
  }

  const quote = detail.quote
  const profile = detail.profile
  const financial = detail.financial
  const displayName = detail.name && detail.name !== detail.code
    ? detail.name
    : (stock.name && stock.name !== stock.code ? stock.name : (profile?.name || profile?.orgName || detail.code))
  const tone = pctTone(quote?.changePct)
  const toneClass = mergeClasses(
    tone === 'up' && s.pctUp,
    tone === 'down' && s.pctDown,
    tone === 'flat' && s.pctFlat,
  )

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <div className={s.titleMain}>
            <Text className={s.name}>{displayName}</Text>
            <span className={s.code}>{detail.code}</span>
            {isHolding && <Badge size="small" color="informative" appearance="outline">持有</Badge>}
          </div>
          <div className={s.quoteMain}>
            {onManage && (
              <button type="button" className={s.manageBtn} onClick={onManage}>
                <EditRegular fontSize={12} />
                管理持仓
              </button>
            )}
            <span className={mergeClasses(s.price, toneClass)}>
              {formatPrice(quote?.price ?? null)}
            </span>
            <span className={mergeClasses(s.change, toneClass)}>
              {formatSignedNumber(quote?.change ?? null)}
            </span>
            <span className={mergeClasses(s.pct, toneClass)}>
              {formatPct(quote?.changePct ?? null)}
            </span>
          </div>
        </div>
        <div className={s.heroGrid}>
          <HeroCell label="开" value={formatPrice(quote?.open ?? null)} />
          <HeroCell label="高" value={formatPrice(quote?.high ?? null)} />
          <HeroCell label="低" value={formatPrice(quote?.low ?? null)} />
          <HeroCell label="昨" value={formatPrice(quote?.preClose ?? null)} />
          <HeroCell label="量" value={formatVolume(quote?.volume ?? null)} />
          <HeroCell label="额" value={formatCompactNumber(quote?.amount ?? null)} />
          <HeroCell label="换手" value={quote?.turnoverRate != null ? `${quote.turnoverRate.toFixed(2)}%` : '—'} />
          <HeroCell label="振幅" value={quote?.amplitude != null ? `${quote.amplitude.toFixed(2)}%` : '—'} />
        </div>
      </div>

      <div className={s.tabBar}>
        <TabList
          className={s.tabList}
          size="small"
          selectedValue={detailTab}
          onTabSelect={(_, data) => setDetailTab(data.value as DetailTab)}
        >
          <Tab value="chart">走势</Tab>
          <Tab value="trend">趋势</Tab>
          <Tab value="analysis">分析</Tab>
          <Tab value="basic">概况</Tab>
          <Tab value="company">公司</Tab>
          <Tab value="news">公告</Tab>
          <Tab value="f10">财务</Tab>
        </TabList>
      </div>

      <div className={s.tabBody}>
        <div className={mergeClasses(s.tabPanel, detailTab !== 'trend' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            {detailTab === 'trend' && (
              <StockTrendTab
                code={detail.code}
                active={detailTab === 'trend'}
                holdingCost={holding?.costBasis}
              />
            )}
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'analysis' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            {detailTab === 'analysis' && (
              <StockDecisionCard
                key={stock.code}
                stock={{ ...stock, name: displayName }}
                price={quote?.price ?? null}
                quotePe={quote?.pe ?? null}
                quotePb={quote?.pb ?? null}
                holding={holding}
                moneyFlow={detail.moneyFlow?.[0] ?? null}
                onDiscuss={onDiscussInChat}
              />
            )}
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'chart' && s.tabPanelHidden)}>
          <div className={s.chartPanel}>
            <TradingViewChart
              code={detail.code}
              instrument={resolveWatchlistInstrument(stock)}
              expanded
              active={detailTab === 'chart'}
            />
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'basic' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            <MetricSection title="今日行情">
              <div className={s.metricGrid3}>
                <Metric label="今开" value={formatPrice(quote?.open ?? null)} />
                <Metric label="最高" value={formatPrice(quote?.high ?? null)} />
                <Metric label="最低" value={formatPrice(quote?.low ?? null)} />
                <Metric label="昨收" value={formatPrice(quote?.preClose ?? null)} />
                <Metric label="涨跌额" value={formatSignedNumber(quote?.change ?? null)} />
                <Metric label="涨跌幅" value={formatPct(quote?.changePct ?? null)} />
                <Metric label="振幅" value={quote?.amplitude != null ? `${quote.amplitude.toFixed(2)}%` : '—'} />
                <Metric label="换手率" value={quote?.turnoverRate != null ? `${quote.turnoverRate.toFixed(2)}%` : '—'} />
                <Metric label="成交量" value={formatVolume(quote?.volume ?? null)} />
                <Metric label="成交额" value={formatCompactNumber(quote?.amount ?? null)} />
                <Metric label="量比" value={quote?.volumeRatio != null ? quote.volumeRatio.toFixed(2) : '—'} />
                <Metric label="市盈率" value={quote?.pe != null ? quote.pe.toFixed(2) : '—'} />
                <Metric label="市净率" value={quote?.pb != null ? quote.pb.toFixed(2) : '—'} />
              </div>
            </MetricSection>

            <MetricSection title="规模与估值">
              <div className={s.metricGrid3}>
                <Metric label="总市值" value={formatCompactNumber(profile?.totalMarketCap ?? quote?.marketCap ?? null)} />
                <Metric label="流通市值" value={formatCompactNumber(profile?.circulatingMarketCap ?? null)} />
                <Metric label="所属行业" value={formatIndustryLine(profile, stock.industry)} />
                <Metric label="EPS" value={financial?.eps != null ? financial.eps.toFixed(2) : '—'} />
                <Metric label="每股净资产" value={financial?.bps != null ? financial.bps.toFixed(2) : '—'} />
                <Metric label="报告类型" value={financial?.reportType ?? '—'} />
              </div>
            </MetricSection>

            {profile?.industryRank && (
              <MetricSection title={`行业内排名 · ${profile.industryRank.industryName}`}>
                <div className={s.metricGrid3}>
                  <Metric label="市盈率排名" value={formatRankValue(profile.industryRank.peRank)} />
                  <Metric label="市值排名" value={formatRankValue(profile.industryRank.marketCapRank)} />
                  <Metric label="EPS 排名" value={formatRankValue(profile.industryRank.epsRank)} />
                  <Metric label="行业平均 PE" value={profile.industryRank.industryAvgPe != null ? profile.industryRank.industryAvgPe.toFixed(2) : '—'} />
                  <Metric label="本股市盈率" value={profile.industryRank.pe != null ? profile.industryRank.pe.toFixed(2) : '—'} />
                  <Metric label="行业 EPS" value={profile.industryRank.eps != null ? profile.industryRank.eps.toFixed(2) : '—'} />
                </div>
              </MetricSection>
            )}

            {profile?.profileMetrics?.length ? (
              <MetricSection title={`最新指标${profile.metricsReportDate ? ` · ${profile.metricsReportDate}` : ''}`}>
                <div className={s.metricGrid3}>
                  {profile.profileMetrics.slice(0, 9).map((item, index) => (
                    <Metric key={listRowKey(index, item.label)} label={item.label} value={item.value} />
                  ))}
                </div>
              </MetricSection>
            ) : null}

            {financial && (
              <MetricSection title="盈利能力">
                <div className={s.metricGrid3}>
                  <Metric label="营收" value={formatCompactNumber(financial.revenue)} />
                  <Metric label="营收同比" value={formatPct(financial.revenueYoy)} />
                  <Metric label="净利润" value={formatCompactNumber(financial.netProfit)} />
                  <Metric label="净利同比" value={formatPct(financial.netProfitYoy)} />
                  <Metric label="ROE" value={financial.roe != null ? `${financial.roe.toFixed(2)}%` : '—'} />
                  <Metric label="毛利率" value={financial.grossMargin != null ? `${financial.grossMargin.toFixed(2)}%` : '—'} />
                  <Metric label="净利率" value={financial.netMargin != null ? `${financial.netMargin.toFixed(2)}%` : '—'} />
                  <Metric label="资产负债率" value={financial.debtRatio != null ? `${financial.debtRatio.toFixed(2)}%` : '—'} />
                  <Metric label="每股现金流" value={financial.operatingCashFlow != null ? financial.operatingCashFlow.toFixed(2) : '—'} />
                  <Metric label="报告期" value={financial.reportDate || '—'} />
                </div>
              </MetricSection>
            )}
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'company' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            <MetricSection title="公司概况">
              <div className={s.metricGrid3}>
                <Metric label="公司全称" value={profile?.orgName || detail.name || '—'} />
                <Metric label="英文名称" value={profile?.orgNameEn ?? '—'} />
                <Metric label="证券类型" value={profile?.securityType ?? '—'} />
                <Metric label="曾用名" value={profile?.formerName ?? '—'} />
                <Metric label="成立日期" value={profile?.foundDate ?? '—'} />
                <Metric label="上市日期" value={profile?.listingDate ?? '—'} />
                <Metric label="发行价" value={profile?.issuePrice != null ? formatPrice(profile.issuePrice) : '—'} />
                <Metric label="注册资本" value={profile?.regCapital != null ? formatCompactNumber(profile.regCapital) : '—'} />
                <Metric label="员工人数" value={profile?.employees != null ? String(profile.employees) : '—'} />
                <Metric label="所属行业" value={formatIndustryLine(profile, stock.industry)} />
                <Metric label="证监会行业" value={profile?.industryCsrc ?? '—'} />
                <Metric label="注册地址" value={profile?.address || profile?.province || '—'} />
                <Metric label="办公地址" value={profile?.officeAddress ?? '—'} />
                <Metric label="联系电话" value={profile?.orgTel ?? '—'} />
                <Metric label="电子邮箱" value={profile?.orgEmail ?? '—'} />
                <Metric label="传真" value={profile?.orgFax ?? '—'} />
                <Metric label="主承销商" value={profile?.leadUnderwriter ?? '—'} />
              </div>
            </MetricSection>

            <MetricSection title="治理结构">
              <div className={s.metricGrid3}>
                <Metric label="董事长" value={profile?.chairman ?? '—'} />
                <Metric label="法人代表" value={profile?.legalPerson ?? '—'} />
                <Metric label="董秘" value={profile?.secretary ?? '—'} />
              </div>
            </MetricSection>

            {profile?.executives?.length ? (
              <MetricSection title="高管团队">
                <div className={s.flatList}>
                  <div className={s.tableHeadWide}>
                    <span className={s.tableHeadCell}>姓名</span>
                    <span className={s.tableHeadCell}>职务</span>
                    <span className={s.tableHeadCell}>任职日期</span>
                    <span className={s.tableHeadCell}>离任日期</span>
                    <span className={s.tableHeadCell} />
                  </div>
                  {profile.executives.slice(0, 10).map((exec, index) => (
                    <div key={listRowKey(index, exec.name, exec.title, exec.startDate)} className={s.tableRowWide}>
                      <span className={s.tableCellName}>{exec.name}</span>
                      <span className={s.tableCell}>{exec.title || '—'}</span>
                      <span className={s.tableCell}>{exec.startDate || '—'}</span>
                      <span className={s.tableCell}>{exec.endDate || '—'}</span>
                      <span className={s.tableCell} />
                    </div>
                  ))}
                </div>
              </MetricSection>
            ) : null}

            {profile?.indexMembership?.length ? (
              <MetricSection title="指数成分">
                <div className={s.tagRow}>
                  {profile.indexMembership.map((item, index) => (
                    <span
                      key={listRowKey(index, item.indexCode, item.indexName)}
                      className={s.tag}
                      title={item.enterDate ? `纳入 ${item.enterDate}` : item.indexName}
                    >
                      {item.indexName}
                    </span>
                  ))}
                </div>
              </MetricSection>
            ) : null}

            {profile?.website && (
              <MetricSection title="官网">
                <Link
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={event => {
                    const website = profile.website!
                    const href = website.startsWith('http') ? website : `https://${website}`
                    openExternalUrl(href, event)
                  }}
                >
                  {profile.website}
                </Link>
              </MetricSection>
            )}

            <PlateTags title="行业板块" plates={profile?.industryPlates ?? []} />
            <PlateTags title="概念题材" plates={profile?.conceptPlates ?? []} />
            <PlateTags title="地域板块" plates={profile?.areaPlates ?? []} />

            {!profile?.conceptPlates?.length && profile?.concepts?.length ? (
              <MetricSection title="板块 · 题材">
                <div className={s.tagRow}>
                  {profile.concepts.slice(0, 16).map((tag, index) => (
                    <span key={listRowKey(index, tag)} className={s.tag}>{tag}</span>
                  ))}
                </div>
              </MetricSection>
            ) : null}

            {profile?.institutionRating && (
              <MetricSection title="机构评级">
                <InstitutionRatingPanel rating={profile.institutionRating} />
              </MetricSection>
            )}

            <MetricSection title="公司简介">
              <Text className={s.prose} block>
                {profile?.orgProfile || profile?.mainBusiness || '暂无公司介绍'}
              </Text>
            </MetricSection>

            {profile?.businessScope && (
              <MetricSection title="经营范围">
                <Text className={s.prose} block>{profile.businessScope}</Text>
              </MetricSection>
            )}
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'news' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            <NewsPanel items={detail.news ?? []} />
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'f10' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            {financial && (
              <MetricSection title="最新财报摘要">
                <div className={s.metricGrid3}>
                  <Metric label="营收" value={formatCompactNumber(financial.revenue)} />
                  <Metric label="营收同比" value={formatPct(financial.revenueYoy)} />
                  <Metric label="净利润" value={formatCompactNumber(financial.netProfit)} />
                  <Metric label="净利同比" value={formatPct(financial.netProfitYoy)} />
                  <Metric label="ROE" value={financial.roe != null ? `${financial.roe.toFixed(2)}%` : '—'} />
                  <Metric label="毛利率" value={financial.grossMargin != null ? `${financial.grossMargin.toFixed(2)}%` : '—'} />
                  <Metric label="净利率" value={financial.netMargin != null ? `${financial.netMargin.toFixed(2)}%` : '—'} />
                  <Metric label="资产负债率" value={financial.debtRatio != null ? `${financial.debtRatio.toFixed(2)}%` : '—'} />
                  <Metric label="每股现金流" value={financial.operatingCashFlow != null ? financial.operatingCashFlow.toFixed(2) : '—'} />
                  <Metric label="每股净资产" value={financial.bps != null ? financial.bps.toFixed(2) : '—'} />
                  <Metric label="EPS" value={financial.eps != null ? financial.eps.toFixed(2) : '—'} />
                  <Metric label="报告期" value={`${financial.reportDate || '—'} ${financial.reportType ?? ''}`.trim()} />
                </div>
              </MetricSection>
            )}

            <MetricSection title="财务历史">
              <FinancialHistoryPanel rows={detail.financialHistory ?? []} />
            </MetricSection>

            <MetricSection title="分红送转">
              <DividendPanel items={detail.dividends ?? []} />
            </MetricSection>

            <MetricSection title="股东结构">
              <ShareholderPanel data={detail.shareholders} />
            </MetricSection>

            <MetricSection title="资金流向">
              <MoneyFlowPanel items={detail.moneyFlow ?? []} />
            </MetricSection>
          </div>
        </div>
      </div>
    </div>
  )
}
