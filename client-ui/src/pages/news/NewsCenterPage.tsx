import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowSyncRegular, SettingsRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import MobileNavMenuButton from '../../components/MobileNavMenuButton'
import ChromeToolButton from '../../desktop/ChromeToolButton'
import StandaloneElectronTitleBar from '../../desktop/StandaloneElectronTitleBar'
import { opptrixCssVars } from '../../theme/tokens'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
} from '../../desktop/constants'
import NewsFeedSidebar from './NewsFeedSidebar'
import NewsArticleDetail from './NewsArticleDetail'
import NewsReaderEmpty from './NewsReaderEmpty'
import { useNewsFeed } from './useNewsFeed'
import type { FeedArticle } from '../../types/schemas'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  /** Electron: let app-main tint show through (sidebar/detail keep own surfaces). */
  rootElectron: {
    backgroundColor: 'transparent',
  },
  toolbarMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  webHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
  },
  webHeadMobile: {
    gap: '4px',
    padding: '6px 8px',
    paddingTop: 'max(6px, env(safe-area-inset-top))',
    minHeight: '44px',
  },
  webTitle: {
    fontSize: 'var(--opptrix-font-xl)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    flex: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  sidebar: {
    flex: '0 0 34%',
    minWidth: '260px',
    maxWidth: '400px',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  detail: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  detailLoading: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

type Props = {
  electronChrome?: boolean
  /** When sidebar collapsed: `desktopChromeToolbarReserve`; inline: 0 */
  chromeToolbarReserve?: number
  isMobile?: boolean
  sidebarDrawerOpen?: boolean
  onOpenSidebar?: () => void
  onOpenSettings?: () => void
  onDiscussArticle?: (article: FeedArticle) => void
}

function NewsCenterContent({
  electronChrome = false,
  chromeToolbarReserve = 0,
  isMobile = false,
  sidebarDrawerOpen = false,
  onOpenSidebar,
  onOpenSettings,
  onDiscussArticle,
}: Props) {
  const s = useStyles()
  const feed = useNewsFeed()
  const {
    articles,
    grouped,
    groups,
    subscriptions,
    loading,
    loadingMore,
    refreshing,
    refreshedAt,
    selectedId,
    selected,
    hasMore,
    listCapReached,
    total,
    view,
    setSelectedId,
    setView,
    timelineDate,
    groupFilterId,
    sourceFilterId,
    listSyncing,
    listPulseEpoch,
    setTimelineDate,
    setGroupFilter,
    setSourceFilter,
    loadMore,
    refresh,
    error,
  } = feed

  const hasAnyArticles = (grouped?.by_source.length ?? 0) > 0
    || articles.length > 0
    || (grouped?.ungrouped.length ?? 0) > 0

  const updatedLabel = refreshedAt
    ? new Date(refreshedAt).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : null

  const statusLabel = refreshing
    ? '刷新中…'
    : updatedLabel
      ? `更新 ${updatedLabel}`
      : '尚未刷新'

  const electronTitleBar = electronChrome ? (
    <StandaloneElectronTitleBar
      title="新闻中心"
      chromeToolbarReserve={chromeToolbarReserve}
      className="opptrix-news-title-bar"
      dragRegionClassName="opptrix-news-title-drag"
      meta={statusLabel}
      actions={(
        <>
          {onOpenSettings && (
            <ChromeToolButton
              label="订阅设置"
              iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
              onClick={onOpenSettings}
            >
              <SettingsRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
            </ChromeToolButton>
          )}
          <ChromeToolButton
            label="刷新列表"
            iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
            disabled={refreshing}
            onClick={() => { void refresh() }}
          >
            <ArrowSyncRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
          </ChromeToolButton>
        </>
      )}
    />
  ) : null

  const webHead = !electronChrome ? (
    <div className={mergeClasses(s.webHead, isMobile && s.webHeadMobile)}>
      {isMobile && onOpenSidebar ? (
            <MobileNavMenuButton open={sidebarDrawerOpen} onClick={onOpenSidebar} />
          ) : null}
      <Text className={s.webTitle} block>新闻中心</Text>
      {updatedLabel && <Text className={s.toolbarMeta}>更新 {updatedLabel}</Text>}
      <div className={s.toolbarActions}>
        {onOpenSettings && (
          <OpptrixButton variant="ghost" icon={<SettingsRegular />} onClick={onOpenSettings}>
            订阅设置
          </OpptrixButton>
        )}
        <OpptrixButton
          variant="secondary"
          icon={<ArrowSyncRegular />}
          disabled={refreshing}
          onClick={() => { void refresh() }}
        >
          {refreshing ? '刷新中…' : '刷新列表'}
        </OpptrixButton>
      </div>
    </div>
  ) : null

  return (
    <div className={mergeClasses(s.root, electronChrome && s.rootElectron, 'opptrix-news-center')}>
      {electronTitleBar}
      {webHead}

      <div className={s.body}>
        <div className={s.sidebar}>
          <NewsFeedSidebar
            view={view}
            onViewChange={setView}
            articles={articles}
            grouped={grouped}
            groups={groups}
            subscriptions={subscriptions}
            timelineDate={timelineDate}
            groupFilterId={groupFilterId}
            sourceFilterId={sourceFilterId}
            listSyncing={listSyncing}
            listPulseEpoch={listPulseEpoch}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onTimelineDateChange={date => { void setTimelineDate(date) }}
            onGroupFilterChange={setGroupFilter}
            onSourceFilterChange={setSourceFilter}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            listCapReached={listCapReached}
            total={total}
            hasAnyArticles={hasAnyArticles}
            hasSubscriptions={subscriptions.length > 0}
            onLoadMore={() => { void loadMore() }}
            error={error}
          />
        </div>
        <div className={s.detail}>
          {loading && !selected ? (
            <div className={s.detailLoading}>
              <Spinner size="medium" label="正在加载资讯…" />
            </div>
          ) : selected ? (
            <NewsArticleDetail article={selected} onDiscussArticle={onDiscussArticle} />
          ) : (
            <NewsReaderEmpty
              hasArticles={hasAnyArticles}
              hasSubscriptions={subscriptions.length > 0}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default function NewsCenterPage(props: Props) {
  return <NewsCenterContent {...props} />
}
