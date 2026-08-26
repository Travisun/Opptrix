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
import { research, portfolioFeeInstrument, portfolioFeeInstrumentSave } from '../api/client'
import {
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  resolvePortfolioLedgerKind,
  type InstrumentFeeOverrides,
  type PortfolioGlobalFees,
  type PortfolioLedgerKind,
} from '@opptrix/shared/portfolio-fees'
import { formatCompactNumberForMarket, formatPct, formatPriceForMarket, pctTone, resolveCloseOnDate, resolveFundNavOnDate } from './format'
import { displayCodeFromInstrument, instrumentKey, resolveWatchlistInstrument } from './instrument'
import PortfolioFeeEditor from './PortfolioFeeEditor'
import {
  calcHoldingFromTrades,
  displayPortfolioHoldingReturnPct,
  estimateTradeAmount,
  estimateTradeFees,
  followReturnPct,
} from './portfolioCalc'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'
import TradeDateField, { todayTradeDate } from './TradeDateField'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
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
    minWidth: 0,
    maxWidth: `min(100%, ${DRAWER_MAX_WIDTH}px)`,
    boxSizing: 'border-box',
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
    backgroundColor: opptrixCssVars.borderStrong,
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
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 650,
    letterSpacing: '-0.02em',
  },
  sub: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
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
      color: opptrixCssVars.textPrimary,
    },
  },
  drawerBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 15px 12px',
  },
  contentStack: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
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
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  metricValue: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  fieldBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flexShrink: 0,
  },
  fieldLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 650,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.04em',
  },
  tabRow: {
    display: 'flex',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    gap: '2px',
    padding: '2px',
    borderRadius: opptrixTokens.radiusXl,
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    flexShrink: 0,
  },
  tabBtn: {...ghostInteractive,

    flex: '1 1 0',
    minWidth: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    padding: '0 10px',
    height: '26px',
    borderRadius: opptrixTokens.radiusFull,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
      color: opptrixCssVars.textPrimary,
    },
  },
  tabBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    color: opptrixCssVars.textPrimary,
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
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  tradeFullRow: {
    gridColumn: '1 / -1',
    minWidth: 0,
    width: '100%',
    boxSizing: 'border-box',
  },
  tradeSideRow: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'stretch',
    width: '100%',
    minWidth: 0,
    gap: '4px',
  },
  sideBtn: {...ghostInteractive,

    flex: '1 1 0',
    minWidth: 0,
    minHeight: '26px',
    borderRadius: opptrixTokens.radiusFull,
    border: 'none',
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    cursor: 'pointer',
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
    minWidth: 0,
    backgroundColor: 'rgba(29, 29, 31, 0.06)',
    borderRadius: opptrixTokens.radiusMd,
  },
  feeHint: {
    gridColumn: '1 / -1',
    minWidth: 0,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
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
    fontSize: 'var(--opptrix-font-sm)',
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
    color: opptrixCssVars.textTertiary,
    lineHeight: 0,
    flexShrink: 0,
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
      color: opptrixCssVars.textPrimary,
    },
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  emptyTrades: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    padding: '10px 2px',
    textAlign: 'center',
  },
  feeToggle: {
    alignSelf: 'flex-start',
    background: 'transparent',
    padding: '4px 0',
    fontSize: 'var(--opptrix-font-xs)',
    color: 'var(--colorBrandForeground1)',
    cursor: 'pointer',
    ...ghostInteractive,
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
  /** 持仓录入与盈亏；需标的支持 portfolio_pnl */
  portfolioEnabled?: boolean
  onClose: () => void
  onSaveNote: (code: string, note: string) => void
  loadTrades: (code: string, market?: string) => Promise<PortfolioTradeItem[]>
  submitTrade: (payload: {
    code: string
    market?: string
    assetClass?: string
    instrument?: import('../types/instrument').InstrumentRef
    shares: number
    price: number
    side: 'buy' | 'sell'
    date?: string
  }) => Promise<PortfolioTradeItem[]>
  deleteTrade: (id: number, code: string, market?: string) => Promise<PortfolioTradeItem[]>
  onFeesRecalculated?: () => void
}

export default function FollowStockDialog({
  open,
  stock,
  currentPrice,
  holding,
  portfolioEnabled = true,
  onClose,
  onSaveNote,
  loadTrades,
  submitTrade,
  deleteTrade,
  onFeesRecalculated,
}: Props) {
  const s = useStyles()
  const closingRef = useRef(false)
  const lastSavedNoteRef = useRef('')
  const priceManualRef = useRef(false)
  const [presented, setPresented] = useState(false)
  const [note, setNote] = useState('')
  const [dialogTab, setDialogTab] = useState<DialogTab>('trade')
  const [trades, setTrades] = useState<PortfolioTradeItem[]>([])
  const [loadingTrades, setLoadingTrades] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fundNavRows, setFundNavRows] = useState<Array<{ date: string; nav?: number | null }>>([])
  const [loadingFundNav, setLoadingFundNav] = useState(false)
  const [klineBars, setKlineBars] = useState<Array<{ date: string; close?: number | null }>>([])
  const [loadingKline, setLoadingKline] = useState(false)
  const [feePanelOpen, setFeePanelOpen] = useState(false)
  const [ledgerKind, setLedgerKind] = useState<PortfolioLedgerKind>('exchange')
  const [globalFees, setGlobalFees] = useState<PortfolioGlobalFees>(DEFAULT_PORTFOLIO_GLOBAL_FEES)
  const [feeOverrides, setFeeOverrides] = useState<InstrumentFeeOverrides>({})
  const [tradeForm, setTradeForm] = useState({
    side: 'buy' as 'buy' | 'sell',
    shares: '',
    price: '',
    date: '',
  })

  const stockRef = stock ? resolveWatchlistInstrument(stock) : null
  const tradeCode = stockRef ? displayCodeFromInstrument(stockRef) : (stock?.code ?? '')
  // 稳定 identity：勿把 stockRef / stock 对象放进 effect deps（每 render 新引用会狂打 API）
  const stockIdentity = stockRef ? instrumentKey(stockRef) : (stock?.code ?? '')
  const stockMarket = stockRef?.market
  const isFundRef = stockRef?.assetClass === 'FUND'
  const isExchangeLedger = stockRef ? resolvePortfolioLedgerKind(stockRef) === 'exchange' : false
  const isOtcFund = isFundRef && !isExchangeLedger
  const positionUnit = isFundRef || stockRef?.assetClass === 'ETF' ? '份' : '股'
  const positionUnitLabel = isFundRef || stockRef?.assetClass === 'ETF' ? '份额' : '股数'

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

  // 打开 / 换标的时拉交易与重置表单；勿依赖 currentPrice 或 stockRef 对象引用
  useEffect(() => {
    if (!open || !stockIdentity) return undefined
    const initialNote = stock?.note ?? ''
    setNote(initialNote)
    lastSavedNoteRef.current = initialNote.trim()
    priceManualRef.current = false
    setFeePanelOpen(false)
    if (stockRef) setLedgerKind(resolvePortfolioLedgerKind(stockRef))
    setTradeForm(prev => ({
      ...prev,
      price: isOtcFund ? prev.price : (currentPrice != null ? String(currentPrice) : prev.price),
      date: todayTradeDate(),
    }))
    if (!portfolioEnabled) {
      setTrades([])
      setDialogTab('trade')
      setLoadingTrades(false)
      return undefined
    }
    let cancelled = false
    setLoadingTrades(true)
    void loadTrades(tradeCode, stockMarket).then(rows => {
      if (!cancelled) {
        setTrades(rows)
        setDialogTab(rows.length > 0 ? 'records' : 'trade')
      }
    }).finally(() => {
      if (!cancelled) setLoadingTrades(false)
    })
    return () => { cancelled = true }
    // stock / stockRef / currentPrice 仅在 open/identity 切换时取快照；价格轮询见下方小 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意不依赖对象引用与 currentPrice
  }, [open, stockIdentity, tradeCode, stockMarket, loadTrades, portfolioEnabled, isOtcFund])

  // 行情价变化只更新表单价，不重拉交易
  useEffect(() => {
    if (!open || isOtcFund || priceManualRef.current) return
    if (currentPrice == null) return
    setTradeForm(prev => {
      const next = String(currentPrice)
      return prev.price === next ? prev : { ...prev, price: next }
    })
  }, [open, isOtcFund, currentPrice])

  useEffect(() => {
    if (!open || !stockIdentity || !portfolioEnabled || !stockMarket) return undefined
    let cancelled = false
    void portfolioFeeInstrument(tradeCode, stockMarket).then(resp => {
      if (cancelled || !resp.success || !resp.data) return
      setLedgerKind(resp.data.ledgerKind)
      setGlobalFees(resp.data.globalFees)
      setFeeOverrides(resp.data.overrides)
    })
    return () => { cancelled = true }
  }, [open, stockIdentity, tradeCode, stockMarket, portfolioEnabled])

  useEffect(() => {
    if (!open || !stockIdentity || !isOtcFund || !stockRef) {
      setFundNavRows([])
      return undefined
    }
    const ref = stockRef
    let cancelled = false
    setLoadingFundNav(true)
    void research.fundNav(ref).then(resp => {
      if (cancelled) return
      const items = resp.success && Array.isArray(resp.data?.items) ? resp.data.items : []
      setFundNavRows(items)
    }).finally(() => {
      if (!cancelled) setLoadingFundNav(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅跟 stockIdentity，勿跟 stockRef 对象
  }, [open, stockIdentity, isOtcFund])

  useEffect(() => {
    if (!open || !stockIdentity || !stockRef || !isExchangeLedger) {
      setKlineBars([])
      return undefined
    }
    const ref = stockRef
    let cancelled = false
    setLoadingKline(true)
    void research.stockChart(ref, 'daily', 260).then(resp => {
      if (cancelled) return
      const bars = resp.success && resp.data?.bars
        ? resp.data.bars
            .filter((b): b is import('../types/market').OhlcChartBar => 'close' in b)
            .map(b => ({ date: b.time.slice(0, 10), close: b.close }))
        : []
      setKlineBars(bars)
    }).finally(() => {
      if (!cancelled) setLoadingKline(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅跟 stockIdentity，勿跟 stockRef 对象
  }, [open, stockIdentity, isExchangeLedger])

  useEffect(() => {
    if (priceManualRef.current) return
    const tradeDate = tradeForm.date || todayTradeDate()
    if (isOtcFund && fundNavRows.length) {
      const nav = resolveFundNavOnDate(fundNavRows, tradeDate)
      if (nav == null) return
      setTradeForm(prev => {
        const next = String(nav)
        return prev.price === next ? prev : { ...prev, price: next }
      })
      return
    }
    if (isExchangeLedger && klineBars.length) {
      const close = resolveCloseOnDate(klineBars, tradeDate)
      if (close == null) return
      setTradeForm(prev => {
        const next = String(close)
        return prev.price === next ? prev : { ...prev, price: next }
      })
    }
  }, [isOtcFund, isExchangeLedger, fundNavRows, klineBars, tradeForm.date])

  useEffect(() => {
    if (!open || !stockIdentity) return undefined
    const code = stock?.code
    if (!code) return undefined
    const timer = window.setTimeout(() => {
      const trimmed = note.trim()
      if (trimmed === lastSavedNoteRef.current) return
      lastSavedNoteRef.current = trimmed
      onSaveNote(code, trimmed)
    }, NOTE_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [note, open, stockIdentity, stock?.code, onSaveNote])

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
    if (!stockRef) return null
    const shares = Number(tradeForm.shares)
    const price = Number(tradeForm.price)
    if (!shares || !price) return null
    return estimateTradeFees(stockRef, tradeForm.side, shares, price, globalFees, feeOverrides)
  }, [stockRef, tradeForm, globalFees, feeOverrides])

  const handleFeeOverridesChange = useCallback((next: InstrumentFeeOverrides) => {
    setFeeOverrides(next)
    if (!stock || !stockRef) return
    void portfolioFeeInstrumentSave(tradeCode, next, stockRef.market).then(resp => {
      if (!resp.success) return
      if ((resp.data?.recalculatedTrades ?? 0) > 0) {
        onFeesRecalculated?.()
        void loadTrades(tradeCode, stockRef.market).then(setTrades)
      }
    }).catch(() => { /* ignore */ })
  }, [stock, stockRef, tradeCode, onFeesRecalculated])

  const handleSubmitTrade = useCallback(async () => {
    if (!stock) return
    const shares = Number(tradeForm.shares)
    const price = Number(tradeForm.price)
    if (!shares || !price) return
    setSubmitting(true)
    try {
      const rows = await submitTrade({
        code: tradeCode,
        market: stockRef?.market,
        assetClass: stockRef?.assetClass,
        instrument: stockRef ?? undefined,
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
  }, [stock, stockRef, tradeCode, tradeForm, submitTrade])

  const handleDeleteTrade = useCallback(async (id: number) => {
    if (!stock) return
    try {
      const rows = await deleteTrade(id, tradeCode, stockRef?.market)
      setTrades(rows)
    } catch { /* ignore */ }
  }, [stock, tradeCode, stockRef, deleteTrade])

  if (!stock) return null

  const holdPct = displayPortfolioHoldingReturnPct(holding, currentPrice)
    ?? displayPortfolioHoldingReturnPct(localHolding, currentPrice)
  const holdTone = pctTone(holdPct)
  const followTone = pctTone(followPct)
  const isHolding = portfolioEnabled && (localHolding?.shares ?? holding?.shares ?? 0) > 0

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
          aria-label={portfolioEnabled ? `${stock.name} 持仓管理` : `${stock.name} 关注备注`}
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
                <span className={s.metricValue}>{formatPriceForMarket(stockRef?.market, currentPrice)}</span>
              </div>
              <div className={s.metric}>
                <span className={s.metricLabel}>关注收益</span>
                <span className={mergeClasses(s.metricValue, followTone === 'up' && s.pctUp, followTone === 'down' && s.pctDown)}>
                  {formatPct(followPct)}
                </span>
              </div>
              {isHolding && (
                <>
                  <div className={s.metric}>
                    <span className={s.metricLabel}>持仓</span>
                    <span className={s.metricValue}>
                      {(localHolding?.shares ?? holding?.shares ?? 0).toFixed(0)} {positionUnit}
                    </span>
                  </div>
                  <div className={s.metric}>
                    <span className={s.metricLabel}>持有收益</span>
                    <span className={mergeClasses(s.metricValue, holdTone === 'up' && s.pctUp, holdTone === 'down' && s.pctDown)}>
                      {formatPct(holdPct)}
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

            {!portfolioEnabled && (
              <Text className={s.sub}>
                此标的暂不支持持仓录入与盈亏统计；可记录关注备注，并在上方查看现价与关注收益。
              </Text>
            )}

            {portfolioEnabled && (
            <>
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
                    placeholder={positionUnitLabel}
                    value={tradeForm.shares}
                    onChange={(_, data) => setTradeForm(prev => ({ ...prev, shares: data.value }))}
                  />
                  <Input
                    className={s.glassInput}
                    appearance="filled-darker"
                    size="small"
                    placeholder={
                      isOtcFund
                        ? (loadingFundNav ? '正在获取净值…' : '成交净值（自动，可改）')
                        : isExchangeLedger
                          ? (loadingKline ? '正在匹配收盘价…' : '成交价（自动，可改）')
                          : '成交价'
                    }
                    value={tradeForm.price}
                    onChange={(_, data) => {
                      priceManualRef.current = true
                      setTradeForm(prev => ({ ...prev, price: data.value }))
                    }}
                  />
                  <div className={s.tradeFullRow}>
                    <TradeDateField
                      className={s.glassInput}
                      value={tradeForm.date}
                      onChange={date => {
                        priceManualRef.current = false
                        setTradeForm(prev => ({ ...prev, date }))
                      }}
                    />
                  </div>
                  {previewFees && tradeForm.shares && tradeForm.price && (
                    <Text className={s.feeHint}>
                      预估成交额 {formatCompactNumberForMarket(stockRef?.market, estimateTradeAmount(Number(tradeForm.shares), Number(tradeForm.price)))}
                      {' · '}
                      费用约 {previewFees.totalFee.toFixed(2)}
                      {ledgerKind === 'exchange'
                        ? `（佣金+过户${tradeForm.side === 'sell' ? '+印花税' : ''}）`
                        : `（${tradeForm.side === 'buy' ? '申购' : '赎回'}费）`}
                    </Text>
                  )}
                  {isOtcFund && tradeForm.shares && tradeForm.price && (
                    <Text className={s.feeHint}>
                      按 {tradeForm.date || todayTradeDate()} 单位净值 {tradeForm.price} 记账
                    </Text>
                  )}
                  {isExchangeLedger && tradeForm.shares && tradeForm.price && !isOtcFund && (
                    <Text className={s.feeHint}>
                      按 {tradeForm.date || todayTradeDate()} 收盘价 {tradeForm.price} 记账
                    </Text>
                  )}
                  <button
                    type="button"
                    className={mergeClasses(s.feeToggle, 'opptrix-focusable')}
                    onClick={() => setFeePanelOpen(prev => !prev)}
                  >
                    {feePanelOpen ? '收起费率设置' : '为本标的设置费率'}
                  </button>
                  {feePanelOpen && stockRef && (
                    <PortfolioFeeEditor
                      ledgerKind={ledgerKind}
                      globalFees={globalFees}
                      overrides={feeOverrides}
                      onChange={handleFeeOverridesChange}
                    />
                  )}
                  <OpptrixButton
                    className={s.tradeFullRow}
                    variant="primary"
                    block
                    disabled={
                      submitting
                      || !tradeForm.shares
                      || !tradeForm.price
                      || (isOtcFund && loadingFundNav)
                      || (isExchangeLedger && loadingKline && !tradeForm.price)
                    }
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
                            <span>{t.tradeDate} · {t.shares} {positionUnit} @ {t.price.toFixed(2)}</span>
                            <span className={s.sub}>
                              成交额 {formatCompactNumberForMarket(stockRef?.market, t.amount)} · 费用 {t.totalFee.toFixed(2)}
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
            </>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
