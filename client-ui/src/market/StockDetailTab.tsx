import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Spinner, Text, Badge, makeStyles, mergeClasses } from '@fluentui/react-components'
import { EditRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import type { StockDetailData, WatchlistItem } from '../types/market'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
  formatSignedNumber,
  formatVolume,
  pctTone,
} from './format'
import TradingViewChart from './TradingViewChart'
import {
  normalizeWatchlistItem,
  resolveWatchlistInstrument,
  watchlistItemKey,
} from './instrument'
import type { HoldingSnapshot } from './useFollowPortfolio'
import type { StockDiscussPayload } from './StockDecisionCard'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const CONTENT_PAD = '15px'
const DETAIL_FOOTNOTE = '行情约每 1–2 分钟刷新；公司资料、财务与新闻请通过助手查询。'

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
    flex: 1,
    minHeight: 0,
    padding: `4px ${CONTENT_PAD} 8px`,
    overflowY: 'auto',
    overflowX: 'hidden',
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
  isHolding?: boolean
  holding?: HoldingSnapshot | null
  onManage?: () => void
  onDiscussInChat?: (payload: StockDiscussPayload) => void
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

function StockDetailTab({
  stock,
  isHolding = false,
  onManage,
}: Props) {
  const s = useStyles()
  const [detail, setDetail] = useState<StockDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailReload, setDetailReload] = useState(0)
  const stockRef = useRef(stock)
  stockRef.current = stock
  const stockKey = useMemo(
    () => (stock ? watchlistItemKey(normalizeWatchlistItem(stock)) : null),
    [stock],
  )
  const chartInstrument = useMemo(
    () => (stock ? resolveWatchlistInstrument(stock) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by stockKey
    [stockKey],
  )

  useEffect(() => {
    if (!stockKey) {
      setDetail(null)
      setError('')
      return undefined
    }

    const current = stockRef.current
    if (!current) {
      setDetail(null)
      setError('')
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const ref = resolveWatchlistInstrument(current)
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
  }, [stockKey, detailReload])

  useEffect(() => {
    if (!stockKey) return undefined
    const timer = window.setInterval(() => setDetailReload(n => n + 1), 90_000)
    return () => window.clearInterval(timer)
  }, [stockKey])

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
  const displayName = detail.name && detail.name !== detail.code
    ? detail.name
    : (stock.name && stock.name !== stock.code ? stock.name : detail.code)
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

      <div className={s.chartBody}>
        <div className={s.chartPanel}>
          <TradingViewChart
            code={detail.code}
            instrument={chartInstrument}
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

export default memo(StockDetailTab)
