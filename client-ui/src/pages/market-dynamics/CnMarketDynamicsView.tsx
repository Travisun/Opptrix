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
import { readCnIndexChartCode, writeCnIndexChartCode } from './cnIndexChartStorage'
import { resolveIndexDisplayName } from './cnIndexFormat'
import { chartCodeFromIndex } from './marketBoardUtils'
import { sectorIndexCode } from './MarketSectorStrip'
import { useMarketDynamicsLayout } from './useMarketDynamicsLayout'
import { CN_DASH } from './cnDashboardTokens'

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
    overflow: 'hidden',
  },
})

type Props = {
  data: MarketDynamicsData | null
  loading: boolean
  articles: FeedArticle[]
  insightsLoading: boolean
}

export default function CnMarketDynamicsView({
  data,
  loading,
  articles,
  insightsLoading,
}: Props) {
  const s = useStyles()
  const containerRef = useRef<HTMLDivElement>(null)
  const layoutMode = useMarketDynamicsLayout(containerRef)
  const stacked = layoutMode === 'stacked'

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
    if (!chartCode || !cnIndices.length) return
    const hit = cnIndices.find(item => chartCodeFromIndex(item, cnIndices) === chartCode)
    if (hit) setActiveIndex(hit)
  }, [chartCode, cnIndices])

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
      }
      return
    }
    setInsightTab(action)
  }, [topSector])

  return (
    <div
      ref={containerRef}
      className={mergeClasses(s.root, 'opptrix-cn-market-dynamics')}
    >
      <CnHeroIndexStrip
        indices={cnIndices}
        cnIndices={cnIndices}
        selectedCode={chartCode}
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
          <div className={s.chartCol}>
            <CnMarketChartPanel
              chartCode={chartCode}
              activeIndex={activeIndex}
              title={activeIndex ? resolveIndexDisplayName(activeIndex) : '指数走势'}
              indexCode={activeIndex?.qt_code ?? activeIndex?.code}
              price={activeIndex?.price}
              changePct={activeIndex?.change_pct}
              changeAmt={activeIndex?.change_amt}
              quoteTime={activeIndex?.quote_time}
              tradeState={activeIndex?.trade_state_label}
            />
          </div>
          <div className={s.detailCol}>
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
            />
          </div>
        </div>

        <div className={s.sideCol}>
          <CnSectorDiscoverGrid
            sectors={sectorIndices}
            selectedCode={selectedSectorCode}
            loading={loading && !data}
            emptyHint={data?.cn_sector_hint}
            onSelect={handleSectorSelect}
          />
        </div>
      </div>
    </div>
  )
}
