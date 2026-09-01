import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import { MARKET_DOWN, MARKET_UP } from '../market/chartTheme'
import { formatPct, pctTone } from '../market/format'
import { formatIndexPoints } from '../pages/market-dynamics/cnIndexFormat'
import {
  WELCOME_PULSE_INTERVAL_MS,
  WELCOME_PULSE_ROW_HEIGHT_PX,
  WELCOME_PULSE_TRANSITION_MS,
  resolveWelcomePulsePageSize,
  type WelcomePulseItem,
} from './welcomeMarketPulseModel'
import { useChatWelcomeMarketPulse } from './useChatWelcomeMarketPulse'

const useStyles = makeStyles({
  root: {
    width: '100%',
    maxWidth: 'min(96vw, 540px)',
    marginTop: '6px',
    userSelect: 'none',
    pointerEvents: 'none',
  },
  rootMobile: {
    maxWidth: '100%',
    paddingInline: '4px',
    boxSizing: 'border-box',
  },
  viewport: {
    position: 'relative',
    overflow: 'hidden',
    height: `${WELCOME_PULSE_ROW_HEIGHT_PX}px`,
  },
  track: {
    display: 'flex',
    flexDirection: 'column',
    willChange: 'transform',
  },
  page: {
    flex: `0 0 ${WELCOME_PULSE_ROW_HEIGHT_PX}px`,
    height: `${WELCOME_PULSE_ROW_HEIGHT_PX}px`,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr) 1px minmax(0, 1fr)',
    columnGap: '20px',
    alignItems: 'center',
    minWidth: 0,
  },
  pageMobile: {
    gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
    columnGap: '24px',
  },
  divider: {
    width: '1px',
    height: '30px',
    justifySelf: 'center',
    backgroundColor: opptrixCssVars.separatorHairline,
    opacity: 0.9,
  },
  cell: {
    minWidth: 0,
    maxHeight: `${WELCOME_PULSE_ROW_HEIGHT_PX}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    alignItems: 'stretch',
    justifyContent: 'center',
    textAlign: 'center',
    paddingInline: '4px',
    overflow: 'hidden',
  },
  cellMobile: {
    paddingInline: '6px',
  },
  name: {
    width: '100%',
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.2,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  nameMobile: {
    fontSize: '11px',
    WebkitLineClamp: 1,
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: '4px',
    minWidth: 0,
    width: '100%',
    whiteSpace: 'nowrap',
  },
  price: {
    fontSize: '12px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  priceMobile: {
    fontSize: '13px',
    flexShrink: 0,
    overflow: 'visible',
    textOverflow: 'clip',
  },
  pct: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
    flexShrink: 0,
  },
  pctMobile: {
    fontSize: '12px',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textTertiary },
  skeletonPage: {
    flex: `0 0 ${WELCOME_PULSE_ROW_HEIGHT_PX}px`,
    height: `${WELCOME_PULSE_ROW_HEIGHT_PX}px`,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr) 1px minmax(0, 1fr)',
    columnGap: '20px',
    alignItems: 'center',
  },
  skeletonCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    alignItems: 'center',
    paddingInline: '4px',
  },
  skeletonLine: {
    height: '8px',
    borderRadius: '999px',
    backgroundColor: opptrixCssVars.surfaceMuted,
    opacity: 0.55,
  },
  skeletonLineWide: {
    width: '78%',
  },
  skeletonLineNarrow: {
    width: '58%',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
})

type Props = {
  enabled: boolean
  isMobile?: boolean
  shuffleEpoch?: number
  className?: string
}

function PulseCell({ item, isMobile }: { item: WelcomePulseItem; isMobile: boolean }) {
  const s = useStyles()
  const tone = pctTone(item.changePct)
  const pctClass = tone === 'up' ? s.pctUp : tone === 'down' ? s.pctDown : s.pctFlat

  return (
    <div className={mergeClasses(s.cell, isMobile && s.cellMobile)}>
      <span className={mergeClasses(s.name, isMobile && s.nameMobile)} title={item.name}>
        {item.name}
      </span>
      <div className={s.valueRow}>
        <span className={mergeClasses(s.price, isMobile && s.priceMobile)}>
          {formatIndexPoints(item.price, 2)}
        </span>
        <span className={mergeClasses(s.pct, isMobile && s.pctMobile, pctClass)}>
          {formatPct(item.changePct, 2)}
        </span>
      </div>
    </div>
  )
}

function LoadingSkeleton({ columnCount, isMobile }: { columnCount: number; isMobile: boolean }) {
  const s = useStyles()
  return (
    <div
      className={mergeClasses(s.skeletonPage, isMobile && s.pageMobile)}
      aria-hidden
    >
      {Array.from({ length: columnCount }, (_, i) => (
        <Fragment key={i}>
          {i > 0 ? <div className={s.divider} /> : null}
          <div className={s.skeletonCell}>
            <div className={mergeClasses(s.skeletonLine, s.skeletonLineWide)} />
            <div className={mergeClasses(s.skeletonLine, s.skeletonLineNarrow)} />
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function PulsePage({
  page,
  columnCount,
  isMobile,
}: {
  page: WelcomePulseItem[]
  columnCount: number
  isMobile: boolean
}) {
  const s = useStyles()
  const slots: WelcomePulseItem[] = [...page]
  while (slots.length < columnCount) {
    slots.push({
      id: `pad:${slots.length}`,
      name: '',
      price: null,
      changePct: null,
      kind: 'index',
    })
  }

  return (
    <div className={mergeClasses(s.page, isMobile && s.pageMobile)}>
      {slots.map((item, cellIdx) => (
        <Fragment key={item.id}>
          {cellIdx > 0 ? <div className={s.divider} aria-hidden /> : null}
          {item.name ? (
            <PulseCell item={item} isMobile={isMobile} />
          ) : (
            <div className={mergeClasses(s.cell, isMobile && s.cellMobile)} aria-hidden />
          )}
        </Fragment>
      ))}
    </div>
  )
}

export default function ChatWelcomeMarketPulse({
  enabled,
  isMobile = false,
  shuffleEpoch = 0,
  className,
}: Props) {
  const s = useStyles()
  const columnCount = resolveWelcomePulsePageSize(isMobile)
  const { pages, loading } = useChatWelcomeMarketPulse(enabled, shuffleEpoch, isMobile)
  const [pageIndex, setPageIndex] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const pageCount = pages.length
  const safeIndex = pageCount > 0 ? pageIndex % pageCount : 0

  useEffect(() => {
    setPageIndex(0)
  }, [pageCount, shuffleEpoch, isMobile])

  useEffect(() => {
    if (!enabled || pageCount <= 1 || reducedMotionRef.current) return undefined

    let timer = window.setTimeout(function tick() {
      if (document.hidden) {
        timer = window.setTimeout(tick, WELCOME_PULSE_INTERVAL_MS)
        return
      }
      setTransitioning(true)
      setPageIndex(prev => (prev + 1) % pageCount)
      timer = window.setTimeout(tick, WELCOME_PULSE_INTERVAL_MS)
    }, WELCOME_PULSE_INTERVAL_MS)

    return () => window.clearTimeout(timer)
  }, [enabled, pageCount])

  useEffect(() => {
    if (!transitioning) return undefined
    const t = window.setTimeout(() => setTransitioning(false), WELCOME_PULSE_TRANSITION_MS)
    return () => window.clearTimeout(t)
  }, [transitioning, safeIndex])

  const ariaSummary = useMemo(() => {
    const page = pages[safeIndex]
    if (!page?.length) return ''
    return page
      .filter(item => item.name)
      .map(item => `${item.name} ${formatIndexPoints(item.price, 2)} ${formatPct(item.changePct, 2)}`)
      .join('，')
  }, [pages, safeIndex])

  if (!enabled) return null
  if (!loading && pageCount === 0) return null

  const trackStyle = {
    transform: `translateY(-${safeIndex * WELCOME_PULSE_ROW_HEIGHT_PX}px)`,
    transition: transitioning && !reducedMotionRef.current
      ? `transform ${WELCOME_PULSE_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : 'none',
  }

  return (
    <div
      className={mergeClasses(s.root, isMobile && s.rootMobile, className)}
      role="region"
      aria-label="A股主要指数"
      aria-live="polite"
    >
      <div className={s.viewport}>
        {loading ? (
          <LoadingSkeleton columnCount={columnCount} isMobile={isMobile} />
        ) : (
          <div className={s.track} style={trackStyle}>
            {pages.map(page => (
              <PulsePage
                key={page.map(item => item.id).join('|')}
                page={page}
                columnCount={columnCount}
                isMobile={isMobile}
              />
            ))}
          </div>
        )}
      </div>
      {ariaSummary ? (
        <span className={s.srOnly}>{ariaSummary}</span>
      ) : null}
    </div>
  )
}
