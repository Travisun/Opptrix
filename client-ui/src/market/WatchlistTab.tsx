import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  ProgressBar,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { DismissRegular, DeleteRegular, EditRegular, SearchRegular, StarRegular } from '@fluentui/react-icons'
import SidebarListEmpty from './SidebarListEmpty'
import WatchlistGroupFilterBar from './WatchlistGroupFilterBar'
import WatchlistGroupSummaryStrip from './WatchlistGroupSummaryStrip'
import WatchlistGroupsDrawer from './WatchlistGroupsDrawer'
import { useTouchAxisLockedScroll } from '../hooks/useTouchAxisLockedScroll'
import { computeWatchlistGroupSummary } from './watchlistGroupCalc'
import { filterWatchlistByGroup, useWatchlistGroups } from './WatchlistGroupsContext'
import { research } from '../api/client'
import type { MarketQuote, WatchlistItem } from '../types/market'
import type { HoldingSnapshot } from './useFollowPortfolio'
import HoverMarqueeText from '../chat/HoverMarqueeText'
import { formatPct, formatPriceWithCurrency, pctTone, resolveDisplayStockName, hasCjkText, normalizeCode } from './format'
import { unifiedQuoteToMarketQuote } from './instrument-adapters'
import type { QuoteFailedReason } from './instrument-adapters'
import { lookupHoldingSnapshot, followReturnPct, holdingReturnPctInCny, dayChangeReturnPct } from './portfolioCalc'
import { useFxRates } from './useFxRates'
import { formatWatchlistRadarLine } from './watchlistRadar'
import type { WatchlistRadarItem } from '../types/schemas'
import { displayCodeFromInstrument, instrumentKey, tryParseInstrumentInput, resolveWatchlistInstrument, watchlistItemKey, UNRESOLVED_INSTRUMENT_COPY, formatDisambiguationCandidateLabel, formatInstrumentSearchHitSubtitle, normalizeWatchlistItem } from './instrument'
import {
  WATCHLIST_QUOTES_POLL_MS,
  WatchlistQuoteBatchAbortError,
  classifyWatchlistBatchFailReason,
  isWatchlistItemWithinQuoteGrace,
  mergeWatchlistQuoteRefresh,
  runWatchlistQuoteBatches,
  shouldSuppressWatchlistQuoteFailure,
} from './watchlistQuotes'
import {
  readWatchlistQuotesSessionCache,
  writeWatchlistQuotesSessionCache,
} from './rightPanelSessionCache'
import {
  markWatchlistQuotesFetched,
  runWatchlistQuotesRefreshIfNeeded,
  shouldPollWatchlistQuotesAt,
} from './watchlistQuotesRefresh'
import { useWatchlist } from './useWatchlist'
import { useInstrumentSearchWithUniversePrep, UNIVERSE_PREP_COPY } from './useInstrumentSearchWithUniversePrep'
import { hasApplicationCapability } from './capabilities'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive, motion, sidebarItemSelected } from '../theme/mixins'

function stopRowActionPointer(e: React.MouseEvent | React.PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
}

/** Search / chips / footer horizontal inset */
const CONTENT_PAD = '15px'
const ITEM_BG_INSET = '10px'
const ITEM_INNER_PAD = '10px'

const IDENTITY_WIDTH = '108px'
const METRICS_MIN_WIDTH = '268px'
/** Hover 操作区（双 28px 钮 + gap），与行尾留白一并计入横滑可滚区域 */
const ROW_ACTION_RESERVE = '68px'
const ROW_SCROLL_END_PAD = `calc(${ROW_ACTION_RESERVE} + ${ITEM_INNER_PAD})`
const LIST_TABLE_MIN_WIDTH = `calc(${IDENTITY_WIDTH} + 8px + ${METRICS_MIN_WIDTH} + ${ITEM_INNER_PAD} * 2 + ${ROW_SCROLL_END_PAD})`

const METRIC_COLUMNS = [
  { key: 'price', label: '最新价', minWidth: '68px' },
  { key: 'change', label: '涨跌幅', minWidth: '64px' },
  { key: 'cost', label: '成本价', minWidth: '64px' },
  { key: 'holding', label: '持仓收益', minWidth: '68px' },
] as const

/** 行内失败态文案 — reason → 产品级短文案 + title 提示（禁技术词） */
const QUOTE_FAILED_COPY: Record<QuoteFailedReason, { label: string; hint: string }> = {
  no_provider: { label: '行情源未配置', hint: '在设置中添加行情源后即可查看' },
  unsupported: { label: '暂不支持该市场', hint: '该市场暂未开通实时行情' },
  empty: { label: '暂时无行情数据', hint: '可稍后刷新查看最新行情' },
  error: { label: '行情暂时获取失败', hint: '请稍后刷新重试' },
  not_found: { label: '该标的数据源暂未收录', hint: '可稍后再试，或添加其他行情源' },
}

/** 整表失败时的 footer 文案 — 可操作、禁 provider/熔断等技术词 */
function watchlistQuoteErrorCopy(message?: string): string {
  const raw = String(message ?? '')
  if (/熔断|冷却|限流|繁忙|所有 provider 均失败/.test(raw)) {
    return '行情暂时繁忙，请稍后刷新'
  }
  if (raw.includes('行情获取失败')) return '行情暂时繁忙，请稍后刷新'
  return '行情暂时无法更新'
}

function lookupWatchlistQuote<T>(
  bag: Record<string, T>,
  item: WatchlistItem,
  ref: ReturnType<typeof resolveWatchlistInstrument>,
): T | undefined {
  if (ref) {
    const keyed = bag[instrumentKey(ref)]
    if (keyed) return keyed
  }
  return bag[watchlistItemKey(item)] ?? bag[item.code]
}

const useStyles = makeStyles({
  root: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  searchRow: {
    padding: `8px ${CONTENT_PAD} 4px`,
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  /** Group chips — equal vertical rhythm under search; single bottom rule for the chrome block. */
  chipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: `4px ${CONTENT_PAD} 8px`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    minWidth: 0,
    minHeight: '34px',
    boxSizing: 'border-box',
  },
  chipsWrap: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  chip: {...ghostInteractive,
    flexShrink: 0,
    height: '26px',
    padding: '0 10px',
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  chipActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
      color: opptrixCssVars.accent,
    },
  },
  chipEditBtn: {...ghostInteractive,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    padding: 0,
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    lineHeight: 0,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
  },
  results: {
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    maxHeight: '176px',
    overflowY: 'auto',
    padding: `4px ${ITEM_BG_INSET}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minHeight: '88px',
  },
  resultItem: {...ghostInteractive,

    width: '100%',
    border: 'none',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: `7px ${ITEM_INNER_PAD}`,
    minHeight: '44px',
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  resultMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  resultName: {
    display: 'block',
    width: '100%',
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    lineHeight: 1.35,
    color: opptrixCssVars.textPrimary,
  },
  resultSubtitle: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resultAction: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  resultMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  resultsCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  prepBanner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: `6px ${ITEM_INNER_PAD}`,
    marginBottom: '2px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.accentSoft,
  },
  prepText: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.3,
  },
  prepFailText: {
    fontSize: 'var(--opptrix-font-sm)',
    color: MARKET_DOWN,
    lineHeight: 1.3,
    padding: `4px ${ITEM_INNER_PAD}`,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: `10px ${CONTENT_PAD}`,
    /* 双轴可滚；斜向由 useTouchAxisLockedScroll 主轴锁定 */
    touchAction: 'none',
    WebkitOverflowScrolling: 'touch',
  },
  listCentered: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: '10px',
  },
  listTable: {
    minWidth: '100%',
    width: 'max-content',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    boxSizing: 'border-box',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: `0 ${ITEM_INNER_PAD}`,
    minHeight: '24px',
    minWidth: LIST_TABLE_MIN_WIDTH,
    width: 'max-content',
    boxSizing: 'border-box',
  },
  headerIdentity: {
    flexShrink: 0,
    width: IDENTITY_WIDTH,
    minWidth: IDENTITY_WIDTH,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  headerMetrics: {
    flex: 1,
    minWidth: METRICS_MIN_WIDTH,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  headerMetricCell: {
    flex: '1 0 auto',
    textAlign: 'right',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  row: {...ghostInteractive,
    display: 'grid',
    gridTemplateColumns: `${IDENTITY_WIDTH} minmax(${METRICS_MIN_WIDTH}, 1fr) ${ROW_SCROLL_END_PAD}`,
    gridTemplateRows: '48px',
    alignItems: 'center',
    columnGap: '8px',
    padding: `0 ${ITEM_INNER_PAD}`,
    height: '48px',
    minHeight: '48px',
    maxHeight: '48px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    minWidth: LIST_TABLE_MIN_WIDTH,
    width: 'max-content',
    boxSizing: 'border-box',
    color: opptrixCssVars.textPrimary,
    cursor: 'pointer',
    /* 触屏：无 sticky focus/hover 底；保留操作列 */
    '@media (hover: none)': {
      ':hover': {
        backgroundColor: 'transparent',
      },
      ':active': {
        backgroundColor: 'transparent',
        opacity: 1,
      },
      ':focus': {
        outline: 'none',
        boxShadow: 'none',
        backgroundColor: 'transparent',
      },
      ':focus-visible': {
        outline: 'none',
        boxShadow: 'none',
      },
    },
  },
  rowActive: {...sidebarItemSelected},
  rowIdentity: {
    gridColumn: '1',
    gridRow: '1',
    zIndex: 1,
    flexShrink: 0,
    width: IDENTITY_WIDTH,
    minWidth: IDENTITY_WIDTH,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: '1px',
    minHeight: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  rowNameLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    minWidth: 0,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    lineHeight: 1.2,
  },
  rowCode: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
    fontVariantNumeric: 'tabular-nums',
  },
  holdBadge: {
    flexShrink: 0,
  },
  rowMetrics: {
    flex: 1,
    minWidth: METRICS_MIN_WIDTH,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    height: '28px',
  },
  metricCell: {
    flex: '1 0 auto',
    textAlign: 'right',
    fontSize: 'var(--opptrix-font-sm)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    lineHeight: 1.1,
    color: opptrixCssVars.textPrimary,
  },
  metricPrice: {
    fontWeight: 650,
  },
  pctUp: { color: MARKET_UP, fontWeight: 600 },
  pctDown: { color: MARKET_DOWN, fontWeight: 600 },
  pctFlat: { color: opptrixCssVars.textTertiary },
  metricMuted: {
    color: opptrixCssVars.textTertiary,
    fontWeight: 400,
  },
  metricPending: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '4px',
    color: opptrixCssVars.textTertiary,
    fontWeight: 400,
    fontSize: 'var(--opptrix-font-xs)',
  },
  rowTrailing: {
    gridColumn: '3',
    gridRow: '1',
    zIndex: 2,
    position: 'sticky',
    right: 0,
    flexShrink: 0,
    width: ROW_SCROLL_END_PAD,
    minWidth: ROW_SCROLL_END_PAD,
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    boxSizing: 'border-box',
    backgroundColor: opptrixCssVars.canvas,
    boxShadow: `-10px 0 12px -6px ${opptrixCssVars.canvas}`,
    '@media (hover: hover)': {
      backgroundColor: 'transparent',
      boxShadow: 'none',
    },
  },
  headerEndPad: {
    flexShrink: 0,
    width: ROW_SCROLL_END_PAD,
    minWidth: ROW_SCROLL_END_PAD,
    height: '1px',
    position: 'sticky',
    right: 0,
    zIndex: 2,
    backgroundColor: opptrixCssVars.canvas,
    '@media (hover: hover)': {
      backgroundColor: 'transparent',
    },
  },
  rowQuote: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    transitionProperty: 'opacity',
    transitionDuration: motion.fast,
  },
  rowActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.fast,
    /* 触屏：常显编辑/删除，不依赖 hover/focus */
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
    WebkitTapHighlightColor: 'transparent',
    '@media (hover: hover)': {
      ':hover': {
        backgroundColor: 'rgba(29, 29, 31, 0.08)',
        color: opptrixCssVars.textPrimary,
      },
    },
    '@media (hover: none)': {
      ':hover': {
        backgroundColor: 'transparent',
        color: opptrixCssVars.textSecondary,
      },
      ':focus': {
        outline: 'none',
        boxShadow: 'none',
        backgroundColor: 'transparent',
      },
      ':focus-visible': {
        outline: 'none',
        boxShadow: 'none',
      },
      ':active': {
        opacity: 0.55,
        backgroundColor: 'transparent',
      },
    },
  },
  rowMetricsWrap: {
    gridColumn: '2',
    gridRow: '1',
    zIndex: 1,
    minWidth: METRICS_MIN_WIDTH,
    display: 'flex',
    alignItems: 'center',
  },
  empty: {
    padding: `12px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  footer: {
    padding: `6px ${CONTENT_PAD}`,
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexShrink: 0,
  },
  footerHint: {
    color: opptrixCssVars.textSecondary,
  },
  footerError: {
    color: MARKET_DOWN,
  },
  iconBtn: {...ghostInteractive,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    padding: 0,
    border: 'none',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    lineHeight: 0,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  footerAction: {...ghostInteractive,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '26px',
    padding: '0 8px',
    border: 'none',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    lineHeight: 1.25,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
    ':disabled': {
      cursor: 'default',
      opacity: 0.6,
    },
  },
})

interface Props {
  active?: boolean
  items: WatchlistItem[]
  selectedCode?: string | null
  holdingsByCode: Record<string, HoldingSnapshot>
  onSelect: (item: WatchlistItem) => void
  onManage: (item: WatchlistItem) => void
  onAdd: (item: WatchlistItem, opts?: { addedPrice?: number | null }) => Promise<WatchlistItem> | WatchlistItem
  onRemove: (item: WatchlistItem) => void
  onPatchItem: (code: string, patch: Partial<WatchlistItem>) => void
  onRefreshingChange?: (refreshing: boolean) => void
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
  onRefreshingChange,
}: Props) {
  const s = useStyles()
  const listRef = useRef<HTMLDivElement>(null)
  useTouchAxisLockedScroll(listRef)
  const {
    groups,
    membership,
    selectedGroupId,
    setSelectedGroupId,
    replaceDoc,
    dialogOpen,
    setDialogOpen,
  } = useWatchlistGroups()
  const { disambiguationCandidates, clearDisambiguationCandidates, syncedItemsKey, subscribeQuotePatches } = useWatchlist()
  const [keyword, setKeyword] = useState('')
  const {
    hits: searchHits,
    searching,
    searchError,
    universePrep,
    refreshingAfterPrep,
  } = useInstrumentSearchWithUniversePrep({ keyword, limit: 20 })
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>(
    () => readWatchlistQuotesSessionCache()?.quotes ?? {},
  )
  const [radar, setRadar] = useState<Record<string, WatchlistRadarItem>>({})
  const [strategyByCode, setStrategyByCode] = useState<Record<string, string>>({})
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [refreshingQuotes, setRefreshingQuotes] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [failedByKey, setFailedByKey] = useState<Record<string, QuoteFailedReason>>({})
  const [, setGraceTick] = useState(0)
  const [updatedAt, setUpdatedAt] = useState('')
  const patchedRef = useRef<Set<string>>(new Set())
  const itemsRef = useRef(items)
  itemsRef.current = items
  const loadSeqRef = useRef(0)
  const quotesRef = useRef(quotes)
  quotesRef.current = quotes
  const failedByKeyRef = useRef(failedByKey)
  failedByKeyRef.current = failedByKey
  const itemsKey = useMemo(
    () => items.map(watchlistItemKey).join('|'),
    [items],
  )

  const filteredItems = useMemo(
    () => filterWatchlistByGroup(items, membership, selectedGroupId, watchlistItemKey),
    [items, membership, selectedGroupId],
  )

  const selectedGroupTitle = useMemo(() => {
    if (!selectedGroupId) return null
    return groups.find(g => g.id === selectedGroupId)?.title ?? null
  }, [groups, selectedGroupId])

  const fxRates = useFxRates(active)

  const groupsDoc = useMemo(
    () => ({ groups, membership }),
    [groups, membership],
  )

  const groupSummary = useMemo(
    () => computeWatchlistGroupSummary(items, membership, selectedGroupId, quotes, holdingsByCode, fxRates),
    [items, membership, selectedGroupId, quotes, holdingsByCode, fxRates],
  )

  const refreshQuotes = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const hasDisplayed = Object.keys(quotesRef.current).length > 0
    await runWatchlistQuotesRefreshIfNeeded(async () => {
      const currentItems = itemsRef.current
      if (!currentItems.length) {
        setQuotes({})
        setFailedByKey({})
        quotesRef.current = {}
        failedByKeyRef.current = {}
        setQuoteError('')
        setRefreshingQuotes(false)
        onRefreshingChange?.(false)
        return
      }
      const seq = ++loadSeqRef.current
      const silent = opts?.silent === true
      const hard = opts?.force === true
      if (!silent) {
        setLoadingQuotes(true)
      } else if (hasDisplayed) {
        setRefreshingQuotes(true)
        onRefreshingChange?.(true)
      }
      try {
        const instruments = currentItems
          .map(resolveWatchlistInstrument)
          .filter((r): r is NonNullable<typeof r> => r != null)
        if (!instruments.length) {
          setQuotes({})
          setFailedByKey({})
          quotesRef.current = {}
          failedByKeyRef.current = {}
          setQuoteError('')
          return
        }

        const itemByInstrumentKey = new Map<string, WatchlistItem>()
        for (const item of currentItems) {
          const itemRef = resolveWatchlistInstrument(item)
          if (itemRef) itemByInstrumentKey.set(instrumentKey(itemRef), item)
        }

        const shouldMarkQuoteFailed = (itemRef: NonNullable<ReturnType<typeof resolveWatchlistInstrument>>) => {
          const item = itemByInstrumentKey.get(instrumentKey(itemRef))
          if (!item) return true
          const cached = lookupWatchlistQuote(quotesRef.current, item, itemRef)
          return !shouldSuppressWatchlistQuoteFailure(item, {
            loadingQuotes: !silent,
            hasPrice: cached?.price != null,
          })
        }

        const applyMerge = (
          patch: Record<string, MarketQuote>,
          failedMap: Record<string, QuoteFailedReason>,
          touchUpdatedAt: boolean,
        ) => {
          const merged = mergeWatchlistQuoteRefresh({
            prevQuotes: quotesRef.current,
            prevFailed: failedByKeyRef.current,
            patch,
            failedMap,
          })
          quotesRef.current = merged.quotes
          failedByKeyRef.current = merged.failedByKey
          setQuotes(merged.quotes)
          setFailedByKey(merged.failedByKey)
          const fetchedAtMs = Date.now()
          writeWatchlistQuotesSessionCache(merged.quotes, fetchedAtMs)
          markWatchlistQuotesFetched(fetchedAtMs)
          if (touchUpdatedAt) {
            setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
          }
        }

        let lastBatchErrorMessage: string | undefined
        const { okCount, failCount } = await runWatchlistQuoteBatches({
          items: instruments,
          shouldAbort: () => seq !== loadSeqRef.current,
          onBatchError: (err) => {
            if (err instanceof Error && err.message) {
              lastBatchErrorMessage = err.message
            }
          },
          runBatch: async (batch) => {
            if (seq !== loadSeqRef.current) throw new WatchlistQuoteBatchAbortError()
            const resp = await research.instrumentQuotes(batch, hard ? { fresh: true } : undefined)
            if (seq !== loadSeqRef.current) throw new WatchlistQuoteBatchAbortError()

            const quotesArr = resp.data?.quotes
            const hasQuotesArray = Array.isArray(quotesArr)

            if (!hasQuotesArray) {
              const reason = classifyWatchlistBatchFailReason(resp.message)
              const failedMap: Record<string, QuoteFailedReason> = {}
              for (const itemRef of batch) {
                if (!shouldMarkQuoteFailed(itemRef)) continue
                const code = displayCodeFromInstrument(itemRef)
                const rowKey = watchlistItemKey({ code, name: code, instrument: itemRef })
                failedMap[code] = reason
                failedMap[rowKey] = reason
                failedMap[instrumentKey(itemRef)] = reason
              }
              if (seq !== loadSeqRef.current) throw new WatchlistQuoteBatchAbortError()
              applyMerge({}, failedMap, false)
              return
            }

            const patch: Record<string, MarketQuote> = {}
            for (const q of quotesArr) {
              const itemRef = q.instrument ?? resolveWatchlistInstrument({
                code: q.code,
                name: q.name,
              })
              if (!itemRef) continue
              const mq = unifiedQuoteToMarketQuote(q)
              const code = displayCodeFromInstrument(itemRef)
              const rowKey = watchlistItemKey({ code, name: mq.name, instrument: itemRef })
              const quote: MarketQuote = {
                ...mq,
                code,
                name: mq.name ?? code,
              }
              patch[code] = quote
              patch[rowKey] = quote
              patch[instrumentKey(itemRef)] = quote
            }
            const failedMap: Record<string, QuoteFailedReason> = {}
            for (const f of resp.data?.failed ?? []) {
              const itemRef = f.instrument ?? resolveWatchlistInstrument({ code: f.code, name: f.code })
              if (itemRef && !shouldMarkQuoteFailed(itemRef)) continue
              failedMap[f.code] = f.reason
              if (itemRef) failedMap[instrumentKey(itemRef)] = f.reason
            }
            if (seq !== loadSeqRef.current) throw new WatchlistQuoteBatchAbortError()
            applyMerge(patch, failedMap, Object.keys(patch).length > 0)
          },
        })

        if (seq !== loadSeqRef.current) return
        if (okCount > 0) {
          setQuoteError('')
        } else if (failCount > 0) {
          const hasCachedQuote = Object.values(quotesRef.current).some(q => q.price != null)
          if (!(silent && hasCachedQuote)) {
            setQuoteError(watchlistQuoteErrorCopy(lastBatchErrorMessage))
          }
        } else {
          setQuoteError('')
        }
      } catch {
        if (seq === loadSeqRef.current) {
          const hasCachedQuote = Object.values(quotesRef.current).some(q => q.price != null)
          if (!(silent && hasCachedQuote)) {
            setQuoteError('行情暂时繁忙，请稍后刷新')
          }
        }
      } finally {
        if (seq === loadSeqRef.current) {
          setLoadingQuotes(false)
          setRefreshingQuotes(false)
          onRefreshingChange?.(false)
        }
      }
    }, { force: opts?.force, hasDisplayedData: hasDisplayed })
  }, [onRefreshingChange])

  const refreshRadar = useCallback(async () => {
    const currentItems = itemsRef.current
    const cnItems = currentItems.filter(item => {
      const ref = resolveWatchlistInstrument(item)
      return ref != null && ref.market === 'CN' && hasApplicationCapability(ref, 'scorecard')
    })
    if (!cnItems.length) {
      setRadar({})
      return
    }
    const cnCodes = cnItems.flatMap(item => {
      const ref = resolveWatchlistInstrument(item)
      return ref ? [instrumentKey(ref)] : []
    })
    try {
      const resp = await research.watchlistRadar(cnCodes)
      if (resp.success && resp.data?.items) {
        const map: Record<string, WatchlistRadarItem> = {}
        for (const row of resp.data.items) {
          const parsedCode = tryParseInstrumentInput(row.code)
          const rowKey = parsedCode ? instrumentKey(parsedCode) : row.code
          const matchItem = cnItems.find(item => {
            const ref = resolveWatchlistInstrument(item)
            return ref != null && instrumentKey(ref) === rowKey
          })
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
  }, [itemsKey])

  useEffect(() => {
    if (!active) return undefined
    void refreshRadar()
    const timer = window.setInterval(() => { void refreshRadar() }, 60000)
    return () => window.clearInterval(timer)
  }, [refreshRadar, active])

  useEffect(() => {
    if (!active || !selectedCode) return undefined
    const item = itemsRef.current.find(
      row => row.code === selectedCode || watchlistItemKey(row) === selectedCode,
    )
    if (!item) return undefined
    const ref = resolveWatchlistInstrument(item)
    if (!ref || !hasApplicationCapability(ref, 'strategy_signal')) return undefined
    const key = item.code
    let cancelled = false
    void research.strategySignals(ref).then(resp => {
      if (cancelled || !resp.success || !resp.data?.summary) return
      setStrategyByCode(prev => (
        prev[key] ? prev : { ...prev, [key]: resp.data!.summary }
      ))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [active, selectedCode, itemsKey])

  const applyQuotePatch = useCallback((patch: Record<string, MarketQuote>) => {
    if (!Object.keys(patch).length) return
    const merged = mergeWatchlistQuoteRefresh({
      prevQuotes: quotesRef.current,
      prevFailed: failedByKeyRef.current,
      patch,
      failedMap: {},
    })
    quotesRef.current = merged.quotes
    failedByKeyRef.current = merged.failedByKey
    setQuotes(merged.quotes)
    setFailedByKey(merged.failedByKey)
    writeWatchlistQuotesSessionCache(merged.quotes)
    setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
  }, [])

  useEffect(() => subscribeQuotePatches(applyQuotePatch), [subscribeQuotePatches, applyQuotePatch])

  useEffect(() => {
    if (!active || syncedItemsKey !== itemsKey) return undefined
    void refreshQuotes({ silent: Object.keys(quotesRef.current).length > 0 })
    const timer = window.setInterval(() => {
      if (document.hidden || !shouldPollWatchlistQuotesAt()) return
      void refreshQuotes({ silent: true })
    }, WATCHLIST_QUOTES_POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshQuotes, active, itemsKey, syncedItemsKey])

  // 宽限期结束后及时从「加载中」切换到真实失败/价格态
  useEffect(() => {
    const hasGraceItem = items.some(item => isWatchlistItemWithinQuoteGrace(item))
    if (!hasGraceItem) return undefined
    const timer = window.setInterval(() => {
      setGraceTick(t => t + 1)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [items])

  useEffect(() => {
    for (const item of items) {
      if (item.addedPrice != null || patchedRef.current.has(item.code)) continue
      const ref = resolveWatchlistInstrument(item)
      const q = lookupWatchlistQuote(quotes, item, ref)
      const price = q?.price
      if (price == null) continue
      const preClose = q?.preClose
      if (preClose != null && preClose > 0) {
        const ratio = price / preClose
        if (ratio > 5 || ratio < 0.2) continue
      }
      patchedRef.current.add(item.code)
      onPatchItem(item.code, {
        addedPrice: price,
        addedAt: item.addedAt ?? new Date().toISOString(),
      })
    }
  }, [items, quotes, onPatchItem])

  useEffect(() => {
    for (const item of items) {
      const added = item.addedPrice
      if (added == null || added <= 0 || patchedRef.current.has(item.code)) continue
      const ref = resolveWatchlistInstrument(item)
      const q = lookupWatchlistQuote(quotes, item, ref)
      const price = q?.price
      if (price == null) continue
      const follow = followReturnPct(price, added)
      const day = dayChangeReturnPct(
        q?.changePct,
        price,
        q?.preClose,
      )
      if (follow != null) {
        if (day != null && Math.abs(follow - day) > 15) {
          patchedRef.current.add(item.code)
          onPatchItem(item.code, { addedPrice: null })
        }
        continue
      }
      patchedRef.current.add(item.code)
      onPatchItem(item.code, { addedPrice: null })
    }
  }, [items, quotes, onPatchItem])

  useEffect(() => {
    for (const item of items) {
      const ref = resolveWatchlistInstrument(item)
      const qName = lookupWatchlistQuote(quotes, item, ref)?.name
      const itemKey = watchlistItemKey(item)
      const rName = radar[itemKey]?.name ?? (ref ? radar[instrumentKey(ref)]?.name : undefined)
      const resolved = resolveDisplayStockName(item.code, qName, rName, item.name)
      if (resolved === item.name) continue
      const stored = item.name?.trim() ?? ''
      const shouldPatch = !stored
        || stored === item.code
        || !hasCjkText(stored)
        || (hasCjkText(resolved) && resolved.length > stored.length)
      if (shouldPatch) {
        onPatchItem(item.code, { name: resolved })
      }
    }
  }, [items, quotes, radar, onPatchItem])

  useEffect(() => {
    let cancelled = false
    const targets = items.filter(item => {
      const stored = item.name?.trim() ?? ''
      return !stored || stored === item.code || !hasCjkText(stored) || stored.length < 8
    })
    if (!targets.length) return undefined

    const timer = window.setTimeout(() => {
      void (async () => {
        const refs = targets
          .map(item => resolveWatchlistInstrument(item))
          .filter((r): r is NonNullable<typeof r> => r != null)
        if (!refs.length || cancelled) return

        try {
          const resp = await research.resolveInstrumentNames(refs)
          if (cancelled) return
          const hits = resp.data?.items ?? []
          const nameByKey = new Map(
            hits.map(hit => [instrumentKey(hit.instrument), hit.name?.trim() ?? '']),
          )

          for (const item of targets) {
            if (cancelled) break
            const syncKey = `index-name:${item.code}`
            if (patchedRef.current.has(syncKey)) continue
            const ref = resolveWatchlistInstrument(item)
            if (!ref) continue
            const indexName = nameByKey.get(instrumentKey(ref))
            if (!indexName) continue
            const stored = item.name?.trim() ?? ''
            if (indexName.length <= stored.length && stored !== item.code && hasCjkText(stored)) {
              patchedRef.current.add(syncKey)
              continue
            }
            patchedRef.current.add(syncKey)
            onPatchItem(item.code, { name: indexName })
          }
        } catch {
          /* 名录同步失败时保留已有名称 */
        }
      })()
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [itemsKey, onPatchItem])

  const holdingCount = useMemo(
    () => items.filter(item => {
      const ref = resolveWatchlistInstrument(item)
      if (!ref) return false
      if (!hasApplicationCapability(ref, 'portfolio_pnl')) return false
      return (lookupHoldingSnapshot(holdingsByCode, ref)?.shares ?? 0) > 0
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

      <WatchlistGroupFilterBar
        groups={groups}
        membership={membership}
        items={items}
        selectedGroupId={selectedGroupId}
        onSelectGroup={setSelectedGroupId}
        onManage={() => setDialogOpen(true)}
      />

      <WatchlistGroupSummaryStrip
        mode="watchlist"
        metrics={groupSummary}
        groupTitle={selectedGroupTitle}
      />

      {keyword.trim().length >= 2 && (
        <div className={mergeClasses(s.results, 'opptrix-scroll', !searching && searchHits.length === 0 && !universePrep.status && s.resultsCentered)}>
          {universePrep.status === 'preparing' && (
            <div className={s.prepBanner}>
              <Text className={s.prepText} block>
                {refreshingAfterPrep ? UNIVERSE_PREP_COPY.refreshing : (universePrep.message || UNIVERSE_PREP_COPY.preparing)}
              </Text>
              <ProgressBar
                value={Math.min(1, Math.max(0.03, (universePrep.percent || 0) / 100))}
                thickness="medium"
                color="brand"
                shape="rounded"
              />
            </div>
          )}
          {universePrep.status === 'failed' && (
            <Text className={s.prepFailText} block>
              {universePrep.message || UNIVERSE_PREP_COPY.failed}
            </Text>
          )}
          {searching && !searchHits.length && universePrep.status !== 'preparing' && (
            <div className={s.empty}>
              <Spinner size="tiny" />
              正在搜索…
            </div>
          )}
          {!searching && searchHits.length === 0 && universePrep.status !== 'preparing' && (
            searchError ? (
              <SidebarListEmpty
                compact
                icon={<SearchRegular />}
                title="暂时无法搜索"
                hint={searchError}
              />
            ) : (
              <SidebarListEmpty
                compact
                icon={<SearchRegular />}
                title="没找到匹配的股票"
                hint="试试输入完整代码，或换一个字再搜"
              />
            )
          )}
          {searchHits.map(hit => (
            <button
              key={watchlistItemKey(hit)}
              type="button"
              className={mergeClasses(s.resultItem, 'opptrix-hover-marquee-host')}
              onClick={async () => {
                await Promise.resolve(onAdd(hit, {}))
                setKeyword('')
              }}
            >
              <div className={s.resultMain}>
                <HoverMarqueeText text={hit.name} className={s.resultName} />
                <span className={s.resultSubtitle}>{formatInstrumentSearchHitSubtitle(hit)}</span>
              </div>
              <span className={s.resultAction}>添加</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={listRef}
        className={mergeClasses(s.list, 'opptrix-scroll', 'opptrix-scroll-hover', !filteredItems.length && s.listCentered)}
      >
        {!filteredItems.length && !items.length && (
          <SidebarListEmpty
            icon={<StarRegular />}
            title="还没有关注的股票"
            hint="在上方搜索并添加后，会在这里显示行情与涨跌"
          />
        )}
        {!filteredItems.length && items.length > 0 && selectedGroupId && (
          <SidebarListEmpty
            icon={<StarRegular />}
            title={selectedGroupTitle ? `「${selectedGroupTitle}」还没有标的` : '这个分组还没有标的'}
            hint="在上方搜索添加新关注，或点右侧设置把已有关注移入此分组"
          />
        )}
        {filteredItems.length > 0 && (
          <div className={s.listTable}>
            <div className={s.tableHeader}>
              <span className={s.headerIdentity}>名称</span>
              <div className={s.headerMetrics}>
                {METRIC_COLUMNS.map(col => (
                  <span
                    key={col.key}
                    className={s.headerMetricCell}
                    style={{ minWidth: col.minWidth }}
                  >
                    {col.label}
                  </span>
                ))}
              </div>
              <span className={s.headerEndPad} aria-hidden />
            </div>
            {filteredItems.map(item => {
              const ref = resolveWatchlistInstrument(item)
              const unresolved = ref == null
              const candidates = disambiguationCandidates[item.code] ?? []
              const hasCandidates = unresolved && candidates.length > 1
              const quote = lookupWatchlistQuote(quotes, item, ref)
              const failedReason = lookupWatchlistQuote(failedByKey, item, ref)
              const livePrice = quote?.price ?? null
              const suppressFailure = shouldSuppressWatchlistQuoteFailure(item, {
                loadingQuotes,
                hasPrice: livePrice != null,
              })
              const tentativePending = livePrice == null
                && (loadingQuotes || isWatchlistItemWithinQuoteGrace(item))
              const price = livePrice ?? (tentativePending && item.addedPrice != null ? item.addedPrice : null)
              const failedCopy = failedReason && !suppressFailure && price == null
                ? QUOTE_FAILED_COPY[failedReason]
                : undefined
              const quotePending = price == null && tentativePending && !failedCopy
              const holding = ref ? lookupHoldingSnapshot(holdingsByCode, ref) : null
              const isHolding = (holding?.shares ?? 0) > 0
              const market = ref?.market
              const supportsHoldingPnl = ref != null && hasApplicationCapability(ref, 'portfolio_pnl')
              const isFxMarket = market === 'HK' || market === 'US'
              const dayPct = dayChangeReturnPct(quote?.changePct, livePrice, quote?.preClose)
              const dayTone = pctTone(dayPct)
              const holdingPct = isHolding && supportsHoldingPnl
                ? holdingReturnPctInCny(holding, livePrice, market, fxRates)
                : null
              const holdingTone = pctTone(holdingPct)
              const costBasisLocal = holding != null && isHolding && supportsHoldingPnl && holding.costBasis > 0
                ? holding.costBasis
                : null
              const costBasisDisplay = costBasisLocal != null
                ? formatPriceWithCurrency(market, costBasisLocal)
                : null
              const costBasisTitle = costBasisLocal != null
                ? `成本 ${formatPriceWithCurrency(market, costBasisLocal)}`
                : undefined
              const holdingTitle = isFxMarket && isHolding && supportsHoldingPnl && fxRates
                ? '港美持仓收益已按人民币口径计算'
                : undefined
              const radarRow = ref?.market === 'CN' ? radar[instrumentKey(ref)] : undefined
              const radarLine = unresolved
                ? (hasCandidates
                  ? UNRESOLVED_INSTRUMENT_COPY.ambiguousHint
                  : UNRESOLVED_INSTRUMENT_COPY.listHint)
                : formatWatchlistRadarLine(
                  item,
                  radarRow,
                  selectedCode === item.code ? strategyByCode[item.code] : null,
                )
              const displayName = resolveDisplayStockName(item.code, quote?.name, radarRow?.name, item.name)
              const displayCode = item.code.trim() || '—'
              const portfolioEditEnabled = ref != null && hasApplicationCapability(ref, 'portfolio_pnl')
              const rowTooltip = [
                unresolved
                  ? (hasCandidates ? UNRESOLVED_INSTRUMENT_COPY.ambiguousHint : UNRESOLVED_INSTRUMENT_COPY.hint)
                  : failedCopy?.hint,
                radarLine,
                item.note?.trim(),
              ].filter(Boolean).join('\n') || undefined

              return (
                <div
                  key={item.code}
                  className={mergeClasses(
                    s.row,
                    'opptrix-follow-item',
                    selectedCode === item.code && 'opptrix-follow-item-active',
                    'opptrix-focusable',
                    'opptrix-hover-marquee-host',
                    selectedCode === item.code && s.rowActive,
                  )}
                  role="button"
                  tabIndex={0}
                  title={rowTooltip}
                  onClick={e => {
                    onSelect(item)
                    if (e.currentTarget instanceof HTMLElement) e.currentTarget.blur()
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(item)
                      if (e.currentTarget instanceof HTMLElement) e.currentTarget.blur()
                    }
                  }}
                >
                  <div className={s.rowIdentity}>
                    <div className={s.rowNameLine}>
                      <HoverMarqueeText text={displayName} />
                      {isHolding && supportsHoldingPnl && (
                        <Badge className={s.holdBadge} size="small" color="informative" appearance="outline">持有</Badge>
                      )}
                      {unresolved && hasCandidates && (
                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <Badge
                              className={s.holdBadge}
                              size="small"
                              color="warning"
                              appearance="outline"
                              role="button"
                              tabIndex={0}
                              onClick={e => { e.stopPropagation() }}
                              onKeyDown={e => e.stopPropagation()}
                              style={{ cursor: 'pointer' }}
                            >
                              {UNRESOLVED_INSTRUMENT_COPY.ambiguousShort}
                            </Badge>
                          </MenuTrigger>
                          <MenuPopover onClick={e => e.stopPropagation()}>
                            <MenuList>
                              {candidates.map(c => (
                                <MenuItem
                                  key={`${c.code}:${c.instrument.market}`}
                                  onClick={e => {
                                    e.stopPropagation()
                                    const prevCode = item.code
                                    onPatchItem(prevCode, {
                                      code: c.code,
                                      name: c.name?.trim() || item.name,
                                      instrument: c.instrument,
                                    })
                                    clearDisambiguationCandidates(prevCode)
                                  }}
                                >
                                  {formatDisambiguationCandidateLabel(c)}
                                </MenuItem>
                              ))}
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                      )}
                      {unresolved && !hasCandidates && (
                        <Badge className={s.holdBadge} size="small" color="warning" appearance="outline">
                          {UNRESOLVED_INSTRUMENT_COPY.short}
                        </Badge>
                      )}
                    </div>
                    <span className={s.rowCode}>{displayCode}</span>
                  </div>

                  <div className={s.rowMetricsWrap}>
                    <div
                      className={mergeClasses(s.rowMetrics, 'opptrix-follow-quote')}
                      onPointerDown={stopRowActionPointer}
                      onMouseDown={stopRowActionPointer}
                      onClick={stopRowActionPointer}
                    >
                      {failedCopy && livePrice == null ? (
                        <>
                          <span
                            className={mergeClasses(s.metricCell, s.metricMuted)}
                            style={{ minWidth: METRIC_COLUMNS[0].minWidth }}
                            title={failedCopy.hint}
                          >
                            {failedCopy.label}
                          </span>
                          <span className={mergeClasses(s.metricCell, s.metricMuted)} style={{ minWidth: METRIC_COLUMNS[1].minWidth }}>—</span>
                          <span className={mergeClasses(s.metricCell, s.metricMuted)} style={{ minWidth: METRIC_COLUMNS[2].minWidth }}>—</span>
                          <span className={mergeClasses(s.metricCell, s.metricMuted)} style={{ minWidth: METRIC_COLUMNS[3].minWidth }}>—</span>
                        </>
                      ) : quotePending && livePrice == null ? (
                        <>
                          <span
                            className={mergeClasses(s.metricCell, s.metricPending)}
                            style={{ minWidth: METRIC_COLUMNS[0].minWidth }}
                            title="正在获取最新行情"
                          >
                            <Spinner size="extra-tiny" />
                            正在获取行情…
                          </span>
                          <span className={mergeClasses(s.metricCell, s.metricMuted)} style={{ minWidth: METRIC_COLUMNS[1].minWidth }}>—</span>
                          <span className={mergeClasses(s.metricCell, s.metricMuted)} style={{ minWidth: METRIC_COLUMNS[2].minWidth }}>—</span>
                          <span className={mergeClasses(s.metricCell, s.metricMuted)} style={{ minWidth: METRIC_COLUMNS[3].minWidth }}>—</span>
                        </>
                      ) : (
                        <>
                          <span
                            className={mergeClasses(
                              s.metricCell,
                              s.metricPrice,
                              quotePending && livePrice == null && item.addedPrice != null && s.metricMuted,
                            )}
                            style={{ minWidth: METRIC_COLUMNS[0].minWidth }}
                            title={failedCopy?.hint}
                          >
                            {formatPriceWithCurrency(market, price)}
                          </span>
                          <span
                            className={mergeClasses(
                              s.metricCell,
                              dayPct == null && s.metricMuted,
                              dayTone === 'up' && s.pctUp,
                              dayTone === 'down' && s.pctDown,
                              dayTone === 'flat' && s.pctFlat,
                            )}
                            style={{ minWidth: METRIC_COLUMNS[1].minWidth }}
                          >
                            {formatPct(dayPct, 1)}
                          </span>
                          <span
                            className={mergeClasses(s.metricCell, costBasisDisplay == null && s.metricMuted)}
                            style={{ minWidth: METRIC_COLUMNS[2].minWidth }}
                            title={costBasisTitle}
                          >
                            {costBasisDisplay ?? '—'}
                          </span>
                          <span
                            className={mergeClasses(
                              s.metricCell,
                              holdingPct == null && s.metricMuted,
                              holdingTone === 'up' && s.pctUp,
                              holdingTone === 'down' && s.pctDown,
                              holdingTone === 'flat' && s.pctFlat,
                            )}
                            style={{ minWidth: METRIC_COLUMNS[3].minWidth }}
                            title={holdingTitle}
                          >
                            {isHolding && supportsHoldingPnl ? formatPct(holdingPct, 1) : '—'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className={mergeClasses(s.rowTrailing, 'opptrix-follow-trailing')}
                    onPointerDown={stopRowActionPointer}
                    onMouseDown={stopRowActionPointer}
                    onClick={stopRowActionPointer}
                  >
                    <span className={mergeClasses(s.rowActions, 'opptrix-follow-actions')}>
                      {portfolioEditEnabled && (
                        <button
                          type="button"
                          className={mergeClasses(s.rowActionBtn, 'opptrix-focusable')}
                          aria-label={`编辑持仓 ${displayName}`}
                          onClick={e => {
                            e.stopPropagation()
                            onManage(item)
                            e.currentTarget.blur()
                          }}
                        >
                          <EditRegular fontSize={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={mergeClasses(s.rowActionBtn, 'opptrix-focusable')}
                        aria-label={`删除 ${displayName}`}
                        onClick={e => {
                          e.stopPropagation()
                          onRemove(item)
                          e.currentTarget.blur()
                        }}
                      >
                        <DeleteRegular fontSize={14} />
                      </button>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className={s.footer}>
        <span className={mergeClasses(quoteError && !loadingQuotes && !refreshingQuotes && s.footerError)}>
          {loadingQuotes && !Object.keys(quotes).length
            ? '正在加载行情…'
            : refreshingQuotes
              ? '正在拉取最新记录'
              : loadingQuotes
                ? '正在更新行情…'
                : quoteError
                  ? quoteError
                  : selectedGroupId
                    ? `${filteredItems.length} 只 · ${selectedGroupTitle ?? '分组'}${holdingCount ? ` · ${holdingCount} 持有` : ''} · 约每 1 分钟更新${updatedAt ? ` · ${updatedAt}` : ''}`
                    : `${items.length} 只关注${holdingCount ? ` · ${holdingCount} 持有` : ''} · 约每 1 分钟更新${updatedAt ? ` · ${updatedAt}` : ''}`}
        </span>
        <button
          type="button"
          className={s.footerAction}
          aria-label="刷新行情"
          disabled={loadingQuotes || refreshingQuotes}
          onClick={() => void refreshQuotes({ force: true })}
        >
          刷新
        </button>
      </div>

      <WatchlistGroupsDrawer
        open={dialogOpen}
        items={items}
        doc={groupsDoc}
        onClose={() => setDialogOpen(false)}
        onSave={replaceDoc}
      />
    </div>
  )
}
