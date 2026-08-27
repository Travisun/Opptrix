import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { formatPct, formatPrice, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { chartCodeFromIndex, indexKey } from './marketBoardUtils'

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '6px',
    minWidth: 0,
  },
  gridStacked: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--opptrix-separator-hairline)',
    backgroundColor: opptrixCssVars.canvas,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    appearance: 'none',
    transitionProperty: 'background-color, box-shadow',
    transitionDuration: '150ms',
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: '2px solid var(--opptrix-accent)',
      outlineOffset: '2px',
    },
  },
  cardActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    boxShadow: 'inset 0 0 0 1px var(--opptrix-accent)',
  },
  name: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  price: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
  },
  pct: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
})

type Props = {
  indices: MarketIndexQuote[]
  cnIndices: MarketIndexQuote[]
  selectedCode?: string | null
  stacked?: boolean
  onSelect?: (item: MarketIndexQuote, chartCode: string) => void
}

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

export default function CnIndexOverviewGrid({
  indices,
  cnIndices,
  selectedCode,
  stacked = false,
  onSelect,
}: Props) {
  const s = useStyles()

  return (
    <div className={mergeClasses(s.grid, stacked && s.gridStacked)}>
      {indices.map(item => {
        const code = chartCodeFromIndex(item, cnIndices) ?? item.code
        const active = selectedCode === code
        const clickable = Boolean(onSelect && chartCodeFromIndex(item, cnIndices))

        return (
          <button
            key={indexKey(item)}
            type="button"
            className={mergeClasses(s.card, active && s.cardActive)}
            disabled={!clickable}
            onClick={() => {
              const chartCode = chartCodeFromIndex(item, cnIndices)
              if (chartCode && onSelect) onSelect(item, chartCode)
            }}
          >
            <span className={s.name}>{item.name}</span>
            <span className={s.price}>
              {item.price != null ? formatPrice(item.price, 2) : '—'}
            </span>
            <span className={mergeClasses(s.pct, pctClass(s, item.change_pct))}>
              {formatPct(item.change_pct, 2)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
