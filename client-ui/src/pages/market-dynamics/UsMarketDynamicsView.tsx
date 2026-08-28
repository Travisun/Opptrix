import { useMemo, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular, NewsRegular, OpenRegular } from '@fluentui/react-icons'
import TradingViewChart from '../../market/TradingViewChart'
import type { InstrumentRef } from '../../types/instrument'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatPct, formatPriceForMarket, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import type { FeedArticle, MarketDynamicsData, MarketIndexQuote } from '../../types/schemas'
import { openExternalUrl } from '../../platform/openUrl'
import { formatRelativeTime } from '../news/newsUtils'
import MarketBoardStrip from './MarketBoardStrip'
import { MarketDynamicsSectionTabs } from './MarketDynamicsHeader'
import {
  MarketUsTechWatchList,
  MarketUsTechWatchManageButton,
  MarketUsTechWatchProvider,
} from './MarketUsTechWatch'
import { CnInsightListSkeleton, CnNewsListSkeleton } from './cnDashboardSkeletons'

const DETAIL_TABS = [
  { value: 'indices' as const, label: '指数' },
  { value: 'news' as const, label: '资讯' },
]

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  chartBar: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  chartTitle: {
    flex: 1,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    ...ghostInteractive,
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    padding: '4px 6px',
    borderRadius: '6px',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  chartWrap: {
    flexShrink: 0,
    height: 'min(42vh, 320px)',
    minHeight: '220px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    padding: '6px 10px 8px',
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  indexList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: '8px 10px 12px',
  },
  indexRow: {
    ...ghostInteractive,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '8px',
    alignItems: 'center',
    padding: '8px',
    borderRadius: '8px',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    cursor: 'pointer',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  indexName: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  indexMeta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  watchHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px 4px',
  },
  watchTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
  },
  newsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: '0 10px 12px',
  },
  newsRow: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px',
    borderRadius: '6px',
    cursor: 'pointer',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  newsTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
  },
  newsMeta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    display: 'flex',
    gap: '6px',
  },
  empty: {
    padding: '24px 12px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  sectionBlock: {
    paddingBottom: '4px',
  },
})

function resolveUsChartMarket(market?: string): InstrumentRef['market'] {
  if (market === 'CN' || market === 'US' || market === 'HK' || market === 'JP' || market === 'KR') return market
  return 'US'
}

function usChartInstrument(item: MarketIndexQuote): InstrumentRef {
  const sym = item.chart_symbol ?? item.code
  const isIndex = sym.startsWith('^') || ['SPX', 'IXIC', 'DJI', 'N225', 'KOSPI', 'HSI', 'FTSE', 'GDAXI', 'FCHI'].includes(item.code)
  return {
    market: resolveUsChartMarket(item.market),
    assetClass: isIndex ? 'INDEX' : 'EQUITY',
    symbol: sym,
  }
}

function UsQuoteRows({
  items,
  onSelect,
  pctClass,
  priceMarket = 'US',
  styles: s,
}: {
  items: MarketIndexQuote[]
  onSelect: (item: MarketIndexQuote) => void
  pctClass: (value: number | null | undefined) => string
  priceMarket?: InstrumentRef['market']
  styles: ReturnType<typeof useStyles>
}) {
  if (!items.length) return null
  return (
    <div className={s.indexList}>
      {items.map(item => (
        <button
          key={`${item.code}-${item.name}`}
          type="button"
          className={s.indexRow}
          onClick={() => onSelect(item)}
        >
          <div>
            <div className={s.indexName}>{item.name}</div>
            <div className={s.indexMeta}>{item.code}{item.location ? ` · ${item.location}` : ''}</div>
          </div>
          <span>{formatPriceForMarket(priceMarket, item.price)}</span>
          <span className={pctClass(item.change_pct)}>{formatPct(item.change_pct, 2)}</span>
        </button>
      ))}
    </div>
  )
}

type Props = {
  data: MarketDynamicsData | null
  loading: boolean
  articles: FeedArticle[]
  insightsLoading: boolean
}

export default function UsMarketDynamicsView({
  data,
  loading,
  articles,
  insightsLoading,
}: Props) {
  const s = useStyles()
  const [detailTab, setDetailTab] = useState<'indices' | 'news'>('indices')
  const [chartInstrument, setChartInstrument] = useState<InstrumentRef | null>(null)
  const [chartTitle, setChartTitle] = useState('')

  const sections = useMemo(() => data?.sections ?? [], [data?.sections])
  const indices = useMemo(
    () => data?.us_indices ?? sections.find(sec => sec.id === 'us_major')?.items ?? [],
    [data, sections],
  )
  const sectors = useMemo(
    () => sections.find(sec => sec.id === 'us_sectors')?.items ?? [],
    [sections],
  )
  const gainers = useMemo(
    () => data?.us_gainers ?? sections.find(sec => sec.id === 'us_gainers')?.items ?? [],
    [data, sections],
  )
  const losers = useMemo(
    () => data?.us_losers ?? sections.find(sec => sec.id === 'us_losers')?.items ?? [],
    [data, sections],
  )
  const trending = useMemo(
    () => data?.us_trending ?? sections.find(sec => sec.id === 'us_trending')?.items ?? [],
    [data, sections],
  )
  const trendingJp = useMemo(
    () => data?.us_trending_jp ?? sections.find(sec => sec.id === 'us_trending_jp')?.items ?? [],
    [data, sections],
  )

  const handleIndexSelect = (item: MarketIndexQuote) => {
    const inst = usChartInstrument(item)
    if (chartInstrument?.symbol === inst.symbol && chartInstrument.market === inst.market) {
      setChartInstrument(null)
      setChartTitle('')
      return
    }
    setChartInstrument(inst)
    setChartTitle(item.name)
  }

  const pctClass = (value: number | null | undefined) => {
    const tone = pctTone(value)
    if (tone === 'up') return s.pctUp
    if (tone === 'down') return s.pctDown
    return s.pctFlat
  }

  return (
    <MarketUsTechWatchProvider>
      <div className={s.root}>
      <MarketBoardStrip
        indices={indices}
        cnIndices={[]}
        onIndexSelect={handleIndexSelect}
      />

      {chartInstrument ? (
        <>
          <div className={s.chartBar}>
            <Text className={s.chartTitle} block>
              {chartTitle || chartInstrument.symbol}
            </Text>
            <button type="button" className={s.closeBtn} onClick={() => { setChartInstrument(null); setChartTitle('') }}>
              <DismissRegular fontSize={14} />
              收起图表
            </button>
          </div>
          <div className={s.chartWrap}>
            <TradingViewChart
              code={`US:${chartInstrument.symbol}`}
              instrument={chartInstrument}
              expanded
              active
            />
          </div>
        </>
      ) : null}

      <MarketDynamicsSectionTabs
        tabs={DETAIL_TABS}
        value={detailTab}
        onChange={setDetailTab}
      />

      <div className={s.body}>
        {detailTab === 'indices' ? (
          <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
            {loading && !indices.length ? (
              <CnInsightListSkeleton rowCount={6} fill />
            ) : (
              <>
                <div className={s.sectionBlock}>
                  <div className={s.watchHead}>
                    <span className={s.watchTitle}>全球主要指数</span>
                  </div>
                  <UsQuoteRows items={indices} onSelect={handleIndexSelect} pctClass={pctClass} styles={s} />
                </div>

                {sectors.length ? (
                  <div className={s.sectionBlock}>
                    <div className={s.watchHead}>
                      <span className={s.watchTitle}>美股板块</span>
                    </div>
                    <UsQuoteRows items={sectors} onSelect={handleIndexSelect} pctClass={pctClass} styles={s} />
                  </div>
                ) : null}

                {gainers.length ? (
                  <div className={s.sectionBlock}>
                    <div className={s.watchHead}>
                      <span className={s.watchTitle}>涨幅榜</span>
                    </div>
                    <UsQuoteRows items={gainers} onSelect={handleIndexSelect} pctClass={pctClass} styles={s} />
                  </div>
                ) : null}

                {losers.length ? (
                  <div className={s.sectionBlock}>
                    <div className={s.watchHead}>
                      <span className={s.watchTitle}>跌幅榜</span>
                    </div>
                    <UsQuoteRows items={losers} onSelect={handleIndexSelect} pctClass={pctClass} styles={s} />
                  </div>
                ) : null}

                {trending.length ? (
                  <div className={s.sectionBlock}>
                    <div className={s.watchHead}>
                      <span className={s.watchTitle}>美股热门</span>
                    </div>
                    <UsQuoteRows items={trending} onSelect={handleIndexSelect} pctClass={pctClass} styles={s} />
                  </div>
                ) : null}

                {trendingJp.length ? (
                  <div className={s.sectionBlock}>
                    <div className={s.watchHead}>
                      <span className={s.watchTitle}>日本热门</span>
                    </div>
                    <UsQuoteRows
                      items={trendingJp}
                      onSelect={handleIndexSelect}
                      pctClass={pctClass}
                      priceMarket="JP"
                      styles={s}
                    />
                  </div>
                ) : null}

                <div className={s.watchHead}>
                  <span className={s.watchTitle}>科技龙头自选</span>
                  <MarketUsTechWatchManageButton />
                </div>
                <MarketUsTechWatchList />
              </>
            )}
          </div>
        ) : (
          <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
            {insightsLoading && !articles.length ? (
              <CnNewsListSkeleton />
            ) : !articles.length ? (
              <div className={s.empty}>
                <NewsRegular fontSize={18} />
                <div>暂无美股相关资讯</div>
              </div>
            ) : (
              <div className={s.newsList}>
                {articles.map(article => (
                  <div
                    key={article.id}
                    className={s.newsRow}
                    role="link"
                    tabIndex={0}
                    onClick={e => openExternalUrl(article.link, e)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openExternalUrl(article.link, e)
                      }
                    }}
                  >
                    <span className={s.newsTitle}>{article.title}</span>
                    <span className={s.newsMeta}>
                      <span>{article.source_title}</span>
                      <span>{formatRelativeTime(article.pub_date)}</span>
                      <OpenRegular fontSize={12} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </MarketUsTechWatchProvider>
  )
}
