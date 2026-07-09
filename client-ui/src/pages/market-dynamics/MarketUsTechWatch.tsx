import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Spinner,
  Tab,
  TabList,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { DismissRegular, EditRegular, NewsRegular, OpenRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { research } from '../../api/client'
import { formatPct, formatPriceForMarket, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import type { InstrumentRef } from '../../types/instrument'
import {
  DEFAULT_US_TECH_SYMBOLS,
  readUsTechWatch,
  resetUsTechWatch,
  writeUsTechWatch,
  type UsTechSymbol,
} from './usTechWatchStorage'

const CONTENT_PAD = '10px'

type UsQuote = {
  symbol: string
  name: string
  price: number | null
  changePct: number | null
}

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: `2px ${CONTENT_PAD} 12px`,
  },
  listScrollable: {
    paddingBottom: '6px',
  },
  rowQuad: {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '4px',
    padding: '4px 6px',
    minHeight: '24px',
  },
  rowTitleQuad: {
    fontSize: '11px',
  },
  rowPctQuad: {
    fontSize: '10px',
    minWidth: '40px',
  },
  manageRowQuad: {
    padding: `2px ${CONTENT_PAD} 0`,
  },
  manageBtnQuad: {
    fontSize: '10px',
    padding: '2px 4px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '6px 8px',
    alignItems: 'center',
    padding: '6px 8px',
    minHeight: '28px',
    borderRadius: '6px',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  rowTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowNum: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  rowPct: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    minWidth: '52px',
    whiteSpace: 'nowrap',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  manageRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: `4px ${CONTENT_PAD} 2px`,
  },
  manageRowCompact: {
    padding: `0 ${CONTENT_PAD} 2px`,
  },
  manageBtn: {
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    fontWeight: 600,
    padding: '4px 6px',
    borderRadius: '6px',
    ...ghostInteractive,
  },
  iconBox: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    flexShrink: 0,
    lineHeight: 0,
  },
  dialogList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '10px',
  },
  dialogRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '8px',
    backgroundColor: opptrixCssVars.canvasAlt,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  dialogRowBody: { flex: 1, minWidth: 0 },
  searchHits: {
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '160px',
    overflowY: 'auto',
  },
  hitBtn: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    padding: '6px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  empty: {
    padding: '16px 12px',
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
  },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

export function MarketUsTechWatchList({
  compact = false,
  scrollable = false,
  quad = false,
}: {
  compact?: boolean
  scrollable?: boolean
  quad?: boolean
}) {
  const s = useStyles()
  const [symbols, setSymbols] = useState<UsTechSymbol[]>(() => readUsTechWatch())
  const [quotes, setQuotes] = useState<Record<string, UsQuote>>({})
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<UsTechSymbol[]>([])
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<Array<{ symbol: string; name: string }>>([])

  const refreshQuotes = useCallback(async () => {
    if (!symbols.length) {
      setQuotes({})
      return
    }
    setLoading(true)
    try {
      const instruments: InstrumentRef[] = symbols.map(row => ({
        market: 'US',
        assetClass: 'EQUITY',
        symbol: row.symbol,
      }))
      const resp = await research.instrumentQuotes(instruments)
      if (resp.success && resp.data?.quotes) {
        const map: Record<string, UsQuote> = {}
        for (const q of resp.data.quotes) {
          const sym = q.instrument?.symbol ?? q.code
          map[sym] = {
            symbol: sym,
            name: q.name ?? sym,
            price: q.price ?? null,
            changePct: q.change_pct ?? null,
          }
        }
        setQuotes(map)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [symbols])

  useEffect(() => {
    void refreshQuotes()
    const timer = window.setInterval(() => { void refreshQuotes() }, 15000)
    return () => window.clearInterval(timer)
  }, [refreshQuotes])

  useEffect(() => {
    if (!editOpen) return undefined
    const q = keyword.trim()
    if (!q) {
      setHits([])
      return undefined
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const resp = await research.searchInstruments(q, 12)
        if (cancelled) return
        setHits((resp.data?.items ?? [])
          .filter(item => item.instrument.market === 'US')
          .map(item => ({
            symbol: item.instrument.symbol,
            name: item.name ?? item.instrument.symbol,
          })))
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 260)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [keyword, editOpen])

  const saveEdit = () => {
    const next = draft.length ? draft : DEFAULT_US_TECH_SYMBOLS
    setSymbols(next)
    writeUsTechWatch(next)
    setEditOpen(false)
  }

  return (
    <>
      <div className={mergeClasses(s.manageRow, compact && s.manageRowCompact, quad && s.manageRowQuad)}>
        <button
          type="button"
          className={mergeClasses(s.manageBtn, quad && s.manageBtnQuad)}
          onClick={() => {
            setDraft([...symbols])
            setKeyword('')
            setHits([])
            setEditOpen(true)
          }}
        >
          <span className={s.iconBox}><EditRegular fontSize={quad ? 14 : 16} /></span>
          {quad ? '管理' : '管理列表'}
        </button>
      </div>
      <div className={mergeClasses(s.list, scrollable && s.listScrollable)}>
        {loading && !Object.keys(quotes).length && (
          <div className={s.empty}><Spinner size="tiny" label="加载报价…" /></div>
        )}
        {symbols.map(row => {
          const q = quotes[row.symbol]
          return (
            <div key={row.symbol} className={mergeClasses(s.row, quad && s.rowQuad)}>
              <div className={s.rowBody}>
                <span className={mergeClasses(s.rowTitle, quad && s.rowTitleQuad)}>{row.symbol}</span>
                <span className={s.rowMeta}>{q?.name ?? row.name}</span>
              </div>
              {!quad && (
                <span className={s.rowNum}>{formatPriceForMarket('US', q?.price ?? null)}</span>
              )}
              <span className={mergeClasses(s.rowPct, quad && s.rowPctQuad, pctClass(s, q?.changePct))}>
                {formatPct(q?.changePct ?? null, 2)}
              </span>
            </div>
          )
        })}
      </div>

      <Dialog open={editOpen} onOpenChange={(_, data) => setEditOpen(data.open)}>
        <DialogSurface className="opptrix-dialog-surface">
          <DialogBody>
            <DialogTitle>管理美股列表</DialogTitle>
            <DialogContent>
              <Input
                appearance="filled-darker"
                size="small"
                placeholder="搜索美股，如 AAPL"
                value={keyword}
                onChange={(_, data) => setKeyword(data.value)}
                contentAfter={searching ? <Spinner size="tiny" /> : undefined}
              />
              <div className={mergeClasses(s.searchHits, 'opptrix-scroll')}>
                {hits.map(hit => (
                  <button
                    key={hit.symbol}
                    type="button"
                    className={s.hitBtn}
                    onClick={() => {
                      if (draft.some(row => row.symbol === hit.symbol)) return
                      setDraft(prev => [...prev, hit])
                      setKeyword('')
                      setHits([])
                    }}
                  >
                    <Text block style={{ fontSize: 13, fontWeight: 500 }}>{hit.name}</Text>
                    <Text block style={{ fontSize: 11, color: opptrixCssVars.textTertiary }}>{hit.symbol}</Text>
                  </button>
                ))}
              </div>
              <div className={s.dialogList}>
                {draft.map(row => (
                  <div key={row.symbol} className={s.dialogRow}>
                    <div className={s.dialogRowBody}>
                      <Text block style={{ fontSize: 13, fontWeight: 600 }}>{row.symbol}</Text>
                      <Text block style={{ fontSize: 11, color: opptrixCssVars.textTertiary }}>{row.name}</Text>
                    </div>
                    <button
                      type="button"
                      className={s.manageBtn}
                      aria-label={`移除 ${row.symbol}`}
                      onClick={() => setDraft(prev => prev.filter(x => x.symbol !== row.symbol))}
                    >
                      <span className={s.iconBox}><DismissRegular fontSize={16} /></span>
                    </button>
                  </div>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <OpptrixButton variant="secondary" onClick={() => setDraft([...resetUsTechWatch()])}>
                恢复默认
              </OpptrixButton>
              <OpptrixButton variant="secondary" onClick={() => setEditOpen(false)}>取消</OpptrixButton>
              <OpptrixButton variant="primary" onClick={saveEdit}>保存</OpptrixButton>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}
