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
  MarketReportData,
  MarketStockMover,
} from '../../types/schemas'
import { openExternalUrl } from '../../platform/openUrl'
import { formatRelativeTime } from '../news/newsUtils'
import { indexChartCodeFromQuote, writeCnIndexChartCode } from './cnIndexChartStorage'
import MarketBoardFocus from './MarketBoardFocus'
import MarketDragonTigerList from './MarketDragonTigerList'

type BriefTab = 'report' | 'dragon_tiger'

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
    fontSize: '10px',
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
    flex: '0 0 auto',
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    fontWeight: 600,
    padding: '4px 6px',
    borderRadius: '6px',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  mainPane: {
    flex: '1 1 45%',
    minHeight: '140px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  mainPaneChart: {
    flex: '0 0 auto',
    minHeight: 'unset',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  chartWrap: {
    padding: `6px ${CONTENT_PAD} 8px`,
    minHeight: '200px',
  },
  briefSection: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
  },
  insightsRow: {
    flex: '1 1 32%',
    minHeight: '120px',
    display: 'grid',
    gridTemplateColumns: '2fr 3fr',
    overflow: 'hidden',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
  },
  insightsRowStacked: {
    gridTemplateColumns: '1fr',
  },
  insightsCol: {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  insightsColStacked: {
    borderRight: 'none',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  newsSection: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sectionHead: {
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
  sectionHeadTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.03em',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  sectionTabList: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    minHeight: 'unset',
    gap: '2px',
    '& .fui-TabList': {
      minHeight: 'unset',
      height: '24px',
      gap: '2px',
    },
    '& .fui-Tab': {
      fontSize: '10px',
      fontWeight: 600,
      color: opptrixCssVars.textTertiary,
      letterSpacing: '0.03em',
      minHeight: '24px',
      height: '24px',
      paddingTop: 0,
      paddingBottom: 0,
      backgroundColor: 'transparent',
      ':enabled:hover': { backgroundColor: 'transparent' },
      ':enabled:active': { backgroundColor: 'transparent' },
      ':focus': { backgroundColor: 'transparent' },
      ':focus-visible': { backgroundColor: 'transparent' },
    },
  },
  sectionHeadHint: {
    fontSize: '10px',
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
  briefScrollReport: {
    padding: `6px ${CONTENT_PAD} 8px`,
  },
  briefTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
    marginBottom: '2px',
  },
  briefText: {
    fontSize: '11px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  briefSectionLine: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    marginTop: '4px',
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
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '6px 8px',
    minHeight: '28px',
    borderRadius: '6px',
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  newsTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  newsMeta: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
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
    fontSize: '11px',
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
  report: MarketReportData | null
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
  report,
  articles,
  insightsLoading,
  stacked = false,
}: Props) {
  const s = useStyles()
  const [briefTab, setBriefTab] = useState<BriefTab>('report')
  const showChart = Boolean(chartCode)
  const activeName = cnIndices.find(item => indexChartCodeFromQuote(item) === chartCode)?.name ?? chartCode
  const chartMinHeight = stacked ? '180px' : '220px'

  const handleTabSelect = (code: string) => {
    onChartCodeChange(code)
    writeCnIndexChartCode(code)
  }

  return (
    <div className={mergeClasses(s.root, 'opptrix-market-dynamics-detail')}>
      {showChart && (
        <div className={s.chrome}>
          <Text className={s.chromeMeta}>指数走势</Text>
          {cnIndices.length > 0 && (
            <TabList
              className={s.tabList}
              size="small"
              appearance="subtle"
              selectedValue={chartCode ?? undefined}
              onTabSelect={(_, d) => handleTabSelect(String(d.value))}
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
      )}

      <div className={s.body}>
        <div className={mergeClasses(s.mainPane, showChart && s.mainPaneChart)}>
          {showChart ? (
            <>
              <div className={s.chartWrap} style={{ minHeight: chartMinHeight }}>
                <TradingViewChart code={chartCode!} expanded active />
              </div>
              {activeName && (
                <Text
                  block
                  style={{
                    fontSize: 10,
                    color: opptrixCssVars.textTertiary,
                    padding: '0 10px 6px',
                  }}
                >
                  {activeName} · 仅 A 股宽基指数
                </Text>
              )}
            </>
          ) : (
            <MarketBoardFocus
              gainers={gainers}
              losers={losers}
              stacked={stacked}
            />
          )}
        </div>

        <div className={mergeClasses(s.insightsRow, stacked && s.insightsRowStacked)}>
          <div className={mergeClasses(s.insightsCol, s.briefSection, stacked && s.insightsColStacked)}>
            <div className={s.sectionHead}>
              <TabList
                className={s.sectionTabList}
                size="small"
                appearance="subtle"
                selectedValue={briefTab}
                onTabSelect={(_, d) => setBriefTab(String(d.value) as BriefTab)}
              >
                <Tab value="report">市场简报</Tab>
                <Tab value="dragon_tiger">龙虎榜</Tab>
              </TabList>
              {briefTab === 'dragon_tiger' && dragonTigerDate && (
                <span className={s.sectionHeadHint}>{dragonTigerDate}</span>
              )}
            </div>
            <div className={mergeClasses(s.briefScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
              {briefTab === 'report' ? (
                <div className={s.briefScrollReport}>
                  {insightsLoading && !report ? (
                    <div className={s.loading}><Spinner size="tiny" label="整理市场要点…" /></div>
                  ) : report?.summary ? (
                    <>
                      <Text className={s.briefTitle} block>{report.title}</Text>
                      <Text className={s.briefText} block>{report.summary}</Text>
                      {report.sections.slice(0, 2).map(sec => (
                        <Text key={sec.title} className={s.briefSectionLine} block>
                          {sec.title}：{sec.content}
                        </Text>
                      ))}
                    </>
                  ) : (
                    <div className={s.empty}>暂无市场简报</div>
                  )}
                </div>
              ) : marketLoading && !dragonTiger.length ? (
                <div className={s.loading}><Spinner size="tiny" label="加载龙虎榜…" /></div>
              ) : (
                <MarketDragonTigerList items={dragonTiger} />
              )}
            </div>
          </div>

          <div className={mergeClasses(s.insightsCol, s.newsSection, stacked && s.insightsColStacked)}>
            <div className={s.sectionHead}>
              <span className={s.sectionHeadTitle}>最新资讯</span>
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
              <div className={mergeClasses(s.newsScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
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
        </div>
      </div>
    </div>
  )
}
