import { useCallback, useEffect, useState } from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import { research } from '../../api/client'
import { formatPct, formatPriceForMarket, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { useWatchlist } from '../../market/useWatchlist'
import {
  displayCodeFromInstrument,
  resolveWatchlistInstrument,
  watchlistItemKey,
} from '../../market/instrument'

const CONTENT_PAD = '8px'

type WatchQuote = {
  key: string
  code: string
  name: string
  market: string
  price: number | null
  changePct: number | null
}

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: `0 ${CONTENT_PAD} 6px`,
  },
  row: {...ghostInteractive,

    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '4px 6px',
    alignItems: 'center',
    padding: '5px 8px',
    minHeight: '26px',
    borderRadius: '6px',
':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowCompact: {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '4px',
    padding: '4px 6px',
    minHeight: '24px',
  },
  rowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  rowTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowTitleCompact: {
    fontSize: 'var(--opptrix-font-sm)',
  },
  rowMeta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowNum: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  rowPct: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    minWidth: '44px',
    whiteSpace: 'nowrap',
  },
  rowPctCompact: {
    fontSize: 'var(--opptrix-font-xs)',
    minWidth: '40px',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  empty: {
    padding: '8px 10px 12px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.45,
  },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

type Props = {
  compact?: boolean
}

export default function MarketWatchlistQuotes({ compact = false }: Props) {
  const s = useStyles()
  const { items } = useWatchlist()
  const [quotes, setQuotes] = useState<WatchQuote[]>([])
  const [loading, setLoading] = useState(false)

  const refreshQuotes = useCallback(async () => {
    if (!items.length) {
      setQuotes([])
      return
    }
    setLoading(true)
    try {
      const instruments = items.map(resolveWatchlistInstrument)
      const resp = await research.instrumentQuotes(instruments)
      if (resp.success && resp.data?.quotes) {
        const byKey = new Map<string, WatchQuote>()
        for (const q of resp.data.quotes) {
          const ref = q.instrument ?? resolveWatchlistInstrument({ code: q.code, name: q.name })
          const code = displayCodeFromInstrument(ref)
          const key = watchlistItemKey({ code, name: q.name, instrument: ref })
          byKey.set(key, {
            key,
            code,
            name: q.name ?? code,
            market: ref.market,
            price: q.price ?? null,
            changePct: q.change_pct ?? null,
          })
        }
        const ordered = items.map(item => {
          const key = watchlistItemKey(item)
          return byKey.get(key) ?? {
            key,
            code: item.code,
            name: item.name ?? item.code,
            market: resolveWatchlistInstrument(item).market,
            price: null,
            changePct: null,
          }
        })
        setQuotes(ordered)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [items])

  useEffect(() => {
    void refreshQuotes()
    const timer = window.setInterval(() => { void refreshQuotes() }, 15000)
    return () => window.clearInterval(timer)
  }, [refreshQuotes])

  if (loading && !quotes.length) {
    return <div className={s.empty}><Spinner size="tiny" label="加载关注列表…" /></div>
  }

  if (!items.length) {
    return <div className={s.empty}>暂无关注，可在侧栏「关注」中添加</div>
  }

  return (
    <div className={s.list}>
      {quotes.map(row => (
        <div key={row.key} className={mergeClasses(s.row, compact && s.rowCompact)}>
          <div className={s.rowBody}>
            <span className={mergeClasses(s.rowTitle, compact && s.rowTitleCompact)}>{row.name}</span>
            <span className={s.rowMeta}>{row.code}</span>
          </div>
          {!compact && (
            <span className={s.rowNum}>
              {formatPriceForMarket(row.market, row.price)}
            </span>
          )}
          <span className={mergeClasses(s.rowPct, compact && s.rowPctCompact, pctClass(s, row.changePct))}>
            {formatPct(row.changePct, 2)}
          </span>
        </div>
      ))}
    </div>
  )
}
