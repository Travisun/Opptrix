import { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular, NewsRegular, OpenRegular } from '@fluentui/react-icons'
import type {
  FeedArticle,
  MarketDragonTigerItem,
  MarketHotItem,
  MarketIndexQuote,
  MarketLimitLadder,
  MarketLimitUpItem,
  MarketStockMover,
} from '../../types/schemas'
import { formatPct, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatRelativeTime } from '../news/newsUtils'
import { openExternalUrl } from '../../platform/openUrl'
import MarketBoardFocus from './MarketBoardFocus'
import MarketDragonTigerList from './MarketDragonTigerList'
import MarketEmotionBoard from './MarketEmotionBoard'
import MarketSectorConstituentsPanel from './MarketSectorConstituentsPanel'
import CnDashboardFlexPanel from './CnDashboardFlexPanel'
import { formatIndexPoints } from './cnIndexFormat'
import CnChangePill from './CnChangePill'

type InsightTab =
  | 'constituents'
  | 'gainers'
  | 'losers'
  | 'limit_up'
  | 'limit_break'
  | 'ladder'
  | 'dragon'
  | 'news'

export type CnInsightTab = InsightTab

const useStyles = makeStyles({
  sectorSummary: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  sectorPoint: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
  },
  sectorUnit: {
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    marginLeft: '2px',
  },
  clearBtn: {
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
    padding: '4px 8px',
    borderRadius: '6px',
    marginLeft: 'auto',
    ':hover': { backgroundColor: opptrixCssVars.surfaceHover },
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
    padding: '4px 12px 12px',
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
  sectionHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px 6px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
  },
  quoteRow: {
    ...ghostInteractive,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '8px',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    ':last-child': { borderBottom: 'none' },
  },
  quoteName: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  quoteMeta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  quotePct: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
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
  articles: FeedArticle[]
  insightsLoading: boolean
  marketLoading: boolean
  onClearSector: () => void
  activeTab?: InsightTab
  onTabChange?: (tab: InsightTab) => void
}

export default function CnMarketInsightPanel({
  selectedSector,
  selectedSectorCode,
  gainers,
  losers,
  limitUp,
  limitBreak,
  skyrocket,
  limitLadder,
  dragonTiger,
  dragonTigerDate,
  articles,
  insightsLoading,
  marketLoading,
  onClearSector,
  activeTab,
  onTabChange,
}: Props) {
  const s = useStyles()
  const [internalTab, setInternalTab] = useState<InsightTab>('gainers')
  const tab = activeTab ?? internalTab

  const setTab = (next: InsightTab) => {
    onTabChange?.(next)
    if (activeTab === undefined) setInternalTab(next)
  }

  useEffect(() => {
    if (selectedSector) setTab('constituents')
    else if (tab === 'constituents') setTab('gainers')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sector selection drives tab
  }, [selectedSector])

  const tabs = useMemo(() => {
    const base = [
      { value: 'gainers' as const, label: `涨幅 ${gainers.length}` },
      { value: 'losers' as const, label: `跌幅 ${losers.length}` },
      { value: 'limit_up' as const, label: `涨停 ${limitUp?.length ?? 0}` },
      { value: 'limit_break' as const, label: `炸板 ${limitBreak?.length ?? 0}` },
      { value: 'ladder' as const, label: '连板' },
      { value: 'dragon' as const, label: `龙虎 ${dragonTiger.length}` },
      { value: 'news' as const, label: `资讯 ${articles.length}` },
    ]
    if (selectedSector) {
      return [{ value: 'constituents' as const, label: '成份股' }, ...base]
    }
    return base
  }, [
    articles.length,
    dragonTiger.length,
    gainers.length,
    limitBreak?.length,
    limitUp?.length,
    losers.length,
    selectedSector,
  ])

  const pctClass = (value: number | null | undefined) => {
    const tone = pctTone(value)
    if (tone === 'up') return s.pctUp
    if (tone === 'down') return s.pctDown
    return s.pctFlat
  }

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

    if (tab === 'gainers') {
      if (marketLoading && !gainers.length) {
        return <div className={s.empty}><Spinner size="tiny" label="正在加载涨幅榜…" /></div>
      }
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
      if (marketLoading && !losers.length) {
        return <div className={s.empty}><Spinner size="tiny" label="正在加载跌幅榜…" /></div>
      }
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

    if (tab === 'limit_up') {
      const count = limitUp?.length ?? 0
      if (marketLoading && !count) {
        return <div className={s.empty}><Spinner size="tiny" label="正在加载涨停…" /></div>
      }
      if (!count) {
        return (
          <div className={s.empty}>
            <div>今日暂无涨停数据</div>
            <div>交易时段内将自动更新</div>
          </div>
        )
      }
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

    if (tab === 'limit_break') {
      const count = limitBreak?.length ?? 0
      if (marketLoading && !count) {
        return <div className={s.empty}><Spinner size="tiny" label="正在加载炸板…" /></div>
      }
      if (!count) {
        return (
          <div className={s.empty}>
            <div>今日暂无炸板数据</div>
            <div>交易时段内将自动更新</div>
          </div>
        )
      }
      return (
        <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
          {(limitBreak ?? []).map(item => (
            <div key={item.code} className={s.quoteRow}>
              <div>
                <div className={s.quoteName}>{item.name}</div>
                <div className={s.quoteMeta}>{item.code}</div>
              </div>
              <span className={mergeClasses(s.quotePct, pctClass(item.change_pct))}>
                {formatPct(item.change_pct ?? null, 2)}
              </span>
            </div>
          ))}
        </div>
      )
    }

    if (tab === 'ladder') {
      const boards = limitLadder?.boards?.length ?? 0
      if (marketLoading && !boards) {
        return <div className={s.empty}><Spinner size="tiny" label="正在加载连板天梯…" /></div>
      }
      if (!boards) {
        return (
          <div className={s.empty}>
            <div>暂无连板天梯</div>
            <div>出现连板梯队后将在此展示</div>
          </div>
        )
      }
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
      if (marketLoading && !dragonTiger.length) {
        return <div className={s.empty}><Spinner size="tiny" label="正在加载龙虎榜…" /></div>
      }
      if (!dragonTiger.length) {
        return (
          <div className={s.empty}>
            <div>暂无龙虎榜数据</div>
            <div>每日收盘后将更新上榜个股</div>
          </div>
        )
      }
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
          <NewsRegular fontSize={20} />
          <div>暂无相关资讯</div>
          <div>可在新闻中心添加 A 股订阅源</div>
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
      subtitle="涨幅、跌幅、涨停、连板、龙虎与资讯"
      fill
      tabConfig={{
        tabs,
        value: tab,
        onChange: setTab,
        ariaLabel: '数据明细',
      }}
    >
      {selectedSector ? (
        <div className={s.sectorSummary}>
          <Text block style={{ fontSize: 'var(--opptrix-font-xs)', fontWeight: 650, flex: 1, minWidth: 0 }}>
            {selectedSector.name}
          </Text>
          <span>
            <span className={s.sectorPoint}>{formatIndexPoints(selectedSector.price, 2)}</span>
            <span className={s.sectorUnit}>点</span>
          </span>
          <CnChangePill changePct={selectedSector.change_pct} changeAmt={selectedSector.change_amt} ghost />
          <button type="button" className={s.clearBtn} onClick={onClearSector}>
            <DismissRegular fontSize={12} />
            取消板块
          </button>
        </div>
      ) : null}

      <div className={s.body}>{renderContent()}</div>
    </CnDashboardFlexPanel>
  )
}
