import { useMemo } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketDynamicsData, MarketIndexQuote } from '../../types/schemas'
import StatCard from '../../components/StatCard'
import { formatPct } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gap: '8px',
    minWidth: 0,
  },
  rootStacked: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
})

type Props = {
  data: MarketDynamicsData | null
  sectors: MarketIndexQuote[]
  stacked?: boolean
}

export default function CnMarketKpiStrip({ data, sectors, stacked = false }: Props) {
  const s = useStyles()

  const metrics = useMemo(() => {
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
    const topSector = sortedSectors[0]
    const ladderBoards = data?.cn_limit_ladder?.boards?.length ?? 0

    return [
      {
        label: '涨停',
        value: limitUp,
        color: limitUp > 0 ? MARKET_UP : undefined,
        tooltip: '当日涨停家数',
      },
      {
        label: '炸板',
        value: limitBreak,
        color: limitBreak > 0 ? MARKET_DOWN : undefined,
        tooltip: '曾涨停后回落',
      },
      {
        label: '涨幅榜',
        value: gainers,
        tooltip: '涨幅前列个股',
      },
      {
        label: '跌幅榜',
        value: losers,
        tooltip: '跌幅前列个股',
      },
      {
        label: '连板梯队',
        value: ladderBoards,
        unit: ladderBoards ? '档' : undefined,
        tooltip: '连板天梯档位数',
      },
      {
        label: '领涨板块',
        value: topSector?.name ?? '—',
        color: topSector?.change_pct != null && topSector.change_pct > 0
          ? MARKET_UP
          : topSector?.change_pct != null && topSector.change_pct < 0
            ? MARKET_DOWN
            : opptrixCssVars.textPrimary,
        tooltip: topSector?.change_pct != null
          ? `${topSector.name} ${formatPct(topSector.change_pct, 2)}`
          : '板块指数涨跌前列',
      },
    ]
  }, [data, sectors])

  return (
    <div className={mergeClasses(s.root, stacked && s.rootStacked, 'opptrix-cn-kpi-strip')}>
      {metrics.map(item => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          unit={item.unit}
          tooltip={item.tooltip}
          color={item.color}
        />
      ))}
    </div>
  )
}
