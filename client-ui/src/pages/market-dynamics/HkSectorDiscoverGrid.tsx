import { useMemo } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { indexKey } from './marketBoardUtils'
import { sectorIndexCode } from './MarketSectorStrip'
import CnDashboardFlexPanel from './CnDashboardFlexPanel'
import CnQuoteUnitCard from './CnQuoteUnitCard'
import { useCnHeroCardStyles } from './cnSelectCardStyles'
import { CnSectorGridSkeleton } from './cnDashboardSkeletons'

const useStyles = makeStyles({
  scrollWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: '10px 12px 12px',
  },
  grid: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridAutoRows: 'min-content',
    alignContent: 'start',
    gap: '8px',
  },
  cardInner: {
    padding: '10px 12px',
    borderRadius: '10px',
    width: '100%',
    boxSizing: 'border-box',
  },
  empty: {
    gridColumn: '1 / -1',
    padding: '24px 8px',
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
})

type Props = {
  sectors: MarketIndexQuote[]
  selectedCode?: string | null
  loading?: boolean
  emptyHint?: string
  onSelect?: (item: MarketIndexQuote) => void
}

export default function HkSectorDiscoverGrid({
  sectors,
  selectedCode,
  loading = false,
  emptyHint,
  onSelect,
}: Props) {
  const s = useStyles()
  const cardS = useCnHeroCardStyles()

  const items = useMemo(() => [...sectors].sort((a, b) => {
    const av = a.change_pct
    const bv = b.change_pct
    if (av == null && bv == null) return a.name.localeCompare(b.name, 'zh-CN')
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av
  }), [sectors])

  const panelSubtitle = loading && !sectors.length
    ? '板块 ETF'
    : `${items.length} 个板块 · 按涨跌幅排序`

  return (
    <CnDashboardFlexPanel
      title="板块发现"
      subtitle={panelSubtitle}
      fill
    >
      <div className={s.scrollWrap}>
        {loading && !sectors.length ? (
          <CnSectorGridSkeleton />
        ) : (
          <div className={mergeClasses(s.grid, 'opptrix-scroll-hidden')}>
            {!items.length ? (
              <Text className={s.empty} block>{emptyHint ?? '暂无板块数据'}</Text>
            ) : (
              items.map(item => {
                const code = sectorIndexCode(item)
                const active = selectedCode === code

                return (
                  <button
                    key={indexKey(item)}
                    type="button"
                    className={mergeClasses(cardS.card, s.cardInner, active && cardS.cardActive)}
                    title="查看板块走势"
                    onClick={() => onSelect?.(item)}
                  >
                    <CnQuoteUnitCard
                      name={item.name}
                      midLabel={item.code || null}
                      price={item.price}
                      changePct={item.change_pct}
                      changeAmt={item.change_amt}
                      sparkSeed={item.code || item.name}
                    />
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </CnDashboardFlexPanel>
  )
}
