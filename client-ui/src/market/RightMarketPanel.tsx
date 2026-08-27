import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import { makeStyles, mergeClasses, Text } from '@fluentui/react-components'
import PortfolioTab from './PortfolioTab'
import WatchlistTab from './WatchlistTab'
import StockDetailTab from './StockDetailTab'
import IndexDetailTab from './IndexDetailTab'
import EtfDetailTab from './EtfDetailTab'
import FundDetailTab from './FundDetailTab'
import CryptoDetailTab from './CryptoDetailTab'
import CrossMarketDetailTab from './CrossMarketDetailTab'
import type { StockDiscussPayload } from './StockDecisionCard'
import FollowStockDialog from './FollowStockDialog'
import { useWatchlist } from './useWatchlist'
import { useMarketPanelUi, type MarketPanelTab } from './MarketPanelUiContext'
import { useWatchlistGroups } from './WatchlistGroupsContext'
import { useFollowPortfolio } from './useFollowPortfolio'
import type { WatchlistItem } from '../types/market'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import ChromeToolButton from '../desktop/ChromeToolButton'
import {
  DESKTOP_CHROME_TOP_OFFSET,
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_GAP,
  DESKTOP_Z_PANEL_TITLE,
} from '../desktop/constants'
import {
  PanelRightContractRegular,
  ArrowMaximizeRegular,
  ArrowMinimizeRegular,
} from '../chat/chatIcons'
import { electronPlatform } from '../platform/detect'
import { research } from '../api/client'
import { portfolioHoldingsKey } from './format'
import { lookupHoldingSnapshot } from './portfolioCalc'
import { portfolioHoldingDisplayName } from './portfolioWatchlist'
import {
  buildOpptrixInstrumentId,
  detailPanelKind,
  instrumentKey,
  normalizeWatchlistItem,
  tryParseInstrumentInput,
  normalizeInstrumentRefLocal,
  resolveWatchlistInstrument,
  watchlistItemKey,
  UNRESOLVED_INSTRUMENT_COPY,
} from './instrument'
import { hasApplicationCapability } from './capabilities'

type MarketTab = MarketPanelTab

const MARKET_TITLE_TABS: Array<{ value: MarketTab; label: string }> = [
  { value: 'watchlist', label: '关注' },
  { value: 'portfolio', label: '组合' },
  { value: 'detail', label: '详情' },
]

const useStyles = makeStyles({
  root: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
  },
  /** Electron: let ancestor `.opptrix-right-panel` / app-main tint show through (no solid cover). */
  rootElectron: {
    backgroundColor: 'transparent',
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
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvas,
    position: 'relative',
    zIndex: DESKTOP_Z_PANEL_TITLE,
  },
  titleBarElectronFill: {
    backgroundColor: 'transparent',
  },
  titleBarWeb: {
    height: '40px',
    zIndex: 1,
  },
  /**
   * Match DesktopWindowChrome tool band: top inset + center within remaining
   * chromeBand so tabs / actions share the file-box vertical midline.
   */
  titleBarElectron: {
    paddingTop: `${DESKTOP_CHROME_TOP_OFFSET}px`,
  },
  titleBarElectronWin: {
    paddingRight: '12px',
  },
  titleBarElectronMac: {
    paddingRight: '12px',
  },
  tabsWrap: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: `${DESKTOP_TOOL_GAP}px`,
    width: 'fit-content',
    maxWidth: '100%',
    height: '28px',
    paddingLeft: '15px',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    WebkitAppRegion: 'no-drag',
    pointerEvents: 'auto',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  /** Text pill — same hit height as ChromeToolButton md (28×28), ghost / accentSoft. */
  tab: {
    ...ghostInteractive,
    boxSizing: 'border-box',
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'auto',
    minWidth: 'unset',
    height: '28px',
    minHeight: '28px',
    maxHeight: '28px',
    padding: '0 10px',
    margin: 0,
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 400,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  tabSelected: {
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
      color: opptrixCssVars.accent,
    },
  },
  titleBarDragLead: {
    flex: '0 0 auto',
    alignSelf: 'stretch',
    minWidth: '8px',
  },
  /** Fills leftover title-bar space so tabs stay content-sized (never stretch). */
  titleBarSpacer: {
    flex: '1 1 auto',
    minWidth: '8px',
    alignSelf: 'stretch',
  },
  titleBarActions: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: `${DESKTOP_TOOL_GAP}px`,
    height: '28px',
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
  /** Right panel shell is open (not collapsed to zero width). */
  panelVisible?: boolean
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

function RightMarketPanel({
  panelVisible = true,
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
  const { items, addItemAndSync, updateItem, removeItem } = useWatchlist()
  const { removeItemMembership } = useWatchlistGroups()
  const { tab, setTab, selected, setSelected, selectDetail } = useMarketPanelUi()
  const {
    holdingsByCode,
    summary: portfolioSummary,
    loading: portfolioLoading,
    error: portfolioError,
    loadTrades,
    submitTrade,
    deleteTrade,
    clearPortfolioForCode,
    refreshHoldings,
  } = useFollowPortfolio({
    enabled: panelVisible && (tab === 'watchlist' || tab === 'portfolio'),
  })
  const [manageStock, setManageStock] = useState<WatchlistItem | null>(null)
  const [dialogPrice, setDialogPrice] = useState<number | null>(null)

  const selectedCode = selected?.code ?? null
  const electronWin = electronChrome && electronPlatform() !== 'darwin'

  const handleSelect = selectDetail

  const handleAdd = useCallback(async (item: WatchlistItem, opts?: { addedPrice?: number | null }) => {
    return addItemAndSync(item, opts)
  }, [addItemAndSync])

  const handleManage = useCallback(async (item: WatchlistItem) => {
    const ref = resolveWatchlistInstrument(item)
    setManageStock(item)
    try {
      if (ref && (hasApplicationCapability(ref, 'batch_quote') || hasApplicationCapability(ref, 'quote'))) {
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
    const ref = resolveWatchlistInstrument(detailStock)
    return ref ? detailPanelKind(ref) : null
  }, [detailStock])

  const detailStockRef = useRef(detailStock)
  detailStockRef.current = detailStock

  const handlePortfolioSelect = useCallback((code: string, market?: string) => {
    const holdingHint = holdingsByCode[portfolioHoldingsKey(code, market)]
      ?? holdingsByCode[code.trim()]
    const holdingAssetClass = holdingHint?.assetClass as
      | import('../types/instrument').InstrumentRef['assetClass']
      | undefined

    const fromList = items.find(item => {
      const ref = resolveWatchlistInstrument(item)
      if (!ref) return item.code === code
      const itemKey = portfolioHoldingsKey(item.code, ref.market, ref.assetClass)
      const targetKey = portfolioHoldingsKey(code, market ?? ref.market, holdingAssetClass ?? ref.assetClass)
      const parsedTarget = tryParseInstrumentInput(code)
      const targetInstrumentKey = parsedTarget
        ? instrumentKey(normalizeInstrumentRefLocal(
          holdingAssetClass ? { ...parsedTarget, assetClass: holdingAssetClass } : parsedTarget,
        ))
        : itemKey
      return itemKey === targetKey
        || instrumentKey(ref) === targetInstrumentKey
        || item.code === code
    })

    let ref = fromList ? resolveWatchlistInstrument(fromList) : null
    if (!ref) {
      const parsed = tryParseInstrumentInput(code)
        ?? (market ? tryParseInstrumentInput(`${market}:${code}`) : null)
      if (parsed) {
        ref = normalizeInstrumentRefLocal({
          ...parsed,
          ...(holdingHint?.market ? { market: holdingHint.market as import('../types/instrument').Market } : {}),
          ...(holdingAssetClass ? { assetClass: holdingAssetClass } : {}),
        })
      }
    }
    if (!ref) return

    const holding = lookupHoldingSnapshot(holdingsByCode, ref)
      ?? holdingHint
      ?? null

    // 禁止裸码进 selected：强制 Opptrix + instrument（保留 INDEX/FUND/REIT）
    const item = normalizeWatchlistItem(fromList ?? {
      code: buildOpptrixInstrumentId(ref),
      name: holding ? portfolioHoldingDisplayName(holding, items) : code,
      instrument: ref,
    })
    setSelected(item)
    setTab('detail')
  }, [items, holdingsByCode, setSelected, setTab])

  const manageRef = manageStock ? resolveWatchlistInstrument(manageStock) : null
  const manageHolding = manageStock && manageRef
    ? lookupHoldingSnapshot(holdingsByCode, manageRef)
    : null

  const detailRef = detailStock ? resolveWatchlistInstrument(detailStock) : null
  const detailManageEnabled = detailRef != null && hasApplicationCapability(detailRef, 'portfolio_pnl')
  const detailHolding = detailStock && detailRef
    ? lookupHoldingSnapshot(holdingsByCode, detailRef)
    : null

  const handleDetailManage = useCallback(() => {
    const current = detailStockRef.current
    if (!current) return
    void handleManage(current)
  }, [handleManage])

  const handleSelectPeer = useCallback((item: WatchlistItem) => {
    handleSelect(normalizeWatchlistItem(item))
  }, [handleSelect])

  const handleRemove = useCallback((item: WatchlistItem) => {
    const normalized = normalizeWatchlistItem(item)
    const ref = resolveWatchlistInstrument(normalized)
    const clearCode = ref ? buildOpptrixInstrumentId(ref) : normalized.code
    void (async () => {
      await clearPortfolioForCode(clearCode, ref?.market, ref?.assetClass)
      removeItemMembership(watchlistItemKey(normalized))
      removeItem(item.code)
      const selectedKey = selected
        ? watchlistItemKey(normalizeWatchlistItem(selected))
        : null
      const removedKey = watchlistItemKey(normalized)
      if (selected?.code === item.code || selectedKey === removedKey) {
        setSelected(null)
        setTab('watchlist')
      }
      if (manageStock?.code === item.code) {
        setManageStock(null)
        setDialogPrice(null)
      }
    })()
  }, [clearPortfolioForCode, removeItem, removeItemMembership, selected, manageStock])

  const handleManageClick = useCallback((item: WatchlistItem) => {
    void handleManage(item)
  }, [handleManage])

  useEffect(() => {
    if (!focusStockCode) return
    handlePortfolioSelect(focusStockCode)
    onFocusStockConsumed?.()
  }, [focusStockCode, handlePortfolioSelect, onFocusStockConsumed])

  const showDetailTab = selected != null
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

  const titleTabs = useMemo(
    () => MARKET_TITLE_TABS.filter(item => item.value !== 'detail' || showDetailTab),
    [showDetailTab],
  )

  const showWorkspaceActions = Boolean(onToggleRightPanel || onToggleChatColumn)

  return (
    <div className={mergeClasses(s.root, electronChrome && s.rootElectron)}>
      <div
        className={mergeClasses(
          s.titleBar,
          !electronChrome && s.titleBarWeb,
          electronChrome && s.titleBarElectron,
          electronChrome && s.titleBarElectronFill,
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
        <div
          className={mergeClasses(s.tabsWrap, 'opptrix-panel-title-no-drag')}
          role="tablist"
          aria-label="行情面板"
        >
          {titleTabs.map(item => {
            const selectedTab = tab === item.value
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selectedTab}
                className={mergeClasses(
                  s.tab,
                  selectedTab && s.tabSelected,
                  'opptrix-focusable',
                )}
                onClick={() => {
                  if (item.value !== tab) setTab(item.value)
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        <div
          className={mergeClasses(
            s.titleBarSpacer,
            electronChrome && 'opptrix-right-panel-title-drag',
          )}
          aria-hidden
        />

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
            active={panelVisible && tab === 'watchlist'}
            items={items}
            selectedCode={selectedCode}
            holdingsByCode={holdingsByCode}
            onSelect={handleSelect}
            onManage={handleManageClick}
            onAdd={handleAdd}
            onPatchItem={updateItem}
            onRemove={handleRemove}
          />
        </div>
        <div className={mergeClasses(s.tabPane, tab !== 'portfolio' && s.tabPaneHidden)}>
          <PortfolioTab
            active={panelVisible && tab === 'portfolio'}
            selectedCode={selectedCode}
            onSelect={handlePortfolioSelect}
            summary={portfolioSummary}
            loading={portfolioLoading}
            error={portfolioError}
            onRetry={() => { void refreshHoldings() }}
            watchlistItems={items}
            holdingsByCode={holdingsByCode}
          />
        </div>
        {tab === 'detail' && detailStock && detailKind === 'cn-index' ? (
          <IndexDetailTab stock={detailStock} />
        ) : tab === 'detail' && detailStock && detailKind === 'cn-fund' ? (
          <FundDetailTab
            stock={detailStock}
            isHolding={(detailHolding?.shares ?? 0) > 0}
            onManage={detailManageEnabled ? handleDetailManage : undefined}
          />
        ) : tab === 'detail' && detailStock && detailKind === 'cn-etf' ? (
          <EtfDetailTab stock={detailStock} />
        ) : tab === 'detail' && detailStock && detailKind === 'crypto' ? (
          <CryptoDetailTab
            stock={detailStock}
            onManage={detailManageEnabled ? handleDetailManage : undefined}
          />
        ) : tab === 'detail' && detailStock && detailKind === 'cross-market' ? (
          <CrossMarketDetailTab
            stock={detailStock}
            onManage={detailManageEnabled ? handleDetailManage : undefined}
            onSelectPeer={handleSelectPeer}
          />
        ) : tab === 'detail' && detailStock && detailKind === 'cn-equity' ? (
          <StockDetailTab
            stock={detailStock}
            isHolding={(detailHolding?.shares ?? 0) > 0}
            holding={detailHolding ?? null}
            onManage={detailManageEnabled ? handleDetailManage : undefined}
            onDiscussInChat={onDiscussInChat}
          />
        ) : tab === 'detail' && detailStock && !detailKind ? (
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text weight="semibold">{detailStock.name || detailStock.code}</Text>
            <Text size={200} style={{ color: opptrixCssVars.textSecondary }}>
              {UNRESOLVED_INSTRUMENT_COPY.hint}
            </Text>
            <Text size={200} style={{ color: opptrixCssVars.textTertiary }}>
              {UNRESOLVED_INSTRUMENT_COPY.listHint}
            </Text>
          </div>
        ) : null}

        <FollowStockDialog
          open={!!manageStock}
          stock={manageStock}
          currentPrice={dialogPrice}
          holding={manageHolding}
          portfolioEnabled={manageStock && manageRef
            ? hasApplicationCapability(manageRef, 'portfolio_pnl')
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
          deleteTrade={async (id, code, market, assetClass) => {
            const rows = await deleteTrade(id, code, market, assetClass)
            await refreshHoldings()
            return rows
          }}
          onFeesRecalculated={() => void refreshHoldings()}
        />
      </div>
    </div>
  )
}

export default memo(RightMarketPanel)
