import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Link,
  Spinner,
  Tab,
  TabList,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { EditRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import { openExternalUrl } from '../platform/openUrl'
import type {
  CryptoSnapshotData,
  FinancialSummaryData,
  StockDividendItem,
  StockNewsItem,
  StockProfileData,
  StockShareholderData,
  UsSnapshotData,
  WatchlistItem,
  type CrossMarketRelatedStock,
  type RevenueBreakdownBlock,
  type SeniorTradeItem,
  type TradingDistributionData,
} from '../types/market'
import type { InstrumentRef } from '../types/instrument'
import {
  formatCompactNumber,
  formatCompactNumberForMarket,
  formatPct,
  formatPriceForMarket,
  formatSignedNumber,
  formatVolume,
  pctTone,
} from './format'
import {
  displayCodeFromInstrument,
  formatInstrumentLabel,
  marketDisplayName,
  resolveWatchlistInstrument,
} from './instrument'
import { hasApplicationCapability } from './capabilities'
import TradingViewChart from './TradingViewChart'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const CONTENT_PAD = '15px'

type EquityDetail = UsSnapshotData
type DetailTab = 'chart' | 'basic' | 'company' | 'notices' | 'articles' | 'f10' | 'dividends' | 'holders'

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
    flex: 1,
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
    padding: '2px 8px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  quoteMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  manageBtn: {
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    borderRadius: opptrixTokens.radiusSm,
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 7px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    lineHeight: 1.2,
    ...ghostInteractive,
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
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  heroValue: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  tabList: { minWidth: 'max-content' },
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
  tabPanelHidden: { display: 'none' },
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
    backgroundColor: opptrixCssVars.canvasAlt,
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
  prose: {
    fontSize: '11px',
    lineHeight: 1.55,
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'pre-wrap',
  },
  flatList: { display: 'flex', flexDirection: 'column' },
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
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.4,
  },
  listTitle: {
    fontSize: '11px',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
    textDecoration: 'none',
    ':hover': { color: opptrixCssVars.accent },
  },
  tableHeadWide: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) repeat(4, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  tableRowWide: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) repeat(4, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) repeat(3, minmax(0, 0.75fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) repeat(3, minmax(0, 0.75fr))',
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
  peerRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.55fr) minmax(0, 0.45fr)',
    gap: '4px',
    alignItems: 'center',
    padding: '5px 4px',
    margin: '0 -4px',
    borderRadius: opptrixTokens.radiusSm,
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
    ...ghostInteractive,
  },
  distRow: {
    display: 'grid',
    gridTemplateColumns: '52px minmax(0, 1fr) 56px',
    gap: '6px',
    alignItems: 'center',
    padding: '3px 0',
  },
  distBarTrack: {
    height: '6px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.surfaceMuted,
    overflow: 'hidden',
  },
  distBarFill: {
    height: '100%',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentMuted,
  },
  emptyHint: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    padding: '8px 2px',
  },
  error: {
    fontSize: '12px',
    color: '#C50F1F',
    lineHeight: 1.45,
  },
  foot: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  cryptoBody: {
    flex: 1,
    padding: CONTENT_PAD,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflow: 'auto',
  },
  card: {
    padding: '12px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceMuted,
    border: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '11px',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
  },
  klineRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '3px',
    height: '72px',
    paddingTop: '4px',
  },
  klineBar: {
    flex: '1 1 0',
    minWidth: '4px',
    borderRadius: '2px 2px 0 0',
    backgroundColor: opptrixCssVars.accent,
    opacity: 0.85,
  },
  klineBarDown: {
    backgroundColor: '#34C759',
    opacity: 0.75,
  },
  muted: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
})

interface Props {
  stock: WatchlistItem
  instrumentRef?: InstrumentRef
  localIndexed?: boolean | null
  loading?: boolean
  onManage?: () => void
  onSelectPeer?: (item: WatchlistItem) => void
}

function pctClass(s: ReturnType<typeof useStyles>, tone: ReturnType<typeof pctTone>) {
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
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

function Metric({ label, value }: { label: string; value: string }) {
  const s = useStyles()
  return (
    <div className={s.metric}>
      <span className={s.metricLabel}>{label}</span>
      <span className={s.metricValue}>{value}</span>
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

function NewsPanel({ items, emptyHint }: { items: StockNewsItem[]; emptyHint: string }) {
  const s = useStyles()
  if (!items.length) {
    return <Text className={s.emptyHint}>{emptyHint}</Text>
  }
  return (
    <div className={s.flatList}>
      {items.map((item, index) => (
        <div key={`${item.date}-${item.title}-${item.url ?? index}`} className={s.annRow}>
          <span className={s.listDate}>{item.date || '—'}</span>
          {item.url ? (
            <Link
              className={s.listTitle}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              onClick={event => openExternalUrl(item.url, event)}
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

function formatShareCount(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿股`
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万股`
  return `${Math.round(v).toLocaleString('zh-CN')} 股`
}

function RelatedStocksPanel({
  items,
  formatPrice,
  onSelectPeer,
}: {
  items: CrossMarketRelatedStock[]
  formatPrice: (v: number | null | undefined) => string
  onSelectPeer?: (item: WatchlistItem) => void
}) {
  const s = useStyles()
  if (!items.length) {
    return <Text className={s.emptyHint}>暂无关联股票</Text>
  }
  return (
    <div className={s.flatList}>
      {items.slice(0, 12).map(item => {
        const tone = pctTone(item.changePct ?? null)
        const toneClass = pctClass(s, tone)
        const label = `${item.name} (${item.code})`
        return (
          <button
            key={`${item.market}-${item.code}`}
            type="button"
            className={s.peerRow}
            title={onSelectPeer ? `查看 ${label}` : label}
            disabled={!onSelectPeer}
            onClick={() => {
              if (!onSelectPeer) return
              onSelectPeer({
                code: `${item.market}:${item.code}`,
                name: item.name,
                instrument: { market: item.market, assetClass: 'EQUITY', symbol: item.code },
              })
            }}
          >
            <span className={s.tableCellName}>{label}</span>
            <span className={s.tableCell}>{item.price != null ? formatPrice(item.price) : '—'}</span>
            <span className={mergeClasses(s.tableCell, toneClass)}>
              {formatPct(item.changePct ?? null)}
            </span>
          </button>
        )
      })}
      {!onSelectPeer ? (
        <Text className={s.muted}>关联标的来自同行业或产业链，暂不支持从此处跳转。</Text>
      ) : null}
    </div>
  )
}

function TradingDistributionPanel({
  data,
  formatPrice,
}: {
  data: TradingDistributionData
  formatPrice: (v: number | null | undefined) => string
}) {
  const s = useStyles()
  const levels = data.priceLevels.filter(row => row.price != null)
  if (!levels.length && data.largeOrderPct == null) {
    return <Text className={s.emptyHint}>盘中暂无成交分布数据</Text>
  }
  const maxRatio = Math.max(...levels.map(row => row.volumeRatio ?? 0), 0.0001)
  return (
    <>
      {data.largeOrderPct != null ? (
        <Text className={s.muted}>大单成交占比约 {data.largeOrderPct.toFixed(1)}%</Text>
      ) : null}
      <div className={s.flatList}>
        {levels.map(row => {
          const widthPct = row.volumeRatio != null
            ? Math.max(4, (row.volumeRatio / maxRatio) * 100)
            : 4
          return (
            <div key={`${row.price}-${row.volume}`} className={s.distRow}>
              <span className={s.tableCell}>{formatPrice(row.price)}</span>
              <div className={s.distBarTrack}>
                <div className={s.distBarFill} style={{ width: `${widthPct}%` }} />
              </div>
              <span className={s.tableCell}>{formatVolume(row.volume ?? null)}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

function SeniorTradesPanel({ items }: { items: SeniorTradeItem[] }) {
  const s = useStyles()
  if (!items.length) {
    return <Text className={s.emptyHint}>暂无高管交易记录</Text>
  }
  return (
    <div className={s.flatList}>
      <div className={s.tableHeadWide}>
        <span className={s.tableHeadCell}>日期</span>
        <span className={s.tableHeadCell}>姓名</span>
        <span className={s.tableHeadCell}>股数</span>
        <span className={s.tableHeadCell}>金额</span>
        <span className={s.tableHeadCell}>说明</span>
      </div>
      {items.slice(0, 12).map(item => (
        <div key={`${item.tradeDate}-${item.personName}-${item.shares}`} className={s.tableRowWide}>
          <span className={s.tableCell}>{item.tradeDate || '—'}</span>
          <span className={s.tableCellName} title={item.personName}>{item.personName}</span>
          <span className={s.tableCell}>{formatVolume(item.shares ?? null)}</span>
          <span className={s.tableCell}>
            {item.value != null ? formatCompactNumber(item.value) : '—'}
          </span>
          <span className={s.tableCellName} title={item.detail}>{item.detail || '—'}</span>
        </div>
      ))}
    </div>
  )
}

function RevenueBreakdownPanel({ blocks }: { blocks: RevenueBreakdownBlock[] }) {
  const s = useStyles()
  if (!blocks.length) return null
  const latest = blocks[0]
  if (!latest?.segments.length) return null
  return (
    <MetricSection title={`营收构成${latest.date ? `（${latest.date}）` : ''}`}>
      <div className={s.flatList}>
        <div className={s.tableHeadWide}>
          <span className={s.tableHeadCell}>业务</span>
          <span className={s.tableHeadCell}>收入</span>
          <span className={s.tableHeadCell}>占比</span>
        </div>
        {latest.segments.map(seg => (
          <div key={seg.label} className={s.tableRowWide}>
            <span className={s.tableCellName} title={seg.label}>{seg.label}</span>
            <span className={s.tableCell}>{seg.sales || '—'}</span>
            <span className={s.tableCell}>{seg.ratio || '—'}</span>
          </div>
        ))}
      </div>
      {latest.currency ? (
        <Text className={s.muted}>单位：{latest.currency}</Text>
      ) : null}
    </MetricSection>
  )
}

function DividendPanel({ items }: { items: StockDividendItem[] }) {
  const s = useStyles()
  if (!items.length) {
    return <Text className={s.emptyHint}>暂无分红派息记录</Text>
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
      {items.slice(0, 12).map(item => (
        <div key={`${item.exDate}-${item.plan}`} className={s.tableRowWide}>
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

function ShareholderPanel({ data }: { data: StockShareholderData | null | undefined }) {
  const s = useStyles()
  const top10 = data?.top10Shareholders ?? []
  if (!top10.length) {
    return <Text className={s.emptyHint}>暂无主要股东数据</Text>
  }
  return (
    <div className={s.flatList}>
      {data?.reportDate ? (
        <Text className={s.muted} style={{ marginBottom: 4 }}>数据日期：{data.reportDate}</Text>
      ) : null}
      <div className={s.tableHead}>
        <span className={s.tableHeadCell}>股东</span>
        <span className={s.tableHeadCell}>持股数</span>
        <span className={s.tableHeadCell}>占比</span>
        <span className={s.tableHeadCell}>变动</span>
      </div>
      {top10.slice(0, 10).map(row => (
        <div key={`${row.rank}-${row.name}`} className={s.tableRow}>
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
        <span className={s.tableHeadCell}>负债率</span>
      </div>
      {rows.slice(0, 12).map(row => (
        <div key={`${row.reportDate}-${row.reportType}`} className={s.tableRowWide}>
          <span className={s.tableCell}>{row.reportDate || '—'}</span>
          <span className={s.tableCell}>{row.reportType || '—'}</span>
          <span className={s.tableCell}>{formatCompactNumber(row.revenue)}</span>
          <span className={s.tableCell}>{formatCompactNumber(row.netProfit)}</span>
          <span className={s.tableCell}>{row.debtRatio != null ? `${row.debtRatio.toFixed(2)}%` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

function MiniKline({
  bars,
  formatPriceLabel,
}: {
  bars: { close: number; changePct: number | null }[]
  formatPriceLabel: (value: number) => string
}) {
  const s = useStyles()
  const values = bars.map(b => b.close).filter(v => Number.isFinite(v))
  if (values.length < 2) return <Text className={s.muted}>暂无 K 线</Text>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return (
    <div className={s.klineRow}>
      {bars.map((bar, i) => {
        const h = Math.max(8, Math.round(((bar.close - min) / span) * 64))
        const down = (bar.changePct ?? 0) < 0
        return (
          <div
            key={`${bar.close}-${i}`}
            className={mergeClasses(s.klineBar, down ? s.klineBarDown : undefined)}
            style={{ height: `${h}px` }}
            title={formatPriceLabel(bar.close)}
          />
        )
      })}
    </div>
  )
}

async function loadSnapshot(ref: InstrumentRef): Promise<EquityDetail | CryptoSnapshotData> {
  if (!hasApplicationCapability(ref, 'snapshot')) {
    throw new Error('该标的暂不支持快照')
  }
  const resp = await research.instrumentSnapshot(ref)
  if (!resp.success || !resp.data || typeof resp.data !== 'object') {
    throw new Error(resp.message || '获取行情失败')
  }
  return resp.data as EquityDetail | CryptoSnapshotData
}

function asProfile(raw: Record<string, unknown> | null | undefined): StockProfileData | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as StockProfileData
}

export default function CrossMarketSnapshotDetail({
  stock,
  instrumentRef,
  localIndexed = null,
  loading = false,
  onManage,
  onSelectPeer,
}: Props) {
  const s = useStyles()
  const ref = instrumentRef ?? resolveWatchlistInstrument(stock)
  const label = marketDisplayName(ref.market)
  const isCrypto = ref.market === 'CRYPTO'
  const isEquity = ref.market === 'US' || ref.market === 'HK'

  const [detailTab, setDetailTab] = useState<DetailTab>('chart')
  const [snapshot, setSnapshot] = useState<EquityDetail | CryptoSnapshotData | null>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFetching(true)
    setError(null)
    try {
      const data = await loadSnapshot(ref)
      setSnapshot(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取行情失败')
    } finally {
      setFetching(false)
    }
  }, [ref])

  useEffect(() => {
    setDetailTab('chart')
    void load()
    const ms = isCrypto ? 30_000 : 90_000
    const timer = window.setInterval(() => { void load() }, ms)
    return () => window.clearInterval(timer)
  }, [load, isCrypto])

  const equity = isEquity ? (snapshot as EquityDetail | null) : null
  const crypto = isCrypto ? (snapshot as CryptoSnapshotData | null) : null
  const quote = equity?.quote ?? crypto?.quote ?? null
  const profile = asProfile(equity?.profile ?? null)
  const financial = equity?.financial ?? null
  const financialHistory = equity?.financialHistory ?? (financial ? [financial] : [])
  const notices = equity?.notices ?? equity?.news ?? []
  const articles = equity?.articles ?? []
  const dividends = equity?.dividends ?? []
  const shareholders = equity?.shareholders ?? null
  const reviewProspect = equity?.reviewProspect ?? null
  const relatedStocks = equity?.relatedStocks ?? []
  const seniorTrades = equity?.seniorTrades ?? []
  const tradingDistribution = equity?.tradingDistribution ?? null
  const klines = equity?.recentKlines ?? crypto?.recentKlines ?? []

  const tone = pctTone(quote?.changePct)
  const toneClass = mergeClasses(
    tone === 'up' && s.pctUp,
    tone === 'down' && s.pctDown,
    tone === 'flat' && s.pctFlat,
  )
  const priceDigits = isCrypto && (quote?.price ?? 0) < 1 ? 4 : 2
  const fmtPrice = (v: number | null | undefined) => formatPriceForMarket(ref.market, v, priceDigits)
  const fmtCompact = (v: number | null | undefined) => formatCompactNumberForMarket(ref.market, v)

  const displayName = useMemo(() => {
    if (equity?.name && equity.name !== equity.code) return equity.name
    if (stock.name && stock.name !== stock.code) return stock.name
    return quote?.name || profile?.name || profile?.orgName || displayCodeFromInstrument(ref)
  }, [equity, stock.name, stock.code, quote?.name, profile, ref])

  const chartCode = formatInstrumentLabel(ref)
  const showDividendsTab = ref.market === 'HK'
  const showHoldersTab = ref.market === 'US'

  const footnote = isCrypto
    ? 'Crypto 行情 7×24 更新，约每 30 秒自动刷新。'
    : ref.market === 'US'
      ? (quote && 'quoteSession' in quote && (quote.quoteSession === 'pre' || quote.quoteSession === 'post')
        ? '当前为延长交易时段报价；盘中以常规时段为准。'
        : '行情、公告、资讯与财务摘要来自腾讯公开接口，约每 1–2 分钟刷新。')
      : '行情、公告、资讯、分红与业绩展望来自腾讯公开接口，约每 1–2 分钟刷新。'

  if (isCrypto) {
    return (
      <div className={s.root}>
        <div className={s.hero}>
          <div className={s.titleRow}>
            <div className={s.titleMain}>
              <Text className={s.name}>{displayName}</Text>
              <span className={s.badge}>{label}</span>
            </div>
            {onManage && (
              <button type="button" className={s.manageBtn} onClick={onManage}>
                <EditRegular fontSize={12} />
                备注
              </button>
            )}
          </div>
          {loading || (fetching && !quote) ? (
            <Spinner size="tiny" label="正在获取行情…" />
          ) : quote ? (
            <div className={s.quoteMain}>
              <span className={mergeClasses(s.price, toneClass)}>{fmtPrice(quote.price)}</span>
              <span className={mergeClasses(s.change, toneClass)}>{formatPct(quote.changePct)}</span>
            </div>
          ) : error ? (
            <Text className={s.error}>{error}</Text>
          ) : null}
        </div>
        <div className={s.cryptoBody}>
          <div className={s.card}>
            <Text className={s.cardTitle}>近 10 日走势</Text>
            <MiniKline bars={klines} formatPriceLabel={v => fmtPrice(v)} />
          </div>
          <Text className={s.foot}>{footnote}</Text>
        </div>
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <div className={s.titleMain}>
            <Text className={s.name}>{displayName}</Text>
            <span className={s.code}>{equity?.code ?? displayCodeFromInstrument(ref)}</span>
            <span className={s.badge}>{label}</span>
            {quote && 'sessionLabel' in quote && quote.sessionLabel ? (
              <span className={s.badge}>{quote.sessionLabel}</span>
            ) : null}
          </div>
          <div className={s.quoteMain}>
            {onManage && (
              <button type="button" className={s.manageBtn} onClick={onManage}>
                <EditRegular fontSize={12} />
                备注
              </button>
            )}
            {loading || (fetching && !quote) ? (
              <Spinner size="tiny" />
            ) : quote ? (
              <>
                <span className={mergeClasses(s.price, toneClass)}>{fmtPrice(quote.price)}</span>
                <span className={mergeClasses(s.change, toneClass)}>
                  {formatSignedNumber(quote.change ?? null, priceDigits)}
                </span>
                <span className={mergeClasses(s.change, toneClass)}>
                  {formatPct(quote.changePct)}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {quote ? (
          <div className={s.heroGrid}>
            <HeroCell label="开" value={fmtPrice(quote.open ?? null)} />
            <HeroCell label="高" value={fmtPrice(quote.high ?? null)} />
            <HeroCell label="低" value={fmtPrice(quote.low ?? null)} />
            <HeroCell label="昨" value={fmtPrice(quote.preClose ?? null)} />
            <HeroCell label="量" value={formatVolume(quote.volume ?? null)} />
            <HeroCell label="额" value={fmtCompact(quote.amount ?? null)} />
            <HeroCell label="换手" value={quote.turnoverRate != null ? `${quote.turnoverRate.toFixed(2)}%` : '—'} />
            <HeroCell label="市值" value={fmtCompact(quote.marketCap ?? null)} />
            {quote.week52High != null ? (
              <HeroCell label="52周高" value={fmtPrice(quote.week52High)} />
            ) : null}
            {quote.circulatingMarketCap != null ? (
              <HeroCell label="流通值" value={fmtCompact(quote.circulatingMarketCap)} />
            ) : null}
          </div>
        ) : error && !quote ? (
          <Text className={s.error}>{error}</Text>
        ) : null}
      </div>

      <div className={s.tabBar}>
        <TabList
          className={s.tabList}
          size="small"
          selectedValue={detailTab}
          onTabSelect={(_, data) => setDetailTab(data.value as DetailTab)}
        >
          <Tab value="chart">走势</Tab>
          <Tab value="basic">概况</Tab>
          <Tab value="company">公司</Tab>
          <Tab value="notices">公告</Tab>
          <Tab value="articles">资讯</Tab>
          <Tab value="f10">财务</Tab>
          {showDividendsTab ? <Tab value="dividends">分红</Tab> : null}
          {showHoldersTab ? <Tab value="holders">股东</Tab> : null}
        </TabList>
      </div>

      <div className={s.tabBody}>
        <div className={mergeClasses(s.tabPanel, detailTab !== 'chart' && s.tabPanelHidden)}>
          <div className={s.chartPanel}>
            <TradingViewChart code={chartCode} expanded active={detailTab === 'chart'} />
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'basic' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            <MetricSection title="今日行情">
              <div className={s.metricGrid3}>
                <Metric label="今开" value={fmtPrice(quote?.open ?? null)} />
                <Metric label="最高" value={fmtPrice(quote?.high ?? null)} />
                <Metric label="最低" value={fmtPrice(quote?.low ?? null)} />
                <Metric label="昨收" value={fmtPrice(quote?.preClose ?? null)} />
                <Metric label="涨跌额" value={formatSignedNumber(quote?.change ?? null, priceDigits)} />
                <Metric label="涨跌幅" value={formatPct(quote?.changePct ?? null)} />
                <Metric label="成交量" value={formatVolume(quote?.volume ?? null)} />
                <Metric label="成交额" value={fmtCompact(quote?.amount ?? null)} />
                <Metric label="换手率" value={quote?.turnoverRate != null ? `${quote.turnoverRate.toFixed(2)}%` : '—'} />
                <Metric label="振幅" value={quote?.amplitude != null ? `${quote.amplitude.toFixed(2)}%` : '—'} />
                <Metric label="市盈率" value={quote?.pe != null ? quote.pe.toFixed(2) : '—'} />
                <Metric label="市净率" value={quote?.pb != null ? quote.pb.toFixed(2) : '—'} />
                <Metric label="总市值" value={fmtCompact(quote?.marketCap ?? null)} />
                <Metric label="流通市值" value={fmtCompact(quote?.circulatingMarketCap ?? null)} />
                {quote?.week52High != null ? (
                  <Metric label="52 周最高" value={fmtPrice(quote.week52High)} />
                ) : null}
                {quote?.week52Low != null ? (
                  <Metric label="52 周最低" value={fmtPrice(quote.week52Low)} />
                ) : null}
                {quote?.currency ? (
                  <Metric label="报价币种" value={quote.currency} />
                ) : null}
                <Metric label="所属行业" value={profile?.industry ?? stock.industry ?? '—'} />
                <Metric label="上市日期" value={profile?.listingDate ?? '—'} />
                {profile?.weekDividendYield != null ? (
                  <Metric label="周股息率" value={`${profile.weekDividendYield.toFixed(2)}%`} />
                ) : null}
              </div>
            </MetricSection>
            {financial ? (
              <MetricSection title="最新财务摘要">
                <div className={s.metricGrid3}>
                  <Metric label="报告期" value={financial.reportDate || '—'} />
                  <Metric label="营收" value={formatCompactNumber(financial.revenue)} />
                  <Metric label="净利润" value={formatCompactNumber(financial.netProfit)} />
                  <Metric label="净利率" value={financial.netMargin != null ? `${financial.netMargin.toFixed(2)}%` : '—'} />
                  <Metric label="负债率" value={financial.debtRatio != null ? `${financial.debtRatio.toFixed(2)}%` : '—'} />
                  <Metric label="经营现金流" value={formatCompactNumber(financial.operatingCashFlow)} />
                </div>
              </MetricSection>
            ) : null}
            {ref.market === 'HK' && tradingDistribution ? (
              <MetricSection title="今日成交分布">
                <TradingDistributionPanel data={tradingDistribution} formatPrice={v => fmtPrice(v)} />
              </MetricSection>
            ) : null}
            {relatedStocks.length ? (
              <MetricSection title="关联股票">
                <RelatedStocksPanel
                  items={relatedStocks}
                  formatPrice={v => fmtPrice(v)}
                  onSelectPeer={onSelectPeer}
                />
              </MetricSection>
            ) : null}
            <div className={s.card}>
              <Text className={s.cardTitle}>近 10 日收盘</Text>
              <MiniKline bars={klines} formatPriceLabel={v => fmtPrice(v)} />
            </div>
            {error && quote ? <Text className={s.error}>刷新失败：{error}</Text> : null}
            {localIndexed === false ? (
              <Text className={s.muted}>
                在线名录暂未匹配到该代码；可用 US:AAPL、HK:00700 格式添加关注。
              </Text>
            ) : null}
            <Text className={s.foot}>{footnote}</Text>
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'company' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            <MetricSection title="公司概况">
              <div className={s.metricGrid3}>
                <Metric label="公司全称" value={profile?.orgName || displayName} />
                <Metric label="证券类型" value={profile?.securityType ?? label} />
                <Metric label="上市日期" value={profile?.listingDate ?? '—'} />
                <Metric label="所属行业" value={profile?.industry ?? '—'} />
                <Metric label="董事长" value={profile?.chairman ?? '—'} />
                <Metric label="总股本" value={formatShareCount(profile?.totalShares ?? null)} />
                <Metric label="官网" value={profile?.website ?? '—'} />
              </div>
            </MetricSection>
            {profile?.website ? (
              <MetricSection title="官网链接">
                <Link
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={event => {
                    const href = profile.website!.startsWith('http') ? profile.website! : `https://${profile.website}`
                    openExternalUrl(href, event)
                  }}
                >
                  {profile.website}
                </Link>
              </MetricSection>
            ) : null}
            <MetricSection title="业务介绍">
              <Text className={s.prose} block>
                {profile?.orgProfile || profile?.mainBusiness || '暂无公司介绍'}
              </Text>
            </MetricSection>
            {profile?.revenueBreakdown?.length ? (
              <RevenueBreakdownPanel blocks={profile.revenueBreakdown} />
            ) : null}
            {reviewProspect?.review ? (
              <MetricSection title="业绩回顾">
                <Text className={s.prose} block>{reviewProspect.review}</Text>
              </MetricSection>
            ) : null}
            {reviewProspect?.prospect ? (
              <MetricSection title="业绩展望">
                <Text className={s.prose} block>{reviewProspect.prospect}</Text>
              </MetricSection>
            ) : null}
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'notices' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            <NewsPanel items={notices} emptyHint="暂无官方公告" />
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'articles' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            <NewsPanel items={articles} emptyHint="暂无相关资讯" />
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'f10' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
            {financial ? (
              <MetricSection title="最新财报摘要">
                <div className={s.metricGrid3}>
                  <Metric label="营收" value={formatCompactNumber(financial.revenue)} />
                  <Metric label="净利润" value={formatCompactNumber(financial.netProfit)} />
                  <Metric label="净利率" value={financial.netMargin != null ? `${financial.netMargin.toFixed(2)}%` : '—'} />
                  <Metric label="总资产" value={formatCompactNumber(financial.totalAssets ?? null)} />
                  <Metric label="总负债" value={formatCompactNumber(financial.totalLiabilities ?? null)} />
                  <Metric label="负债率" value={financial.debtRatio != null ? `${financial.debtRatio.toFixed(2)}%` : '—'} />
                  <Metric label="经营现金流" value={formatCompactNumber(financial.operatingCashFlow)} />
                  <Metric label="报告期" value={financial.reportDate || '—'} />
                </div>
              </MetricSection>
            ) : null}
            <MetricSection title="历史财务">
              <FinancialHistoryPanel rows={financialHistory} />
            </MetricSection>
          </div>
        </div>

        {showDividendsTab ? (
          <div className={mergeClasses(s.tabPanel, detailTab !== 'dividends' && s.tabPanelHidden)}>
            <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
              <DividendPanel items={dividends} />
            </div>
          </div>
        ) : null}

        {showHoldersTab ? (
          <div className={mergeClasses(s.tabPanel, detailTab !== 'holders' && s.tabPanelHidden)}>
            <div className={mergeClasses(s.scrollPanel, 'opptrix-scroll')}>
              <ShareholderPanel data={shareholders} />
              {ref.market === 'US' ? (
                <MetricSection title="高管交易">
                  <SeniorTradesPanel items={seniorTrades} />
                </MetricSection>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
