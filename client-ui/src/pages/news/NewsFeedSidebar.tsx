import { Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { NewsGroupedFeed } from '../../types/schemas'
import type { NewsListView } from './useNewsFeed'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import NewsArticleList from './NewsArticleList'
import NewsFeedFilterBar from './NewsFeedFilterBar'
import type { FeedArticle, FeedGroup, FeedSubscription } from '../../types/schemas'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixCssVars.canvas,
    borderRight: `1px solid ${opptrixCssVars.separatorStrong}`,
  },
  rootFullWidth: {
    borderRight: 'none',
  },
  chrome: {
    flexShrink: 0,
    backgroundColor: opptrixCssVars.canvas,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  tabs: {
    padding: '6px 10px 0',
    marginBottom: '5px',
  },
  tabList: {
    minHeight: 'unset',
    gap: '2px',
    '& .fui-Tab': {
      backgroundColor: 'transparent',
      ':enabled:hover': {
        backgroundColor: 'transparent',
      },
      ':enabled:active': {
        backgroundColor: 'transparent',
      },
      ':focus': {
        backgroundColor: 'transparent',
      },
      ':focus-visible': {
        backgroundColor: 'transparent',
      },
    },
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorHint: {
    flexShrink: 0,
    padding: '8px 10px 6px',
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.5,
    color: opptrixCssVars.error,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
  },
})

type Props = {
  view: NewsListView
  onViewChange: (view: NewsListView) => void
  articles: FeedArticle[]
  filteredArticles: FeedArticle[]
  grouped: NewsGroupedFeed | null
  groups: FeedGroup[]
  subscriptions: FeedSubscription[]
  timelineDate: string | null
  groupFilterId: string | null
  sourceFilterId: string | null
  listSyncing: boolean
  listPulseEpoch: number
  selectedId: string | null
  onSelect: (id: string) => void
  onTimelineDateChange: (date: string | null) => void
  onGroupFilterChange: (groupId: string | null) => void
  onSourceFilterChange: (subscriptionId: string | null) => void
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  filteredHasMore: boolean
  listCapReached?: boolean
  total: number
  filteredTotal: number
  hasAnyArticles: boolean
  hasSubscriptions: boolean
  onLoadMore: () => void
  error?: string
  fullWidth?: boolean
}

export default function NewsFeedSidebar({
  view,
  onViewChange,
  articles,
  filteredArticles,
  grouped,
  groups,
  subscriptions,
  timelineDate,
  groupFilterId,
  sourceFilterId,
  listSyncing,
  listPulseEpoch,
  selectedId,
  onSelect,
  onTimelineDateChange,
  onGroupFilterChange,
  onSourceFilterChange,
  loading,
  loadingMore,
  hasMore,
  filteredHasMore,
  listCapReached = false,
  total,
  filteredTotal,
  hasAnyArticles,
  hasSubscriptions,
  onLoadMore,
  error = '',
  fullWidth = false,
}: Props) {
  const s = useStyles()

  const listArticles = view === 'timeline' ? articles : filteredArticles
  const listHasMore = view === 'timeline' ? hasMore : filteredHasMore
  const displayTotal = view === 'timeline' ? total : filteredTotal
  const visibleCount = listArticles.length

  return (
    <div className={mergeClasses(s.root, fullWidth && s.rootFullWidth, 'opptrix-news-sidebar')}>
      <div className={s.chrome}>
        <div className={s.tabs}>
          <TabList
            className={s.tabList}
            size="small"
            appearance="subtle"
            selectedValue={view}
            onTabSelect={(_, d) => onViewChange(d.value as NewsListView)}
          >
            <Tab value="timeline">时间线</Tab>
            <Tab value="group">分组</Tab>
            <Tab value="source">来源</Tab>
          </TabList>
        </div>
        <NewsFeedFilterBar
          view={view}
          groups={groups}
          subscriptions={subscriptions}
          grouped={grouped}
          timelineDate={timelineDate}
          groupFilterId={groupFilterId}
          sourceFilterId={sourceFilterId}
          listSyncing={listSyncing}
          loadedCount={visibleCount}
          totalCount={displayTotal}
          onTimelineDateChange={onTimelineDateChange}
          onGroupFilterChange={onGroupFilterChange}
          onSourceFilterChange={onSourceFilterChange}
        />
      </div>
      <div className={s.body}>
        {error && (
          <Text className={s.errorHint} block role="alert">
            {error}。请检查网络后点击刷新重试。
          </Text>
        )}
        {loading ? (
          <div className={s.loading}>
            <Spinner size="small" label="正在加载资讯…" />
          </div>
        ) : (
          <NewsArticleList
            articles={listArticles}
            selectedId={selectedId}
            onSelect={onSelect}
            compact
            listPulseEpoch={listPulseEpoch}
            loadingMore={loadingMore || listSyncing}
            hasMore={listHasMore}
            listCapReached={view === 'timeline' ? listCapReached : false}
            onLoadMore={onLoadMore}
            hasAnyArticles={hasAnyArticles}
            hasSubscriptions={hasSubscriptions}
          />
        )}
      </div>
    </div>
  )
}
