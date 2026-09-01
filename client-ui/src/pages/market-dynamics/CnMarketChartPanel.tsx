import { useMemo } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChevronRightRegular } from '@fluentui/react-icons'
import TradingViewChart from '../../market/TradingViewChart'
import type { InstrumentRef } from '../../types/instrument'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import {
  formatIndexChangePoints,
  formatIndexPoints,
  resolveIndexChangeAmt,
  resolveIndexDisplayCode,
} from './cnIndexFormat'
import { resolveMarketIndexChartInstrument } from './marketBoardUtils'
import { buildOpptrixInstrumentId } from '../../market/instrument'
import CnChangePill from './CnChangePill'
import { CN_DASH } from './cnDashboardTokens'
import { CnChartPanelSkeleton } from './cnDashboardSkeletons'

const LEFT_COL_WIDTH = '172px'

const useStyles = makeStyles({
  panel: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.surface,
    borderRadius: CN_DASH.cardRadius,
    border: CN_DASH.cardBorder,
    overflow: 'hidden',
  },
  split: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    isolation: 'isolate',
  },
  leftCol: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    width: LEFT_COL_WIDTH,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px 14px 12px',
    boxSizing: 'border-box',
    minHeight: 0,
    overflow: 'hidden',
    pointerEvents: 'auto',
    backgroundColor: opptrixCssVars.surfaceGlass,
    borderRight: `1px solid ${opptrixCssVars.glassSurfaceBorder}`,
    borderRadius: `${CN_DASH.cardRadius} 0 0 ${CN_DASH.cardRadius}`,
    boxShadow: '4px 0 20px rgba(0, 0, 0, 0.04)',
    backdropFilter: 'blur(20px) saturate(160%)',
    WebkitBackdropFilter: 'blur(20px) saturate(160%)',
    '@media (prefers-reduced-transparency: reduce)': {
      backgroundColor: opptrixCssVars.surface,
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    },
  },
  breadcrumb: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.3,
    flexWrap: 'wrap',
  },
  breadcrumbSep: {
    lineHeight: 0,
    opacity: 0.5,
  },
  breadcrumbActive: {
    color: opptrixCssVars.textSecondary,
  },
  breadcrumbCompact: {
    flexWrap: 'nowrap',
    overflow: 'hidden',
    width: '100%',
  },
  breadcrumbTail: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    overflow: 'hidden',
  },
  breadcrumbName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: opptrixCssVars.textPrimary,
    fontWeight: 650,
  },
  breadcrumbCode: {
    flexShrink: 0,
    fontSize: '9px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textTertiary,
    padding: '1px 5px',
    borderRadius: '4px',
    backgroundColor: opptrixCssVars.surfaceMuted,
    lineHeight: 1.3,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
    minWidth: 0,
  },
  title: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.25,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    flex: 1,
    minWidth: 0,
  },
  code: {
    flexShrink: 0,
    fontSize: '9px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textTertiary,
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: opptrixCssVars.surfaceMuted,
    lineHeight: 1.3,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px 8px',
    marginTop: 'auto',
  },
  metricCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
  },
  metricCellWide: {
    gridColumn: '1 / -1',
  },
  metricLabel: {
    fontSize: '9px',
    fontWeight: 650,
    letterSpacing: '0.04em',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.2,
  },
  metricValue: {
    fontSize: '18px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
  },
  metricValueSm: {
    fontSize: '12px',
    fontWeight: 650,
    lineHeight: 1.25,
  },
  metricUnit: {
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    marginLeft: '2px',
  },
  deltaUp: { color: MARKET_UP },
  deltaDown: { color: MARKET_DOWN },
  deltaFlat: { color: opptrixCssVars.textSecondary },
  heroNote: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  chartCol: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: CN_DASH.cardRadius,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  emptyRight: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `24px 24px 24px calc(${LEFT_COL_WIDTH} + 16px)`,
    boxSizing: 'border-box',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.55,
    borderRadius: CN_DASH.cardRadius,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  panelCompact: {
    height: '100%',
  },
  compactHead: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px 12px 6px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
  },
  compactChart: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  compactEmpty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    boxSizing: 'border-box',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.55,
  },
  metricsGridCompact: {
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
    marginTop: 0,
  },
  metricValueCompact: {
    fontSize: '16px',
  },
})

function chartDisplayCode(
  chartCode: string | null,
  indexCode?: string | null,
  instrument?: InstrumentRef,
): string {
  if (indexCode) return indexCode
  if (instrument) return `${instrument.market}:${instrument.symbol}`
  return chartCode ?? ''
}

function deltaClass(
  s: ReturnType<typeof useStyles>,
  changePct: number | null | undefined,
): string {
  const tone = pctTone(changePct)
  if (tone === 'up') return s.deltaUp
  if (tone === 'down') return s.deltaDown
  return s.deltaFlat
}

type Props = {
  chartCode: string | null
  activeIndex?: MarketIndexQuote | null
  title: string
  indexCode?: string | null
  price?: number | null
  changePct?: number | null
  changeAmt?: number | null
  quoteTime?: string | null
  tradeState?: string | null
  loading?: boolean
  /** 手机：元数据在上、图在下，避免左栏挤占 */
  compact?: boolean
}

export default function CnMarketChartPanel({
  chartCode,
  activeIndex,
  title,
  indexCode,
  price,
  changePct,
  changeAmt,
  quoteTime,
  tradeState,
  loading = false,
  compact = false,
}: Props) {
  const s = useStyles()

  const instrument = useMemo(
    () => resolveMarketIndexChartInstrument(activeIndex, chartCode),
    [activeIndex, chartCode],
  )

  const chartInputCode = instrument ? buildOpptrixInstrumentId(instrument) : ''

  const displayCode = activeIndex
    ? resolveIndexDisplayCode(activeIndex)
    : (indexCode ?? chartDisplayCode(chartCode, indexCode, instrument))

  const resolvedChangeAmt = resolveIndexChangeAmt(price, changePct, changeAmt)
  const changeAmtText = formatIndexChangePoints(resolvedChangeAmt, 2) || '—'

  const breadcrumb = ['市场动态', '指数', title]

  const leftMeta = (
    <>
      <div className={s.breadcrumb}>
        {breadcrumb.map((crumb, i) => (
          <span key={`${crumb}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            {i > 0 ? <ChevronRightRegular className={s.breadcrumbSep} fontSize={9} /> : null}
            <span className={i === breadcrumb.length - 1 ? s.breadcrumbActive : undefined}>
              {crumb}
            </span>
          </span>
        ))}
      </div>
      <div className={s.titleRow}>
        <Text className={s.title} block>{title}</Text>
        {displayCode ? <span className={s.code}>{displayCode}</span> : null}
      </div>
    </>
  )

  /** 手机：名称+代码并入面包屑末级，省掉独立标题行 */
  const compactMeta = (
    <div className={mergeClasses(s.breadcrumb, s.breadcrumbCompact)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
        市场动态
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
        <ChevronRightRegular className={s.breadcrumbSep} fontSize={9} />
        指数
      </span>
      <span className={s.breadcrumbTail}>
        <ChevronRightRegular className={s.breadcrumbSep} fontSize={9} />
        <span className={s.breadcrumbName}>{title}</span>
        {displayCode ? <span className={s.breadcrumbCode}>{displayCode}</span> : null}
      </span>
    </div>
  )

  const metrics = (
    <div className={mergeClasses(s.metricsGrid, compact && s.metricsGridCompact)}>
      <div className={mergeClasses(s.metricCell, !compact && s.metricCellWide)}>
        <span className={s.metricLabel}>最新点位</span>
        <span>
          <span className={mergeClasses(s.metricValue, compact && s.metricValueCompact)}>
            {formatIndexPoints(price, 2)}
          </span>
          <span className={s.metricUnit}>点</span>
        </span>
      </div>
      <div className={s.metricCell}>
        <span className={s.metricLabel}>今日涨跌</span>
        <span className={mergeClasses(s.metricValueSm, deltaClass(s, changePct))}>
          {changeAmtText}
        </span>
      </div>
      <div className={s.metricCell}>
        <span className={s.metricLabel}>涨跌幅</span>
        <CnChangePill changePct={changePct} ghost compact />
      </div>
      {!compact ? (
        <div className={mergeClasses(s.metricCell, s.metricCellWide)}>
          <span className={s.metricLabel}>行情状态</span>
          <span className={mergeClasses(s.metricValueSm, s.deltaFlat)}>
            {quoteTime
              ? `更新 ${quoteTime}${tradeState ? ` · ${tradeState}` : ''}`
              : `${displayCode} · 日 K`}
          </span>
        </div>
      ) : null}
    </div>
  )

  if (loading) {
    return <CnChartPanelSkeleton />
  }

  if (compact) {
    return (
      <section className={mergeClasses(s.panel, s.panelCompact, 'opptrix-cn-chart-panel')}>
        <div className={s.compactHead}>
          {compactMeta}
          {chartCode ? metrics : (
            <Text className={s.heroNote} block>
              在顶部选择宽基指数，查看点位与走势
            </Text>
          )}
        </div>
        <div className={s.compactChart}>
          {chartCode && instrument ? (
            <TradingViewChart
              code={chartInputCode}
              instrument={instrument}
              chartVariant="index"
              expanded
              embedMode
              active
            />
          ) : (
            <Text className={s.compactEmpty} block>
              点击顶部宽基指数卡片，查看点位与走势
            </Text>
          )}
        </div>
      </section>
    )
  }

  if (!chartCode) {
    return (
      <section className={mergeClasses(s.panel, 'opptrix-cn-chart-panel')}>
        <div className={s.split}>
          <Text className={s.emptyRight} block>
            点击顶部宽基指数卡片，查看点位与走势
          </Text>
          <aside className={s.leftCol}>
            {leftMeta}
            <Text className={s.heroNote} block>
              在顶部选择宽基指数，查看点位与走势
            </Text>
          </aside>
        </div>
      </section>
    )
  }

  return (
    <section className={mergeClasses(s.panel, 'opptrix-cn-chart-panel')}>
      <div className={s.split}>
        <div className={s.chartCol}>
          {instrument ? (
            <TradingViewChart
              code={chartInputCode}
              instrument={instrument}
              chartVariant="index"
              expanded
              embedMode
              active
            />
          ) : null}
        </div>
        <aside className={s.leftCol}>
          {leftMeta}
          {metrics}
        </aside>
      </div>
    </section>
  )
}
