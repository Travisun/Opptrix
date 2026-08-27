import { useMemo } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowDownRegular, ArrowUpRegular, SubtractRegular } from '@fluentui/react-icons'
import type { MarketDynamicsData, MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { formatPct } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { CN_DASH } from './cnDashboardTokens'

const useStyles = makeStyles({
  row: {
    display: 'flex',
    gap: '8px',
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  chip: {
    flex: '1 0 140px',
    minWidth: '140px',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    gap: '8px',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: '10px',
    border: CN_DASH.cardBorder,
    backgroundColor: opptrixCssVars.surface,
  },
  iconUp: { color: MARKET_UP },
  iconDown: { color: MARKET_DOWN },
  iconFlat: { color: opptrixCssVars.textTertiary },
  body: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 650,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  delta: {
    fontSize: '11px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  deltaUp: { color: MARKET_UP },
  deltaDown: { color: MARKET_DOWN },
  deltaFlat: { color: opptrixCssVars.textSecondary },
})

type Props = {
  data: MarketDynamicsData | null
  sectors: MarketIndexQuote[]
}

export default function CnCompactKpiRow({ data, sectors }: Props) {
  const s = useStyles()

  const chips = useMemo(() => {
    const limitUp = data?.cn_limit_up?.length ?? 0
    const limitBreak = data?.cn_limit_break?.length ?? 0
    const gainers = data?.cn_gainers?.length ?? 0
    const losers = data?.cn_losers?.length ?? 0
    const sortedSectors = [...sectors].sort((a, b) => {
      const av = a.change_pct
      const bv = b.change_pct
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })
    const top = sortedSectors[0]
    const ladderBoards = data?.cn_limit_ladder?.boards?.length ?? 0

    return [
      { label: '涨停', value: String(limitUp), delta: limitUp > 0 ? '活跃' : '—', tone: limitUp > 0 ? 'up' as const : 'flat' as const },
      { label: '炸板', value: String(limitBreak), delta: limitBreak > 0 ? '回落' : '—', tone: limitBreak > 0 ? 'down' as const : 'flat' as const },
      { label: '涨幅榜', value: String(gainers), delta: '只', tone: 'flat' as const },
      { label: '跌幅榜', value: String(losers), delta: '只', tone: 'flat' as const },
      { label: '连板', value: String(ladderBoards), delta: ladderBoards ? '档' : '—', tone: 'flat' as const },
      {
        label: '领涨',
        value: top?.name ?? '—',
        delta: top?.change_pct != null ? formatPct(top.change_pct, 2) : '—',
        tone: top?.change_pct != null && top.change_pct > 0
          ? 'up' as const
          : top?.change_pct != null && top.change_pct < 0
            ? 'down' as const
            : 'flat' as const,
      },
    ]
  }, [data, sectors])

  return (
    <div className={mergeClasses(s.row, 'opptrix-cn-compact-kpi', 'opptrix-scroll-x')}>
      {chips.map(chip => {
        const Icon = chip.tone === 'up'
          ? ArrowUpRegular
          : chip.tone === 'down'
            ? ArrowDownRegular
            : SubtractRegular
        const deltaClass = chip.tone === 'up'
          ? s.deltaUp
          : chip.tone === 'down'
            ? s.deltaDown
            : s.deltaFlat
        const iconClass = chip.tone === 'up'
          ? s.iconUp
          : chip.tone === 'down'
            ? s.iconDown
            : s.iconFlat

        return (
          <div key={chip.label} className={s.chip}>
            <Icon className={iconClass} fontSize={14} />
            <div className={s.body}>
              <span className={s.label}>{chip.label}</span>
              <span className={s.value}>{chip.value}</span>
            </div>
            <span className={mergeClasses(s.delta, deltaClass)}>{chip.delta}</span>
          </div>
        )
      })}
    </div>
  )
}
