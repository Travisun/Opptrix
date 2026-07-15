import { useMemo } from 'react'
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

type Section = { key: string; label: string; articles: FeedArticle[] }

type Props = {
  view: NewsListView
  onViewChange: (view: NewsListView) => void
  articles: FeedArticle[]
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
  total: number
  hasAnyArticles: boolean
  hasSubscriptions: boolean
  onLoadMore: () => void
  error?: string
}

function buildGroupSections(
  grouped: NewsGroupedFeed,
  groupFilterId: string,
): Section[] {
  if (groupFilterId === '__ungrouped__') {
    return grouped.ungrouped.length
      ? [{ key: '__ungrouped__', label: '未分组', articles: grouped.ungrouped }]
      : []
  }
  const g = grouped.groups.find(x => x.id === groupFilterId)
  return g ? [{ key: g.id, label: g.title, articles: g.articles }] : []
}

function buildSourceSections(
  grouped: NewsGroupedFeed,
  sourceFilterId: string,
): Section[] {
  const s = grouped.by_source.find(x => x.subscription_id === sourceFilterId)
  return s ? [{ key: s.subscription_id, label: s.title, articles: s.articles }] : []
}

export default function NewsFeedSidebar({
  view,
  onViewChange,
  articles,
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
  total,
  hasAnyArticles,
  hasSubscriptions,
  onLoadMore,
  error = '',
}: Props) {
  const s = useStyles()

  const sections = useMemo(() => {
    if (!grouped || view === 'timeline') return undefined
    if (view === 'group') {
      if (!groupFilterId) return []
      return buildGroupSections(grouped, groupFilterId)
    }
    if (!sourceFilterId) return []
    return buildSourceSections(grouped, sourceFilterId)
  }, [grouped, view, groupFilterId, sourceFilterId])

  const visibleCount = useMemo(() => {
    if (view === 'timeline') return articles.length
    if (!sections) return 0
    return sections.reduce((sum, sec) => sum + sec.articles.length, 0)
  }, [view, articles.length, sections])

  const displayTotal = view === 'timeline' ? total : visibleCount

  return (
    <div className={mergeClasses(s.root, 'opptrix-news-sidebar')}>
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
            sections={sections}
            articles={view === 'timeline' ? articles : undefined}
            selectedId={selectedId}
            onSelect={onSelect}
            compact
            listPulseEpoch={listPulseEpoch}
            loadingMore={loadingMore || listSyncing}
            hasMore={view === 'timeline' ? hasMore : false}
            onLoadMore={view === 'timeline' ? onLoadMore : undefined}
            hasAnyArticles={hasAnyArticles}
            hasSubscriptions={hasSubscriptions}
          />
        )}
      </div>
    </div>
  )
}
