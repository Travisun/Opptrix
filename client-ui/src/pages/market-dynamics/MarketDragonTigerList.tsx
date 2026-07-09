import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketDragonTigerItem } from '../../types/schemas'
import { formatCompactNumber, formatPct, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'

const CONTENT_PAD = '8px'

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: `0 ${CONTENT_PAD} 6px`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '4px 6px',
    alignItems: 'center',
    padding: '5px 6px',
    minHeight: '28px',
    borderRadius: '6px',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  rowTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowNet: {
    fontSize: '10px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    minWidth: '44px',
  },
  rowPct: {
    fontSize: '10px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    minWidth: '44px',
    whiteSpace: 'nowrap',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  netUp: { color: MARKET_UP },
  netDown: { color: MARKET_DOWN },
  netFlat: { color: opptrixCssVars.textSecondary },
  empty: {
    padding: '12px 8px',
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.5,
  },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function netClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.netUp
  if (tone === 'down') return s.netDown
  return s.netFlat
}

function formatNetAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatCompactNumber(value)}`
}

type Props = {
  items: MarketDragonTigerItem[]
}

export default function MarketDragonTigerList({ items }: Props) {
  const s = useStyles()

  if (!items.length) {
    return (
      <div className={s.empty}>
        今日暂无龙虎榜数据，非交易日或收盘前可能为空
      </div>
    )
  }

  return (
    <div className={s.list}>
      {items.map(item => (
        <div key={`${item.date}-${item.code}`} className={s.row}>
          <div className={s.rowBody}>
            <span className={s.rowTitle}>{item.name}</span>
            <span className={s.rowMeta}>
              {[item.code, item.reason].filter(Boolean).join(' · ')}
            </span>
          </div>
          <span className={mergeClasses(s.rowNet, netClass(s, item.net_amount))}>
            {formatNetAmount(item.net_amount)}
          </span>
          <span className={mergeClasses(s.rowPct, pctClass(s, item.change_pct))}>
            {formatPct(item.change_pct, 2)}
          </span>
        </div>
      ))}
    </div>
  )
}
