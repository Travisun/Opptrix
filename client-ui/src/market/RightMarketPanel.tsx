import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tab, TabList, makeStyles, mergeClasses } from '@fluentui/react-components'
import PortfolioTab from './PortfolioTab'
import WatchlistTab from './WatchlistTab'
import StockDetailTab from './StockDetailTab'
import EtfDetailTab from './EtfDetailTab'
import CryptoDetailTab from './CryptoDetailTab'
import CrossMarketDetailTab from './CrossMarketDetailTab'
import type { StockDiscussPayload } from './StockDecisionCard'
import FollowStockDialog from './FollowStockDialog'
import { useWatchlist } from './useWatchlist'
import { useFollowPortfolio } from './useFollowPortfolio'
import type { WatchlistItem } from '../types/market'
import { opptrixCssVars } from '../theme/tokens'
import ChromeToolButton from '../desktop/ChromeToolButton'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_Z_PANEL_TITLE,
} from '../desktop/constants'
import {
  PanelRightContractRegular,
  ArrowMaximizeRegular,
  ArrowMinimizeRegular,
} from '../chat/chatIcons'
import { electronPlatform } from '../platform/detect'
import { research } from '../api/client'
import { normalizeCode } from './format'
import {
  detailPanelKind,
  normalizeWatchlistItem,
  resolveWatchlistInstrument,
  watchlistItemKey,
} from './instrument'
import { hasApplicationCapability } from './capabilities'

type MarketTab = 'watchlist' | 'portfolio' | 'detail'

const useStyles = makeStyles({
  root: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
  },
  titleBar: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    paddingLeft: '0',
    paddingRight: '8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
    position: 'relative',
    zIndex: DESKTOP_Z_PANEL_TITLE,
  },
  titleBarWeb: {
    height: '40px',
    zIndex: 1,
  },
  titleBarElectronWin: {
    paddingRight: '132px',
  },
  titleBarElectronMac: {
    paddingRight: '12px',
  },
  tabsWrap: {
    flex: '0 0 auto',
    minWidth: 0,
    maxWidth: '100%',
    paddingLeft: '15px',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    WebkitAppRegion: 'no-drag',
    pointerEvents: 'auto',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  tabs: {
    minHeight: 'unset',
    flexWrap: 'nowrap',
    width: 'max-content',
  },
  titleBarDragLead: {
    flex: '0 0 auto',
    alignSelf: 'stretch',
    minWidth: '8px',
  },
  dragFill: {
    flex: '1 1 auto',
    minWidth: '8px',
    alignSelf: 'stretch',
  },
  titleBarActions: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    WebkitAppRegion: 'no-drag',
    pointerEvents: 'auto',
  },
  content: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  tabPane: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  tabPaneHidden: {
    display: 'none',
  },
})

interface Props {
  electronChrome?: boolean
  chatColumnVisible?: boolean
  /** Skip left global toolbar band when sidebar overlay + panel spans full width. */
  chromeToolbarReserve?: number
  /** Right panel occupies full workspace width (chat column hidden). */
  panelFullWidth?: boolean
  focusStockCode?: string | null
  onFocusStockConsumed?: () => void
  onToggleRightPanel?: () => void
  onToggleChatColumn?: () => void
  onDiscussInChat?: (payload: StockDiscussPayload) => void
}

export default function RightMarketPanel({
  electronChrome = false,
  chatColumnVisible = true,
  chromeToolbarReserve = 0,
  panelFullWidth = false,
  focusStockCode = null,
  onFocusStockConsumed,
  onToggleRightPanel,
  onToggleChatColumn,
  onDiscussInChat,
}: Props) {
  const s = useStyles()
  const { items, addItem, updateItem, removeItem } = useWatchlist()
  const {
    holdingsByCode,
    loadTrades,
    submitTrade,
    deleteTrade,
    clearPortfolioForCode,
    refreshHoldings,
  } = useFollowPortfolio()
  const [tab, setTab] = useState<MarketTab>('watchlist')
  const [selected, setSelected] = useState<WatchlistItem | null>(null)
  const [manageStock, setManageStock] = useState<WatchlistItem | null>(null)
  const [dialogPrice, setDialogPrice] = useState<number | null>(null)
  const [localIndexed, setLocalIndexed] = useState<boolean | null>(null)
  const [localIndexLoading, setLocalIndexLoading] = useState(false)

  const selectedCode = selected?.code ?? null
  const electronWin = electronChrome && electronPlatform() !== 'darwin'

  const handleSelect = useCallback((item: WatchlistItem) => {
    setSelected(item)
    setTab('detail')
  }, [])

  const handleAdd = useCallback((item: WatchlistItem, opts?: { addedPrice?: number | null }) => {
    addItem(item, opts)
  }, [addItem])

  const handleManage = useCallback(async (item: WatchlistItem) => {
    const ref = resolveWatchlistInstrument(item)
    setManageStock(item)
    try {
      if (hasApplicationCapability(ref, 'batch_quote') || hasApplicationCapability(ref, 'quote')) {
        const resp = await research.instrumentQuotes([ref])
        setDialogPrice(resp.data?.quotes?.[0]?.price ?? null)
      } else {
        setDialogPrice(null)
      }
    } catch {
      setDialogPrice(null)
    }
  }, [])

  const handleSaveNote = useCallback((code: string, note: string) => {
    updateItem(code, { note: note || undefined })
  }, [updateItem])

  const detailStock = useMemo(() => {
    if (!selected) return null
    const key = watchlistItemKey(normalizeWatchlistItem(selected))
    return items.find(item => watchlistItemKey(normalizeWatchlistItem(item)) === key)
      ?? normalizeWatchlistItem(selected)
  }, [items, selected])

  const detailKind = useMemo(() => {
    if (!detailStock) return null
    return detailPanelKind(resolveWatchlistInstrument(detailStock))
  }, [detailStock])

  useEffect(() => {
    if (!detailStock || detailKind === 'cn-equity' || detailKind === 'cn-etf') {
      setLocalIndexed(null)
      setLocalIndexLoading(false)
      return
    }
    let cancelled = false
    setLocalIndexLoading(true)
    void research.searchInstruments(detailStock.code, 5)
      .then(resp => {
        if (cancelled) return
        const hits = resp.data?.items ?? []
        setLocalIndexed(hits.some(h => h.code.toUpperCase() === detailStock.code.toUpperCase()))
      })
      .catch(() => {
        if (!cancelled) setLocalIndexed(null)
      })
      .finally(() => {
        if (!cancelled) setLocalIndexLoading(false)
      })
    return () => { cancelled = true }
  }, [detailStock, detailKind])

  const handlePortfolioSelect = useCallback((code: string) => {
    const fromList = items.find(item => item.code === code || normalizeCode(item.code) === normalizeCode(code))
    const holding = holdingsByCode[normalizeCode(code)] ?? holdingsByCode[code]
    const item: WatchlistItem = fromList ?? normalizeWatchlistItem({
      code,
      name: holding?.name ?? code,
    })
    setSelected(item)
    setTab('detail')
  }, [items, holdingsByCode])

  const handleSelectPeer = useCallback((item: WatchlistItem) => {
    handleSelect(normalizeWatchlistItem(item))
  }, [handleSelect])

  useEffect(() => {
    if (!focusStockCode) return
    handlePortfolioSelect(focusStockCode)
    onFocusStockConsumed?.()
  }, [focusStockCode, handlePortfolioSelect, onFocusStockConsumed])

  const manageHolding = manageStock
    ? holdingsByCode[normalizeCode(manageStock.code)] ?? null
    : null

  const showDetailTab = tab === 'detail'
  /** Full-width panel: reserve global toolbar band as a dedicated drag zone (not tab padding). */
  const titleBarDragLeadWidth = electronChrome
    && panelFullWidth
    && !chatColumnVisible
    && chromeToolbarReserve > 0
    ? chromeToolbarReserve
    : 0

  useEffect(() => {
    if (tab === 'detail' && !selected) {
      setTab('watchlist')
    }
  }, [tab, selected])

  const handleTabSelect = useCallback((_: unknown, data: { value: unknown }) => {
    setTab(data.value as MarketTab)
  }, [])

  const showWorkspaceActions = Boolean(onToggleRightPanel || onToggleChatColumn)

  return (
    <div className={s.root}>
      <div
        className={mergeClasses(
          s.titleBar,
          !electronChrome && s.titleBarWeb,
          electronChrome && 'opptrix-right-panel-title-bar',
          electronChrome && (electronWin ? s.titleBarElectronWin : s.titleBarElectronMac),
        )}
      >
        {titleBarDragLeadWidth > 0 && (
          <div
            className={mergeClasses(s.titleBarDragLead, 'opptrix-right-panel-title-drag')}
            style={{ width: `${titleBarDragLeadWidth}px` }}
            aria-hidden
          />
        )}
        <div className={mergeClasses(s.tabsWrap, 'opptrix-panel-title-no-drag')}>
          <TabList
            className={s.tabs}
            size="small"
            selectedValue={tab}
            onTabSelect={handleTabSelect}
          >
            <Tab value="watchlist">关注</Tab>
            <Tab value="portfolio">组合</Tab>
            {showDetailTab ? <Tab value="detail">详情</Tab> : null}
          </TabList>
        </div>

        {electronChrome && (
          <div
            className={mergeClasses(s.dragFill, 'opptrix-right-panel-title-drag')}
            aria-hidden
          />
        )}

        {showWorkspaceActions && (
          <div className={mergeClasses(s.titleBarActions, 'opptrix-panel-title-no-drag')}>
            {onToggleChatColumn && (
              <ChromeToolButton
                label={chatColumnVisible ? '最大化右侧面板' : '恢复聊天区域'}
                iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
                onClick={onToggleChatColumn}
              >
                {chatColumnVisible
                  ? <ArrowMaximizeRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
                  : <ArrowMinimizeRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />}
              </ChromeToolButton>
            )}
            {onToggleRightPanel && (
              <ChromeToolButton
                label="收起右侧面板"
                iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
                active
                onClick={onToggleRightPanel}
              >
                <PanelRightContractRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
              </ChromeToolButton>
            )}
          </div>
        )}
      </div>

      <div className={s.content}>
        <div className={mergeClasses(s.tabPane, tab !== 'watchlist' && s.tabPaneHidden)}>
          <WatchlistTab
            items={items}
            selectedCode={selectedCode}
            holdingsByCode={holdingsByCode}
            onSelect={handleSelect}
            onManage={item => { void handleManage(item) }}
            onAdd={handleAdd}
            onPatchItem={updateItem}
            onRemove={code => {
              void clearPortfolioForCode(code)
              removeItem(code)
              const selectedKey = selected
                ? watchlistItemKey(normalizeWatchlistItem(selected))
                : null
              if (selected?.code === code || selectedKey === code) {
                setSelected(null)
                setTab('watchlist')
              }
              if (manageStock?.code === code) {
                setManageStock(null)
                setDialogPrice(null)
              }
            }}
          />
        </div>
        <div className={mergeClasses(s.tabPane, tab !== 'portfolio' && s.tabPaneHidden)}>
          <PortfolioTab
            active={tab === 'portfolio'}
            selectedCode={selectedCode}
            onSelect={handlePortfolioSelect}
          />
        </div>
        {tab === 'detail' && detailStock && detailKind === 'cn-etf' ? (
          <EtfDetailTab stock={detailStock} />
        ) : tab === 'detail' && detailStock && detailKind === 'crypto' ? (
          <CryptoDetailTab
            stock={detailStock}
            localIndexed={localIndexed}
            loading={localIndexLoading}
            onManage={() => { void handleManage(detailStock) }}
          />
        ) : tab === 'detail' && detailStock && detailKind === 'cross-market' ? (
          <CrossMarketDetailTab
            stock={detailStock}
            localIndexed={localIndexed}
            loading={localIndexLoading}
            onManage={() => { void handleManage(detailStock) }}
            onSelectPeer={handleSelectPeer}
          />
        ) : tab === 'detail' && detailStock && detailKind === 'cn-equity' ? (
          <StockDetailTab
            stock={detailStock}
            isHolding={detailStock ? (holdingsByCode[detailStock.code]?.shares ?? 0) > 0 : false}
            holding={detailStock ? holdingsByCode[detailStock.code] ?? null : null}
            onManage={detailStock ? () => { void handleManage(detailStock) } : undefined}
            onDiscussInChat={onDiscussInChat}
          />
        ) : null}

        <FollowStockDialog
          open={!!manageStock}
          stock={manageStock}
          currentPrice={dialogPrice}
          holding={manageHolding}
          portfolioEnabled={manageStock
            ? hasApplicationCapability(resolveWatchlistInstrument(manageStock), 'portfolio_pnl')
            : false}
          onClose={() => {
            setManageStock(null)
            setDialogPrice(null)
          }}
          onSaveNote={handleSaveNote}
          loadTrades={loadTrades}
          submitTrade={async payload => {
            const rows = await submitTrade(payload)
            await refreshHoldings()
            return rows
          }}
          deleteTrade={async (id, code) => {
            const rows = await deleteTrade(id, code)
            await refreshHoldings()
            return rows
          }}
        />
      </div>
    </div>
  )
}
