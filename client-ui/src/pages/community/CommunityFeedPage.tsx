import { useCallback, type UIEvent } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  ChatRegular,
  HeartRegular,
  OpenRegular,
  PinRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixSegmentedControl from '../../components/opptrix/OpptrixSegmentedControl'
import MobileNavMenuButton from '../../components/MobileNavMenuButton'
import ChromeToolButton from '../../desktop/ChromeToolButton'
import StandaloneElectronTitleBar from '../../desktop/StandaloneElectronTitleBar'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
} from '../../desktop/constants'
import { ghostInteractive } from '../../theme/mixins'
import {
  MOBILE_HEADER_ICON_SIZE,
  mobileHeaderBar,
  mobileHeaderIconBtn,
  mobileHeaderTitle,
} from '../../theme/mobileChrome'
import { openExternalUrl } from '../../platform/openUrl'
import { OPPTRIX_COMMUNITY, OPPTRIX_COMMUNITY_INVITE_CODE } from '../settings/aboutLinks'
import type { CommunityFeedKind, CommunityTopic } from '../../types/schemas'
import { useCommunityFeed } from './useCommunityFeed'
import {
  COMMUNITY_TAB_OPTIONS,
  emptyStateForKind,
  isCategoryFeedKind,
} from './communityFeedMeta'

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
  rootElectron: {
    backgroundColor: 'transparent',
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
    ...mobileHeaderBar,
    backgroundColor: opptrixCssVars.canvas,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
  },
  webTitle: {
    fontSize: 'var(--opptrix-font-xl)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    flex: 1,
  },
  webTitleMobile: mobileHeaderTitle,
  mobileActionBtn: {
    ...ghostInteractive,
    ...mobileHeaderIconBtn,
    color: opptrixCssVars.textSecondary,
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
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  intro: {
    flexShrink: 0,
    padding: '12px 16px 8px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
  },
  tabWrap: {
    flexShrink: 0,
    padding: '10px 16px 8px',
    overflowX: 'auto',
  },
  staleBanner: {
    flexShrink: 0,
    margin: '0 16px 8px',
    padding: '8px 12px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '4px 12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  item: {...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px 14px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.surface,
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
  },
  itemHead: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
  },
  pinIcon: {
    flexShrink: 0,
    color: opptrixCssVars.accent,
    marginTop: '2px',
  },
  excerpt: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  categoryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 8px',
    borderRadius: opptrixTokens.radiusSm,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    lineHeight: 1.5,
    backgroundColor: opptrixCssVars.surfaceHover,
    color: opptrixCssVars.textSecondary,
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 6px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textTertiary,
  },
  stat: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
  },
  empty: {
    flex: 1,
    minHeight: '160px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '24px 20px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-base)',
    lineHeight: 1.6,
  },
  loadingWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '160px',
  },
  loadMore: {
    flexShrink: 0,
    padding: '12px 8px 4px',
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
})

type Props = {
  electronChrome?: boolean
  chromeToolbarReserve?: number
  isMobile?: boolean
  sidebarDrawerOpen?: boolean
  onOpenSidebar?: () => void
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return ''
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function TopicRow({
  topic,
  feedKind,
  onOpen,
}: {
  topic: CommunityTopic
  feedKind: CommunityFeedKind
  onOpen: (url: string) => void
}) {
  const s = useStyles()
  const timeLabel = formatRelativeTime(topic.lastPostedAt ?? topic.createdAt)
  const hideCategoryBadge = isCategoryFeedKind(feedKind)
  const visibleTags = topic.tags.slice(0, 3)
  const ariaLabel = [
    topic.title,
    topic.pinned ? '置顶' : null,
    visibleTags.length ? visibleTags.join('、') : null,
    '在浏览器中打开',
  ].filter(Boolean).join('，')

  return (
    <button
      type="button"
      className={mergeClasses(s.item, 'opptrix-focusable')}
      onClick={() => onOpen(topic.url)}
      aria-label={ariaLabel}
    >
      <div className={s.itemHead}>
        {topic.pinned ? (
          <PinRegular className={s.pinIcon} fontSize={14} aria-hidden />
        ) : null}
        <span className={s.itemTitle}>{topic.title}</span>
      </div>
      {topic.excerpt ? <span className={s.excerpt}>{topic.excerpt}</span> : null}
      <div className={s.metaRow}>
        {topic.categoryName && !hideCategoryBadge ? (
          <span
            className={s.categoryBadge}
            style={topic.categoryColor ? { color: `#${topic.categoryColor}` } : undefined}
          >
            {topic.categoryName}
          </span>
        ) : null}
        {visibleTags.map(tag => (
          <span key={tag} className={s.tag}>{tag}</span>
        ))}
        {topic.authorUsername ? <span>{topic.authorUsername}</span> : null}
        {timeLabel ? <span>{timeLabel}</span> : null}
        {topic.replyCount > 0 ? (
          <span className={s.stat}>
            <ChatRegular fontSize={12} />
            {topic.replyCount}
          </span>
        ) : null}
        {topic.likeCount > 0 ? (
          <span className={s.stat}>
            <HeartRegular fontSize={12} />
            {topic.likeCount}
          </span>
        ) : null}
      </div>
    </button>
  )
}

function CommunityFeedContent({
  electronChrome = false,
  chromeToolbarReserve = 0,
  isMobile = false,
  sidebarDrawerOpen = false,
  onOpenSidebar,
}: Props) {
  const s = useStyles()
  const feed = useCommunityFeed()
  const {
    kind,
    setKind,
    topics,
    fetchedAt,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    loadMoreError,
    staleHint,
    refresh,
    loadMore,
  } = feed
  const emptyCopy = emptyStateForKind(kind)

  const updatedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : null

  const statusLabel = refreshing
    ? '刷新中…'
    : updatedLabel
      ? `更新于 ${updatedLabel}`
      : null

  const handleOpenTopic = (url: string) => {
    openExternalUrl(url)
  }

  const handleOpenCommunity = () => {
    openExternalUrl(OPPTRIX_COMMUNITY)
  }

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (!hasMore || loadingMore || loading || refreshing) return
    const el = e.currentTarget
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
    if (remaining < 120) {
      void loadMore()
    }
  }, [hasMore, loadMore, loading, loadingMore, refreshing])

  const toolbar = (
    <>
      {!isMobile && statusLabel ? <span className={s.toolbarMeta}>{statusLabel}</span> : null}
      <div className={s.toolbarActions}>
        {isMobile ? (
          <>
            <OpptrixButton
              className={s.mobileActionBtn}
              variant="ghost"
              icon={<ArrowSyncRegular fontSize={MOBILE_HEADER_ICON_SIZE} />}
              disabled={refreshing}
              onClick={refresh}
              aria-label={refreshing ? '正在刷新' : '刷新'}
            />
            <OpptrixButton
              className={s.mobileActionBtn}
              variant="ghost"
              icon={<OpenRegular fontSize={MOBILE_HEADER_ICON_SIZE} />}
              onClick={handleOpenCommunity}
              aria-label="访问社区"
            />
          </>
        ) : (
          <>
            <ChromeToolButton
              label="刷新"
              disabled={refreshing}
              onClick={refresh}
            >
              <ArrowSyncRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
            </ChromeToolButton>
            <ChromeToolButton
              label="访问社区"
              onClick={handleOpenCommunity}
            >
              <OpenRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
            </ChromeToolButton>
          </>
        )}
      </div>
    </>
  )

  return (
    <div className={mergeClasses(s.root, electronChrome && s.rootElectron)}>
      {electronChrome ? (
        <StandaloneElectronTitleBar
          title="社区讨论"
          chromeToolbarReserve={chromeToolbarReserve}
          meta={statusLabel}
          actions={(
            <>
              <ChromeToolButton
                label="刷新"
                iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
                disabled={refreshing}
                onClick={refresh}
              >
                <ArrowSyncRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
              </ChromeToolButton>
              <ChromeToolButton
                label="访问社区"
                iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
                onClick={handleOpenCommunity}
              >
                <OpenRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
              </ChromeToolButton>
            </>
          )}
        />
      ) : (
        <div className={isMobile ? s.webHeadMobile : s.webHead}>
          {isMobile && onOpenSidebar ? (
            <MobileNavMenuButton open={sidebarDrawerOpen} onClick={onOpenSidebar} />
          ) : null}
          <Text className={mergeClasses(s.webTitle, isMobile && s.webTitleMobile)}>社区讨论</Text>
          {toolbar}
        </div>
      )}

      <div className={s.body}>
        <div className={s.intro}>
          浏览 Opptrix 投研社区的讨论与分享。点击帖子将在浏览器中打开完整内容；新用户注册邀请码：
          {' '}
          <strong>{OPPTRIX_COMMUNITY_INVITE_CODE}</strong>
        </div>

        <div className={s.tabWrap}>
          <OpptrixSegmentedControl
            aria-label="社区讨论分类"
            value={kind}
            options={COMMUNITY_TAB_OPTIONS}
            onChange={setKind}
          />
        </div>

        {staleHint ? (
          <div className={s.staleBanner} role="status">{staleHint}</div>
        ) : null}

        {error && topics.length > 0 ? (
          <div className={s.staleBanner} role="alert">{error}</div>
        ) : null}

        {loadMoreError ? (
          <div className={s.staleBanner} role="alert">{loadMoreError}</div>
        ) : null}

        {loading ? (
          <div className={s.loadingWrap}>
            <Spinner size="medium" label="正在加载社区讨论…" />
          </div>
        ) : error && topics.length === 0 ? (
          <div className={s.empty}>
            <Text block>{error}</Text>
            <OpptrixButton variant="secondary" onClick={refresh}>重试</OpptrixButton>
          </div>
        ) : topics.length === 0 ? (
          <div className={s.empty}>
            <Text block>{emptyCopy.title}</Text>
            <Text block>{emptyCopy.hint}</Text>
            <OpptrixButton variant="secondary" icon={<OpenRegular />} onClick={handleOpenCommunity}>
              访问社区
            </OpptrixButton>
          </div>
        ) : (
          <div
            className={mergeClasses(s.list, 'opptrix-scroll', 'opptrix-scroll-hover')}
            onScroll={handleScroll}
          >
            {topics.map(topic => (
              <TopicRow key={topic.id} topic={topic} feedKind={kind} onOpen={handleOpenTopic} />
            ))}
            {loadingMore ? (
              <div className={s.loadMore}>正在加载更多…</div>
            ) : null}
            {!loadingMore && hasMore && topics.length > 0 ? (
              <div className={s.loadMore}>继续下滑加载更多</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommunityFeedPage(props: Props) {
  return <CommunityFeedContent {...props} />
}
