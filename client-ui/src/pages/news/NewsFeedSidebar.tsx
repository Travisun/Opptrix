import { useMemo } from 'react'
import { Spinner, Tab, TabList, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { NewsGroupedFeed } from '../../types/schemas'
import type { NewsListView } from './useNewsFeed'
import { opptrixTokens } from '../../theme/tokens'
import NewsArticleList from './NewsArticleList'
import NewsFeedFilterBar from './NewsFeedFilterBar'
import type { FeedArticle, FeedGroup, FeedSubscription } from '../../types/schemas'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixTokens.canvas,
    borderRight: `1px solid ${opptrixTokens.separatorStrong}`,
  },
  chrome: {
    flexShrink: 0,
    backgroundColor: opptrixTokens.canvas,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
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
  onLoadMore: () => void
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
  onLoadMore,
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
        {loading ? (
          <div className={s.loading}>
            <Spinner size="small" label="加载资讯…" />
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
          />
        )}
      </div>
    </div>
  )
}
