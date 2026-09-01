import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { FeedArticle, MarketDynamicsData, MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import CnHeroIndexStrip from './CnHeroIndexStrip'
import CnMarketChartPanel from './CnMarketChartPanel'
import HkCompactKpiRow, { type HkKpiAction } from './HkCompactKpiRow'
import HkMarketInsightPanel, { type HkInsightTab } from './HkMarketInsightPanel'
import HkSectorDiscoverGrid from './HkSectorDiscoverGrid'
import { useMarketDynamicsLayout } from './useMarketDynamicsLayout'
import { CN_DASH } from './cnDashboardTokens'
import { resolveIndexDisplayName } from './cnIndexFormat'
import { buildHkMarketDynamicsModel } from './hkMarketDynamicsModel'
import { hkChartCodeFromIndex, readHkIndexChartCode, writeHkIndexChartCode } from './hkIndexChartStorage'
import { sectorIndexCode } from './MarketSectorStrip'

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

export default function HkMarketDynamicsView({
  data,
  loading,
  articles,
  insightsLoading,
}: Props) {
  const s = useStyles()
  const containerRef = useRef<HTMLDivElement>(null)
  const layoutMode = useMarketDynamicsLayout(containerRef)
  const stacked = layoutMode === 'stacked'

  const hkModel = useMemo(() => buildHkMarketDynamicsModel(data), [data])
  const hkIndices = hkModel.indices
  const sectorIndices = hkModel.sectors

  const [chartCode, setChartCode] = useState<string | null>(() => readHkIndexChartCode())
  const [activeIndex, setActiveIndex] = useState<MarketIndexQuote | null>(null)
  const [selectedSector, setSelectedSector] = useState<MarketIndexQuote | null>(null)
  const [insightTab, setInsightTab] = useState<HkInsightTab>('gainers')

  const selectedSectorCode = selectedSector ? sectorIndexCode(selectedSector) : null

  useEffect(() => {
    if (!hkIndices.length) return
    if (chartCode) {
      const hit = hkIndices.find(item => hkChartCodeFromIndex(item) === chartCode)
      if (hit) {
        setActiveIndex(hit)
        return
      }
    }
    const first = hkIndices.find(item => hkChartCodeFromIndex(item) != null)
    if (!first) return
    const defaultCode = hkChartCodeFromIndex(first)
    if (!defaultCode) return
    setActiveIndex(first)
    setChartCode(defaultCode)
    writeHkIndexChartCode(defaultCode)
  }, [chartCode, hkIndices])

  const handleIndexSelect = (item: MarketIndexQuote, code: string) => {
    setSelectedSector(null)
    setActiveIndex(item)
    setChartCode(code)
    writeHkIndexChartCode(code)
  }


  const handleSectorSelect = useCallback((item: MarketIndexQuote) => {
    const code = hkChartCodeFromIndex(item) ?? sectorIndexCode(item)
    if (selectedSectorCode === sectorIndexCode(item)) {
      setSelectedSector(null)
      return
    }
    setSelectedSector(item)
    if (code) {
      setActiveIndex(item)
      setChartCode(code)
      writeHkIndexChartCode(code)
    }
  }, [selectedSectorCode])

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

  const handleKpiClick = useCallback((action: HkKpiAction) => {
    if (action === 'mood') return
    if (action === 'top_sector') {
      if (topSector) handleSectorSelect(topSector)
      return
    }
    setInsightTab(action)
  }, [handleSectorSelect, topSector])

  return (
    <div
      ref={containerRef}
      className={mergeClasses(s.root, 'opptrix-hk-market-dynamics')}
    >
      <CnHeroIndexStrip
        indices={hkIndices}
        cnIndices={[]}
        selectedCode={chartCode}
        loading={loading}
        onSelect={(item, _code) => {
          const code = hkChartCodeFromIndex(item)
          if (code) handleIndexSelect(item, code)
        }}
      />

      <HkCompactKpiRow
        gainers={hkModel.gainers}
        losers={hkModel.losers}
        trending={hkModel.trending}
        indices={hkIndices}
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
              loading={loading}
              title={activeIndex ? resolveIndexDisplayName(activeIndex) : '指数走势'}
              indexCode={activeIndex?.code}
              price={activeIndex?.price}
              changePct={activeIndex?.change_pct}
              changeAmt={activeIndex?.change_amt}
              quoteTime={activeIndex?.quote_time}
              tradeState={activeIndex?.trade_state_label}
            />
          </div>
          <div className={s.detailCol}>
            <HkMarketInsightPanel
              gainers={hkModel.gainers}
              losers={hkModel.losers}
              trending={hkModel.trending}
              articles={articles}
              insightsLoading={insightsLoading}
              marketLoading={loading}
              activeTab={insightTab}
              onTabChange={setInsightTab}
            />
          </div>
        </div>

        <div className={s.sideCol}>
          <HkSectorDiscoverGrid
            sectors={sectorIndices}
            selectedCode={selectedSectorCode}
            loading={loading}
            emptyHint={hkModel.sectorHint ?? data?.hk_sector_hint}
            onSelect={handleSectorSelect}
          />
        </div>
      </div>
    </div>
  )
}
