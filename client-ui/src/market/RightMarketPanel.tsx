import { useCallback, useMemo, useState } from 'react'
import { Tab, TabList, makeStyles, mergeClasses } from '@fluentui/react-components'
import WatchlistTab from './WatchlistTab'
import StockDetailTab from './StockDetailTab'
import { useWatchlist } from './useWatchlist'
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
    paddingLeft: '8px',
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
  const { items, addItem, removeItem } = useWatchlist()
  const [tab, setTab] = useState<MarketTab>('watchlist')
  const [selected, setSelected] = useState<WatchlistItem | null>(null)

  const selectedCode = selected?.code ?? null
  const electronWin = electronChrome && electronPlatform() !== 'darwin'

  const handleSelect = useCallback((item: WatchlistItem) => {
    setSelected(item)
    setTab('detail')
  }, [])

  const handleAdd = useCallback((item: WatchlistItem) => {
    addItem(item)
  }, [addItem])

  const detailStock = useMemo(() => {
    if (!selected) return null
    return items.find(item => item.code === selected.code) ?? selected
  }, [items, selected])

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
            <Tab value="watchlist">自选</Tab>
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
            onSelect={handleSelect}
            onAdd={handleAdd}
            onRemove={code => {
              removeItem(code)
              if (selected?.code === code) {
                setSelected(null)
                setTab('watchlist')
              }
            }}
          />
        ) : (
          <StockDetailTab stock={detailStock} />
        )}
      </div>
    </div>
  )
}
