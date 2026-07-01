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
    backgroundColor: opptrixTokens.canvasAlt,
    borderRight: `1px solid ${opptrixTokens.separator}`,
  },
  tabs: {
    flexShrink: 0,
    padding: '8px 12px 4px',
    borderBottom: `1px solid ${opptrixTokens.separator}`,
  },
  tabList: {
    minHeight: 'unset',
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
  groupFilterId: string | null,
): Section[] {
  if (groupFilterId === '__ungrouped__') {
    return grouped.ungrouped.length
      ? [{ key: '__ungrouped__', label: '未分组', articles: grouped.ungrouped }]
      : []
  }
  if (groupFilterId) {
    const g = grouped.groups.find(x => x.id === groupFilterId)
    return g ? [{ key: g.id, label: g.title, articles: g.articles }] : []
  }
  const out = grouped.groups.map(g => ({
    key: g.id,
    label: g.title,
    articles: g.articles,
  }))
  if (grouped.ungrouped.length) {
    out.push({ key: '__ungrouped__', label: '未分组', articles: grouped.ungrouped })
  }
  return out
}

function buildSourceSections(
  grouped: NewsGroupedFeed,
  sourceFilterId: string | null,
): Section[] {
  if (sourceFilterId) {
    const s = grouped.by_source.find(x => x.subscription_id === sourceFilterId)
    return s ? [{ key: s.subscription_id, label: s.title, articles: s.articles }] : []
  }
  return grouped.by_source.map(s => ({
    key: s.subscription_id,
    label: s.title,
    articles: s.articles,
  }))
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
    if (view === 'group') return buildGroupSections(grouped, groupFilterId)
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
      <div className={s.tabs}>
        <TabList
          className={s.tabList}
          size="small"
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
            loadingMore={loadingMore || listSyncing}
            hasMore={view === 'timeline' ? hasMore : false}
            onLoadMore={view === 'timeline' ? onLoadMore : undefined}
          />
        )}
      </div>
    </div>
  )
}
