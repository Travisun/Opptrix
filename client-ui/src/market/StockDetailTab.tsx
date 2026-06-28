import { useEffect, useState, type ReactNode } from 'react'
import { Link, Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { research } from '../api/client'
import type {
  FinancialSummaryData,
  StockDetailData,
  StockDividendItem,
  StockMoneyFlowItem,
  StockNewsItem,
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
import TradingViewChart from './TradingViewChart'
import { innoTokens } from '../theme/tokens'

type DetailTab = 'chart' | 'basic' | 'company' | 'news' | 'f10'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  hero: {
    flexShrink: 0,
    padding: '6px 10px 5px',
    borderBottom: `1px solid ${innoTokens.separator}`,
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
    letterSpacing: '-0.02em',
    color: innoTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  code: {
    fontSize: '11px',
    color: innoTokens.textTertiary,
    flexShrink: 0,
  },
  quoteMain: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    flexShrink: 0,
  },
  price: {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  change: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pct: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: '#FF3B30' },
  pctDown: { color: '#34C759' },
  pctFlat: { color: innoTokens.textTertiary },
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
    color: innoTokens.textTertiary,
    flexShrink: 0,
  },
  heroValue: {
    fontSize: '11px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tabBar: {
    flexShrink: 0,
    padding: '0 6px',
    minHeight: '28px',
    borderBottom: `1px solid ${innoTokens.separator}`,
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
    padding: '4px 8px 8px',
    display: 'flex',
    flexDirection: 'column',
  },
  scrollPanel: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '8px 10px 10px',
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
  metricGrid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '4px',
  },
  metric: {
    padding: '5px 6px',
    borderRadius: innoTokens.radiusSm,
    backgroundColor: innoTokens.canvasAlt,
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
  prose: {
    fontSize: '11px',
    lineHeight: 1.55,
    color: innoTokens.textSecondary,
    whiteSpace: 'pre-wrap',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  tag: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: innoTokens.radiusFull,
    backgroundColor: innoTokens.accentSoft,
    color: innoTokens.textSecondary,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    borderRadius: innoTokens.radiusSm,
    overflow: 'hidden',
    border: `1px solid ${innoTokens.separator}`,
  },
  listRow: {
    display: 'grid',
    gridTemplateColumns: '62px minmax(0, 1fr)',
    gap: '6px',
    alignItems: 'start',
    padding: '6px 8px',
    backgroundColor: innoTokens.surface,
    borderBottom: `1px solid ${innoTokens.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  listDate: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.4,
  },
  listTitle: {
    fontSize: '11px',
    color: innoTokens.textPrimary,
    lineHeight: 1.4,
    textDecoration: 'none',
    ':hover': { color: innoTokens.accent },
  },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) repeat(3, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: innoTokens.canvasAlt,
    borderBottom: `1px solid ${innoTokens.separator}`,
  },
  tableHeadCell: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) repeat(3, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '5px 8px',
    borderBottom: `1px solid ${innoTokens.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  tableCell: {
    fontSize: '10px',
    color: innoTokens.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tableCellName: {
    fontSize: '10px',
    color: innoTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyHint: {
    fontSize: '11px',
    color: innoTokens.textTertiary,
    padding: '8px 2px',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: innoTokens.textTertiary,
    fontSize: '12px',
  },
})

interface Props {
  stock: WatchlistItem | null
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
    return <Text className={s.emptyHint}>暂无公告</Text>
  }
  return (
    <div className={s.list}>
      {items.map(item => (
        <div key={`${item.date}-${item.title}`} className={s.listRow}>
          <span className={s.listDate}>{item.date || '—'}</span>
          {item.url ? (
            <Link className={s.listTitle} href={item.url} target="_blank" rel="noreferrer">
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
    return <Text className={s.emptyHint}>暂无分红记录</Text>
  }
  return (
    <div className={s.list}>
      <div className={s.tableHead}>
        <span className={s.tableHeadCell}>除权日</span>
        <span className={s.tableHeadCell}>年度</span>
        <span className={s.tableHeadCell}>每股分红</span>
        <span className={s.tableHeadCell} />
      </div>
      {items.slice(0, 8).map(item => (
        <div key={`${item.exDate}-${item.year}`} className={s.tableRow}>
          <span className={s.tableCell}>{item.exDate || '—'}</span>
          <span className={s.tableCell}>{item.year || '—'}</span>
          <span className={s.tableCell}>
            {item.cashBonus != null ? `${item.cashBonus.toFixed(2)} 元` : '—'}
          </span>
          <span className={s.tableCell} />
        </div>
      ))}
    </div>
  )
}

function MoneyFlowPanel({ items }: { items: StockMoneyFlowItem[] }) {
  const s = useStyles()
  if (!items.length) {
    return <Text className={s.emptyHint}>暂无资金流向</Text>
  }
  return (
    <div className={s.list}>
      <div className={s.tableHead}>
        <span className={s.tableHeadCell}>日期</span>
        <span className={s.tableHeadCell}>主力净流入</span>
        <span className={s.tableHeadCell}>占比</span>
        <span className={s.tableHeadCell}>涨跌</span>
      </div>
      {[...items].reverse().slice(0, 8).map(item => (
        <div key={item.date} className={s.tableRow}>
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
    return <Text className={s.emptyHint}>暂无股东数据</Text>
  }
  return (
    <>
      <div className={s.metricGrid3}>
        <Metric label="报告期" value={data?.reportDate || '—'} />
        <Metric label="股东户数" value={data?.shareholderCount != null ? String(Math.round(data.shareholderCount)) : '—'} />
        <Metric
          label="户数变动"
          value={data?.shareholderCountChange != null ? formatSignedNumber(data.shareholderCountChange, 0) : '—'}
        />
      </div>
      {top10.length > 0 && (
        <div className={s.list}>
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
      )}
    </>
  )
}

function FinancialHistoryPanel({ rows }: { rows: FinancialSummaryData[] }) {
  const s = useStyles()
  if (!rows.length) {
    return <Text className={s.emptyHint}>暂无财务历史</Text>
  }
  return (
    <div className={s.list}>
      <div className={s.tableHead}>
        <span className={s.tableHeadCell}>报告期</span>
        <span className={s.tableHeadCell}>营收</span>
        <span className={s.tableHeadCell}>净利</span>
        <span className={s.tableHeadCell}>ROE</span>
      </div>
      {rows.slice(0, 8).map(row => (
        <div key={row.reportDate} className={s.tableRow}>
          <span className={s.tableCell}>{row.reportDate || '—'}</span>
          <span className={s.tableCell}>{formatCompactNumber(row.revenue)}</span>
          <span className={s.tableCell}>{formatCompactNumber(row.netProfit)}</span>
          <span className={s.tableCell}>{row.roe != null ? `${row.roe.toFixed(2)}%` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

export default function StockDetailTab({ stock }: Props) {
  const s = useStyles()
  const [detailTab, setDetailTab] = useState<DetailTab>('chart')
  const [detail, setDetail] = useState<StockDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    research.stockDetail(stock.code)
      .then(resp => {
        if (cancelled) return
        if (!resp.success || !resp.data) {
          setError(resp.message || '加载失败')
          setDetail(null)
          return
        }
        setDetail(resp.data)
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败')
          setDetail(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [stock])

  if (!stock) {
    return <div className={s.center}>从自选列表选择股票查看详情</div>
  }

  if (loading && !detail) {
    return <div className={s.center}><Spinner size="small" label="加载行情与资料…" /></div>
  }

  if (error && !detail) {
    return <div className={s.center}>{error}</div>
  }

  if (!detail) {
    return <div className={s.center}>暂无数据</div>
  }

  const quote = detail.quote
  const profile = detail.profile
  const financial = detail.financial
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
            <Text className={s.name}>{detail.name}</Text>
            <span className={s.code}>{detail.code}</span>
          </div>
          <div className={s.quoteMain}>
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
          <Tab value="chart">图表</Tab>
          <Tab value="basic">基本</Tab>
          <Tab value="company">公司</Tab>
          <Tab value="news">公告</Tab>
          <Tab value="f10">F10</Tab>
        </TabList>
      </div>

      <div className={s.tabBody}>
        <div className={mergeClasses(s.tabPanel, detailTab !== 'chart' && s.tabPanelHidden)}>
          <div className={s.chartPanel}>
            <TradingViewChart
              code={detail.code}
              expanded
              active={detailTab === 'chart'}
            />
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'basic' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'inno-scroll')}>
            <MetricSection title="行情">
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
              </div>
            </MetricSection>

            <MetricSection title="估值 · 规模">
              <div className={s.metricGrid3}>
                <Metric label="市盈率 TTM" value={quote?.pe != null ? quote.pe.toFixed(2) : '—'} />
                <Metric label="市净率" value={quote?.pb != null ? quote.pb.toFixed(2) : '—'} />
                <Metric label="总市值" value={formatCompactNumber(profile?.totalMarketCap ?? quote?.marketCap ?? null)} />
                <Metric label="流通市值" value={formatCompactNumber(profile?.circulatingMarketCap ?? null)} />
                <Metric label="所属行业" value={profile?.industry ?? stock.industry ?? '—'} />
                <Metric label="EPS" value={financial?.eps != null ? financial.eps.toFixed(2) : '—'} />
              </div>
            </MetricSection>

            {financial && (
              <MetricSection title="盈利 · 质量">
                <div className={s.metricGrid3}>
                  <Metric label="营收" value={formatCompactNumber(financial.revenue)} />
                  <Metric label="营收同比" value={formatPct(financial.revenueYoy)} />
                  <Metric label="净利润" value={formatCompactNumber(financial.netProfit)} />
                  <Metric label="净利同比" value={formatPct(financial.netProfitYoy)} />
                  <Metric label="ROE" value={financial.roe != null ? `${financial.roe.toFixed(2)}%` : '—'} />
                  <Metric label="毛利率" value={financial.grossMargin != null ? `${financial.grossMargin.toFixed(2)}%` : '—'} />
                  <Metric label="资产负债率" value={financial.debtRatio != null ? `${financial.debtRatio.toFixed(2)}%` : '—'} />
                  <Metric label="经营现金流" value={formatCompactNumber(financial.operatingCashFlow)} />
                  <Metric label="报告期" value={financial.reportDate || '—'} />
                </div>
              </MetricSection>
            )}
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'company' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'inno-scroll')}>
            <MetricSection title="公司概况">
              <div className={s.metricGrid3}>
                <Metric label="上市日期" value={profile?.listingDate ?? '—'} />
                <Metric label="员工人数" value={profile?.employees != null ? String(profile.employees) : '—'} />
                <Metric label="注册地" value={[profile?.province, profile?.city].filter(Boolean).join(' · ') || '—'} />
                <Metric label="所属行业" value={profile?.industry ?? stock.industry ?? '—'} />
                <Metric label="总市值" value={formatCompactNumber(profile?.totalMarketCap ?? quote?.marketCap ?? null)} />
                <Metric label="流通市值" value={formatCompactNumber(profile?.circulatingMarketCap ?? null)} />
              </div>
            </MetricSection>

            {profile?.website && (
              <MetricSection title="官网">
                <Link href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer">
                  {profile.website}
                </Link>
              </MetricSection>
            )}

            {profile?.concepts?.length ? (
              <MetricSection title="概念题材">
                <div className={s.tagRow}>
                  {profile.concepts.slice(0, 12).map(tag => (
                    <span key={tag} className={s.tag}>{tag}</span>
                  ))}
                </div>
              </MetricSection>
            ) : null}

            <MetricSection title="主营业务">
              <Text className={s.prose} block>
                {profile?.mainBusiness || '暂无主营业务介绍'}
              </Text>
            </MetricSection>
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'news' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'inno-scroll')}>
            <MetricSection title="最新公告">
              <NewsPanel items={detail.news ?? []} />
            </MetricSection>
          </div>
        </div>

        <div className={mergeClasses(s.tabPanel, detailTab !== 'f10' && s.tabPanelHidden)}>
          <div className={mergeClasses(s.scrollPanel, 'inno-scroll')}>
            {financial && (
              <MetricSection title="财务摘要 · 最新">
                <div className={s.metricGrid3}>
                  <Metric label="营收" value={formatCompactNumber(financial.revenue)} />
                  <Metric label="营收同比" value={formatPct(financial.revenueYoy)} />
                  <Metric label="净利润" value={formatCompactNumber(financial.netProfit)} />
                  <Metric label="净利同比" value={formatPct(financial.netProfitYoy)} />
                  <Metric label="ROE" value={financial.roe != null ? `${financial.roe.toFixed(2)}%` : '—'} />
                  <Metric label="毛利率" value={financial.grossMargin != null ? `${financial.grossMargin.toFixed(2)}%` : '—'} />
                  <Metric label="资产负债率" value={financial.debtRatio != null ? `${financial.debtRatio.toFixed(2)}%` : '—'} />
                  <Metric label="经营现金流" value={formatCompactNumber(financial.operatingCashFlow)} />
                  <Metric label="总资产" value={formatCompactNumber(financial.totalAssets ?? null)} />
                  <Metric label="总负债" value={formatCompactNumber(financial.totalLiabilities ?? null)} />
                  <Metric label="EPS" value={financial.eps != null ? financial.eps.toFixed(2) : '—'} />
                  <Metric label="报告期" value={financial.reportDate || '—'} />
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
