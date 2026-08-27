import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { focusVisibleRing, interactiveTransition } from '../../theme/mixins'
import { formatPct, formatPrice, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { indexKey, isCnChartableIndex } from './marketBoardUtils'

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'stretch',
    minWidth: 0,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvas,
    overflowX: 'auto',
  },
  indexCell: {
    flex: '1 0 96px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '1px',
    padding: '6px 10px',
    minWidth: '96px',
    margin: 0,
    border: 'none',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
    borderRadius: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'default',
    fontFamily: 'inherit',
    fontSize: 'unset',
    fontWeight: 'normal',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    appearance: 'none',
    WebkitAppearance: 'none',
    boxSizing: 'border-box',
    color: 'inherit',
  },
  indexCellClickable: {
    ...interactiveTransition,
    cursor: 'pointer',
    borderRadius: 0,
    ...focusVisibleRing,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  indexName: {
    display: 'block',
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  indexPrice: {
    display: 'block',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.25,
  },
  indexPct: {
    display: 'block',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.25,
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

type Props = {
  indices: MarketIndexQuote[]
  cnIndices: MarketIndexQuote[]
  onIndexSelect?: (item: MarketIndexQuote) => void
}

export default function MarketBoardStrip({
  indices,
  cnIndices,
  onIndexSelect,
}: Props) {
  const s = useStyles()

  return (
    <div className={mergeClasses(s.root, 'opptrix-market-board-strip', 'opptrix-scroll-x')}>
      {indices.map(item => {
        const key = indexKey(item)
        const clickable = Boolean(onIndexSelect && (
          isCnChartableIndex(item, cnIndices)
          || item.chart_symbol
          || item.market === 'US'
        ))
        const select = onIndexSelect

        return (
          <div
            key={key}
            className={mergeClasses(s.indexCell, clickable && s.indexCellClickable)}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={clickable ? '查看走势' : undefined}
            onClick={clickable && select ? () => select(item) : undefined}
            onKeyDown={clickable && select ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                select(item)
              }
            } : undefined}
          >
            <span className={s.indexName}>{item.name}</span>
            <span className={s.indexPrice}>
              {item.price != null ? formatPrice(item.price, 2) : '—'}
            </span>
            <span className={mergeClasses(s.indexPct, pctClass(s, item.change_pct))}>
              {formatPct(item.change_pct, 2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
