import { useEffect, useMemo, useState } from 'react'
import { Spinner, Tab, TabList, Text, Badge, makeStyles, mergeClasses } from '@fluentui/react-components'
import { EditRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import type { WatchlistItem, FundDetailData, FundProfileData, FundSnapshotData } from '../types/market'
import FundNavChart from './FundNavChart'
import TradingViewChart from './TradingViewChart'
import { DETAIL_PANEL_CHART_MAX_HEIGHT_PX } from './chartViewConfig'
import {
  FundArchivePanel,
  FundDividendsPanel,
  FundHoldersPanel,
  FundHoldingsPanel,
  FundPerformancePanel,
} from './fundDetailPanels'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
  inferCnExchangeFromCode,
  isCnListedFundSymbol,
  isCnLofSymbol,
  pctTone,
  resolveDisplayStockName,
} from './format'
import { displayCodeFromInstrument, resolveWatchlistInstrument } from './instrument'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

type FundTab = 'chart' | 'archive' | 'performance' | 'holdings' | 'holders' | 'dividends'

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
  badge: {
    fontSize: 'var(--opptrix-font-xs)',
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
    gap: '6px',
    flexShrink: 0,
  },
  manageBtn: {
    ...ghostInteractive,
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
  chartWrap: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX}px`,
    padding: `4px ${CONTENT_PAD} 8px`,
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  error: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD}`,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.error,
  },
})

type Props = {
  stock: WatchlistItem
  isHolding?: boolean
  onManage?: () => void
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

function mergeProfile(snapshot: FundSnapshotData | null): FundProfileData | null {
  if (!snapshot) return null
  const base = (snapshot.profile ?? {}) as FundProfileData
  const quote = snapshot.quote as Record<string, unknown> | null
  const nav = snapshot.nav as Record<string, unknown> | null
  return {
    ...base,
    code: snapshot.code,
    unitNav: base.unitNav ?? (quote?.unitNav as number | null) ?? (nav?.nav as number | null),
    accNav: base.accNav ?? (quote?.accNav as number | null) ?? (nav?.accNav as number | null),
    changePct: base.changePct ?? (quote?.changePct as number | null) ?? (nav?.changePct as number | null),
    navDate: base.navDate ?? (String(quote?.navDate ?? nav?.date ?? '').slice(0, 10) || undefined),
    name: base.name ?? String(quote?.name ?? ''),
  }
}

function numField(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function snapshotFromDetail(detail: FundDetailData | null): FundSnapshotData | null {
  if (!detail?.snapshot) return null
  return {
    code: detail.snapshot.code || detail.code,
    profile: detail.snapshot.profile ?? null,
    nav: detail.snapshot.nav ?? null,
    quote: detail.snapshot.quote ?? null,
  }
}

export default function FundDetailTab({
  stock,
  isHolding = false,
  onManage,
}: Props) {
  const s = useStyles()
  const [tab, setTab] = useState<FundTab>('chart')
  const [snapshot, setSnapshot] = useState<FundSnapshotData | null>(null)
  const [detail, setDetail] = useState<FundDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const instrumentRef = useMemo(
    () => (stock ? resolveWatchlistInstrument(stock) : null),
    [stock],
  )
  const stockCode = instrumentRef?.symbol ?? stock?.code ?? null
  const displayCode = instrumentRef ? displayCodeFromInstrument(instrumentRef) : (stock?.code ?? '')
  const isListedFund = stockCode != null && isCnListedFundSymbol(stockCode)
  const isLof = stockCode != null && isCnLofSymbol(stockCode)

  const chartInstrument = useMemo(() => {
    if (!instrumentRef) return undefined
    if (!isListedFund) return instrumentRef
    return {
      ...instrumentRef,
      exchange: inferCnExchangeFromCode(instrumentRef.symbol),
    }
  }, [instrumentRef, isListedFund])

  const profile = useMemo(() => mergeProfile(snapshot), [snapshot])
  const quoteRaw = snapshot?.quote as Record<string, unknown> | null
  const failed = detail?.failed ?? []
  const holders = detail?.holders ?? null
  const dividends = detail?.dividends ?? []
  const showHoldersTab = Boolean(
    holders
    && (
      (holders.top?.length ?? 0) > 0
      || holders.holderAmount != null
      || holders.instHolderRatio != null
      || holders.indivHolderRatio != null
    ),
  )
  const showDividendsTab = dividends.length > 0

  useEffect(() => {
    if (!instrumentRef) {
      setSnapshot(null)
      setDetail(null)
      setError('')
      return undefined
    }
    let cancelled = false
    setTab('chart')
    setLoading(true)
    setError('')
    setDetail(null)
    research.fundDetail(instrumentRef)
      .then(async resp => {
        if (cancelled) return
        if (resp.success && resp.data?.snapshot) {
          setDetail(resp.data)
          setSnapshot(snapshotFromDetail(resp.data))
          return
        }
        const snap = await research.fundSnapshot(instrumentRef)
        if (cancelled) return
        if (!snap.success || !snap.data) {
          setError(resp.message || snap.message || '暂时无法加载基金信息，请稍后再试')
          setSnapshot(null)
          return
        }
        setSnapshot(snap.data)
        setDetail(resp.data ?? null)
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '暂时无法加载基金信息，请稍后重试')
          setSnapshot(null)
          setDetail(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [instrumentRef])

  useEffect(() => {
    if (tab === 'holders' && !showHoldersTab) setTab('chart')
    if (tab === 'dividends' && !showDividendsTab) setTab('chart')
  }, [tab, showHoldersTab, showDividendsTab])

  const displayName = resolveDisplayStockName(stockCode ?? '', profile?.name, stock?.name)
  const unitNav = profile?.unitNav
  const changePct = profile?.changePct
  const tone = pctTone(changePct)
  const toneClass = mergeClasses(
    tone === 'up' && s.pctUp,
    tone === 'down' && s.pctDown,
    tone === 'flat' && s.pctFlat,
  )
  const headPrice = isListedFund
    ? (numField(quoteRaw?.exchangePrice) ?? numField(quoteRaw?.price) ?? unitNav)
    : unitNav
  const premiumPct = numField(quoteRaw?.premiumPct ?? quoteRaw?.premiumRate)

  if (loading && !profile) {
    return (
      <div className={s.center}>
        <Spinner size="small" label="正在加载基金信息…" />
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <div className={s.titleMain}>
            <span className={s.name}>{displayName}</span>
            <span className={s.code}>{displayCode}</span>
            {isHolding && <Badge size="small" color="informative" appearance="outline">持有</Badge>}
            <span className={s.badge}>{isListedFund ? '场内基金' : '场外基金'}</span>
          </div>
          <div className={s.quoteMain}>
            {onManage && (
              <button type="button" className={s.manageBtn} onClick={onManage}>
                <EditRegular fontSize={12} />
                管理持仓
              </button>
            )}
            {profile ? (
              <>
                <span className={mergeClasses(s.price, toneClass)}>
                  {formatPrice(headPrice)}
                </span>
                <span className={mergeClasses(s.change, toneClass)}>
                  {formatPct(changePct)}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {error && !profile ? (
          <Text size={200}>{error}</Text>
        ) : null}
        {profile ? (
          <div className={s.heroGrid}>
            <HeroCell
              label={isListedFund ? '单位净值' : '净值'}
              value={formatPrice(unitNav)}
            />
            <HeroCell label="累计净值" value={formatPrice(profile.accNav)} />
            <HeroCell label="基金类型" value={profile.fundType ?? '—'} />
            <HeroCell
              label="规模"
              value={profile.scale != null ? `${formatCompactNumber(profile.scale)} 亿` : '—'}
            />
            <HeroCell label="近一年" value={formatPct(profile.return1y ?? null)} />
            <HeroCell label="基金经理" value={profile.manager ?? '—'} />
            <HeroCell label="成立日期" value={profile.establishDate ?? '—'} />
            <HeroCell label="净值日期" value={profile.navDate ?? '—'} />
            {isListedFund && premiumPct != null ? (
              <HeroCell label="折溢价" value={formatPct(premiumPct)} />
            ) : null}
            {profile.expenseRatio != null ? (
              <HeroCell label="管理费" value={`${profile.expenseRatio}%`} />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={s.subTabs}>
        <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as FundTab)}>
          <Tab value="chart">走势</Tab>
          <Tab value="archive">档案</Tab>
          <Tab value="performance">业绩</Tab>
          <Tab value="holdings">持仓</Tab>
          {showHoldersTab ? <Tab value="holders">持有人</Tab> : null}
          {showDividendsTab ? <Tab value="dividends">分红</Tab> : null}
        </TabList>
      </div>

      {error && profile ? <Text className={s.error}>{error}</Text> : null}

      {tab === 'chart' ? (
        <div className={s.chartWrap}>
          {instrumentRef && isListedFund && !isLof ? (
            <TradingViewChart
              code={displayCode}
              instrument={chartInstrument}
              expanded
              active={tab === 'chart'}
            />
          ) : instrumentRef ? (
            <FundNavChart instrument={instrumentRef} active={tab === 'chart'} />
          ) : null}
        </div>
      ) : (
        <div className={s.body}>
          {tab === 'archive' && <FundArchivePanel profile={profile} />}
          {tab === 'performance' && (
            <FundPerformancePanel
              returns={detail?.returns ?? (profile?.performance ? { performance: profile.performance } : null)}
              drawdowns={detail?.drawdowns ?? []}
              loading={loading && !detail}
              failed={failed}
            />
          )}
          {tab === 'holdings' && (
            <FundHoldingsPanel
              holdings={detail?.holdings ?? []}
              allocation={detail?.allocation ?? null}
              loading={loading && !detail}
              failed={failed}
            />
          )}
          {tab === 'holders' && (
            <FundHoldersPanel
              holders={holders}
              loading={loading && !detail}
              failed={failed}
            />
          )}
          {tab === 'dividends' && (
            <FundDividendsPanel
              dividends={dividends}
              loading={loading && !detail}
              failed={failed}
            />
          )}
        </div>
      )}
    </div>
  )
}
