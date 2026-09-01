import { useMemo } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowDownRegular, ArrowUpRegular, SubtractRegular } from '@fluentui/react-icons'
import type { MarketIndexQuote, MarketStockMover } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { CN_DASH } from './cnDashboardTokens'
import { useCnSelectCardStyles } from './cnSelectCardStyles'
import { CnKpiRowSkeleton } from './cnDashboardSkeletons'
import { computeMarketMood } from './marketBoardUtils'

export type HkKpiAction = 'gainers' | 'losers' | 'trending' | 'top_sector' | 'mood'

type ChipTone = 'up' | 'down' | 'flat'

type Chip = {
  action: HkKpiAction
  label: string
  value: string
  status: string
  tone: ChipTone
}

const useStyles = makeStyles({
  row: {
    display: 'flex',
    gap: '8px',
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  chipInner: {
    flex: '1 0 160px',
    minWidth: '160px',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    gap: '10px',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: CN_DASH.cardRadius,
  },
  iconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    backgroundColor: opptrixCssVars.surfaceMuted,
    flexShrink: 0,
  },
  iconUp: { color: MARKET_UP },
  iconDown: { color: MARKET_DOWN },
  iconFlat: { color: opptrixCssVars.textTertiary },
  body: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 650,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
    minWidth: 0,
  },
  value: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  status: {
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
    flex: '1 1 auto',
    minWidth: 0,
  },
  statusUp: { color: MARKET_UP },
  statusDown: { color: MARKET_DOWN },
  statusFlat: { color: opptrixCssVars.textSecondary },
  statusMuted: { color: opptrixCssVars.textTertiary },
})

type Props = {
  gainers: MarketStockMover[]
  losers: MarketStockMover[]
  trending: MarketStockMover[]
  indices: MarketIndexQuote[]
  sectors: MarketIndexQuote[]
  loading?: boolean
  onMetricClick?: (action: HkKpiAction) => void
}

export default function HkCompactKpiRow({
  gainers,
  losers,
  trending,
  indices,
  sectors,
  loading = false,
  onMetricClick,
}: Props) {
  const s = useStyles()
  const cardS = useCnSelectCardStyles()

  const chips = useMemo((): Chip[] => {
    const mood = computeMarketMood([{ id: 'hk_major', title: '', items: indices }])
    const gainersCount = gainers.length
    const losersCount = losers.length
    const trendingCount = trending.length

    const sortedSectors = [...sectors].sort((a, b) => {
      const av = a.change_pct
      const bv = b.change_pct
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })
    const top = sortedSectors[0]

    return [
      {
        action: 'gainers',
        label: '涨幅榜',
        value: `${gainersCount} 只`,
        status: gainersCount > 0 ? '涨幅前列' : '榜单待更新',
        tone: gainersCount > 0 ? 'up' : 'flat',
      },
      {
        action: 'losers',
        label: '跌幅榜',
        value: `${losersCount} 只`,
        status: losersCount > 0 ? '跌幅前列' : '榜单待更新',
        tone: losersCount > 0 ? 'down' : 'flat',
      },
      {
        action: 'trending',
        label: '热门',
        value: `${trendingCount} 只`,
        status: trendingCount > 0 ? '讨论热度较高' : '热门待更新',
        tone: trendingCount > 0 ? 'up' : 'flat',
      },
      {
        action: 'top_sector',
        label: '领涨板块',
        value: top?.name ?? (sectors.length ? '待刷新' : '暂无'),
        status: top?.change_pct != null
          ? `${top.change_pct > 0 ? '+' : ''}${top.change_pct.toFixed(2)}%`
          : sectors.length
            ? '涨跌待同步'
            : '请稍后刷新',
        tone: top?.change_pct != null && top.change_pct > 0
          ? 'up'
          : top?.change_pct != null && top.change_pct < 0
            ? 'down'
            : 'flat',
      },
      {
        action: 'mood',
        label: '指数情绪',
        value: mood.label,
        status: `${mood.up} 涨 · ${mood.down} 跌`,
        tone: mood.up > mood.down ? 'up' : mood.down > mood.up ? 'down' : 'flat',
      },
    ]
  }, [gainers.length, indices, losers.length, sectors, trending.length])

  if (loading) {
    return (
      <div className={mergeClasses(s.row, 'opptrix-hk-compact-kpi', 'opptrix-scroll-x')}>
        <CnKpiRowSkeleton />
      </div>
    )
  }

  return (
    <div className={mergeClasses(s.row, 'opptrix-hk-compact-kpi', 'opptrix-scroll-x')}>
      {chips.map(chip => {
        const Icon = chip.tone === 'up'
          ? ArrowUpRegular
          : chip.tone === 'down'
            ? ArrowDownRegular
            : SubtractRegular
        const iconClass = chip.tone === 'up'
          ? s.iconUp
          : chip.tone === 'down'
            ? s.iconDown
            : s.iconFlat
        const statusClass = chip.tone === 'up'
          ? s.statusUp
          : chip.tone === 'down'
            ? s.statusDown
            : chip.status.includes('暂无') || chip.status.includes('待')
              ? s.statusMuted
              : s.statusFlat
        const chipKey = `${chip.action}-${chip.label}`

        return (
          <button
            key={chipKey}
            type="button"
            className={mergeClasses(cardS.card, s.chipInner)}
            title={`查看${chip.label}`}
            onClick={() => onMetricClick?.(chip.action)}
          >
            <div className={s.iconWrap}>
              <Icon className={iconClass} fontSize={14} />
            </div>
            <div className={s.body}>
              <span className={s.label}>{chip.label}</span>
              <div className={s.valueRow}>
                <span className={s.value}>{chip.value}</span>
                <span className={mergeClasses(s.status, statusClass)}>{chip.status}</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
