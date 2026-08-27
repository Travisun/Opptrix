import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { formatPriceWithCurrency } from '../../market/format'
import { chartCodeFromIndex, indexKey } from './marketBoardUtils'
import CnChangePill from './CnChangePill'
import CnMiniSparkline from './CnMiniSparkline'
import { CN_DASH } from './cnDashboardTokens'

const useStyles = makeStyles({
  strip: {
    display: 'flex',
    gap: CN_DASH.cardGap,
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  card: {
    flex: '1 0 168px',
    minWidth: '168px',
    maxWidth: '220px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px 16px',
    borderRadius: CN_DASH.cardRadius,
    border: CN_DASH.cardBorder,
    backgroundColor: opptrixCssVars.surface,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    appearance: 'none',
    position: 'relative',
    transitionProperty: 'background-color, box-shadow, transform',
    transitionDuration: '160ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceMuted,
      transform: 'translateY(-1px)',
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: '2px solid var(--opptrix-accent)',
      outlineOffset: '2px',
    },
  },
  cardActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    boxShadow: `0 0 0 1px ${opptrixCssVars.accent}`,
  },
  label: {
    fontSize: CN_DASH.labelSize,
    fontWeight: 700,
    letterSpacing: CN_DASH.labelTracking,
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '8px',
    minWidth: 0,
  },
  price: {
    fontSize: CN_DASH.heroPriceSize,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
  },
  sparkWrap: {
    flexShrink: 0,
    opacity: 0.92,
    marginBottom: '2px',
  },
  changeRow: {
    display: 'flex',
    alignItems: 'center',
    minHeight: '22px',
  },
})

type Props = {
  indices: MarketIndexQuote[]
  cnIndices: MarketIndexQuote[]
  selectedCode?: string | null
  onSelect?: (item: MarketIndexQuote, chartCode: string) => void
}

export default function CnHeroIndexStrip({
  indices,
  cnIndices,
  selectedCode,
  onSelect,
}: Props) {
  const s = useStyles()

  return (
    <div className={mergeClasses(s.strip, 'opptrix-cn-hero-index-strip', 'opptrix-scroll-x')}>
      {indices.map(item => {
        const chartCode = chartCodeFromIndex(item, cnIndices)
        const active = chartCode != null && selectedCode === chartCode
        const clickable = Boolean(onSelect && chartCode)
        const label = item.name.length <= 8 ? item.name : item.name

        return (
          <button
            key={indexKey(item)}
            type="button"
            className={mergeClasses(s.card, active && s.cardActive)}
            disabled={!clickable}
            onClick={() => {
              if (chartCode && onSelect) onSelect(item, chartCode)
            }}
          >
            <span className={s.label}>{label}</span>
            <div className={s.priceRow}>
              <span className={s.price}>
                {item.price != null
                  ? formatPriceWithCurrency(item.market ?? 'CN', item.price, 2)
                  : '—'}
              </span>
              <span className={s.sparkWrap}>
                <CnMiniSparkline
                  seed={item.code || item.name}
                  changePct={item.change_pct}
                  width={68}
                  height={26}
                />
              </span>
            </div>
            <div className={s.changeRow}>
              <CnChangePill
                changePct={item.change_pct}
                changeAmt={item.change_amt}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}
