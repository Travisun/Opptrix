import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Input,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { DismissRegular, SearchRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import type { MarketQuote, WatchlistItem } from '../types/market'
import { formatPct, formatPrice, normalizeCode, pctTone } from './format'
import { innoTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  searchRow: {
    padding: '10px 12px 8px',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    borderBottom: `1px solid ${innoTokens.separator}`,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
  },
  results: {
    borderBottom: `1px solid ${innoTokens.separator}`,
    maxHeight: '160px',
    overflowY: 'auto',
  },
  resultItem: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    textAlign: 'left',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: innoTokens.accentSoft,
    },
  },
  resultMeta: {
    fontSize: '11px',
    color: innoTokens.textTertiary,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '4px 8px',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: `1px solid ${innoTokens.separator}`,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    width: '100%',
    boxSizing: 'border-box',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: innoTokens.accentSoft,
    },
  },
  rowActive: {
    backgroundColor: innoTokens.accentSoft,
  },
  nameLine: {
    fontSize: '13px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  codeLine: {
    fontSize: '11px',
    color: innoTokens.textTertiary,
    textAlign: 'left',
  },
  priceCol: {
    textAlign: 'right',
    minWidth: '64px',
  },
  price: {
    fontSize: '13px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pct: {
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: '#FF3B30' },
  pctDown: { color: '#34C759' },
  pctFlat: { color: innoTokens.textTertiary },
  empty: {
    padding: '24px 16px',
    textAlign: 'center',
    fontSize: '12px',
    color: innoTokens.textTertiary,
  },
  footer: {
    padding: '8px 12px',
    fontSize: '11px',
    color: innoTokens.textTertiary,
    borderTop: `1px solid ${innoTokens.separator}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  iconBtn: {
    border: 'none',
    background: 'transparent',
    color: innoTokens.textTertiary,
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 0,
    ...ghostInteractive,
  },
})

interface Props {
  items: WatchlistItem[]
  selectedCode?: string | null
  onSelect: (item: WatchlistItem) => void
  onAdd: (item: WatchlistItem) => void
  onRemove: (code: string) => void
}

export default function WatchlistTab({
  items,
  selectedCode,
  onSelect,
  onAdd,
  onRemove,
}: Props) {
  const s = useStyles()
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchHits, setSearchHits] = useState<WatchlistItem[]>([])
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')

  const codes = useMemo(() => items.map(item => item.code), [items])

  const refreshQuotes = useCallback(async () => {
    if (!codes.length) {
      setQuotes({})
      return
    }
    setLoadingQuotes(true)
    try {
      const resp = await research.stockQuotes(codes)
      if (resp.success && resp.data?.quotes) {
        const map: Record<string, MarketQuote> = {}
        for (const q of resp.data.quotes) map[normalizeCode(q.code)] = q
        setQuotes(map)
        setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch {
      /* ignore transient quote errors */
    } finally {
      setLoadingQuotes(false)
    }
  }, [codes])

  useEffect(() => {
    void refreshQuotes()
    const timer = window.setInterval(() => { void refreshQuotes() }, 15000)
    return () => window.clearInterval(timer)
  }, [refreshQuotes])

  useEffect(() => {
    const q = keyword.trim()
    if (q.length < 2) {
      setSearchHits([])
      return undefined
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const resp = await research.searchStocks(q)
        if (cancelled) return
        const hits = (resp.data?.results ?? []).map(row => ({
          code: normalizeCode(row.code),
          name: row.name,
          industry: row.industry,
        }))
        setSearchHits(hits)
      } catch {
        if (!cancelled) setSearchHits([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 280)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [keyword])

  return (
    <div className={s.root}>
      <div className={s.searchRow}>
        <Input
          className={s.searchInput}
          appearance="filled-darker"
          size="small"
          placeholder="搜索代码 / 名称添加自选"
          value={keyword}
          contentBefore={<SearchRegular fontSize={14} />}
          onChange={(_, data) => setKeyword(data.value)}
        />
        {keyword && (
          <button type="button" className={s.iconBtn} aria-label="清除搜索" onClick={() => setKeyword('')}>
            <DismissRegular fontSize={14} />
          </button>
        )}
      </div>

      {keyword.trim().length >= 2 && (
        <div className={mergeClasses(s.results, 'inno-scroll')}>
          {searching && <div className={s.empty}><Spinner size="tiny" /> 搜索中…</div>}
          {!searching && searchHits.length === 0 && <div className={s.empty}>未找到匹配股票</div>}
          {!searching && searchHits.map(hit => (
            <button
              key={hit.code}
              type="button"
              className={s.resultItem}
              onClick={() => {
                onAdd(hit)
                setKeyword('')
                setSearchHits([])
              }}
            >
              <div>
                <Text block>{hit.name}</Text>
                <span className={s.resultMeta}>{hit.code}{hit.industry ? ` · ${hit.industry}` : ''}</span>
              </div>
              <span className={s.resultMeta}>添加</span>
            </button>
          ))}
        </div>
      )}

      <div className={mergeClasses(s.list, 'inno-scroll')}>
        {!items.length && <div className={s.empty}>添加股票开始盯盘</div>}
        {items.map(item => {
          const quote = quotes[item.code]
          const tone = pctTone(quote?.changePct)
          return (
            <div
              key={item.code}
              role="button"
              tabIndex={0}
              className={mergeClasses(s.row, selectedCode === item.code && s.rowActive)}
              onClick={() => onSelect(item)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(item)
                }
              }}
            >
              <div>
                <div className={s.nameLine}>{quote?.name ?? item.name}</div>
                <div className={s.codeLine}>{item.code}{item.industry ? ` · ${item.industry}` : ''}</div>
              </div>
              <div className={s.priceCol}>
                <div className={s.price}>{formatPrice(quote?.price ?? null)}</div>
                <div className={mergeClasses(s.pct, tone === 'up' && s.pctUp, tone === 'down' && s.pctDown, tone === 'flat' && s.pctFlat)}>
                  {formatPct(quote?.changePct ?? null)}
                </div>
              </div>
              <button
                type="button"
                className={s.iconBtn}
                aria-label={`移除 ${item.name}`}
                onClick={e => {
                  e.stopPropagation()
                  onRemove(item.code)
                }}
              >
                <DismissRegular fontSize={12} />
              </button>
            </div>
          )
        })}
      </div>

      <div className={s.footer}>
        <span>{loadingQuotes ? '刷新中…' : updatedAt ? `更新 ${updatedAt}` : '等待行情'}</span>
        <button type="button" className={s.iconBtn} onClick={() => void refreshQuotes()}>刷新</button>
      </div>
    </div>
  )
}
