import { type ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketStockMover } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatPct, formatPrice, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { MarketUsTechWatchList } from './MarketUsTechWatch'
import MarketWatchlistQuotes from './MarketWatchlistQuotes'

const CONTENT_PAD = '8px'

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    overflow: 'hidden',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  rootStacked: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridTemplateRows: '1fr 1fr',
  },
  col: {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderRight: 'none' },
  },
  colStacked: {
    ':nth-child(2n)': { borderRight: 'none' },
    ':nth-child(-n+2)': { borderBottom: `1px solid ${opptrixCssVars.separator}` },
  },
  colHead: {
    flexShrink: 0,
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    padding: `5px ${CONTENT_PAD} 4px`,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  colScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '4px',
    alignItems: 'center',
    padding: '4px 6px',
    minHeight: '24px',
    borderRadius: '6px',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowWide: {
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '4px 6px',
  },
  rowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
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
  rowNum: {
    fontSize: '10px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    textAlign: 'right',
    whiteSpace: 'nowrap',
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
  listPad: {
    padding: `0 ${CONTENT_PAD} 6px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  empty: {
    padding: '8px 10px 12px',
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.45,
  },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function MoverRows({
  items,
  s,
  compact,
}: {
  items: MarketStockMover[]
  s: ReturnType<typeof useStyles>
  compact?: boolean
}) {
  if (!items.length) {
    return <div className={s.empty}>暂无</div>
  }
  return (
    <div className={s.listPad}>
      {items.map(item => (
        <div key={item.code} className={mergeClasses(s.row, !compact && s.rowWide)}>
          <div className={s.rowBody}>
            <span className={s.rowTitle}>{item.name}</span>
            <span className={s.rowMeta}>{item.code}</span>
          </div>
          {!compact && (
            <span className={s.rowNum}>{formatPrice(item.price)}</span>
          )}
          <span className={mergeClasses(s.rowPct, pctClass(s, item.change_pct))}>
            {formatPct(item.change_pct, 2)}
          </span>
        </div>
      ))}
    </div>
  )
}

type PanelColProps = {
  title: string
  s: ReturnType<typeof useStyles>
  stacked?: boolean
  children: ReactNode
}

function PanelCol({ title, s, stacked, children }: PanelColProps) {
  return (
    <div className={mergeClasses(s.col, stacked && s.colStacked)}>
      <div className={s.colHead}>{title}</div>
      <div className={mergeClasses(s.colScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        {children}
      </div>
    </div>
  )
}

type Props = {
  gainers: MarketStockMover[]
  losers: MarketStockMover[]
  stacked?: boolean
}

export default function MarketBoardFocus({ gainers, losers, stacked = false }: Props) {
  const s = useStyles()
  const compactRows = !stacked

  return (
    <div className={mergeClasses(s.root, stacked && s.rootStacked)}>
      <PanelCol title="涨幅" s={s} stacked={stacked}>
        <MoverRows items={gainers} s={s} compact={compactRows} />
      </PanelCol>

      <PanelCol title="跌幅" s={s} stacked={stacked}>
        <MoverRows items={losers} s={s} compact={compactRows} />
      </PanelCol>

      <PanelCol title="美股龙头" s={s} stacked={stacked}>
        <MarketUsTechWatchList compact scrollable quad />
      </PanelCol>

      <PanelCol title="我的关注" s={s} stacked={stacked}>
        <MarketWatchlistQuotes compact={compactRows} />
      </PanelCol>
    </div>
  )
}
