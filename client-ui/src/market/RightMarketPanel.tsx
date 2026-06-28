import { useCallback, useMemo, useState } from 'react'
import { Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import WatchlistTab from './WatchlistTab'
import StockDetailTab from './StockDetailTab'
import { useWatchlist } from './useWatchlist'
import type { WatchlistItem } from '../types/market'
import { innoTokens } from '../theme/tokens'

type MarketTab = 'watchlist' | 'detail'

const useStyles = makeStyles({
  root: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: innoTokens.canvas,
  },
  header: {
    flexShrink: 0,
    padding: '10px 12px 0',
    borderBottom: `1px solid ${innoTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  kicker: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: innoTokens.textTertiary,
    textTransform: 'uppercase',
  },
  tabs: {
    minHeight: '34px',
  },
  content: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
})

export default function RightMarketPanel() {
  const s = useStyles()
  const { items, addItem, removeItem } = useWatchlist()
  const [tab, setTab] = useState<MarketTab>('watchlist')
  const [selected, setSelected] = useState<WatchlistItem | null>(null)

  const selectedCode = selected?.code ?? null

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

  return (
    <div className={s.root}>
      <div className={s.header}>
        <Text className={s.kicker}>MARKET DESK</Text>
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
