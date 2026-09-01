import { makeStyles, mergeClasses, Text } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { chartCodeFromIndex, indexKey } from './marketBoardUtils'
import { resolveIndexDisplayCode, resolveIndexDisplayName } from './cnIndexFormat'
import CnQuoteUnitCard from './CnQuoteUnitCard'
import { CN_DASH, CN_DASH_MOBILE } from './cnDashboardTokens'
import { useCnHeroCardStyles } from './cnSelectCardStyles'
import { CnIndexStripSkeleton } from './cnDashboardSkeletons'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  strip: {
    display: 'flex',
    gap: CN_DASH.cardGap,
    minWidth: 0,
    minHeight: '96px',
    flexShrink: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  stripEmpty: {
    display: 'flex',
    alignItems: 'center',
    minHeight: '72px',
    padding: '0 4px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  cardInner: {
    flex: '1 0 188px',
    minWidth: '188px',
    maxWidth: '240px',
    padding: '12px 14px',
    borderRadius: CN_DASH.cardRadius,
  },
  cardInnerCompact: {
    flex: `1 0 ${CN_DASH_MOBILE.heroCardMin}`,
    minWidth: CN_DASH_MOBILE.heroCardMin,
    maxWidth: '260px',
    padding: '12px 14px',
  },
})

type Props = {
  indices: MarketIndexQuote[]
  cnIndices: MarketIndexQuote[]
  selectedCode?: string | null
  loading?: boolean
  compact?: boolean
  onSelect?: (item: MarketIndexQuote, chartCode: string) => void
}

export default function CnHeroIndexStrip({
  indices,
  cnIndices,
  selectedCode,
  loading = false,
  compact = false,
  onSelect,
}: Props) {
  const s = useStyles()
  const cardS = useCnHeroCardStyles()

  if (loading && !indices.length) {
    return <CnIndexStripSkeleton />
  }

  if (!indices.length) {
    return (
      <Text className={s.stripEmpty} block>
        暂无宽基指数，请点顶栏刷新
      </Text>
    )
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
              compact && s.cardInnerCompact,
              active && cardS.cardActive,
            )}
            title={displayName}
            onClick={() => {
              if (chartCode && onSelect) onSelect(item, chartCode)
            }}
          >
            <CnQuoteUnitCard
              name={displayName}
              midLabel={compact ? null : (displayCode || null)}
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
