import { type ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketStockMover } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatPct, formatPrice, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import {
  MarketUsTechWatchList,
  MarketUsTechWatchManageButton,
  MarketUsTechWatchProvider,
} from './MarketUsTechWatch'
import MarketWatchlistQuotes from './MarketWatchlistQuotes'

const CONTENT_PAD = '8px'

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridTemplateRows: '1fr 1fr',
    overflow: 'hidden',
  },
  col: {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':nth-child(2n)': { borderRight: 'none' },
    ':nth-child(n+3)': { borderBottom: 'none' },
  },
  colHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    padding: `5px ${CONTENT_PAD} 4px`,
    minHeight: '24px',
  },
  colHeadTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  colScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  row: {
    ...ghostInteractive,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '4px 6px',
    alignItems: 'center',
    padding: '4px 6px',
    minHeight: '24px',
    borderRadius: '6px',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },
  rowTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowNum: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  rowPct: {
    fontSize: 'var(--opptrix-font-xs)',
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
    fontSize: 'var(--opptrix-font-sm)',
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
}: {
  items: MarketStockMover[]
  s: ReturnType<typeof useStyles>
}) {
  if (!items.length) {
    return <div className={s.empty}>暂无</div>
  }
  return (
    <div className={s.listPad}>
      {items.map(item => (
        <div key={item.code} className={s.row}>
          <div className={s.rowBody}>
            <span className={s.rowTitle}>{item.name}</span>
            <span className={s.rowMeta}>{item.code}</span>
          </div>
          <span className={s.rowNum}>{formatPrice(item.price)}</span>
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
  headAction?: ReactNode
  children: ReactNode
}

function PanelCol({ title, s, headAction, children }: PanelColProps) {
  return (
    <div className={s.col}>
      <div className={s.colHead}>
        <span className={s.colHeadTitle}>{title}</span>
        {headAction}
      </div>
      <div className={mergeClasses(s.colScroll, 'opptrix-scroll-hidden')}>
        {children}
      </div>
    </div>
  )
}

type Props = {
  gainers: MarketStockMover[]
  losers: MarketStockMover[]
}

export default function MarketBoardFocus({ gainers, losers }: Props) {
  const s = useStyles()

  return (
    <div className={s.root}>
      <PanelCol title="涨幅" s={s}>
        <MoverRows items={gainers} s={s} />
      </PanelCol>

      <PanelCol title="跌幅" s={s}>
        <MoverRows items={losers} s={s} />
      </PanelCol>

      <MarketUsTechWatchProvider>
        <PanelCol
          title="美股龙头"
          s={s}
          headAction={<MarketUsTechWatchManageButton />}
        >
          <MarketUsTechWatchList scrollable />
        </PanelCol>
      </MarketUsTechWatchProvider>

      <PanelCol title="我的关注" s={s}>
        <MarketWatchlistQuotes />
      </PanelCol>
    </div>
  )
}
