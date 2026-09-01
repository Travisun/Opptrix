import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketDynamicsData, MarketIndexQuote } from '../../types/schemas'
import type { FeedArticle } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import CnCompactKpiRow, { type CnKpiAction } from './CnCompactKpiRow'
import CnHeroIndexStrip from './CnHeroIndexStrip'
import CnMarketChartPanel from './CnMarketChartPanel'
import CnMarketInsightPanel, { type CnInsightTab } from './CnMarketInsightPanel'
import CnSectorDiscoverGrid from './CnSectorDiscoverGrid'
import CnHotBoardPanel from './CnHotBoardPanel'
import { readCnIndexChartCode, writeCnIndexChartCode } from './cnIndexChartStorage'
import { resolveIndexDisplayName } from './cnIndexFormat'
import { chartCodeFromIndex } from './marketBoardUtils'
import { sectorIndexCode } from './MarketSectorStrip'
import { useMarketDynamicsLayout } from './useMarketDynamicsLayout'
import { CN_DASH, CN_DASH_MOBILE } from './cnDashboardTokens'

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: CN_DASH.pageGap,
    padding: CN_DASH.pagePad,
    overflow: 'hidden',
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  rootMobile: {
    gap: 0,
    padding: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.68fr) minmax(0, 1fr)',
    gap: CN_DASH.pageGap,
    overflow: 'hidden',
  },
  bodyStacked: {
    gridTemplateColumns: '1fr',
    gridTemplateRows: 'auto auto minmax(280px, 1fr)',
    overflowY: 'auto',
  },
  mainCol: {
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: CN_DASH.pageGap,
    overflow: 'hidden',
  },
  chartCol: {
    flex: '1 1 0',
    minHeight: '240px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  detailCol: {
    flex: '1 1 0',
    minHeight: '240px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sideCol: {
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: CN_DASH.pageGap,
    overflow: 'hidden',
  },
  sectorCol: {
    flex: '1 1 45%',
    minHeight: '200px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  hotBoardCol: {
    flex: '1 1 55%',
    minHeight: '280px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  /** 手机信息流：单列纵滚 */
  feedScroll: {
    flex: 1,
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    display: 'flex',
    flexDirection: 'column',
    gap: CN_DASH_MOBILE.pageGap,
    padding: CN_DASH_MOBILE.pagePad,
    paddingBottom: `max(16px, env(safe-area-inset-bottom))`,
    boxSizing: 'border-box',
  },
  /** 顶部指数 / KPI：禁止被下方高块 flex 压扁 */
  feedLead: {
    flexShrink: 0,
    minWidth: 0,
  },
  feedChart: {
    flexShrink: 0,
    height: CN_DASH_MOBILE.chartHeight,
    minHeight: '240px',
    maxHeight: '320px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  feedBlock: {
    flexShrink: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  feedBlockSectors: {
    height: 'min(52vh, 360px)',
    minHeight: '280px',
  },
  feedBlockInsight: {
    height: 'min(62vh, 440px)',
    minHeight: '320px',
  },
  feedBlockHot: {
    height: 'min(52vh, 360px)',
    minHeight: '280px',
  },
})

type Props = {
  data: MarketDynamicsData | null
  loading: boolean
  articles: FeedArticle[]
  insightsLoading: boolean
  isMobile?: boolean
}

export default function CnMarketDynamicsView({
  data,
  loading,
  articles,
  insightsLoading,
  isMobile = false,
}: Props) {
  const s = useStyles()
  const containerRef = useRef<HTMLDivElement>(null)
  const feedScrollRef = useRef<HTMLDivElement>(null)
  const insightBlockRef = useRef<HTMLDivElement>(null)
  const layoutMode = useMarketDynamicsLayout(containerRef)
  /** 手机走信息流；窄桌面仍用 stacked */
  const stacked = !isMobile && layoutMode === 'stacked'

  const sections = useMemo(() => data?.sections ?? [], [data?.sections])
  const cnIndices = useMemo(
    () => sections.find(sec => sec.id === 'cn_major')?.items ?? [],
    [sections],
  )
  const sectorIndices = useMemo(
    () => sections.find(sec => sec.id === 'cn_sectors')?.items ?? [],
    [sections],
  )

  const [chartCode, setChartCode] = useState<string | null>(() => readCnIndexChartCode())
  const [activeIndex, setActiveIndex] = useState<MarketIndexQuote | null>(null)
  const [selectedSector, setSelectedSector] = useState<MarketIndexQuote | null>(null)
  const [insightTab, setInsightTab] = useState<CnInsightTab>('gainers')

  const selectedSectorCode = selectedSector ? sectorIndexCode(selectedSector) : null

  useEffect(() => {
    if (!cnIndices.length) return
    if (chartCode) {
      const hit = cnIndices.find(item => chartCodeFromIndex(item, cnIndices) === chartCode)
      if (hit) {
        setActiveIndex(hit)
        return
      }
    }
    const first = cnIndices.find(item => chartCodeFromIndex(item, cnIndices) != null)
    if (!first) return
    const defaultCode = chartCodeFromIndex(first, cnIndices)
    if (!defaultCode) return
    setActiveIndex(first)
    setChartCode(defaultCode)
    writeCnIndexChartCode(defaultCode)
  }, [chartCode, cnIndices])

  const scrollInsightIntoView = useCallback(() => {
    if (!isMobile) return
    requestAnimationFrame(() => {
      insightBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [isMobile])

  const handleIndexSelect = (item: MarketIndexQuote, code: string) => {
    setActiveIndex(item)
    setChartCode(code)
    writeCnIndexChartCode(code)
  }

  const handleSectorSelect = (item: MarketIndexQuote) => {
    const code = sectorIndexCode(item)
    if (selectedSectorCode === code) {
      setSelectedSector(null)
      return
    }
    setSelectedSector(item)
    setInsightTab('constituents')
    scrollInsightIntoView()
  }

  const handleClearSector = () => setSelectedSector(null)

  const topSector = useMemo(() => {
    const sorted = [...sectorIndices].sort((a, b) => {
      const av = a.change_pct
      const bv = b.change_pct
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })
    return sorted[0] ?? null
  }, [sectorIndices])

  const handleKpiClick = useCallback((action: CnKpiAction) => {
    if (action === 'top_sector') {
      if (topSector) {
        setSelectedSector(topSector)
        setInsightTab('constituents')
        scrollInsightIntoView()
      }
      return
    }
    setInsightTab(action)
    scrollInsightIntoView()
  }, [topSector, scrollInsightIntoView])

  const chartPanel = (
    <CnMarketChartPanel
      chartCode={chartCode}
      activeIndex={activeIndex}
      loading={loading}
      compact={isMobile}
      title={activeIndex ? resolveIndexDisplayName(activeIndex) : '指数走势'}
      indexCode={activeIndex?.qt_code ?? activeIndex?.code}
      price={activeIndex?.price}
      changePct={activeIndex?.change_pct}
      changeAmt={activeIndex?.change_amt}
      quoteTime={activeIndex?.quote_time}
      tradeState={activeIndex?.trade_state_label}
    />
  )

  const insightPanel = (
    <CnMarketInsightPanel
      selectedSector={selectedSector}
      selectedSectorCode={selectedSectorCode}
      gainers={data?.cn_gainers ?? []}
      losers={data?.cn_losers ?? []}
      limitUp={data?.cn_limit_up}
      limitBreak={data?.cn_limit_break}
      skyrocket={data?.cn_skyrocket}
      limitLadder={data?.cn_limit_ladder}
      dragonTiger={data?.cn_dragon_tiger ?? []}
      dragonTigerDate={data?.cn_dragon_tiger_date}
      articles={articles}
      insightsLoading={insightsLoading}
      marketLoading={loading}
      onClearSector={handleClearSector}
      activeTab={insightTab}
      onTabChange={setInsightTab}
      isMobile={isMobile}
    />
  )

  const sectorPanel = (
    <CnSectorDiscoverGrid
      sectors={sectorIndices}
      selectedCode={selectedSectorCode}
      loading={loading}
      emptyHint={data?.cn_sector_hint}
      isMobile={isMobile}
      onSelect={handleSectorSelect}
    />
  )

  const hotPanel = (
    <CnHotBoardPanel
      skyrocket={data?.cn_skyrocket}
      hotStocks={data?.cn_hot_stocks}
      loading={loading}
      emotionSource={data?.cn_emotion_source ?? null}
      isMobile={isMobile}
    />
  )

  if (isMobile) {
    return (
      <div
        ref={containerRef}
        className={mergeClasses(s.root, s.rootMobile, 'opptrix-cn-market-dynamics')}
      >
        <div
          ref={feedScrollRef}
          className={mergeClasses(s.feedScroll, 'opptrix-scroll')}
        >
          <div className={s.feedLead}>
            <CnHeroIndexStrip
              indices={cnIndices}
              cnIndices={cnIndices}
              selectedCode={chartCode}
              loading={loading}
              compact
              onSelect={handleIndexSelect}
            />
          </div>
          <div className={s.feedLead}>
            <CnCompactKpiRow
              data={data}
              sectors={sectorIndices}
              loading={loading && !data}
              onMetricClick={handleKpiClick}
            />
          </div>
          <div className={s.feedChart}>{chartPanel}</div>
          <div className={mergeClasses(s.feedBlock, s.feedBlockSectors)}>
            {sectorPanel}
          </div>
          <div
            ref={insightBlockRef}
            className={mergeClasses(s.feedBlock, s.feedBlockInsight)}
          >
            {insightPanel}
          </div>
          <div className={mergeClasses(s.feedBlock, s.feedBlockHot)}>
            {hotPanel}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={mergeClasses(s.root, 'opptrix-cn-market-dynamics')}
    >
      <CnHeroIndexStrip
        indices={cnIndices}
        cnIndices={cnIndices}
        selectedCode={chartCode}
        loading={loading}
        onSelect={handleIndexSelect}
      />

      <CnCompactKpiRow
        data={data}
        sectors={sectorIndices}
        loading={loading && !data}
        onMetricClick={handleKpiClick}
      />

      <div className={mergeClasses(s.body, stacked && s.bodyStacked)}>
        <div className={s.mainCol}>
          <div className={s.chartCol}>{chartPanel}</div>
          <div className={s.detailCol}>{insightPanel}</div>
        </div>

        <div className={s.sideCol}>
          <div className={s.sectorCol}>{sectorPanel}</div>
          <div className={s.hotBoardCol}>{hotPanel}</div>
        </div>
      </div>
    </div>
  )
}
