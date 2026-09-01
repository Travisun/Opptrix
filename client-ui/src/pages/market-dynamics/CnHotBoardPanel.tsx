import { useMemo, useState } from 'react'
import { Input, Spinner, Text, makeStyles } from '@fluentui/react-components'
import type { MarketHotItem } from '../../types/schemas'
import CnDashboardFlexPanel from './CnDashboardFlexPanel'
import CnInsightSplitView from './CnInsightSplitView'
import type { CnInsightStockPick } from './cnInsightStockUtils'
import { CnInsightListPad, CnInsightStockRow } from './cnInsightListStyles'
import { CnInsightListSkeleton } from './cnDashboardSkeletons'
import { hotBoardRowMeta } from './cnHotBoardUtils'
import { useCnHotBoardHistory } from './useCnHotBoardHistory'
import { opptrixCssVars } from '../../theme/tokens'

type HotBoardTab = 'skyrocket' | 'hot' | 'history'

const TAB_ITEMS: { value: HotBoardTab; label: string }[] = [
  { value: 'skyrocket', label: '飙升榜' },
  { value: 'hot', label: '热股榜' },
  { value: 'history', label: '历史排行' },
]

const useStyles = makeStyles({
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  dateRow: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px 0',
  },
  dateLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  dateInput: {
    flex: 1,
    minWidth: 0,
    maxWidth: '160px',
  },
  dateHint: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '20px 14px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.55,
  },
})

type Props = {
  skyrocket?: MarketHotItem[]
  hotStocks?: MarketHotItem[]
  loading?: boolean
  emotionSource?: 'tonghuashun' | null
  isMobile?: boolean
}

function HotBoardList({
  items,
  emptyTitle,
  emptyHint,
}: {
  items: MarketHotItem[]
  emptyTitle: string
  emptyHint: string
}) {
  const s = useStyles()
  if (!items.length) {
    return (
      <div className={s.empty}>
        <div>{emptyTitle}</div>
        <div>{emptyHint}</div>
      </div>
    )
  }
  return (
    <CnInsightListPad fill>
      {items.map(item => (
        <CnInsightStockRow
          key={item.code}
          code={item.code}
          name={item.name}
          meta={hotBoardRowMeta(item)}
          price={item.price}
          changePct={item.change_pct}
          changeAmt={item.change_amt}
        />
      ))}
    </CnInsightListPad>
  )
}

export default function CnHotBoardPanel({
  skyrocket = [],
  hotStocks = [],
  loading = false,
  emotionSource,
  isMobile = false,
}: Props) {
  const s = useStyles()
  const [tab, setTab] = useState<HotBoardTab>('skyrocket')
  const [selected, setSelected] = useState<CnInsightStockPick | null>(null)
  const history = useCnHotBoardHistory(tab === 'history')

  const activeItems = useMemo(() => {
    if (tab === 'skyrocket') return skyrocket
    if (tab === 'hot') return hotStocks
    return history.items
  }, [tab, skyrocket, hotStocks, history.items])

  const subtitle = useMemo(() => {
    if (emotionSource !== 'tonghuashun' && tab !== 'history') {
      return '配置高级行情源后可查看热榜'
    }
    if (tab === 'history' && history.queryDate) {
      return `查询日 ${history.queryDate} · 日榜 Top30 · 收盘涨跌`
    }
    return '同花顺日榜 · Top30'
  }, [emotionSource, tab, history.queryDate])

  const listLoading = tab === 'history'
    ? history.loading && !history.items.length
    : loading && !activeItems.length

  const renderList = () => {
    if (listLoading) {
      return <CnInsightListSkeleton fill />
    }
    if (tab === 'history' && history.error && !history.items.length) {
      return (
        <div className={s.empty}>
          <div>{history.error}</div>
          <div>请选择其他交易日重试</div>
        </div>
      )
    }
    if (tab === 'skyrocket') {
      return (
        <HotBoardList
          items={skyrocket}
          emptyTitle="暂无飙升榜"
          emptyHint={emotionSource === 'tonghuashun'
            ? '交易时段内将自动更新'
            : '请在设置中启用同花顺行情源'}
        />
      )
    }
    if (tab === 'hot') {
      return (
        <HotBoardList
          items={hotStocks}
          emptyTitle="暂无热股榜"
          emptyHint={emotionSource === 'tonghuashun'
            ? '交易时段内将自动更新'
            : '请在设置中启用同花顺行情源'}
        />
      )
    }
    return (
      <HotBoardList
        items={history.items}
        emptyTitle={history.error || '暂无历史排行'}
        emptyHint="非交易日已自动对齐至最近一个交易日"
      />
    )
  }

  return (
    <CnDashboardFlexPanel
      title="同花顺热榜"
      subtitle={subtitle}
      fill
      tabConfig={{
        tabs: TAB_ITEMS,
        value: tab,
        onChange: next => {
          setTab(next)
          setSelected(null)
        },
        ariaLabel: '同花顺热榜',
      }}
    >
      <div className={s.body}>
        {tab === 'history' ? (
          <div className={s.dateRow}>
            <Text className={s.dateLabel}>日期</Text>
            <Input
              className={s.dateInput}
              type="date"
              size="small"
              value={history.pickerDate ?? ''}
              onChange={(_e, data) => {
                if (data.value) history.onPickerChange(data.value)
              }}
            />
            {history.loading ? <Spinner size="tiny" /> : null}
            {history.queryDate && history.pickerDate !== history.queryDate ? (
              <span className={s.dateHint}>已对齐交易日</span>
            ) : null}
          </div>
        ) : null}
        <CnInsightSplitView
          selected={selected}
          onSelect={setSelected}
          presentation={isMobile ? 'drawer' : 'split'}
        >
          {renderList()}
        </CnInsightSplitView>
      </div>
    </CnDashboardFlexPanel>
  )
}
