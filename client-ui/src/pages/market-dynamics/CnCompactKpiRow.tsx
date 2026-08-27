import { useMemo } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowDownRegular, ArrowUpRegular, SubtractRegular } from '@fluentui/react-icons'
import type { MarketDynamicsData, MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { formatPct } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { CN_DASH } from './cnDashboardTokens'
import { useCnSelectCardStyles } from './cnSelectCardStyles'

export type CnKpiAction =
  | 'limit_up'
  | 'limit_break'
  | 'gainers'
  | 'losers'
  | 'ladder'
  | 'top_sector'

type ChipTone = 'up' | 'down' | 'flat'

type Chip = {
  action: CnKpiAction
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
    flex: '1 0 188px',
    minWidth: '188px',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    gap: '10px',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '10px',
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
    gap: '2px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 650,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
  },
  value: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  status: {
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusUp: { color: MARKET_UP },
  statusDown: { color: MARKET_DOWN },
  statusFlat: { color: opptrixCssVars.textSecondary },
  statusMuted: { color: opptrixCssVars.textTertiary },
})

type Props = {
  data: MarketDynamicsData | null
  sectors: MarketIndexQuote[]
  loading?: boolean
  onMetricClick?: (action: CnKpiAction) => void
}

export default function CnCompactKpiRow({
  data,
  sectors,
  loading = false,
  onMetricClick,
}: Props) {
  const s = useStyles()
  const cardS = useCnSelectCardStyles()

  const chips = useMemo((): Chip[] => {
    if (loading && !data) {
      return [
        { action: 'limit_up', label: '涨停', value: '…', status: '加载中', tone: 'flat' },
        { action: 'limit_break', label: '炸板', value: '…', status: '加载中', tone: 'flat' },
        { action: 'gainers', label: '涨幅榜', value: '…', status: '加载中', tone: 'flat' },
        { action: 'losers', label: '跌幅榜', value: '…', status: '加载中', tone: 'flat' },
        { action: 'ladder', label: '连板', value: '…', status: '加载中', tone: 'flat' },
        { action: 'top_sector', label: '领涨板块', value: '…', status: '加载中', tone: 'flat' },
      ]
    }

    const limitUp = data?.cn_limit_up?.length ?? 0
    const limitBreak = data?.cn_limit_break?.length ?? 0
    const gainers = data?.cn_gainers?.length ?? 0
    const losers = data?.cn_losers?.length ?? 0
    const ladder = data?.cn_limit_ladder
    const ladderBoards = ladder?.boards?.length ?? 0
    const ladderTotal = ladder?.boards?.reduce((sum, b) => sum + b.items.length, 0) ?? 0

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
        action: 'limit_up',
        label: '涨停',
        value: `${limitUp} 家`,
        status: limitUp > 0 ? '短线情绪偏强' : '今日暂无涨停',
        tone: limitUp > 0 ? 'up' : 'flat',
      },
      {
        action: 'limit_break',
        label: '炸板',
        value: `${limitBreak} 家`,
        status: limitBreak > 0 ? '高位分歧增加' : '暂无炸板回落',
        tone: limitBreak > 0 ? 'down' : 'flat',
      },
      {
        action: 'gainers',
        label: '涨幅榜',
        value: `${gainers} 只`,
        status: gainers > 0 ? '涨幅前列个股' : '榜单待更新',
        tone: gainers > 0 ? 'up' : 'flat',
      },
      {
        action: 'losers',
        label: '跌幅榜',
        value: `${losers} 只`,
        status: losers > 0 ? '跌幅前列个股' : '榜单待更新',
        tone: losers > 0 ? 'down' : 'flat',
      },
      {
        action: 'ladder',
        label: '连板',
        value: ladderBoards > 0 ? `${ladderBoards} 档 · ${ladderTotal} 只` : '0 档',
        status: ladder?.date
          ? `天梯 ${ladder.date}`
          : ladderBoards > 0
            ? '连板梯队活跃'
            : '暂无连板天梯',
        tone: ladderBoards > 0 ? 'up' : 'flat',
      },
      {
        action: 'top_sector',
        label: '领涨板块',
        value: top?.name ?? (sectors.length ? '待刷新' : '暂无'),
        status: top?.change_pct != null
          ? formatPct(top.change_pct, 2)
          : sectors.length
            ? '涨跌待同步'
            : '请确认板块数据源',
        tone: top?.change_pct != null && top.change_pct > 0
          ? 'up'
          : top?.change_pct != null && top.change_pct < 0
            ? 'down'
            : 'flat',
      },
    ]
  }, [data, loading, sectors])

  return (
    <div className={mergeClasses(s.row, 'opptrix-cn-compact-kpi', 'opptrix-scroll-x')}>
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
            : chip.status.includes('加载') || chip.status.includes('暂无') || chip.status.includes('待')
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
              <span className={s.value}>{chip.value}</span>
              <span className={mergeClasses(s.status, statusClass)}>{chip.status}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
