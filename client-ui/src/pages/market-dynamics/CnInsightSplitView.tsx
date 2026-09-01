import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import TradingViewChart from '../../market/TradingViewChart'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { motion } from '../../theme/mixins'
import {
  MARKET_INSIGHT_CHART_DRAWER_HEIGHT,
  MARKET_PANEL_DRAWER_CLOSE_MS,
} from '../../market/marketPanelDrawer'
import type { InstrumentRef } from '../../types/instrument'
import { CnInsightStockSelectProvider } from './cnInsightStockContext'
import type { CnInsightStockPick } from './cnInsightStockUtils'
import { cnInsightChartInputCode, cnInsightInstrumentFromCode } from './cnInsightStockUtils'

const DRAWER_CLOSE_MS = MARKET_PANEL_DRAWER_CLOSE_MS

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
  /** 手机：全视口底部 sheet（portal 到 body） */
  portalScrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 2200,
    border: 'none',
    padding: 0,
    margin: 0,
    backgroundColor: 'rgba(29, 29, 31, 0.18)',
    cursor: 'default',
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.ease,
  },
  portalScrimOpen: {
    opacity: 1,
    pointerEvents: 'auto',
  },
  portalAnchor: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2201,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    padding: 0,
    boxSizing: 'border-box',
  },
  portalDrawer: {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    /* 固定高度：避免加载时缩成矮条贴在屏幕底部 */
    height: MARKET_INSIGHT_CHART_DRAWER_HEIGHT,
    maxHeight: MARKET_INSIGHT_CHART_DRAWER_HEIGHT,
    borderRadius: `${opptrixTokens.radiusXl} ${opptrixTokens.radiusXl} 0 0`,
    borderTop: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.12)',
    transform: 'translateY(100%)',
    transitionProperty: 'transform',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easeOut,
    pointerEvents: 'auto',
    overflow: 'hidden',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  portalDrawerOpen: {
    transform: 'translateY(0)',
  },
  /** 触控区：底部多留白，拖拽条视觉更靠上 */
  portalHandleHit: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    flexShrink: 0,
    paddingTop: '10px',
    paddingBottom: '12px',
    boxSizing: 'border-box',
  },
  portalHandle: {
    width: '36px',
    height: '4px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.borderStrong,
    flexShrink: 0,
  },
  portalChart: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  portalFooter: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    /* safe-area 吃在抽屉底栏内，避免锚点 padding 透出遮罩缝 */
    paddingTop: '10px',
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
    borderTop: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  portalFooterName: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  portalFooterCode: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.3,
  },
})

type Props = {
  selected: CnInsightStockPick | null
  onSelect: (pick: CnInsightStockPick | null) => void
  children: React.ReactNode
  instrumentFromCode?: (code: string) => InstrumentRef
  chartInputCode?: (ref: InstrumentRef) => string
  /** split=桌面分栏；drawer=手机全屏底部 sheet */
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

function MobileInsightChartDrawer({
  stock,
  presented,
  onBeginClose,
  onTransitionEnd,
  instrumentFromCode,
  chartInputCodeFn,
}: {
  stock: CnInsightStockPick
  presented: boolean
  onBeginClose: () => void
  onTransitionEnd: (e: React.TransitionEvent<HTMLDivElement>) => void
  instrumentFromCode: (code: string) => InstrumentRef
  chartInputCodeFn: (ref: InstrumentRef) => string
}) {
  const s = useStyles()

  return createPortal(
    <>
      <button
        type="button"
        className={mergeClasses(
          s.portalScrim,
          'opptrix-cn-insight-chart-drawer-scrim',
          presented && s.portalScrimOpen,
        )}
        aria-label="关闭个股走势"
        onClick={onBeginClose}
      />
      <div className={s.portalAnchor}>
        <div
          className={mergeClasses(
            s.portalDrawer,
            'opptrix-cn-insight-chart-drawer',
            presented && s.portalDrawerOpen,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={`${stock.name} 走势`}
          onTransitionEnd={onTransitionEnd}
        >
          <div className={s.portalHandleHit} aria-hidden>
            <div className={s.portalHandle} />
          </div>
          <div className={s.portalChart}>
            <ChartPane
              stock={stock}
              onClose={onBeginClose}
              instrumentFromCode={instrumentFromCode}
              chartInputCodeFn={chartInputCodeFn}
            />
          </div>
          <div className={s.portalFooter}>
            <span className={s.portalFooterName}>{stock.name}</span>
            <span className={s.portalFooterCode}>{stock.code}</span>
          </div>
        </div>
      </div>
    </>,
    document.body,
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
  const closingRef = useRef(false)
  const [presented, setPresented] = useState(false)

  const finishClose = useCallback(() => {
    if (!closingRef.current) return
    closingRef.current = false
    onSelect(null)
  }, [onSelect])

  const beginClose = useCallback(() => {
    if (closingRef.current) return
    if (!presented) {
      onSelect(null)
      return
    }
    closingRef.current = true
    setPresented(false)
  }, [onSelect, presented])

  const handleDrawerTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.propertyName !== 'transform') return
    finishClose()
  }, [finishClose])

  useEffect(() => {
    if (!drawerMode || !open) return undefined
    closingRef.current = false
    setPresented(false)
    const id = requestAnimationFrame(() => setPresented(true))
    return () => cancelAnimationFrame(id)
  }, [drawerMode, open, selected?.code])

  useEffect(() => {
    if (!drawerMode) {
      setPresented(false)
      closingRef.current = false
      return
    }
    if (!open && presented) {
      closingRef.current = true
      setPresented(false)
    }
  }, [drawerMode, open, presented])

  useEffect(() => {
    if (!drawerMode || !presented || !closingRef.current) return undefined
    const timer = window.setTimeout(finishClose, DRAWER_CLOSE_MS + 40)
    return () => window.clearTimeout(timer)
  }, [drawerMode, presented, finishClose])

  useEffect(() => {
    if (!drawerMode || !open || !presented) return undefined
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [beginClose, drawerMode, open, presented])

  const chart = selected ? (
    <ChartPane
      stock={selected}
      onClose={drawerMode ? beginClose : () => onSelect(null)}
      instrumentFromCode={instrumentFromCode}
      chartInputCodeFn={chartInputCodeFn}
    />
  ) : null

  const showMobileDrawer = drawerMode && selected != null
    && (open || presented || closingRef.current)

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
        ) : null}
      </div>

      {showMobileDrawer && selected ? (
        <MobileInsightChartDrawer
          stock={selected}
          presented={presented}
          onBeginClose={beginClose}
          onTransitionEnd={handleDrawerTransitionEnd}
          instrumentFromCode={instrumentFromCode}
          chartInputCodeFn={chartInputCodeFn}
        />
      ) : null}
    </CnInsightStockSelectProvider>
  )
}
