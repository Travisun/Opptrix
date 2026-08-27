import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { chartCodeFromIndex, indexKey } from './marketBoardUtils'
import { resolveIndexDisplayCode, resolveIndexDisplayName } from './cnIndexFormat'
import CnQuoteUnitCard from './CnQuoteUnitCard'
import { CN_DASH } from './cnDashboardTokens'
import { useCnHeroCardStyles } from './cnSelectCardStyles'
import { CnIndexStripSkeleton } from './cnDashboardSkeletons'

const useStyles = makeStyles({
  strip: {
    display: 'flex',
    gap: CN_DASH.cardGap,
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  cardInner: {
    flex: '1 0 188px',
    minWidth: '188px',
    maxWidth: '240px',
    padding: '12px 14px',
    borderRadius: CN_DASH.cardRadius,
  },
})

type Props = {
  indices: MarketIndexQuote[]
  cnIndices: MarketIndexQuote[]
  selectedCode?: string | null
  loading?: boolean
  onSelect?: (item: MarketIndexQuote, chartCode: string) => void
}

export default function CnHeroIndexStrip({
  indices,
  cnIndices,
  selectedCode,
  loading = false,
  onSelect,
}: Props) {
  const s = useStyles()
  const cardS = useCnHeroCardStyles()

  if (loading && !indices.length) {
    return <CnIndexStripSkeleton />
  }

  return (
    <div className={mergeClasses(s.strip, 'opptrix-cn-hero-index-strip', 'opptrix-scroll-x')}>
      {indices.map(item => {
        const chartCode = chartCodeFromIndex(item, cnIndices)
        const active = chartCode != null && selectedCode === chartCode
        const displayName = resolveIndexDisplayName(item)
        const displayCode = resolveIndexDisplayCode(item)

        return (
          <button
            key={indexKey(item)}
            type="button"
            className={mergeClasses(
              cardS.card,
              s.cardInner,
              active && cardS.cardActive,
            )}
            title={displayName}
            onClick={() => {
              if (chartCode && onSelect) onSelect(item, chartCode)
            }}
          >
            <CnQuoteUnitCard
              name={displayName}
              midLabel={displayCode || null}
              price={item.price}
              changePct={item.change_pct}
              changeAmt={item.change_amt}
              sparkSeed={item.code || displayName}
            />
          </button>
        )
      })}
    </div>
  )
}
