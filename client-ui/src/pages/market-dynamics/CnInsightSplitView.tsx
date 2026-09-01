import { useEffect, useMemo, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import TradingViewChart from '../../market/TradingViewChart'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { motion } from '../../theme/mixins'
import type { InstrumentRef } from '../../types/instrument'
import { CnInsightStockSelectProvider } from './cnInsightStockContext'
import type { CnInsightStockPick } from './cnInsightStockUtils'
import { cnInsightChartInputCode, cnInsightInstrumentFromCode } from './cnInsightStockUtils'

const useStyles = makeStyles({
  root: {
    position: 'relative',
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
  rootDrawer: {
    display: 'flex',
    flexDirection: 'column',
    gridTemplateColumns: 'unset',
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
  listPaneDrawer: {
    flex: 1,
    borderRight: 'none',
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
  scrim: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    border: 'none',
    padding: 0,
    margin: 0,
    backgroundColor: 'rgba(29, 29, 31, 0.18)',
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.ease,
  },
  scrimOpen: {
    opacity: 1,
    pointerEvents: 'auto',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 21,
    height: 'min(72%, 420px)',
    minHeight: '280px',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    borderRadius: `${opptrixTokens.radiusXl} ${opptrixTokens.radiusXl} 0 0`,
    borderTop: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.surface,
    boxShadow: '0 -8px 28px rgba(0, 0, 0, 0.12)',
    transform: 'translateY(105%)',
    transitionProperty: 'transform',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easeOut,
    overflow: 'hidden',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  drawerOpen: {
    transform: 'translateY(0)',
  },
  drawerHandle: {
    width: '32px',
    height: '4px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.borderStrong,
    margin: '8px auto 4px',
    flexShrink: 0,
  },
})

type Props = {
  selected: CnInsightStockPick | null
  onSelect: (pick: CnInsightStockPick | null) => void
  children: React.ReactNode
  instrumentFromCode?: (code: string) => InstrumentRef
  chartInputCode?: (ref: InstrumentRef) => string
  /** split=桌面分栏；drawer=手机底部抽屉 */
  presentation?: 'split' | 'drawer'
}

function ChartPane({
  stock,
  onClose,
  instrumentFromCode,
  chartInputCodeFn,
}: {
  stock: CnInsightStockPick
  onClose: () => void
  instrumentFromCode: (code: string) => InstrumentRef
  chartInputCodeFn: (ref: InstrumentRef) => string
}) {
  const s = useStyles()
  const instrument = useMemo(
    () => instrumentFromCode(stock.code),
    [instrumentFromCode, stock.code],
  )
  const chartInputCode = useMemo(
    () => chartInputCodeFn(instrument),
    [chartInputCodeFn, instrument],
  )

  return (
    <div className={s.chartFill}>
      <TradingViewChart
        code={chartInputCode}
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
  instrumentFromCode = cnInsightInstrumentFromCode,
  chartInputCode: chartInputCodeFn = cnInsightChartInputCode,
  presentation = 'split',
}: Props) {
  const s = useStyles()
  const drawerMode = presentation === 'drawer'
  const open = selected != null
  const [drawerPresented, setDrawerPresented] = useState(false)

  useEffect(() => {
    if (!drawerMode) {
      setDrawerPresented(false)
      return
    }
    if (open) {
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setDrawerPresented(true))
      })
      return () => cancelAnimationFrame(raf)
    }
    setDrawerPresented(false)
    return undefined
  }, [drawerMode, open])

  const chart = selected ? (
    <ChartPane
      stock={selected}
      onClose={() => onSelect(null)}
      instrumentFromCode={instrumentFromCode}
      chartInputCodeFn={chartInputCodeFn}
    />
  ) : null

  return (
    <CnInsightStockSelectProvider selected={selected} onSelect={onSelect}>
      <div
        className={mergeClasses(
          s.root,
          !drawerMode && open && s.rootSplit,
          drawerMode && s.rootDrawer,
        )}
      >
        <div
          className={mergeClasses(
            s.listPane,
            !drawerMode && open && s.listPaneSplit,
            drawerMode && s.listPaneDrawer,
          )}
        >
          <div className={s.listInner}>{children}</div>
        </div>

        {!drawerMode ? (
          <div className={mergeClasses(s.chartPane, open && s.chartPaneOpen)}>
            {chart}
          </div>
        ) : open ? (
          <>
            <button
              type="button"
              className={mergeClasses(s.scrim, drawerPresented && s.scrimOpen)}
              aria-label="关闭个股走势"
              onClick={() => onSelect(null)}
            />
            <div
              className={mergeClasses(s.drawer, drawerPresented && s.drawerOpen)}
              role="dialog"
              aria-modal="true"
              aria-label={selected ? `${selected.name} 走势` : '个股走势'}
            >
              <div className={s.drawerHandle} aria-hidden />
              {chart}
            </div>
          </>
        ) : null}
      </div>
    </CnInsightStockSelectProvider>
  )
}
