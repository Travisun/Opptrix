import { useEffect, useMemo, useState } from 'react'
import { Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { research } from '../api/client'
import type { WatchlistItem } from '../types/market'
import type { FundHoldingRow, FundNavPoint, FundProfileData, FundSnapshotData } from '../types/market'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
  pctTone,
  resolveDisplayStockName,
} from './format'
import { displayCodeFromInstrument, resolveWatchlistInstrument, watchlistItemKey, normalizeWatchlistItem } from './instrument'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { listRowKey } from '../utils/listRowKey'

type FundTab = 'overview' | 'chart' | 'nav' | 'holdings'

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
    alignItems: 'baseline',
    gap: '8px',
  },
  price: {
    fontSize: 'var(--opptrix-font-xl)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  change: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  meta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  tabList: {
    flexShrink: 0,
    padding: `4px ${CONTENT_PAD}`,
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
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px 12px',
  },
  label: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  value: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: 'var(--opptrix-font-sm)',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
})

type Props = {
  stock: WatchlistItem
}

function mergeProfile(
  snapshot: FundSnapshotData | null,
): FundProfileData | null {
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

export default function FundDetailTab({ stock }: Props) {
  const s = useStyles()
  const [tab, setTab] = useState<FundTab>('overview')
  const [snapshot, setSnapshot] = useState<FundSnapshotData | null>(null)
  const [navRows, setNavRows] = useState<FundNavPoint[]>([])
  const [holdings, setHoldings] = useState<FundHoldingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [navLoading, setNavLoading] = useState(false)
  const [holdingsLoading, setHoldingsLoading] = useState(false)

  const instrumentRef = useMemo(
    () => (stock ? resolveWatchlistInstrument(stock) : null),
    [stock],
  )
  const stockCode = instrumentRef?.symbol ?? stock?.code ?? null
  const displayCode = instrumentRef ? displayCodeFromInstrument(instrumentRef) : (stock?.code ?? '')
  const stockKey = useMemo(
    () => (stock ? watchlistItemKey(normalizeWatchlistItem(stock)) : null),
    [stock],
  )

  useEffect(() => {
    if (!instrumentRef || tab !== 'chart') return undefined
    if (navRows.length) return undefined
    let cancelled = false
    setNavLoading(true)
    research.fundNav(instrumentRef)
      .then(resp => {
        if (cancelled) return
        const raw = resp.data as { items?: FundNavPoint[] } | FundNavPoint[] | null | undefined
        setNavRows(Array.isArray(raw) ? raw : (raw?.items ?? []))
      })
      .finally(() => {
        if (!cancelled) setNavLoading(false)
      })
    return () => { cancelled = true }
  }, [instrumentRef, tab, navRows.length])

  const profile = useMemo(() => mergeProfile(snapshot), [snapshot])

  useEffect(() => {
    if (!instrumentRef) {
      setSnapshot(null)
      setNavRows([])
      setHoldings([])
      setError('')
      return undefined
    }
    let cancelled = false
    setTab('overview')
    setLoading(true)
    setError('')
    research.fundSnapshot(instrumentRef)
      .then(resp => {
        if (cancelled) return
        if (!resp.success || !resp.data) {
          setError(resp.message || '暂时无法加载基金信息，请稍后再试')
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
  }, [instrumentRef])

  useEffect(() => {
    if (!instrumentRef || tab !== 'nav') return undefined
    let cancelled = false
    setNavLoading(true)
    research.fundNav(instrumentRef)
      .then(resp => {
        if (cancelled) return
        const raw = resp.data as { items?: FundNavPoint[] } | FundNavPoint[] | null | undefined
        setNavRows(Array.isArray(raw) ? raw : (raw?.items ?? []))
      })
      .catch(() => {
        if (!cancelled) setNavRows([])
      })
      .finally(() => {
        if (!cancelled) setNavLoading(false)
      })
    return () => { cancelled = true }
  }, [instrumentRef, tab])

  useEffect(() => {
    if (!instrumentRef || tab !== 'holdings') return undefined
    let cancelled = false
    setHoldingsLoading(true)
    research.fundHoldings(instrumentRef)
      .then(resp => {
        if (cancelled) return
        const raw = resp.data as { items?: FundHoldingRow[] } | FundHoldingRow[] | null | undefined
        setHoldings(Array.isArray(raw) ? raw : (raw?.items ?? []))
      })
      .catch(() => {
        if (!cancelled) setHoldings([])
      })
      .finally(() => {
        if (!cancelled) setHoldingsLoading(false)
      })
    return () => { cancelled = true }
  }, [instrumentRef, tab])

  const displayName = resolveDisplayStockName(stockCode ?? '', profile?.name, stock?.name)
  const unitNav = profile?.unitNav
  const changePct = profile?.changePct

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <div className={s.titleMain}>
            <span className={s.name}>{displayName}</span>
            <span className={s.code}>{displayCode}</span>
          </div>
          <span className={s.badge}>公募基金</span>
        </div>
        {loading ? (
          <Spinner size="tiny" label="正在获取基金净值..." />
        ) : error ? (
          <Text size={200}>{error}</Text>
        ) : (
          <>
            <div className={s.quoteMain}>
              <span className={s.price}>{formatPrice(unitNav)}</span>
              <span className={mergeClasses(s.change, pctTone(changePct))}>
                {formatPct(changePct)}
              </span>
            </div>
            {profile?.navDate ? (
              <span className={s.meta}>净值截至 {profile.navDate}</span>
            ) : null}
          </>
        )}
      </div>
      <TabList
        className={s.tabList}
        selectedValue={tab}
        onTabSelect={(_, d) => setTab((d.value as FundTab) ?? 'overview')}
        size="small"
      >
        <Tab value="overview">概览</Tab>
        <Tab value="chart">走势</Tab>
        <Tab value="nav">净值</Tab>
        <Tab value="holdings">持仓</Tab>
      </TabList>
      <div className={s.body}>
        {tab === 'overview' && profile ? (
          <div className={s.section}>
            <div className={s.grid}>
              <div>
                <div className={s.label}>基金类型</div>
                <div className={s.value}>{profile.fundType ?? '—'}</div>
              </div>
              <div>
                <div className={s.label}>基金经理</div>
                <div className={s.value}>{profile.manager ?? '—'}</div>
              </div>
              <div>
                <div className={s.label}>基金公司</div>
                <div className={s.value}>{profile.company ?? '—'}</div>
              </div>
              <div>
                <div className={s.label}>基金规模</div>
                <div className={s.value}>
                  {profile.scale != null ? `${formatCompactNumber(profile.scale)} 亿` : '—'}
                </div>
              </div>
              <div>
                <div className={s.label}>累计净值</div>
                <div className={s.value}>{formatPrice(profile.accNav)}</div>
              </div>
              <div>
                <div className={s.label}>业绩基准</div>
                <div className={s.value}>{profile.benchmark ?? '—'}</div>
              </div>
            </div>
          </div>
        ) : null}
        {tab === 'chart' ? (
          navLoading ? (
            <div className={s.center}><Spinner size="small" label="正在加载净值走势..." /></div>
          ) : navRows.length ? (
            <div className={s.list}>
              <Text size={200} className={s.meta}>公募基金按交易日公布净值，以下为近期走势</Text>
              {navRows.slice(0, 60).map((row, index) => (
                <div key={listRowKey(index, row.date, row.nav)} className={s.row}>
                  <span>{row.date}</span>
                  <span>{formatPrice(row.nav)}</span>
                  <span className={pctTone(row.changePct)}>{formatPct(row.changePct)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.center}>暂时无法加载净值走势，请稍后再试</div>
          )
        ) : null}
        {tab === 'nav' ? (
          navLoading ? (
            <div className={s.center}><Spinner size="small" label="正在加载净值历史..." /></div>
          ) : navRows.length ? (
            <div className={s.list}>
              {navRows.map((row, index) => (
                <div key={listRowKey(index, row.date, row.nav)} className={s.row}>
                  <span>{row.date}</span>
                  <span>{formatPrice(row.nav)}</span>
                  <span className={pctTone(row.changePct)}>{formatPct(row.changePct)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.center}>还没有净值记录，稍后再来看看</div>
          )
        ) : null}
        {tab === 'holdings' ? (
          holdingsLoading ? (
            <div className={s.center}><Spinner size="small" label="正在加载持仓..." /></div>
          ) : holdings.length ? (
            <div className={s.list}>
              {holdings.map((row, index) => (
                <div key={listRowKey(index, row.reportDate, row.holdingSymbol)} className={s.row}>
                  <span>{row.holdingName ?? row.holdingSymbol}</span>
                  <span>{row.weight != null ? `${row.weight.toFixed(2)}%` : '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.center}>暂无重仓披露，请查看季报更新后再来</div>
          )
        ) : null}
      </div>
    </div>
  )
}
