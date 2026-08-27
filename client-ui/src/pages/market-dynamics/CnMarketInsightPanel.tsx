import { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { NewsRegular, OpenRegular } from '@fluentui/react-icons'
import PanelTitleTabs from '../../components/PanelTitleTabs'
import type {
  FeedArticle,
  MarketAnomalyItem,
  MarketDragonTigerItem,
  MarketHotItem,
  MarketIndexQuote,
  MarketLimitLadder,
  MarketLimitUpItem,
  MarketStockMover,
} from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatRelativeTime } from '../news/newsUtils'
import { openExternalUrl } from '../../platform/openUrl'
import MarketBoardFocus from './MarketBoardFocus'
import MarketDragonTigerList from './MarketDragonTigerList'
import MarketEmotionBoard from './MarketEmotionBoard'
import MarketSectorConstituentsPanel from './MarketSectorConstituentsPanel'
import CnDashboardPanel from './CnDashboardPanel'

type InsightTab = 'constituents' | 'movers' | 'limit_up' | 'ladder' | 'dragon' | 'news'

const BASE_TABS: { value: InsightTab; label: string }[] = [
  { value: 'movers', label: '涨跌榜' },
  { value: 'limit_up', label: '涨停' },
  { value: 'ladder', label: '连板' },
  { value: 'dragon', label: '龙虎' },
  { value: 'news', label: '资讯' },
]

const useStyles = makeStyles({
  tabsRow: {
    flexShrink: 0,
    padding: '0 12px 8px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    overflowX: 'auto',
  },
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
    gap: '1px',
    padding: '4px 10px 10px',
  },
  newsRow: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  newsTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
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
    padding: '20px 12px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
  },
  sectionHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px 4px',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
})

type Props = {
  selectedSector: MarketIndexQuote | null
  selectedSectorCode: string | null
  gainers: MarketStockMover[]
  losers: MarketStockMover[]
  limitUp?: MarketLimitUpItem[]
  limitBreak?: MarketLimitUpItem[]
  skyrocket?: MarketHotItem[]
  limitLadder?: MarketLimitLadder | null
  dragonTiger: MarketDragonTigerItem[]
  dragonTigerDate?: string | null
  anomaly?: MarketAnomalyItem[]
  articles: FeedArticle[]
  insightsLoading: boolean
  marketLoading: boolean
  onClearSector: () => void
}

export default function CnMarketInsightPanel({
  selectedSector,
  selectedSectorCode,
  gainers,
  losers,
  limitUp,
  skyrocket,
  limitLadder,
  dragonTiger,
  dragonTigerDate,
  articles,
  insightsLoading,
  marketLoading,
  onClearSector,
}: Props) {
  const s = useStyles()
  const [tab, setTab] = useState<InsightTab>('movers')

  useEffect(() => {
    if (selectedSector) setTab('constituents')
    else if (tab === 'constituents') setTab('movers')
  }, [selectedSector, tab])

  const tabs = useMemo(() => {
    if (selectedSector) {
      return [{ value: 'constituents' as const, label: '成份股' }, ...BASE_TABS]
    }
    return BASE_TABS
  }, [selectedSector])

  const panelTitle = selectedSector ? `${selectedSector.name} · 成份` : '数据明细'
  const panelSubtitle = selectedSector
    ? '板块内个股现价与涨跌幅'
    : '涨跌榜、涨停、连板、龙虎与资讯'

  const renderContent = () => {
    if (tab === 'constituents' && selectedSector && selectedSectorCode) {
      return (
        <MarketSectorConstituentsPanel
          embedded
          indexCode={selectedSectorCode}
          sector={selectedSector}
          onClose={onClearSector}
        />
      )
    }

    if (tab === 'movers') {
      if (marketLoading && !gainers.length && !losers.length) {
        return <div className={s.empty}><Spinner size="tiny" label="加载涨跌榜…" /></div>
      }
      return <MarketBoardFocus gainers={gainers} losers={losers} embedded variant="cn" />
    }

    if (tab === 'limit_up') {
      return (
        <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
          <MarketEmotionBoard
            section="limit_up"
            limitUp={limitUp ?? []}
            skyrocket={skyrocket ?? []}
            ladder={limitLadder}
            embedded
          />
        </div>
      )
    }

    if (tab === 'ladder') {
      return (
        <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
          <MarketEmotionBoard
            section="ladder"
            limitUp={limitUp ?? []}
            skyrocket={skyrocket ?? []}
            ladder={limitLadder}
            embedded
          />
        </div>
      )
    }

    if (tab === 'dragon') {
      return (
        <>
          <div className={s.sectionHead}>
            <span>龙虎榜</span>
            {dragonTigerDate ? <span>{dragonTigerDate}</span> : null}
          </div>
          <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
            <MarketDragonTigerList items={dragonTiger} />
          </div>
        </>
      )
    }

    if (insightsLoading && !articles.length) {
      return <div className={s.empty}><Spinner size="tiny" label="加载资讯…" /></div>
    }
    if (!articles.length) {
      return (
        <div className={s.empty}>
          <NewsRegular fontSize={18} />
          <div>暂无相关资讯</div>
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
    <CnDashboardPanel title={panelTitle} subtitle={panelSubtitle} fill>
      <div className={s.tabsRow}>
        <PanelTitleTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="市场洞察" />
      </div>
      <div className={s.body}>{renderContent()}</div>
    </CnDashboardPanel>
  )
}
