import { useMemo, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { indexKey } from './marketBoardUtils'
import { sectorIndexCode } from './MarketSectorStrip'
import CnDashboardFlexPanel from './CnDashboardFlexPanel'
import CnQuoteUnitCard from './CnQuoteUnitCard'
import { useCnHeroCardStyles } from './cnSelectCardStyles'
import { CnSectorGridSkeleton } from './cnDashboardSkeletons'

const TAG_TABS = [
  { id: 'all', label: '全部' },
  { id: 'cn_concept', label: '概念' },
  { id: 'industry', label: '行业' },
  { id: 'tszs', label: '特色' },
] as const

type TagFilter = typeof TAG_TABS[number]['id']

const TAG_LABEL: Record<string, string> = {
  cn_concept: '概念',
  industry: '行业',
  tszs: '特色',
}

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

export default function CnSectorDiscoverGrid({
  sectors,
  selectedCode,
  loading = false,
  emptyHint,
  onSelect,
}: Props) {
  const s = useStyles()
  const cardS = useCnHeroCardStyles()
  const [tag, setTag] = useState<TagFilter>('all')

  const items = useMemo(() => {
    const list = tag === 'all'
      ? sectors
      : sectors.filter(row => row.sector_tag === tag)
    return [...list].sort((a, b) => {
      const av = a.change_pct
      const bv = b.change_pct
      if (av == null && bv == null) return a.name.localeCompare(b.name, 'zh-CN')
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })
  }, [sectors, tag])

  const panelSubtitle = loading && !sectors.length
    ? '板块指数'
    : `${items.length} 个板块 · 按涨跌幅排序`

  const filterTabs = TAG_TABS.map(tab => ({
    value: tab.id,
    label: tab.label,
  }))

  return (
    <CnDashboardFlexPanel
      title="板块发现"
      subtitle={panelSubtitle}
      fill
      tabConfig={{
        tabs: filterTabs,
        value: tag,
        onChange: setTag,
        ariaLabel: '板块分类',
      }}
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
              const tagLabel = item.sector_tag ? TAG_LABEL[item.sector_tag] ?? item.sector_tag : null

              return (
                <button
                  key={indexKey(item)}
                  type="button"
                  className={mergeClasses(cardS.card, s.cardInner, active && cardS.cardActive)}
                  onClick={() => onSelect?.(item)}
                  title={item.name}
                >
                  <CnQuoteUnitCard
                    compact
                    name={item.name}
                    midLabel={tagLabel}
                    midAsTag
                    price={item.price}
                    changePct={item.change_pct}
                    changeAmt={item.change_amt}
                    sparkSeed={code}
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
