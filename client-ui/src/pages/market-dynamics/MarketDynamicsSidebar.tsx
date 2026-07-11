import { useMemo } from 'react'
import { Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketDynamicsSection, MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatPct, formatPrice, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { indexChartCodeFromQuote } from './cnIndexChartStorage'
import { indexKey, isCnChartableIndex } from './marketBoardUtils'

const CONTENT_PAD = '10px'

const REGION_TABS = [
  { id: 'spotlight', label: '概览' },
  { id: 'cn_major', label: 'A股' },
  { id: 'asia', label: '亚太' },
  { id: 'europe', label: '欧洲' },
  { id: 'america', label: '美洲' },
] as const

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixCssVars.canvas,
    borderRight: `1px solid ${opptrixCssVars.separatorStrong}`,
  },
  rootStacked: {
    borderRight: 'none',
  },
  chrome: {
    flexShrink: 0,
    backgroundColor: opptrixCssVars.canvas,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    padding: '4px 10px 6px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  chromeMeta: {
    flex: '0 0 auto',
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  tabList: {
    flex: 1,
    minWidth: 0,
    minHeight: 'unset',
    gap: '2px',
    '& .fui-Tab': {
      backgroundColor: 'transparent',
      ':enabled:hover': { backgroundColor: 'transparent' },
      ':enabled:active': { backgroundColor: 'transparent' },
      ':focus': { backgroundColor: 'transparent' },
      ':focus-visible': { backgroundColor: 'transparent' },
    },
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    padding: '6px 10px 4px',
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.03em',
    whiteSpace: 'nowrap',
  },
  sectionHint: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: `0 ${CONTENT_PAD} 12px`,
  },
  row: {...ghostInteractive,

    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '6px 8px',
    alignItems: 'center',
    padding: '6px 8px',
    minHeight: '28px',
    borderRadius: '6px',
':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowStatic: {
    cursor: 'default',
    ':hover': { backgroundColor: 'transparent' },
  },
  rowClickable: {
    cursor: 'pointer',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    backgroundColor: 'transparent',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowSelected: {
    backgroundColor: opptrixCssVars.accentSoft,
  },
  rowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  rowTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowNum: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  rowPct: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    minWidth: '52px',
    whiteSpace: 'nowrap',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    padding: '16px 12px',
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.5,
  },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

type Props = {
  sections: MarketDynamicsSection[]
  cnIndices: MarketIndexQuote[]
  loading: boolean
  stacked?: boolean
  regionId: string
  onRegionChange: (id: string) => void
  selectedChartCode?: string | null
  onIndexSelect?: (item: MarketIndexQuote) => void
}

export default function MarketDynamicsSidebar({
  sections,
  cnIndices,
  loading,
  stacked = false,
  regionId,
  onRegionChange,
  selectedChartCode = null,
  onIndexSelect,
}: Props) {
  const s = useStyles()

  const availableRegions = useMemo(
    () => REGION_TABS.filter(row => sections.some(sec => sec.id === row.id && sec.items.length > 0)),
    [sections],
  )

  const regionItems = useMemo(() => {
    const sec = sections.find(row => row.id === regionId)
    return sec?.items ?? []
  }, [sections, regionId])

  const renderRow = (item: MarketIndexQuote) => {
    const key = indexKey(item)
    const chartable = isCnChartableIndex(item, cnIndices)
    const code = chartable ? indexChartCodeFromQuote(item) : null
    const selected = Boolean(code && selectedChartCode === code)

    const content = (
      <>
        <div className={s.rowBody}>
          <span className={s.rowTitle}>{item.name}</span>
          <span className={s.rowMeta}>
            {[item.location, item.trade_state_label].filter(Boolean).join(' · ') || (chartable ? '点击查看走势' : '—')}
          </span>
        </div>
        <span className={s.rowNum}>
          {item.price != null ? formatPrice(item.price, 2) : '—'}
        </span>
        <span className={mergeClasses(s.rowPct, pctClass(s, item.change_pct))}>
          {formatPct(item.change_pct, 2)}
        </span>
      </>
    )

    if (chartable && onIndexSelect) {
      return (
        <button
          key={key}
          type="button"
          className={mergeClasses(
            s.row,
            s.rowClickable,
            selected && s.rowSelected,
          )}
          onClick={() => onIndexSelect(item)}
          aria-pressed={selected}
        >
          {content}
        </button>
      )
    }

    return (
      <div key={key} className={mergeClasses(s.row, s.rowStatic)}>
        {content}
      </div>
    )
  }

  return (
    <div className={mergeClasses(s.root, stacked && s.rootStacked, 'opptrix-market-dynamics-sidebar')}>
      <div className={s.chrome}>
        <Text className={s.chromeMeta}>区域</Text>
        {availableRegions.length > 0 && (
          <TabList
            className={s.tabList}
            size="small"
            appearance="subtle"
            selectedValue={regionId}
            onTabSelect={(_, d) => onRegionChange(String(d.value))}
          >
            {availableRegions.map(row => (
              <Tab key={row.id} value={row.id}>{row.label}</Tab>
            ))}
          </TabList>
        )}
      </div>

      <div className={mergeClasses(s.scroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        <div className={s.sectionHead}>
          <Text className={s.sectionTitle}>指数列表</Text>
          <Text className={s.sectionHint}>A 股指数可点查看 K 线</Text>
        </div>
        {loading && !sections.length ? (
          <div className={s.loading}><Spinner size="small" label="加载行情…" /></div>
        ) : (
          <div className={s.list}>
            {!regionItems.length && <div className={s.empty}>暂无指数数据</div>}
            {regionItems.map(renderRow)}
          </div>
        )}
      </div>
    </div>
  )
}
