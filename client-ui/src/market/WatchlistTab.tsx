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
import { DismissRegular, DeleteRegular, EditRegular, SearchRegular, SettingsRegular, StarRegular } from '@fluentui/react-icons'
import SidebarListEmpty from './SidebarListEmpty'
import WatchlistGroupsDialog from './WatchlistGroupsDialog'
import { filterWatchlistByGroup, useWatchlistGroups } from './WatchlistGroupsContext'
import { research } from '../api/client'
import type { MarketQuote, WatchlistItem } from '../types/market'
import type { HoldingSnapshot } from './useFollowPortfolio'
import HoverMarqueeText from '../chat/HoverMarqueeText'
import { formatPct, formatPriceForMarket, pctTone, resolveDisplayStockName, hasCjkText, normalizeCode } from './format'
import { unifiedQuoteToMarketQuote } from './instrument-adapters'
import type { QuoteFailedReason } from './instrument-adapters'
import { lookupHoldingSnapshot, followReturnPct, holdingReturnPctFromQuote, dayChangeReturnPct } from './portfolioCalc'
import { formatWatchlistRadarLine } from './watchlistRadar'
import type { WatchlistRadarItem } from '../types/schemas'
import { displayCodeFromInstrument, instrumentKey, tryParseInstrumentInput, resolveWatchlistInstrument, watchlistItemKey, watchlistDisplayCode, UNRESOLVED_INSTRUMENT_COPY, formatDisambiguationCandidateLabel, formatInstrumentSearchHitSubtitle, normalizeWatchlistItem } from './instrument'
import {
  WATCHLIST_QUOTES_POLL_MS,
  WatchlistQuoteBatchAbortError,
  classifyWatchlistBatchFailReason,
  isWatchlistItemWithinQuoteGrace,
  mergeWatchlistQuoteRefresh,
  runWatchlistQuoteBatches,
  shouldSuppressWatchlistQuoteFailure,
} from './watchlistQuotes'
import { buildWatchlistQuotePatch, fetchFreshWatchlistInstrumentQuote } from './watchlistQuotePrefetch'
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
  { key: 'follow', label: '关注收益', minWidth: '64px' },
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
  headerEndPad: {
    flexShrink: 0,
    width: ROW_SCROLL_END_PAD,
    minWidth: ROW_SCROLL_END_PAD,
    height: '1px',
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
  },
  rowMetricsWrap: {
    gridColumn: '2',
    gridRow: '1',
    zIndex: 1,
    minWidth: METRICS_MIN_WIDTH,
    display: 'flex',
    alignItems: 'center',
  },
  rowQuote: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    transitionProperty: 'opacity',
    transitionDuration: motion.fast,
    '@media (hover: none)': {
      display: 'none',
    },
  },
  rowActions: {
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
  const {
    groups,
    membership,
    selectedGroupId,
    setSelectedGroupId,
    replaceDoc,
    dialogOpen,
    setDialogOpen,
  } = useWatchlistGroups()
  const { disambiguationCandidates, clearDisambiguationCandidates, syncedItemsKey } = useWatchlist()
  const [keyword, setKeyword] = useState('')
  const {
    hits: searchHits,
    searching,
    universePrep,
    refreshingAfterPrep,
  } = useInstrumentSearchWithUniversePrep({ keyword, limit: 20 })
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [radar, setRadar] = useState<Record<string, WatchlistRadarItem>>({})
  const [strategyByCode, setStrategyByCode] = useState<Record<string, string>>({})
  const [loadingQuotes, setLoadingQuotes] = useState(false)
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

  const groupsDoc = useMemo(
    () => ({ groups, membership }),
    [groups, membership],
  )

  const refreshQuotes = useCallback(async (opts?: { silent?: boolean }) => {
    const currentItems = itemsRef.current
    if (!currentItems.length) {
      setQuotes({})
      setFailedByKey({})
      quotesRef.current = {}
      failedByKeyRef.current = {}
      setQuoteError('')
      return
    }
    const seq = ++loadSeqRef.current
    const silent = opts?.silent === true
    if (!silent) setLoadingQuotes(true)
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
          const resp = await research.instrumentQuotes(batch)
          if (seq !== loadSeqRef.current) throw new WatchlistQuoteBatchAbortError()

          const quotesArr = resp.data?.quotes
          const hasQuotesArray = Array.isArray(quotesArr)

          // success:false 且无 quotes：软失败 — 写 failedMap，保留已有价，不 throw
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
      // 有成功批则清 footer；仅整轮无成功且确有硬失败才抬红字
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
      // 外层兜底：不清空已有 quotes
      if (seq === loadSeqRef.current) {
        const hasCachedQuote = Object.values(quotesRef.current).some(q => q.price != null)
        if (!(silent && hasCachedQuote)) {
          setQuoteError('行情暂时繁忙，请稍后刷新')
        }
      }
    } finally {
      if (seq === loadSeqRef.current) setLoadingQuotes(false)
    }
  }, [])

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

  useEffect(() => {
    if (!active || syncedItemsKey !== itemsKey) return undefined
    void refreshQuotes()
    const timer = window.setInterval(() => { void refreshQuotes({ silent: true }) }, WATCHLIST_QUOTES_POLL_MS)
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
        for (const item of targets) {
          if (cancelled) break
          const syncKey = `index-name:${item.code}`
          if (patchedRef.current.has(syncKey)) continue
          try {
            const ref = resolveWatchlistInstrument(item)
            if (!ref) continue
            const lookup = displayCodeFromInstrument(ref)
            const resp = await research.searchInstruments(lookup, 12)
            if (cancelled) return
            const hits = resp.data?.items ?? []
            const refKey = instrumentKey(ref)
            const match = hits.find(hit => {
              const hitKey = instrumentKey(hit.instrument)
              return hitKey === refKey || normalizeCode(hit.code) === normalizeCode(item.code)
            })
            const indexName = match?.name?.trim()
            if (!indexName) continue
            const stored = item.name?.trim() ?? ''
            if (indexName.length <= stored.length && stored !== item.code && hasCjkText(stored)) {
              patchedRef.current.add(syncKey)
              continue
            }
            patchedRef.current.add(syncKey)
            onPatchItem(item.code, { name: indexName })
          } catch {
            /* 名录同步失败时保留已有名称 */
          }
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

      <div className={s.chipRow}>
        <div className={mergeClasses(s.chipsWrap, 'opptrix-scroll-x')}>
          <button
            type="button"
            className={mergeClasses(s.chip, !selectedGroupId && s.chipActive)}
            onClick={() => setSelectedGroupId(null)}
          >
            全部
          </button>
          {groups.map(group => (
            <button
              key={group.id}
              type="button"
              className={mergeClasses(s.chip, selectedGroupId === group.id && s.chipActive)}
              onClick={() => setSelectedGroupId(group.id)}
            >
              {group.title}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={s.chipEditBtn}
          aria-label="管理分组"
          onClick={() => setDialogOpen(true)}
        >
          <SettingsRegular fontSize={14} />
        </button>
      </div>

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
            <SidebarListEmpty
              compact
              icon={<SearchRegular />}
              title="没找到匹配的股票"
              hint="试试输入完整代码，或换一个字再搜"
            />
          )}
          {searchHits.map(hit => {
            const row = normalizeWatchlistItem(hit)
            return (
              <button
                key={watchlistItemKey(row)}
                type="button"
                className={mergeClasses(s.resultItem, 'opptrix-hover-marquee-host')}
                onClick={async () => {
                  const row = normalizeWatchlistItem(hit)
                  const ref = resolveWatchlistInstrument(row)
                  const added = await Promise.resolve(onAdd(row, {}))
                  setKeyword('')
                  if (!ref || !hasApplicationCapability(ref, 'batch_quote')) return
                  try {
                    const unified = await fetchFreshWatchlistInstrumentQuote(ref)
                    if (!unified || unified.price == null) return
                    const patch = buildWatchlistQuotePatch(added, ref, unified)
                    quotesRef.current = { ...quotesRef.current, ...patch }
                    setQuotes(prev => ({ ...prev, ...patch }))
                    setFailedByKey(prev => {
                      const next = { ...prev }
                      for (const k of Object.keys(patch)) delete next[k]
                      return next
                    })
                    setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
                    if (added.addedPrice == null && unified.price != null && unified.price > 0) {
                      onPatchItem(added.code, { addedPrice: unified.price })
                    }
                  } catch { /* 整表刷新会补齐 */ }
                }}
              >
                <div className={s.resultMain}>
                  <HoverMarqueeText text={row.name} className={s.resultName} />
                  <span className={s.resultSubtitle}>{formatInstrumentSearchHitSubtitle(row)}</span>
                </div>
                <span className={s.resultAction}>添加</span>
              </button>
            )
          })}
        </div>
      )}

      <div
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
              const followPct = followReturnPct(livePrice, item.addedPrice)
              const holdingPct = isHolding
                ? holdingReturnPctFromQuote(holding, livePrice)
                : null
              const followTone = pctTone(followPct)
              const holdingTone = pctTone(holdingPct)
              const costBasis = holding != null && isHolding && holding.costBasis > 0 ? holding.costBasis : null
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
              const displayCode = watchlistDisplayCode(item)
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
                  onClick={() => onSelect(item)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(item)
                    }
                  }}
                >
                  <div className={s.rowIdentity}>
                    <div className={s.rowNameLine}>
                      <HoverMarqueeText text={displayName} />
                      {isHolding && (
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
                        <span
                          className={mergeClasses(s.metricCell, s.metricMuted)}
                          style={{ minWidth: METRIC_COLUMNS[0].minWidth }}
                          title={failedCopy.hint}
                        >
                          {failedCopy.label}
                        </span>
                      ) : quotePending && livePrice == null ? (
                        <span
                          className={mergeClasses(s.metricCell, s.metricPending)}
                          style={{ minWidth: METRIC_COLUMNS[0].minWidth }}
                          title="正在获取最新行情"
                        >
                          <Spinner size="extra-tiny" />
                          正在获取行情…
                        </span>
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
                            {formatPriceForMarket(ref?.market, price)}
                          </span>
                          <span
                            className={mergeClasses(
                              s.metricCell,
                              followPct == null && s.metricMuted,
                              followTone === 'up' && s.pctUp,
                              followTone === 'down' && s.pctDown,
                              followTone === 'flat' && s.pctFlat,
                            )}
                            style={{ minWidth: METRIC_COLUMNS[1].minWidth }}
                          >
                            {formatPct(followPct, 1)}
                          </span>
                          <span
                            className={mergeClasses(s.metricCell, costBasis == null && s.metricMuted)}
                            style={{ minWidth: METRIC_COLUMNS[2].minWidth }}
                          >
                            {costBasis != null ? formatPriceForMarket(ref?.market, costBasis) : '—'}
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
                          >
                            {isHolding ? formatPct(holdingPct, 1) : '—'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className={s.rowTrailing}
                    onPointerDown={stopRowActionPointer}
                    onMouseDown={stopRowActionPointer}
                    onClick={stopRowActionPointer}
                  >
                    <span className={mergeClasses(s.rowActions, 'opptrix-follow-actions')}>
                      <button
                        type="button"
                        className={mergeClasses(s.rowActionBtn, 'opptrix-focusable')}
                        aria-label={`修改 ${displayName}`}
                        onClick={() => onManage(item)}
                      >
                        <EditRegular fontSize={14} />
                      </button>
                      <button
                        type="button"
                        className={mergeClasses(s.rowActionBtn, 'opptrix-focusable')}
                        aria-label={`删除 ${displayName}`}
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
        )}
      </div>

      <div className={s.footer}>
        <span className={mergeClasses(quoteError && !loadingQuotes && s.footerError)}>
          {loadingQuotes
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
          disabled={loadingQuotes}
          onClick={() => void refreshQuotes()}
        >
          刷新
        </button>
      </div>

      <WatchlistGroupsDialog
        open={dialogOpen}
        items={items}
        doc={groupsDoc}
        onClose={() => setDialogOpen(false)}
        onSave={replaceDoc}
      />
    </div>
  )
}
