import { useCallback, useMemo, useState } from 'react'
import { Tab, TabList, makeStyles, mergeClasses } from '@fluentui/react-components'
import WatchlistTab from './WatchlistTab'
import StockDetailTab from './StockDetailTab'
import FollowStockDialog from './FollowStockDialog'
import { useWatchlist } from './useWatchlist'
import { useFollowPortfolio } from './useFollowPortfolio'
import type { WatchlistItem } from '../types/market'
import { innoTokens } from '../theme/tokens'
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

type MarketTab = 'watchlist' | 'detail'

const useStyles = makeStyles({
  root: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: innoTokens.canvas,
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
    borderBottom: `1px solid ${innoTokens.separator}`,
    backgroundColor: innoTokens.canvas,
    position: 'relative',
    zIndex: DESKTOP_Z_PANEL_TITLE,
    pointerEvents: 'auto',
  },
  titleBarElectron: {
    WebkitAppRegion: 'drag',
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
    flexShrink: 0,
    maxWidth: '100%',
    paddingLeft: '15px',
    WebkitAppRegion: 'no-drag',
    pointerEvents: 'auto',
  },
  tabs: {
    minHeight: 'unset',
  },
  dragFill: {
    flex: 1,
    minWidth: '8px',
    alignSelf: 'stretch',
    WebkitAppRegion: 'drag',
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
})

interface Props {
  electronChrome?: boolean
  chatColumnVisible?: boolean
  onToggleRightPanel?: () => void
  onToggleChatColumn?: () => void
}

export default function RightMarketPanel({
  electronChrome = false,
  chatColumnVisible = true,
  onToggleRightPanel,
  onToggleChatColumn,
}: Props) {
  const s = useStyles()
  const { items, addItem, updateItem, removeItem } = useWatchlist()
  const {
    holdingsByCode,
    loadTrades,
    submitTrade,
    deleteTrade,
    refreshHoldings,
  } = useFollowPortfolio()
  const [tab, setTab] = useState<MarketTab>('watchlist')
  const [selected, setSelected] = useState<WatchlistItem | null>(null)
  const [manageStock, setManageStock] = useState<WatchlistItem | null>(null)
  const [dialogPrice, setDialogPrice] = useState<number | null>(null)

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
    setManageStock(item)
    try {
      const resp = await research.stockQuotes([item.code])
      setDialogPrice(resp.data?.quotes?.[0]?.price ?? null)
    } catch {
      setDialogPrice(null)
    }
  }, [])

  const handleSaveNote = useCallback((code: string, note: string) => {
    updateItem(code, { note: note || undefined })
  }, [updateItem])

  const detailStock = useMemo(() => {
    if (!selected) return null
    return items.find(item => item.code === selected.code) ?? selected
  }, [items, selected])

  const manageHolding = manageStock
    ? holdingsByCode[normalizeCode(manageStock.code)] ?? null
    : null

  const showWorkspaceActions = Boolean(onToggleRightPanel || onToggleChatColumn)

  return (
    <div className={s.root}>
      <div
        className={mergeClasses(
          s.titleBar,
          !electronChrome && s.titleBarWeb,
          electronChrome && s.titleBarElectron,
          electronChrome && 'inno-right-panel-title-bar',
          electronChrome && (electronWin ? s.titleBarElectronWin : s.titleBarElectronMac),
        )}
      >
        <div className={mergeClasses(s.tabsWrap, 'inno-panel-title-no-drag')}>
          <TabList
            className={s.tabs}
            size="small"
            selectedValue={tab}
            onTabSelect={(_, data) => setTab(data.value as MarketTab)}
          >
            <Tab value="watchlist">关注</Tab>
            <Tab value="detail" disabled={!selected}>个股</Tab>
          </TabList>
        </div>

        {electronChrome && <div className={s.dragFill} aria-hidden />}

        {showWorkspaceActions && (
          <div className={mergeClasses(s.titleBarActions, 'inno-panel-title-no-drag')}>
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
        {tab === 'watchlist' ? (
          <WatchlistTab
            items={items}
            selectedCode={selectedCode}
            holdingsByCode={holdingsByCode}
            onSelect={handleSelect}
            onManage={item => { void handleManage(item) }}
            onAdd={handleAdd}
            onPatchItem={updateItem}
            onRemove={code => {
              removeItem(code)
              if (selected?.code === code) {
                setSelected(null)
                setTab('watchlist')
              }
            }}
          />
        ) : (
          <StockDetailTab
            stock={detailStock}
            isHolding={detailStock ? (holdingsByCode[detailStock.code]?.shares ?? 0) > 0 : false}
            onManage={detailStock ? () => { void handleManage(detailStock) } : undefined}
          />
        )}

        <FollowStockDialog
          open={!!manageStock}
          stock={manageStock}
          currentPrice={dialogPrice}
          holding={manageHolding}
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
