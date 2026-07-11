import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { focusVisibleRing, interactiveTransition } from '../../theme/mixins'
import { formatPct, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { indexKey, isCnChartableIndex } from './marketBoardUtils'

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'stretch',
    minWidth: 0,
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
    overflowX: 'auto',
  },
  moodCell: {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '1px',
    padding: '8px 12px',
    minWidth: '68px',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
  },
  moodLabel: {
    fontSize: '14px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
  },
  moodMeta: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
  },
  indexCell: {
    flex: '1 0 86px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '1px',
    padding: '6px 10px',
    minWidth: '86px',
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
  indexCellClickable: {...interactiveTransition,

    cursor: 'pointer',
    borderRadius: '6px',
...focusVisibleRing,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  indexName: {
    display: 'block',
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  indexPct: {
    display: 'block',
    fontSize: '15px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.2,
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  briefCell: {
    flex: '1 1 180px',
    minWidth: '140px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '2px',
    padding: '6px 12px',
  },
  briefKicker: {
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  briefText: {
    fontSize: '11px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

type Mood = { up: number; down: number; label: string }

type Props = {
  indices: MarketIndexQuote[]
  cnIndices: MarketIndexQuote[]
  mood: Mood
  onIndexSelect?: (item: MarketIndexQuote) => void
  briefTitle?: string | null
  briefSummary?: string | null
  stacked?: boolean
}

export default function MarketBoardStrip({
  indices,
  cnIndices,
  mood,
  onIndexSelect,
  briefTitle,
  briefSummary,
  stacked = false,
}: Props) {
  const s = useStyles()
  const showBrief = Boolean(briefTitle || briefSummary)

  return (
    <div className={mergeClasses(s.root, 'opptrix-market-board-strip')}>
      <div className={s.moodCell}>
        <Text className={s.moodLabel} block>{mood.label}</Text>
        <Text className={s.moodMeta} block>涨 {mood.up} · 跌 {mood.down}</Text>
      </div>

      {indices.map(item => {
        const key = indexKey(item)
        const clickable = Boolean(onIndexSelect && isCnChartableIndex(item, cnIndices))

        return (
          <div
            key={key}
            className={mergeClasses(s.indexCell, clickable && s.indexCellClickable)}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onIndexSelect!(item) : undefined}
            onKeyDown={clickable ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onIndexSelect!(item)
              }
            } : undefined}
          >
            <span className={s.indexName}>{item.name}</span>
            <span className={mergeClasses(s.indexPct, pctClass(s, item.change_pct))}>
              {formatPct(item.change_pct, 2)}
            </span>
          </div>
        )
      })}

      {showBrief && !stacked && (
        <div className={s.briefCell}>
          {briefTitle && <Text className={s.briefKicker} block>{briefTitle}</Text>}
          {briefSummary && <Text className={s.briefText} block>{briefSummary}</Text>}
        </div>
      )}
    </div>
  )
}
