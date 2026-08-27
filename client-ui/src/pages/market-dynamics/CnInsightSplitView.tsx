import { useMemo } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import TradingViewChart from '../../market/TradingViewChart'
import { opptrixCssVars } from '../../theme/tokens'
import { CnInsightStockSelectProvider } from './cnInsightStockContext'
import type { CnInsightStockPick } from './cnInsightStockUtils'
import { cnInsightInstrumentFromCode } from './cnInsightStockUtils'

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 0fr',
    overflow: 'hidden',
    transition: 'grid-template-columns 280ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  rootSplit: {
    gridTemplateColumns: 'minmax(0, 0.42fr) minmax(0, 0.58fr)',
  },
  listPane: {
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid transparent',
    transition: 'border-color 280ms ease',
  },
  listPaneSplit: {
    borderRightColor: opptrixCssVars.separatorHairline,
  },
  listInner: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  chartPane: {
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    opacity: 0,
    transform: 'translateX(10px)',
    transitionProperty: 'opacity, transform',
    transitionDuration: '260ms',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'none',
  },
  chartPaneOpen: {
    opacity: 1,
    transform: 'translateX(0)',
    pointerEvents: 'auto',
  },
  chartFill: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
})

type Props = {
  selected: CnInsightStockPick | null
  onSelect: (pick: CnInsightStockPick | null) => void
  children: React.ReactNode
}

function ChartPane({
  stock,
  onClose,
}: {
  stock: CnInsightStockPick
  onClose: () => void
}) {
  const s = useStyles()
  const instrument = useMemo(
    () => cnInsightInstrumentFromCode(stock.code),
    [stock.code],
  )

  return (
    <div className={s.chartFill}>
      <TradingViewChart
        code={stock.code}
        instrument={instrument}
        expanded
        embedMode
        insightEmbed
        insightTitle={stock.name}
        insightSubtitle={stock.code}
        onInsightClose={onClose}
        active
        chartVariant="equity"
      />
    </div>
  )
}

export default function CnInsightSplitView({
  selected,
  onSelect,
  children,
}: Props) {
  const s = useStyles()
  const split = selected != null

  return (
    <CnInsightStockSelectProvider selected={selected} onSelect={onSelect}>
      <div className={mergeClasses(s.root, split && s.rootSplit)}>
        <div className={mergeClasses(s.listPane, split && s.listPaneSplit)}>
          <div className={s.listInner}>{children}</div>
        </div>
        <div className={mergeClasses(s.chartPane, split && s.chartPaneOpen)}>
          {selected ? (
            <ChartPane stock={selected} onClose={() => onSelect(null)} />
          ) : null}
        </div>
      </div>
    </CnInsightStockSelectProvider>
  )
}
