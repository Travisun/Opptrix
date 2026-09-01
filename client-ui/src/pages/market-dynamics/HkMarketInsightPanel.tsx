import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { NewsRegular, OpenRegular } from '@fluentui/react-icons'
import type { FeedArticle, MarketStockMover } from '../../types/schemas'
import { formatRelativeTime } from '../news/newsUtils'
import { openExternalUrl } from '../../platform/openUrl'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import MarketBoardFocus from './MarketBoardFocus'
import CnDashboardFlexPanel from './CnDashboardFlexPanel'
import CnInsightSplitView from './CnInsightSplitView'
import { CnInsightListPad, CnInsightStockRow } from './cnInsightListStyles'
import { CnInsightListSkeleton, CnNewsListSkeleton } from './cnDashboardSkeletons'
import type { CnInsightStockPick } from './cnInsightStockUtils'
import { hkInsightChartInputCode, hkInsightInstrumentFromCode } from './hkInsightStockUtils'

type InsightTab = 'gainers' | 'losers' | 'trending' | 'news'

export type HkInsightTab = InsightTab

const useStyles = makeStyles({
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  newsList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '10px 12px 12px',
  },
  newsRow: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '10px 8px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    cursor: 'pointer',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
    ':last-child': { borderBottom: 'none' },
  },
  newsTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  newsMeta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '24px 16px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.55,
  },
})

type Props = {
  gainers: MarketStockMover[]
  losers: MarketStockMover[]
  trending: MarketStockMover[]
  articles: FeedArticle[]
  insightsLoading: boolean
  marketLoading: boolean
  activeTab?: InsightTab
  onTabChange?: (tab: InsightTab) => void
}

function TrendingList({ items }: { items: MarketStockMover[] }) {
  if (!items.length) return null
  return (
    <CnInsightListPad fill>
      {items.map((item, idx) => (
        <CnInsightStockRow
          key={item.code}
          code={item.code}
          name={item.name}
          meta={item.rank != null ? `热度 #${item.rank}` : `#${idx + 1}`}
          price={item.price}
          changePct={item.change_pct}
          changeAmt={item.change_amt}
        />
      ))}
    </CnInsightListPad>
  )
}

export default function HkMarketInsightPanel({
  gainers,
  losers,
  trending,
  articles,
  insightsLoading,
  marketLoading,
  activeTab,
  onTabChange,
}: Props) {
  const s = useStyles()
  const [internalTab, setInternalTab] = useState<InsightTab>('gainers')
  const [selectedStock, setSelectedStock] = useState<CnInsightStockPick | null>(null)
  const tab = activeTab ?? internalTab

  const setTab = (next: InsightTab) => {
    onTabChange?.(next)
    if (activeTab === undefined) setInternalTab(next)
  }

  useEffect(() => {
    setSelectedStock(null)
  }, [tab])

  const wrapStockList = useCallback((content: ReactNode) => {
    if (tab === 'news') return content
    return (
      <CnInsightSplitView
        selected={selectedStock}
        onSelect={setSelectedStock}
        instrumentFromCode={hkInsightInstrumentFromCode}
        chartInputCode={hkInsightChartInputCode}
      >
        {content}
      </CnInsightSplitView>
    )
  }, [selectedStock, tab])

  const tabs = useMemo(() => [
    { value: 'gainers' as const, label: `涨幅 ${gainers.length}` },
    { value: 'losers' as const, label: `跌幅 ${losers.length}` },
    { value: 'trending' as const, label: `热门 ${trending.length}` },
    { value: 'news' as const, label: `资讯 ${articles.length}` },
  ], [articles.length, gainers.length, losers.length, trending.length])

  const renderContent = () => {
    if (tab === 'gainers') {
      if (marketLoading && !gainers.length) return <CnInsightListSkeleton fill />
      if (!gainers.length) {
        return (
          <div className={s.empty}>
            <div>涨幅榜待更新</div>
            <div>刷新后将展示涨幅前列个股</div>
          </div>
        )
      }
      return (
        <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
          <MarketBoardFocus gainers={gainers} losers={losers} embedded single="gainers" />
        </div>
      )
    }

    if (tab === 'losers') {
      if (marketLoading && !losers.length) return <CnInsightListSkeleton fill />
      if (!losers.length) {
        return (
          <div className={s.empty}>
            <div>跌幅榜待更新</div>
            <div>刷新后将展示跌幅前列个股</div>
          </div>
        )
      }
      return (
        <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
          <MarketBoardFocus gainers={gainers} losers={losers} embedded single="losers" />
        </div>
      )
    }

    if (tab === 'trending') {
      if (marketLoading && !trending.length) return <CnInsightListSkeleton fill />
      if (!trending.length) {
        return (
          <div className={s.empty}>
            <div>热门榜待更新</div>
            <div>刷新后将展示当前讨论热度较高的标的</div>
          </div>
        )
      }
      return <TrendingList items={trending} />
    }

    if (insightsLoading && !articles.length) return <CnNewsListSkeleton />
    if (!articles.length) {
      return (
        <div className={s.empty}>
          <NewsRegular fontSize={20} />
          <div>暂无相关资讯</div>
          <div>可在新闻中心添加港股订阅源</div>
        </div>
      )
    }
    return (
      <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
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
      </div>
    )
  }

  return (
    <CnDashboardFlexPanel
      title="数据明细"
      subtitle="涨幅、跌幅、热门与资讯"
      fill
      tabConfig={{
        tabs,
        value: tab,
        onChange: setTab,
        ariaLabel: '数据明细',
      }}
    >
      <div className={s.body}>
        {wrapStockList(renderContent())}
      </div>
    </CnDashboardFlexPanel>
  )
}
