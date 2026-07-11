import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Input,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { DismissRegular, DeleteRegular, EditRegular, SearchRegular, StarRegular } from '@fluentui/react-icons'
import SidebarListEmpty from './SidebarListEmpty'
import { research } from '../api/client'
import type { MarketQuote, WatchlistItem } from '../types/market'
import { followReturnPct } from './portfolioCalc'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { formatPct, formatPriceForMarket, pctTone, portfolioHoldingsKey, resolveDisplayStockName, hasCjkText } from './format'
import { formatWatchlistRadarLine } from './watchlistRadar'
import type { WatchlistRadarItem } from '../types/schemas'
import { displayCodeFromInstrument, hitToWatchlistItem, instrumentKey, parseInstrumentInput, resolveWatchlistInstrument, normalizeWatchlistItem, watchlistItemKey } from './instrument'
import { hasApplicationCapability } from './capabilities'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive, motion, sidebarItemSelected } from '../theme/mixins'

function stopRowActionPointer(e: React.MouseEvent | React.PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
}

/** Text aligns with search field; item hover bg sits ITEM_BG_INSET from panel edges */
const CONTENT_PAD = '15px'
const ITEM_BG_INSET = '10px'
const ITEM_INNER_PAD = '10px'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  searchRow: {
    padding: `8px ${CONTENT_PAD} 6px`,
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
  },
  results: {
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    maxHeight: '140px',
    overflowY: 'auto',
    padding: `4px ${ITEM_BG_INSET}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minHeight: '88px',
  },
  resultItem: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: `6px ${ITEM_INNER_PAD}`,
    minHeight: '30px',
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  resultMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `10px ${ITEM_BG_INSET} 0`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  listCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: '10px',
  },
  resultsCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: `6px ${ITEM_INNER_PAD}`,
    minHeight: '34px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    width: '100%',
    boxSizing: 'border-box',
    color: opptrixCssVars.textPrimary,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':focus-within': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  rowActive: {
    ...sidebarItemSelected,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':focus-within': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  rowTitle: {
    fontSize: '13px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  rowNote: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowRadar: {
    fontSize: '9px',
    color: opptrixCssVars.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
  },
  holdBadge: {
    flexShrink: 0,
  },
  rowTrailing: {
    position: 'relative',
    flexShrink: 0,
    width: '112px',
    minHeight: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  rowQuote: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '1px',
    transitionProperty: 'opacity',
    transitionDuration: motion.fast,
    '@media (hover: none)': {
      display: 'none',
    },
  },
  quotePrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    lineHeight: 1.1,
  },
  quoteSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '9px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    lineHeight: 1.1,
  },
  metricPrice: {
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
  },
  retLabel: {
    color: opptrixCssVars.textTertiary,
    fontWeight: 500,
  },
  pctUp: { color: MARKET_UP, fontWeight: 600 },
  pctDown: { color: MARKET_DOWN, fontWeight: 600 },
  pctFlat: { color: opptrixCssVars.textTertiary },
  rowActions: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.fast,
    '@media (hover: none)': {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
  rowActionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    lineHeight: 0,
    flexShrink: 0,
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
      color: opptrixCssVars.textPrimary,
    },
  },
  empty: {
    padding: `12px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  footer: {
    padding: `6px ${CONTENT_PAD}`,
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexShrink: 0,
  },
  iconBtn: {
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 0,
    ...ghostInteractive,
  },
})

interface Props {
  active?: boolean
  items: WatchlistItem[]
  selectedCode?: string | null
  holdingsByCode: Record<string, HoldingSnapshot>
  onSelect: (item: WatchlistItem) => void
  onManage: (item: WatchlistItem) => void
  onAdd: (item: WatchlistItem, opts?: { addedPrice?: number | null }) => void
  onRemove: (item: WatchlistItem) => void
  onPatchItem: (code: string, patch: Partial<WatchlistItem>) => void
}

export default function WatchlistTab({
  active = true,
  items,
  selectedCode,
  holdingsByCode,
  onSelect,
  onManage,
  onAdd,
  onRemove,
  onPatchItem,
}: Props) {
  const s = useStyles()
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchHits, setSearchHits] = useState<WatchlistItem[]>([])
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [radar, setRadar] = useState<Record<string, WatchlistRadarItem>>({})
  const [strategyByCode, setStrategyByCode] = useState<Record<string, string>>({})
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')
  const patchedRef = useRef<Set<string>>(new Set())

  const refreshQuotes = useCallback(async () => {
    if (!items.length) {
      setQuotes({})
      return
    }
    setLoadingQuotes(true)
    try {
      const instruments = items.map(resolveWatchlistInstrument)
      const resp = await research.instrumentQuotes(instruments)
      if (resp.success && resp.data?.quotes) {
        const map: Record<string, MarketQuote> = {}
        for (const q of resp.data.quotes) {
          const itemRef = q.instrument ?? resolveWatchlistInstrument({
            code: q.code,
            name: q.name,
          })
          const code = displayCodeFromInstrument(itemRef)
          const rowKey = watchlistItemKey({ code, name: q.name, instrument: itemRef })
          const quote: MarketQuote = {
            code,
            name: q.name ?? code,
            price: q.price ?? null,
            changePct: q.change_pct ?? null,
            pe: q.pe ?? null,
            pb: q.pb ?? null,
            turnoverRate: q.turnover_rate ?? null,
            volume: q.volume ?? null,
            amount: q.amount ?? null,
          }
          map[code] = quote
          map[rowKey] = quote
          map[instrumentKey(itemRef)] = quote
        }
        setQuotes(map)
        setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch {
      /* ignore transient quote errors */
    } finally {
      setLoadingQuotes(false)
    }
  }, [items])

  const refreshRadar = useCallback(async () => {
    const cnItems = items.filter(item => {
      const ref = resolveWatchlistInstrument(item)
      return ref.market === 'CN' && hasApplicationCapability(ref, 'scorecard')
    })
    if (!cnItems.length) {
      setRadar({})
      return
    }
    const cnCodes = cnItems.map(item => instrumentKey(resolveWatchlistInstrument(item)))
    try {
      const resp = await research.watchlistRadar(cnCodes)
      if (resp.success && resp.data?.items) {
        const map: Record<string, WatchlistRadarItem> = {}
        for (const row of resp.data.items) {
          const rowKey = instrumentKey(parseInstrumentInput(row.code))
          const matchItem = cnItems.find(item => instrumentKey(resolveWatchlistInstrument(item)) === rowKey)
          if (matchItem) {
            map[watchlistItemKey(matchItem)] = row
            map[matchItem.code] = row
          }
          map[rowKey] = row
        }
        setRadar(map)
      }
    } catch {
      /* ignore transient radar errors */
    }
  }, [items])

  useEffect(() => {
    if (!active) return undefined
    void refreshRadar()
    const timer = window.setInterval(() => { void refreshRadar() }, 60000)
    return () => window.clearInterval(timer)
  }, [refreshRadar, active])

  useEffect(() => {
    if (!active || !selectedCode) return undefined
    const item = items.find(row => row.code === selectedCode || watchlistItemKey(row) === selectedCode)
    if (!item) return undefined
    const ref = resolveWatchlistInstrument(item)
    if (!hasApplicationCapability(ref, 'strategy_signal')) return undefined
    const key = item.code
    let cancelled = false
    void research.strategySignals(ref).then(resp => {
      if (cancelled || !resp.success || !resp.data?.summary) return
      setStrategyByCode(prev => (
        prev[key] ? prev : { ...prev, [key]: resp.data!.summary }
      ))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [active, selectedCode, items])

  useEffect(() => {
    if (!active) return undefined
    void refreshQuotes()
    const timer = window.setInterval(() => { void refreshQuotes() }, 15000)
    return () => window.clearInterval(timer)
  }, [refreshQuotes, active])

  useEffect(() => {
    for (const item of items) {
      if (item.addedPrice != null || patchedRef.current.has(item.code)) continue
      const price = quotes[item.code]?.price ?? quotes[watchlistItemKey(item)]?.price
      if (price == null) continue
      patchedRef.current.add(item.code)
      onPatchItem(item.code, {
        addedPrice: price,
        addedAt: item.addedAt ?? new Date().toISOString(),
      })
    }
  }, [items, quotes, onPatchItem])

  useEffect(() => {
    for (const item of items) {
      const qName = quotes[item.code]?.name ?? quotes[watchlistItemKey(item)]?.name
      const itemKey = watchlistItemKey(item)
      const rName = radar[itemKey]?.name ?? radar[instrumentKey(resolveWatchlistInstrument(item))]?.name
      const resolved = resolveDisplayStockName(item.code, qName, rName, item.name)
      if (resolved === item.name) continue
      if (!item.name || item.name === item.code || !hasCjkText(item.name)) {
        onPatchItem(item.code, { name: resolved })
      }
    }
  }, [items, quotes, radar, onPatchItem])

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
        const resp = await research.searchInstruments(q, 20)
        if (cancelled) return
        const hits = (resp.data?.items ?? []).map(hitToWatchlistItem)
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

  const holdingCount = useMemo(
    () => items.filter(item => {
      const ref = resolveWatchlistInstrument(item)
      return (holdingsByCode[portfolioHoldingsKey(item.code, ref.market)]?.shares ?? 0) > 0
    }).length,
    [items, holdingsByCode],
  )

  return (
    <div className={s.root}>
      <div className={s.searchRow}>
        <Input
          className={s.searchInput}
          appearance="filled-darker"
          size="small"
          placeholder="搜索股票名称或代码"
          value={keyword}
          onChange={(_, data) => setKeyword(data.value)}
          contentBefore={<SearchRegular fontSize={14} />}
        />
        {keyword && (
          <button type="button" className={s.iconBtn} aria-label="清除搜索" onClick={() => setKeyword('')}>
            <DismissRegular fontSize={14} />
          </button>
        )}
      </div>

      {keyword.trim().length >= 2 && (
        <div className={mergeClasses(s.results, 'opptrix-scroll', !searching && searchHits.length === 0 && s.resultsCentered)}>
          {searching && (
            <div className={s.empty}>
              <Spinner size="tiny" />
              正在搜索…
            </div>
          )}
          {!searching && searchHits.length === 0 && (
            <SidebarListEmpty
              compact
              icon={<SearchRegular />}
              title="没找到匹配的股票"
              hint="试试输入完整代码，或换一个字再搜"
            />
          )}
          {!searching && searchHits.map(hit => (
            <button
              key={hit.code}
              type="button"
              className={s.resultItem}
              onClick={async () => {
                let addedPrice: number | null = null
                try {
                  const ref = resolveWatchlistInstrument(hit)
                  if (hasApplicationCapability(ref, 'batch_quote')) {
                    const q = await research.instrumentQuotes([ref])
                    addedPrice = q.data?.quotes?.[0]?.price ?? null
                  }
                } catch { /* ignore */ }
                onAdd(hit, { addedPrice })
                setKeyword('')
                setSearchHits([])
              }}
            >
              <div>
                <Text block style={{ fontSize: '13px', fontWeight: 500 }}>{hit.name}</Text>
                <span className={s.resultMeta}>{hit.code}{hit.industry ? ` · ${hit.industry}` : ''}</span>
              </div>
              <span className={s.resultMeta}>添加</span>
            </button>
          ))}
        </div>
      )}

      <div className={mergeClasses(s.list, 'opptrix-scroll', 'opptrix-scroll-hover', !items.length && s.listCentered)}>
        {!items.length && (
          <SidebarListEmpty
            icon={<StarRegular />}
            title="还没有关注的股票"
            hint="在上方搜索并添加后，会在这里显示行情与涨跌"
          />
        )}
        {items.map(item => {
          const ref = resolveWatchlistInstrument(item)
          const quote = quotes[item.code] ?? quotes[watchlistItemKey(item)]
          const holding = holdingsByCode[portfolioHoldingsKey(item.code, ref.market)]
          const isHolding = (holding?.shares ?? 0) > 0
          const holdPct = holding?.totalPnlPct ?? holding?.unrealizedPnlPct
          const followPct = followReturnPct(quote?.price, item.addedPrice)
          const holdTone = pctTone(holdPct)
          const followTone = pctTone(followPct)
          const dayTone = pctTone(quote?.changePct)
          const showHoldReturn = isHolding && holdPct != null
          const secondaryPct = showHoldReturn ? holdPct : followPct
          const secondaryTone = showHoldReturn ? holdTone : followTone
          const secondaryLabel = showHoldReturn ? '持' : '关'
          const hasSecondary = secondaryPct != null
          const radarRow = ref.market === 'CN' ? radar[instrumentKey(ref)] : undefined
          const radarLine = formatWatchlistRadarLine(
            item,
            radarRow,
            selectedCode === item.code ? strategyByCode[item.code] : null,
          )

          return (
            <div
              key={item.code}
              className={mergeClasses(
                s.row,
                'opptrix-follow-item',
                'opptrix-focusable',
                selectedCode === item.code && s.rowActive,
              )}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(item)
                }
              }}
            >
              <div className={s.rowBody}>
                <span className={s.rowTitle}>
                  {resolveDisplayStockName(item.code, quote?.name, radarRow?.name, item.name)}
                  {isHolding && (
                    <Badge className={s.holdBadge} size="small" color="informative" appearance="outline">持有</Badge>
                  )}
                </span>
                {(item.note || item.code) && (
                  <span className={s.rowNote}>
                    {item.code}
                    {item.note ? ` · ${item.note}` : ''}
                  </span>
                )}
                {radarLine && (
                  <span className={s.rowRadar}>{radarLine}</span>
                )}
              </div>

              <div
                className={s.rowTrailing}
                onPointerDown={stopRowActionPointer}
                onMouseDown={stopRowActionPointer}
                onClick={stopRowActionPointer}
              >
                <div className={mergeClasses(s.rowQuote, 'opptrix-follow-quote')}>
                  <span className={s.quotePrimary}>
                    <span className={s.metricPrice}>{formatPriceForMarket(ref.market, quote?.price ?? null)}</span>
                    <span className={mergeClasses(dayTone === 'up' && s.pctUp, dayTone === 'down' && s.pctDown, dayTone === 'flat' && s.pctFlat)}>
                      {formatPct(quote?.changePct ?? null, 1)}
                    </span>
                  </span>
                  {hasSecondary && (
                    <span className={s.quoteSecondary}>
                      <span className={mergeClasses(secondaryTone === 'up' && s.pctUp, secondaryTone === 'down' && s.pctDown, secondaryTone === 'flat' && s.pctFlat)}>
                        <span className={s.retLabel}>{secondaryLabel}</span>{formatPct(secondaryPct, 1)}
                      </span>
                    </span>
                  )}
                </div>

                <span className={mergeClasses(s.rowActions, 'opptrix-follow-actions')}>
                  <button
                    type="button"
                    className={mergeClasses(s.rowActionBtn, 'opptrix-focusable')}
                    aria-label={`修改 ${item.name}`}
                    onClick={() => onManage(item)}
                  >
                    <EditRegular fontSize={14} />
                  </button>
                  <button
                    type="button"
                    className={mergeClasses(s.rowActionBtn, 'opptrix-focusable')}
                    aria-label={`删除 ${item.name}`}
                    onClick={() => onRemove(item)}
                  >
                    <DeleteRegular fontSize={14} />
                  </button>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className={s.footer}>
        <span>
          {loadingQuotes
            ? '刷新中…'
            : `${items.length} 只关注${holdingCount ? ` · ${holdingCount} 持有` : ''}${updatedAt ? ` · ${updatedAt}` : ''}`}
        </span>
        <button type="button" className={s.iconBtn} onClick={() => void refreshQuotes()}>刷新</button>
      </div>
    </div>
  )
}
