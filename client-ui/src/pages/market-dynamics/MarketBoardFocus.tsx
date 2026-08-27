import type { ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketStockMover } from '../../types/schemas'
import {
  MarketUsTechWatchList,
  MarketUsTechWatchManageButton,
  MarketUsTechWatchProvider,
} from './MarketUsTechWatch'
import MarketWatchlistQuotes from './MarketWatchlistQuotes'
import { CnInsightListPad, CnInsightStockRow, useCnInsightListStyles } from './cnInsightListStyles'

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridTemplateRows: '1fr 1fr',
    overflow: 'hidden',
  },
  rootEmbedded: {
    flex: 1,
    minHeight: 0,
    height: 'auto',
  },
  rootCn: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridTemplateRows: '1fr',
  },
  rootSingle: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  col: {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: `1px solid var(--opptrix-separator)`,
    borderBottom: `1px solid var(--opptrix-separator)`,
    ':nth-child(2n)': { borderRight: 'none' },
    ':nth-child(n+3)': { borderBottom: 'none' },
  },
  colHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    padding: '8px 12px 6px',
    minHeight: '28px',
    borderBottom: `1px solid var(--opptrix-separator-hairline)`,
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--opptrix-text-tertiary)',
  },
  colScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  empty: {
    padding: '12px 8px',
    fontSize: 'var(--opptrix-font-sm)',
    color: 'var(--opptrix-text-tertiary)',
    textAlign: 'center',
    lineHeight: 1.45,
  },
})

function MoverRows({ items }: { items: MarketStockMover[] }) {
  const listS = useCnInsightListStyles()
  if (!items.length) {
    return <div className={listS.empty}>暂无</div>
  }
  return (
    <>
      {items.map(item => (
        <CnInsightStockRow
          key={item.code}
          code={item.code}
          name={item.name}
          meta={item.code}
          price={item.price}
          changePct={item.change_pct}
          changeAmt={item.change_amt}
        />
      ))}
    </>
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
        <span>{title}</span>
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
  embedded?: boolean
  variant?: 'cn' | 'full'
  single?: 'gainers' | 'losers'
}

export default function MarketBoardFocus({
  gainers,
  losers,
  embedded = false,
  variant = 'cn',
  single,
}: Props) {
  const s = useStyles()

  if (single === 'gainers') {
    return (
      <div className={mergeClasses(s.rootSingle, embedded && s.rootEmbedded)}>
        <CnInsightListPad fill>
          <MoverRows items={gainers} />
        </CnInsightListPad>
      </div>
    )
  }

  if (single === 'losers') {
    return (
      <div className={mergeClasses(s.rootSingle, embedded && s.rootEmbedded)}>
        <CnInsightListPad fill>
          <MoverRows items={losers} />
        </CnInsightListPad>
      </div>
    )
  }

  return (
    <div className={mergeClasses(s.root, embedded && s.rootEmbedded, variant === 'cn' && s.rootCn)}>
      <PanelCol title="涨幅" s={s}>
        <CnInsightListPad>
          <MoverRows items={gainers} />
        </CnInsightListPad>
      </PanelCol>

      <PanelCol title="跌幅" s={s}>
        <CnInsightListPad>
          <MoverRows items={losers} />
        </CnInsightListPad>
      </PanelCol>

      {variant === 'full' && (
        <>
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
        </>
      )}
    </div>
  )
}
