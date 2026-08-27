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
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  leftCol: {
    flexShrink: 0,
    width: LEFT_COL_WIDTH,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px 14px 12px',
    borderRight: `1px solid ${opptrixCssVars.separatorHairline}`,
    minHeight: 0,
    overflow: 'hidden',
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
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  emptySplit: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  emptyLeft: {
    flexShrink: 0,
    width: LEFT_COL_WIDTH,
    padding: '14px',
    borderRight: `1px solid ${opptrixCssVars.separatorHairline}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  emptyRight: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.55,
  },
})

function cnChartInstrument(item: MarketIndexQuote | null | undefined): InstrumentRef | undefined {
  if (!item?.chart_symbol) return undefined
  if (item.market === 'HK') {
    return { market: 'HK', assetClass: 'ETF', symbol: item.chart_symbol }
  }
  if (item.market === 'US') {
    return { market: 'US', assetClass: 'ETF', symbol: item.chart_symbol }
  }
  return undefined
}

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
}: Props) {
  const s = useStyles()

  const instrument = useMemo(
    () => cnChartInstrument(activeIndex),
    [activeIndex],
  )

  const chartInputCode = instrument
    ? `${instrument.market}:${instrument.symbol}`
    : chartCode ?? ''

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
          <span key={crumb} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
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

  if (loading) {
    return <CnChartPanelSkeleton />
  }

  if (!chartCode) {
    return (
      <section className={mergeClasses(s.panel, 'opptrix-cn-chart-panel')}>
        <div className={s.emptySplit}>
          <div className={s.emptyLeft}>
            {leftMeta}
            <Text className={s.heroNote} block>
              在顶部选择宽基指数，查看点位与走势
            </Text>
          </div>
          <Text className={s.emptyRight} block>
            点击顶部宽基指数卡片，查看点位与走势
          </Text>
        </div>
      </section>
    )
  }

  return (
    <section className={mergeClasses(s.panel, 'opptrix-cn-chart-panel')}>
      <div className={s.split}>
        <aside className={s.leftCol}>
          {leftMeta}
          <div className={s.metricsGrid}>
            <div className={mergeClasses(s.metricCell, s.metricCellWide)}>
              <span className={s.metricLabel}>最新点位</span>
              <span>
                <span className={s.metricValue}>{formatIndexPoints(price, 2)}</span>
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
            <div className={mergeClasses(s.metricCell, s.metricCellWide)}>
              <span className={s.metricLabel}>行情状态</span>
              <span className={mergeClasses(s.metricValueSm, s.deltaFlat)}>
                {quoteTime
                  ? `更新 ${quoteTime}${tradeState ? ` · ${tradeState}` : ''}`
                  : `${displayCode} · 日 K`}
              </span>
            </div>
          </div>
        </aside>
        <div className={s.chartCol}>
          <TradingViewChart
            code={chartInputCode}
            instrument={instrument}
            chartVariant="index"
            expanded
            embedMode
            active
          />
        </div>
      </div>
    </section>
  )
}

export { cnChartInstrument }
