import { useMemo, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular, NewsRegular, OpenRegular } from '@fluentui/react-icons'
import PanelTitleTabs from '../../components/PanelTitleTabs'
import TradingViewChart from '../../market/TradingViewChart'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatPct, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
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
import { openExternalUrl } from '../../platform/openUrl'
import { formatRelativeTime } from '../news/newsUtils'
import { indexChartCodeFromQuote } from './cnIndexChartStorage'
import { resolveMarketIndexChartInstrument } from './marketBoardUtils'
import { buildOpptrixInstrumentId } from '../../market/instrument'
import { MarketDynamicsSectionTabs } from './MarketDynamicsHeader'
import MarketBoardFocus from './MarketBoardFocus'
import MarketDragonTigerList from './MarketDragonTigerList'
import MarketEmotionBoard from './MarketEmotionBoard'

type DetailTab = 'board' | 'news'
type BoardListId = 'movers' | 'limit_up' | 'limit_break' | 'skyrocket' | 'ladder' | 'dragon' | 'hot' | 'anomaly'

const BOARD_NAV: { id: BoardListId; label: string }[] = [
  { id: 'movers', label: '涨跌' },
  { id: 'limit_up', label: '涨停' },
  { id: 'limit_break', label: '炸板' },
  { id: 'skyrocket', label: '飙升' },
  { id: 'ladder', label: '天梯' },
  { id: 'dragon', label: '龙虎' },
  { id: 'hot', label: '热股' },
  { id: 'anomaly', label: '异动' },
]

const DETAIL_TABS = [
  { value: 'board' as const, label: '盘面' },
  { value: 'news' as const, label: '资讯' },
]

const CONTENT_PAD = '10px'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixCssVars.canvas,
  },
  chrome: {
    flexShrink: 0,
    backgroundColor: opptrixCssVars.canvas,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    padding: '4px 10px 6px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flexWrap: 'wrap',
  },
  chromeChart: {
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
  },
  chartTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chromeMeta: {
    flex: '0 0 auto',
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  tabList: {
    flex: 1,
    minWidth: 0,
    minHeight: 'unset',
    gap: '2px',
    '& .fui-Tab': {
      backgroundColor: 'transparent',
      ':enabled:hover': { backgroundColor: 'transparent' },
      ':enabled:active': { backgroundColor: 'transparent' },
      ':focus': { backgroundColor: 'transparent' },
      ':focus-visible': { backgroundColor: 'transparent' },
    },
  },
  closeBtn: {
    ...ghostInteractive,
    flex: '0 0 auto',
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
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  pane: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  chartWrap: {
    flex: '0 0 auto',
    height: 'min(42vh, 320px)',
    minHeight: '220px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: `6px ${CONTENT_PAD} 8px`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  boardBody: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  boardTabsRow: {
    flexShrink: 0,
    padding: '0 12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    overflowX: 'auto',
  },
  boardMain: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  boardMainScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  sectionHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    padding: '6px 10px 4px',
    minHeight: '28px',
  },
  sectionHeadTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.03em',
  },
  sectionHeadHint: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 400,
    color: opptrixCssVars.textTertiary,
    letterSpacing: 'normal',
    lineHeight: 1,
    flexShrink: 0,
  },
  newsScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  newsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: `0 ${CONTENT_PAD} 10px`,
  },
  newsRow: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '6px 8px',
    minHeight: '28px',
    borderRadius: '6px',
    cursor: 'pointer',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  newsTitle: {
    fontSize: 'var(--opptrix-font-md)',
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
  newsHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    padding: '6px 10px 4px',
  },
  newsHeadTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.03em',
  },
  iconBox: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    flexShrink: 0,
    lineHeight: 0,
  },
  empty: {
    padding: '12px 8px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  loading: {
    padding: '16px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: `0 ${CONTENT_PAD} 10px`,
  },
  simpleRow: {
    ...ghostInteractive,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '8px',
    alignItems: 'start',
    padding: '8px 8px',
    borderRadius: '6px',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  simpleTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  simpleMeta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    marginTop: '2px',
  },
  simplePct: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function SimpleQuoteList({
  items,
  emptyLabel,
}: {
  items: Array<{ code: string; name: string; change_pct?: number | null; reason?: string; tag?: string }>
  emptyLabel: string
}) {
  const s = useStyles()
  if (!items.length) {
    return <div className={s.empty}>{emptyLabel}</div>
  }
  return (
    <div className={mergeClasses(s.simpleList, 'opptrix-scroll-hidden')}>
      {items.map(item => (
        <div key={item.code} className={s.simpleRow}>
          <div>
            <div className={s.simpleTitle}>{item.name}</div>
            <div className={s.simpleMeta}>
              {[item.tag, item.reason, item.code].filter(Boolean).join(' · ')}
            </div>
          </div>
          {'change_pct' in item && (
            <span className={mergeClasses(s.simplePct, pctClass(s, item.change_pct ?? null))}>
              {formatPct(item.change_pct ?? null, 2)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

type Props = {
  cnIndices: MarketIndexQuote[]
  chartCode: string | null
  onChartCodeChange: (code: string | null) => void
  gainers: MarketStockMover[]
  losers: MarketStockMover[]
  dragonTiger: MarketDragonTigerItem[]
  dragonTigerDate?: string | null
  limitUp?: MarketLimitUpItem[]
  limitBreak?: MarketLimitUpItem[]
  skyrocket?: MarketHotItem[]
  hotStocks?: MarketHotItem[]
  anomaly?: MarketAnomalyItem[]
  limitLadder?: MarketLimitLadder | null
  marketLoading: boolean
  articles: FeedArticle[]
  insightsLoading: boolean
}

export default function MarketDynamicsDetail({
  cnIndices,
  chartCode,
  onChartCodeChange,
  gainers,
  losers,
  dragonTiger,
  dragonTigerDate,
  limitUp = [],
  limitBreak = [],
  skyrocket = [],
  hotStocks = [],
  anomaly = [],
  limitLadder,
  marketLoading,
  articles,
  insightsLoading,
}: Props) {
  const s = useStyles()
  const [detailTab, setDetailTab] = useState<DetailTab>('board')
  const [boardList, setBoardList] = useState<BoardListId>('movers')
  const showChart = Boolean(chartCode)
  const activeIndex = cnIndices.find(item => indexChartCodeFromQuote(item) === chartCode) ?? null
  const activeName = activeIndex?.name ?? chartCode
  const chartInstrument = useMemo(
    () => resolveMarketIndexChartInstrument(activeIndex, chartCode),
    [activeIndex, chartCode],
  )

  const moversLoading = marketLoading && !gainers.length && !losers.length
  const limitUpLoading = marketLoading && !limitUp.length
  const limitBreakLoading = marketLoading && !limitBreak.length
  const skyrocketLoading = marketLoading && !skyrocket.length
  const hotLoading = marketLoading && !hotStocks.length
  const anomalyLoading = marketLoading && !anomaly.length
  const ladderLoading = marketLoading && !limitLadder?.boards.length
  const dragonLoading = marketLoading && !dragonTiger.length

  const boardListLoading =
    boardList === 'movers' ? moversLoading
      : boardList === 'limit_up' ? limitUpLoading
        : boardList === 'limit_break' ? limitBreakLoading
          : boardList === 'skyrocket' ? skyrocketLoading
            : boardList === 'hot' ? hotLoading
              : boardList === 'anomaly' ? anomalyLoading
                : boardList === 'ladder' ? ladderLoading
                  : dragonLoading

  const renderBoardContent = () => {
    if (boardListLoading) {
      const loadingLabel =
        boardList === 'movers' ? '正在加载涨跌榜…'
          : boardList === 'limit_up' ? '正在加载涨停…'
            : boardList === 'limit_break' ? '正在加载炸板…'
              : boardList === 'skyrocket' ? '正在加载飙升榜…'
                : boardList === 'hot' ? '正在加载热股…'
                  : boardList === 'anomaly' ? '正在加载异动…'
                    : boardList === 'ladder' ? '正在加载连板天梯…'
                      : '正在加载龙虎榜…'
      return (
        <div className={s.loading}><Spinner size="tiny" label={loadingLabel} /></div>
      )
    }

    switch (boardList) {
      case 'movers':
        return <MarketBoardFocus gainers={gainers} losers={losers} embedded variant="cn" />
      case 'limit_up':
        return (
          <MarketEmotionBoard
            section="limit_up"
            limitUp={limitUp}
            skyrocket={skyrocket}
            ladder={limitLadder}
          />
        )
      case 'limit_break':
        return (
          <SimpleQuoteList
            items={limitBreak}
            emptyLabel="暂无炸板数据，请确认已配置扶摇数据源"
          />
        )
      case 'skyrocket':
        return (
          <MarketEmotionBoard
            section="skyrocket"
            limitUp={limitUp}
            skyrocket={skyrocket}
            ladder={limitLadder}
          />
        )
      case 'hot':
        return (
          <SimpleQuoteList
            items={hotStocks.map(row => ({
              code: row.code,
              name: row.name,
              reason: row.rank != null ? `热度 #${row.rank}` : undefined,
            }))}
            emptyLabel="暂无热股榜单"
          />
        )
      case 'anomaly':
        return (
          <SimpleQuoteList
            items={anomaly}
            emptyLabel="暂无异动解读"
          />
        )
      case 'ladder':
        return (
          <MarketEmotionBoard
            section="ladder"
            limitUp={limitUp}
            skyrocket={skyrocket}
            ladder={limitLadder}
          />
        )
      case 'dragon':
        return (
          <>
            <div className={s.sectionHead}>
              <span className={s.sectionHeadTitle}>龙虎榜</span>
              {dragonTigerDate && (
                <span className={s.sectionHeadHint}>{dragonTigerDate}</span>
              )}
            </div>
            <div className={mergeClasses(s.boardMainScroll, 'opptrix-scroll-hidden')}>
              <MarketDragonTigerList items={dragonTiger} />
            </div>
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className={mergeClasses(s.root, 'opptrix-market-dynamics-detail')}>
      {showChart ? (
        <div className={mergeClasses(s.chrome, s.chromeChart)}>
          <Text className={s.chartTitle}>{activeName ?? '指数走势'}</Text>
          <button
            type="button"
            className={s.closeBtn}
            onClick={() => onChartCodeChange(null)}
          >
            <span className={s.iconBox}><DismissRegular fontSize={14} /></span>
            收起图表
          </button>
        </div>
      ) : (
        <MarketDynamicsSectionTabs
          tabs={DETAIL_TABS}
          value={detailTab}
          onChange={setDetailTab}
        />
      )}

      <div className={s.body}>
        {showChart && chartCode && chartInstrument ? (
          <div className={s.pane}>
            <div className={s.chartWrap}>
              <TradingViewChart
                code={buildOpptrixInstrumentId(chartInstrument)}
                instrument={chartInstrument}
                chartVariant="index"
                expanded
                active
              />
            </div>
          </div>
        ) : null}

        {!showChart && detailTab === 'board' ? (
          <div className={s.pane}>
            <div className={s.boardBody}>
              <div className={s.boardTabsRow}>
                <PanelTitleTabs
                  tabs={BOARD_NAV.map(item => ({ value: item.id, label: item.label }))}
                  value={boardList}
                  onChange={setBoardList}
                  ariaLabel="盘面列表"
                />
              </div>
              <div className={s.boardMain}>
                <div className={mergeClasses(s.boardMainScroll, 'opptrix-scroll-hidden')}>
                  {renderBoardContent()}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!showChart && detailTab === 'news' ? (
          <div className={s.pane}>
            <div className={s.newsHead}>
              <span className={s.newsHeadTitle}>最新资讯</span>
              <span className={s.sectionHeadHint}>{articles.length} 篇</span>
            </div>
            {insightsLoading && !articles.length ? (
              <div className={s.loading}><Spinner size="tiny" label="加载资讯…" /></div>
            ) : !articles.length ? (
              <div className={s.empty}>
                <span className={s.iconBox}><NewsRegular fontSize={18} /></span>
                <div>暂无相关资讯，可在新闻中心添加订阅</div>
              </div>
            ) : (
              <div className={mergeClasses(s.newsScroll, 'opptrix-scroll-hidden')}>
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
                        <span className={s.iconBox}><OpenRegular fontSize={12} /></span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {showChart && chartCode ? (
          <div className={s.pane}>
            <div className={s.boardBody}>
              <div className={s.boardTabsRow}>
                <PanelTitleTabs
                  tabs={BOARD_NAV.map(item => ({ value: item.id, label: item.label }))}
                  value={boardList}
                  onChange={setBoardList}
                  ariaLabel="盘面列表"
                />
              </div>
              <div className={s.boardMain}>
                <div className={mergeClasses(s.boardMainScroll, 'opptrix-scroll-hidden')}>
                  {renderBoardContent()}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
