import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { research } from '../api/client'
import type { StockDetailData, WatchlistItem } from '../types/market'
import {
  normalizeWatchlistItem,
  resolveWatchlistInstrument,
  watchlistItemKey,
  UNRESOLVED_INSTRUMENT_COPY,
} from './instrument'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
  formatSignedNumber,
  formatVolume,
  pctTone,
  resolveDisplayStockName,
} from './format'
import TradingViewChart from './TradingViewChart'
import { DETAIL_PANEL_CHART_MAX_HEIGHT_PX } from './chartViewConfig'
import { WATCHLIST_QUOTES_POLL_MS } from './watchlistQuotes'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const CONTENT_PAD = '15px'
const DETAIL_FOOTNOTE = '指数行情约每 1 分钟刷新；成分与权重请通过助手查询。'

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
  chartBody: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  chartPanel: {
    flexShrink: 0,
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX}px`,
    minHeight: '200px',
    padding: `4px ${CONTENT_PAD} 8px`,
    overflow: 'hidden',
  },
  foot: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD} 10px`,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
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
  error: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD}`,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.error,
  },
})

interface Props {
  stock: WatchlistItem | null
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

function IndexDetailTab({ stock }: Props) {
  const s = useStyles()
  const [detail, setDetail] = useState<StockDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailReload, setDetailReload] = useState(0)
  const stockRef = useRef(stock)
  stockRef.current = stock

  const normalizedStock = useMemo(
    () => (stock ? normalizeWatchlistItem(stock) : null),
    [stock],
  )
  const stockKey = useMemo(
    () => (normalizedStock ? watchlistItemKey(normalizedStock) : null),
    [normalizedStock],
  )
  const instrumentRef = useMemo(
    () => (normalizedStock ? resolveWatchlistInstrument(normalizedStock) ?? undefined : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by stockKey
    [stockKey],
  )
  const displayCode = stock?.code?.trim() ?? ''

  useEffect(() => {
    if (!stockKey || !instrumentRef) {
      setDetail(null)
      setError(instrumentRef ? '' : UNRESOLVED_INSTRUMENT_COPY.hint)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError('')

    research.stockDetail(instrumentRef)
      .then(resp => {
        if (cancelled) return
        if (!resp.success || !resp.data) {
          setError(resp.message || '暂时无法加载指数行情，请稍后再试')
          setDetail(null)
          return
        }
        setDetail(resp.data)
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '暂时无法加载指数行情，请稍后再试')
          setDetail(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [stockKey, instrumentRef, detailReload])

  useEffect(() => {
    if (!stockKey) return undefined
    const timer = window.setInterval(() => setDetailReload(n => n + 1), WATCHLIST_QUOTES_POLL_MS)
    return () => window.clearInterval(timer)
  }, [stockKey])

  if (!stock) {
    return <div className={s.center}>请在「关注」中选择一条指数</div>
  }

  if (loading && !detail) {
    const pendingName = normalizedStock?.name && normalizedStock.name !== normalizedStock.code
      ? normalizedStock.name
      : displayCode
    return (
      <div className={s.root}>
        <div className={s.hero}>
          <div className={s.titleRow}>
            <div className={s.titleMain}>
              <Text className={s.name}>{pendingName}</Text>
              <span className={s.code}>{displayCode}</span>
              <span className={s.badge}>指数</span>
            </div>
          </div>
        </div>
        <div className={s.center}><Spinner size="small" label="正在加载指数行情…" /></div>
      </div>
    )
  }

  if (error && !detail) {
    return <div className={s.center}>{error}</div>
  }

  if (!detail || !instrumentRef) {
    return <div className={s.center}>暂时无法显示该指数</div>
  }

  const quote = detail.quote
  const displayName = resolveDisplayStockName(
    instrumentRef.symbol,
    quote?.name,
    detail.name,
    normalizedStock?.name,
  )
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
            <span className={s.code}>{displayCode}</span>
            <span className={s.badge}>指数</span>
          </div>
          <div className={s.quoteMain}>
            <span className={mergeClasses(s.price, toneClass)}>
              {formatPrice(quote?.price ?? null, 2)}
            </span>
            <span className={mergeClasses(s.change, toneClass)}>
              {formatSignedNumber(quote?.change ?? null, 2)}
            </span>
            <span className={mergeClasses(s.pct, toneClass)}>
              {formatPct(quote?.changePct ?? null)}
            </span>
          </div>
        </div>
        <div className={s.heroGrid}>
          <HeroCell label="今开" value={formatPrice(quote?.open ?? null, 2)} />
          <HeroCell label="最高" value={formatPrice(quote?.high ?? null, 2)} />
          <HeroCell label="最低" value={formatPrice(quote?.low ?? null, 2)} />
          <HeroCell label="昨收" value={formatPrice(quote?.preClose ?? null, 2)} />
          <HeroCell label="成交量" value={formatVolume(quote?.volume ?? null)} />
          <HeroCell label="成交额" value={formatCompactNumber(quote?.amount ?? null)} />
          <HeroCell
            label="振幅"
            value={quote?.amplitude != null ? `${quote.amplitude.toFixed(2)}%` : '—'}
          />
          <HeroCell label="涨跌额" value={formatSignedNumber(quote?.change ?? null, 2)} />
        </div>
      </div>

      <div className={s.chartBody}>
        <div className={s.chartPanel}>
          <TradingViewChart
            code={instrumentRef.symbol}
            instrument={instrumentRef}
            chartVariant="index"
            expanded
            active
          />
        </div>
        {error ? <Text className={s.error}>刷新失败：{error}</Text> : null}
        <Text className={s.foot}>{DETAIL_FOOTNOTE}</Text>
      </div>
    </div>
  )
}

export default memo(IndexDetailTab)
