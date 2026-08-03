import { useState } from 'react'
import { Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular, NewsRegular, OpenRegular } from '@fluentui/react-icons'
import TradingViewChart from '../../market/TradingViewChart'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import type {
  FeedArticle,
  MarketDragonTigerItem,
  MarketIndexQuote,
  MarketStockMover,
} from '../../types/schemas'
import { openExternalUrl } from '../../platform/openUrl'
import { formatRelativeTime } from '../news/newsUtils'
import { indexChartCodeFromQuote, writeCnIndexChartCode } from './cnIndexChartStorage'
import MarketBoardFocus from './MarketBoardFocus'
import MarketDragonTigerList from './MarketDragonTigerList'

type DetailTab = 'focus' | 'brief' | 'news'

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
    padding: `6px ${CONTENT_PAD} 8px`,
    minHeight: '200px',
  },
  briefHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    padding: '0 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    height: '32px',
    minHeight: '32px',
    boxSizing: 'border-box',
  },
  sectionHeadHint: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 400,
    color: opptrixCssVars.textTertiary,
    letterSpacing: 'normal',
    lineHeight: 1,
    flexShrink: 0,
  },
  briefScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
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
})

type Props = {
  cnIndices: MarketIndexQuote[]
  chartCode: string | null
  onChartCodeChange: (code: string | null) => void
  gainers: MarketStockMover[]
  losers: MarketStockMover[]
  dragonTiger: MarketDragonTigerItem[]
  dragonTigerDate?: string | null
  marketLoading: boolean
  articles: FeedArticle[]
  insightsLoading: boolean
  stacked?: boolean
}

export default function MarketDynamicsDetail({
  cnIndices,
  chartCode,
  onChartCodeChange,
  gainers,
  losers,
  dragonTiger,
  dragonTigerDate,
  marketLoading,
  articles,
  insightsLoading,
  stacked = false,
}: Props) {
  const s = useStyles()
  const [detailTab, setDetailTab] = useState<DetailTab>('focus')
  const showChart = Boolean(chartCode)
  const activeName = cnIndices.find(item => indexChartCodeFromQuote(item) === chartCode)?.name ?? chartCode
  const chartMinHeight = stacked ? '180px' : '220px'

  const handleChartTabSelect = (code: string) => {
    onChartCodeChange(code)
    writeCnIndexChartCode(code)
  }

  return (
    <div className={mergeClasses(s.root, 'opptrix-market-dynamics-detail')}>
      {showChart ? (
        <div className={s.chrome}>
          <Text className={s.chromeMeta}>指数走势</Text>
          {cnIndices.length > 0 && (
            <TabList
              className={s.tabList}
              size="small"
              appearance="subtle"
              selectedValue={chartCode ?? undefined}
              onTabSelect={(_, d) => handleChartTabSelect(String(d.value))}
            >
              {cnIndices.map(item => (
                <Tab key={item.qt_code || item.code} value={indexChartCodeFromQuote(item)}>
                  {item.name}
                </Tab>
              ))}
            </TabList>
          )}
          <button
            type="button"
            className={s.closeBtn}
            onClick={() => onChartCodeChange(null)}
          >
            <span className={s.iconBox}><DismissRegular fontSize={14} /></span>
            返回看板
          </button>
        </div>
      ) : (
        <div className={s.chrome}>
          <Text className={s.chromeMeta}>观察</Text>
          <TabList
            className={s.tabList}
            size="small"
            appearance="subtle"
            selectedValue={detailTab}
            onTabSelect={(_, d) => setDetailTab(String(d.value) as DetailTab)}
          >
            <Tab value="focus">热度</Tab>
            <Tab value="brief">龙虎榜</Tab>
            <Tab value="news">资讯</Tab>
          </TabList>
        </div>
      )}

      <div className={s.body}>
        {showChart && chartCode ? (
          <div className={s.pane}>
            <div className={s.chartWrap} style={{ minHeight: chartMinHeight }}>
              <TradingViewChart code={chartCode} expanded active />
            </div>
            {activeName && (
              <Text
                block
                style={{
                  fontSize: 'var(--opptrix-font-xs)',
                  color: opptrixCssVars.textTertiary,
                  padding: '0 10px 6px',
                }}
              >
                {activeName} · 仅 A 股宽基指数
              </Text>
            )}
          </div>
        ) : detailTab === 'focus' ? (
          <div className={s.pane}>
            <MarketBoardFocus gainers={gainers} losers={losers} />
          </div>
        ) : detailTab === 'brief' ? (
          <div className={s.pane}>
            <div className={s.briefHead}>
              <Text className={s.sectionHeadHint}>龙虎榜</Text>
              {dragonTigerDate && (
                <span className={s.sectionHeadHint}>{dragonTigerDate}</span>
              )}
            </div>
            <div className={mergeClasses(s.briefScroll, 'opptrix-scroll-hidden')}>
              {marketLoading && !dragonTiger.length ? (
                <div className={s.loading}><Spinner size="tiny" label="加载龙虎榜…" /></div>
              ) : (
                <MarketDragonTigerList items={dragonTiger} />
              )}
            </div>
          </div>
        ) : (
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
                <div>暂无资讯，可在新闻中心添加订阅</div>
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
        )}
      </div>
    </div>
  )
}
