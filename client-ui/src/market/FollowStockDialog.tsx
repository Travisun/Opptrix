import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Input,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import type { WatchlistItem } from '../types/market'
import type { PortfolioTradeItem } from '../types/schemas'
import { formatCompactNumber, formatPct, formatPrice, normalizeCode, pctTone } from './format'
import {
  calcHoldingFromTrades,
  estimateTradeAmount,
  estimateTradeFees,
  followReturnPct,
} from './portfolioCalc'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'
import TradeDateField, { todayTradeDate } from './TradeDateField'
import { opptrixTokens } from '../theme/tokens'
import { ghostInteractive, motion, nativeIconInteractive } from '../theme/mixins'

type DialogTab = 'records' | 'trade'

const DRAWER_CLOSE_MS = 220
const DRAWER_MAX_WIDTH = 440
const NOTE_SAVE_DEBOUNCE_MS = 400

const useStyles = makeStyles({
  scrim: {
    position: 'absolute',
    inset: 0,
    zIndex: 29,
    border: 'none',
    padding: 0,
    margin: 0,
    backgroundColor: 'rgba(29, 29, 31, 0.05)',
    cursor: 'default',
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.ease,
  },
  scrimOpen: {
    opacity: 1,
    pointerEvents: 'auto',
  },
  drawerAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    padding: 0,
    boxSizing: 'border-box',
  },
  drawer: {
    width: '100%',
    maxWidth: `${DRAWER_MAX_WIDTH}px`,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'min(78%, 520px)',
    borderRadius: `${opptrixTokens.radiusXl} ${opptrixTokens.radiusXl} 0 0`,
    borderTop: '1px solid rgba(255, 255, 255, 0.55)',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.08)',
    transform: 'translateY(100%)',
    transitionProperty: 'transform',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easeOut,
    pointerEvents: 'auto',
  },
  drawerOpen: {
    transform: 'translateY(0)',
  },
  handle: {
    width: '32px',
    height: '4px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixTokens.borderStrong,
    margin: '8px auto 0',
    flexShrink: 0,
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '6px 15px 8px',
    flexShrink: 0,
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    fontSize: '14px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
  },
  sub: {
    fontSize: '11px',
    fontWeight: 500,
    color: opptrixTokens.textTertiary,
  },
  closeBtn: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
    padding: 0,
    margin: 0,
    borderRadius: opptrixTokens.radiusFull,
    lineHeight: 0,
    flexShrink: 0,
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
      color: opptrixTokens.textPrimary,
    },
  },
  drawerBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 15px 12px',
  },
  contentStack: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflow: 'hidden',
  },
  metrics: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    flexShrink: 0,
  },
  metric: {
    padding: '4px 7px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    minWidth: '64px',
  },
  metricLabel: {
    fontSize: '9px',
    color: opptrixTokens.textTertiary,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  metricValue: {
    fontSize: '11px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixTokens.textPrimary,
    lineHeight: 1.35,
  },
  fieldBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flexShrink: 0,
  },
  fieldLabel: {
    fontSize: '10px',
    fontWeight: 650,
    color: opptrixTokens.textTertiary,
    letterSpacing: '0.04em',
  },
  tabRow: {
    display: 'inline-flex',
    gap: '2px',
    padding: '2px',
    borderRadius: opptrixTokens.radiusXl,
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    width: 'fit-content',
    flexShrink: 0,
  },
  tabBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixTokens.textSecondary,
    fontSize: '11px',
    fontWeight: 500,
    padding: '0 10px',
    height: '26px',
    borderRadius: opptrixTokens.radiusFull,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
      color: opptrixTokens.textPrimary,
    },
  },
  tabBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    color: opptrixTokens.textPrimary,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minHeight: 0,
  },
  panelTrade: {
    flexShrink: 0,
    minHeight: '168px',
  },
  panelRecords: {
    flexShrink: 0,
  },
  recordsScroll: {
    maxHeight: '250px',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    display: 'flex',
    flexDirection: 'column',
  },
  tradeForm: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
  },
  tradeSideRow: {
    gridColumn: '1 / -1',
    display: 'flex',
    gap: '4px',
  },
  sideBtn: {
    flex: 1,
    minHeight: '26px',
    borderRadius: opptrixTokens.radiusFull,
    border: 'none',
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.1)',
    },
  },
  sideBtnBuy: {
    backgroundColor: 'rgba(255, 59, 48, 0.14)',
    color: MARKET_UP,
  },
  sideBtnSell: {
    backgroundColor: 'rgba(52, 199, 89, 0.14)',
    color: MARKET_DOWN,
  },
  glassInput: {
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    borderRadius: opptrixTokens.radiusMd,
  },
  feeHint: {
    gridColumn: '1 / -1',
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.35,
  },
  tradeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  tradeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 7px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    fontSize: '11px',
  },
  tradeMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  tradeDelete: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: opptrixTokens.radiusFull,
    color: opptrixTokens.textTertiary,
    lineHeight: 0,
    flexShrink: 0,
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
      color: opptrixTokens.textPrimary,
    },
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  emptyTrades: {
    fontSize: '11px',
    color: opptrixTokens.textTertiary,
    padding: '10px 2px',
    textAlign: 'center',
  },
  noteArea: {
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    borderRadius: opptrixTokens.radiusMd,
    minHeight: '52px',
  },
})

interface Props {
  open: boolean
  stock: WatchlistItem | null
  currentPrice: number | null
  holding?: HoldingSnapshot | null
  onClose: () => void
  onSaveNote: (code: string, note: string) => void
  loadTrades: (code: string) => Promise<PortfolioTradeItem[]>
  submitTrade: (payload: {
    code: string
    shares: number
    price: number
    side: 'buy' | 'sell'
    date?: string
  }) => Promise<PortfolioTradeItem[]>
  deleteTrade: (id: number, code: string) => Promise<PortfolioTradeItem[]>
}

export default function FollowStockDialog({
  open,
  stock,
  currentPrice,
  holding,
  onClose,
  onSaveNote,
  loadTrades,
  submitTrade,
  deleteTrade,
}: Props) {
  const s = useStyles()
  const closingRef = useRef(false)
  const lastSavedNoteRef = useRef('')
  const [presented, setPresented] = useState(false)
  const [note, setNote] = useState('')
  const [dialogTab, setDialogTab] = useState<DialogTab>('trade')
  const [trades, setTrades] = useState<PortfolioTradeItem[]>([])
  const [loadingTrades, setLoadingTrades] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tradeForm, setTradeForm] = useState({
    side: 'buy' as 'buy' | 'sell',
    shares: '',
    price: '',
    date: '',
  })

  const code = stock ? normalizeCode(stock.code) : ''

  const finishClose = useCallback(() => {
    if (!closingRef.current) return
    closingRef.current = false
    onClose()
  }, [onClose])

  const beginClose = useCallback(() => {
    if (closingRef.current) return
    if (stock) {
      const trimmed = note.trim()
      if (trimmed !== lastSavedNoteRef.current) {
        lastSavedNoteRef.current = trimmed
        onSaveNote(stock.code, trimmed)
      }
    }
    if (!presented) {
      onClose()
      return
    }
    closingRef.current = true
    setPresented(false)
  }, [presented, onClose, stock, note, onSaveNote])

  const handleDrawerTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.propertyName !== 'transform') return
    finishClose()
  }, [finishClose])

  useEffect(() => {
    if (!open) return undefined
    closingRef.current = false
    setPresented(false)
    const id = requestAnimationFrame(() => setPresented(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (presented || !closingRef.current) return undefined
    const timer = window.setTimeout(finishClose, DRAWER_CLOSE_MS + 40)
    return () => window.clearTimeout(timer)
  }, [presented, finishClose])

  useEffect(() => {
    if (!open || !stock) return undefined
    const initialNote = stock.note ?? ''
    setNote(initialNote)
    lastSavedNoteRef.current = initialNote.trim()
    setTradeForm(prev => ({
      ...prev,
      price: currentPrice != null ? String(currentPrice) : prev.price,
      date: todayTradeDate(),
    }))
    let cancelled = false
    setLoadingTrades(true)
    void loadTrades(code).then(rows => {
      if (!cancelled) {
        setTrades(rows)
        setDialogTab(rows.length > 0 ? 'records' : 'trade')
      }
    }).finally(() => {
      if (!cancelled) setLoadingTrades(false)
    })
    return () => { cancelled = true }
  }, [open, stock, code, currentPrice, loadTrades])

  useEffect(() => {
    if (!open || !stock) return undefined
    const timer = window.setTimeout(() => {
      const trimmed = note.trim()
      if (trimmed === lastSavedNoteRef.current) return
      lastSavedNoteRef.current = trimmed
      onSaveNote(stock.code, trimmed)
    }, NOTE_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [note, open, stock, onSaveNote])

  const sortedTrades = useMemo(
    () => [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id),
    [trades],
  )

  const localHolding = useMemo(() => {
    if (!trades.length) return null
    const price = currentPrice ?? holding?.currentPrice ?? trades[trades.length - 1]?.price ?? 0
    if (!price) return null
    return calcHoldingFromTrades(trades, price)
  }, [trades, currentPrice, holding?.currentPrice])

  const followPct = followReturnPct(currentPrice, stock?.addedPrice)

  const previewFees = useMemo(() => {
    const shares = Number(tradeForm.shares)
    const price = Number(tradeForm.price)
    if (!shares || !price) return null
    return estimateTradeFees(shares, price, tradeForm.side)
  }, [tradeForm])

  const handleSubmitTrade = useCallback(async () => {
    if (!stock) return
    const shares = Number(tradeForm.shares)
    const price = Number(tradeForm.price)
    if (!shares || !price) return
    setSubmitting(true)
    try {
      const rows = await submitTrade({
        code: stock.code,
        shares,
        price,
        side: tradeForm.side,
        date: tradeForm.date || undefined,
      })
      setTrades(rows)
      setTradeForm(prev => ({ ...prev, shares: '', date: todayTradeDate() }))
      setDialogTab('records')
    } catch {
      /* ignore — user can retry */
    } finally {
      setSubmitting(false)
    }
  }, [stock, tradeForm, submitTrade])

  const handleDeleteTrade = useCallback(async (id: number) => {
    if (!stock) return
    try {
      const rows = await deleteTrade(id, stock.code)
      setTrades(rows)
    } catch { /* ignore */ }
  }, [stock, deleteTrade])

  if (!stock) return null

  const holdPct = holding?.totalPnlPct ?? holding?.unrealizedPnlPct ?? localHolding?.totalPnlPct
  const holdTone = pctTone(holdPct)
  const followTone = pctTone(followPct)
  const isHolding = (localHolding?.shares ?? holding?.shares ?? 0) > 0

  return (
    <>
      <button
        type="button"
        className={mergeClasses(s.scrim, 'opptrix-follow-drawer-scrim', presented && s.scrimOpen)}
        aria-label="关闭"
        onClick={beginClose}
      />
      <div className={s.drawerAnchor}>
        <div
          className={mergeClasses(s.drawer, 'opptrix-follow-drawer', presented && s.drawerOpen)}
          role="dialog"
          aria-modal="false"
          aria-hidden={!presented}
          aria-label={`${stock.name} 持仓管理`}
          onTransitionEnd={handleDrawerTransitionEnd}
        >
        <div className={s.handle} aria-hidden />
        <div className={s.drawerHeader}>
          <div className={s.headerMeta}>
            <span>{stock.name}</span>
            <span className={s.sub}>
              {stock.code}
              {stock.industry ? ` · ${stock.industry}` : ''}
              {isHolding && (
                <>
                  {' · '}
                  <Badge size="small" color="informative" appearance="filled">持有</Badge>
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            className={mergeClasses(s.closeBtn, 'opptrix-focusable')}
            aria-label="关闭"
            onClick={beginClose}
          >
            <DismissRegular fontSize={14} />
          </button>
        </div>

        <div className={mergeClasses(s.drawerBody, 'opptrix-scroll')}>
          <div className={s.contentStack}>
            <div className={s.metrics}>
              <div className={s.metric}>
                <span className={s.metricLabel}>现价</span>
                <span className={s.metricValue}>{formatPrice(currentPrice)}</span>
              </div>
              <div className={s.metric}>
                <span className={s.metricLabel}>关注收益</span>
                <span className={mergeClasses(s.metricValue, followTone === 'up' && s.pctUp, followTone === 'down' && s.pctDown)}>
                  {followPct != null ? formatPct(followPct) : '—'}
                </span>
              </div>
              {isHolding && (
                <>
                  <div className={s.metric}>
                    <span className={s.metricLabel}>持仓</span>
                    <span className={s.metricValue}>
                      {(localHolding?.shares ?? holding?.shares ?? 0).toFixed(0)} 股
                    </span>
                  </div>
                  <div className={s.metric}>
                    <span className={s.metricLabel}>持有收益</span>
                    <span className={mergeClasses(s.metricValue, holdTone === 'up' && s.pctUp, holdTone === 'down' && s.pctDown)}>
                      {holdPct != null ? formatPct(holdPct) : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className={s.fieldBlock}>
              <span className={s.fieldLabel}>备注</span>
              <Textarea
                className={s.noteArea}
                appearance="filled-darker"
                resize="vertical"
                placeholder="记录关注理由、目标价、操作计划…"
                value={note}
                onChange={(_, data) => setNote(data.value)}
                rows={2}
              />
            </div>

            <div className={s.tabRow} role="tablist" aria-label="交易">
              <button
                type="button"
                role="tab"
                aria-selected={dialogTab === 'trade'}
                className={mergeClasses(s.tabBtn, dialogTab === 'trade' && s.tabBtnActive)}
                onClick={() => setDialogTab('trade')}
              >
                录入交易
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dialogTab === 'records'}
                className={mergeClasses(s.tabBtn, dialogTab === 'records' && s.tabBtnActive)}
                onClick={() => setDialogTab('records')}
              >
                交易记录{trades.length ? ` (${trades.length})` : ''}
              </button>
            </div>

              <div
                className={mergeClasses(
                  s.panel,
                  dialogTab === 'trade' ? s.panelTrade : s.panelRecords,
                )}
              >
                {dialogTab === 'trade' && (
                <div className={s.tradeForm}>
                  <div className={s.tradeSideRow}>
                    <button
                      type="button"
                      className={mergeClasses(s.sideBtn, tradeForm.side === 'buy' && s.sideBtnBuy)}
                      onClick={() => setTradeForm(prev => ({ ...prev, side: 'buy' }))}
                    >
                      买入
                    </button>
                    <button
                      type="button"
                      className={mergeClasses(s.sideBtn, tradeForm.side === 'sell' && s.sideBtnSell)}
                      onClick={() => setTradeForm(prev => ({ ...prev, side: 'sell' }))}
                    >
                      卖出
                    </button>
                  </div>
                  <Input
                    className={s.glassInput}
                    appearance="filled-darker"
                    size="small"
                    placeholder="股数"
                    value={tradeForm.shares}
                    onChange={(_, data) => setTradeForm(prev => ({ ...prev, shares: data.value }))}
                  />
                  <Input
                    className={s.glassInput}
                    appearance="filled-darker"
                    size="small"
                    placeholder="成交价"
                    value={tradeForm.price}
                    onChange={(_, data) => setTradeForm(prev => ({ ...prev, price: data.value }))}
                  />
                  <TradeDateField
                    className={s.glassInput}
                    value={tradeForm.date}
                    onChange={date => setTradeForm(prev => ({ ...prev, date }))}
                  />
                  {previewFees && tradeForm.shares && tradeForm.price && (
                    <Text className={s.feeHint}>
                      预估成交额 {formatCompactNumber(estimateTradeAmount(Number(tradeForm.shares), Number(tradeForm.price)))}
                      {' · '}
                      费用约 {previewFees.totalFee.toFixed(2)}（佣金+过户{tradeForm.side === 'sell' ? '+印花税' : ''}）
                    </Text>
                  )}
                  <OpptrixButton
                    variant="primary"
                    disabled={submitting || !tradeForm.shares || !tradeForm.price}
                    onClick={() => void handleSubmitTrade()}
                  >
                    {submitting ? '提交中…' : '添加记录'}
                  </OpptrixButton>
                </div>
              )}

              {dialogTab === 'records' && (
                <div className={mergeClasses(s.recordsScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
                  {loadingTrades && <Spinner size="tiny" label="加载记录…" />}
                  {!loadingTrades && sortedTrades.length === 0 && (
                    <Text className={s.emptyTrades}>暂无买卖记录，可切换到「录入交易」添加</Text>
                  )}
                  {!loadingTrades && sortedTrades.length > 0 && (
                    <div className={s.tradeList}>
                      {sortedTrades.map(t => (
                        <div key={t.id} className={s.tradeRow}>
                          <Badge size="small" color={t.tradeSide === 'buy' ? 'danger' : 'success'}>
                            {t.tradeSide === 'buy' ? '买' : '卖'}
                          </Badge>
                          <div className={s.tradeMain}>
                            <span>{t.tradeDate} · {t.shares} 股 @ {t.price.toFixed(2)}</span>
                            <span className={s.sub}>
                              成交额 {formatCompactNumber(t.amount)} · 费用 {t.totalFee.toFixed(2)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={s.tradeDelete}
                            aria-label="删除记录"
                            onClick={() => void handleDeleteTrade(t.id)}
                          >
                            <DismissRegular fontSize={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
