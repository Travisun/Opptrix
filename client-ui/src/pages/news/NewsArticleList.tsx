import { useEffect, useState, type UIEvent } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { BookOpenRegular, ChevronDownRegular, ChevronRightRegular, NewsRegular } from '@fluentui/react-icons'
import type { FeedArticle } from '../../types/schemas'
import { opptrixTokens } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatRelativeTime, stripHtml } from './newsUtils'

const CONTENT_PAD = '10px'

const useStyles = makeStyles({
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: `2px ${CONTENT_PAD} 12px`,
  },
  sectionHead: {
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixTokens.textTertiary,
    letterSpacing: '0.03em',
    padding: '8px 8px 3px',
  },
  sectionHeadButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    margin: 0,
    padding: '8px 8px 3px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: opptrixTokens.radiusSm,
    ...ghostInteractive,
  },
  sectionHeadLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixTokens.textTertiary,
    letterSpacing: '0.03em',
    lineHeight: 1.35,
  },
  sectionHeadCount: {
    flexShrink: 0,
    fontSize: '10px',
    fontWeight: 500,
    color: opptrixTokens.textTertiary,
    opacity: 0.75,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    padding: '7px 8px',
    minHeight: '28px',
    borderRadius: opptrixTokens.radiusSm,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixTokens.accentSoft },
  },
  rowCompact: {
    padding: '6px 8px',
    gap: '2px',
  },
  rowActive: {
    backgroundColor: opptrixTokens.canvasAlt,
    ':hover': {
      backgroundColor: opptrixTokens.canvasMuted,
    },
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixTokens.textPrimary,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  meta: {
    fontSize: '11px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.4,
  },
  summary: {
    fontSize: '12px',
    color: opptrixTokens.textSecondary,
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  loadMore: {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px',
    fontSize: '12px',
    color: opptrixTokens.textTertiary,
  },
})

type Section = { key: string; label: string; articles: FeedArticle[] }

type Props = {
  sections?: Section[]
  articles?: FeedArticle[]
  selectedId: string | null
  onSelect: (id: string) => void
  compact?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  listPulseEpoch?: number
  /** 全部分组 / 全部来源时，各区块可展开收起 */
  sectionsCollapsible?: boolean
}

export default function NewsArticleList({
  sections,
  articles = [],
  selectedId,
  onSelect,
  compact,
  loadingMore,
  hasMore,
  onLoadMore,
  listPulseEpoch = 0,
  sectionsCollapsible = false,
}: Props) {
  const s = useStyles()
  const [pulseActive, setPulseActive] = useState(false)
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set())

  const sectionKeys = sections?.map(sec => sec.key).join('|') ?? ''

  useEffect(() => {
    if (!listPulseEpoch) return
    setPulseActive(true)
    const timer = window.setTimeout(() => setPulseActive(false), 420)
    return () => window.clearTimeout(timer)
  }, [listPulseEpoch])

  useEffect(() => {
    setCollapsedKeys(new Set())
  }, [sectionKeys, sectionsCollapsible])

  useEffect(() => {
    if (!sectionsCollapsible || !sections || !selectedId) return
    const hit = sections.find(sec => sec.articles.some(a => a.id === selectedId))
    if (!hit) return
    setCollapsedKeys(prev => {
      if (!prev.has(hit.key)) return prev
      const next = new Set(prev)
      next.delete(hit.key)
      return next
    })
  }, [selectedId, sections, sectionsCollapsible])

  const toggleSection = (key: string) => {
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const flatArticles = sections
    ? sections.flatMap(sec => sec.articles)
    : articles

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!onLoadMore || !hasMore || loadingMore) return
    const el = e.currentTarget
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
    if (remaining < 120) onLoadMore()
  }

  const checkPreload = (globalIndex: number) => {
    if (!onLoadMore || !hasMore || loadingMore) return
    if (globalIndex >= flatArticles.length - 3) onLoadMore()
  }

  let globalIdx = 0

  const renderRow = (article: FeedArticle) => {
    const idx = globalIdx++
    const active = article.id === selectedId
    checkPreload(idx)
    return (
      <div
        key={article.id}
        className={mergeClasses(
          s.row,
          'opptrix-news-article-row',
          compact && s.rowCompact,
          active && s.rowActive,
          pulseActive && 'opptrix-news-article-row-refresh',
        )}
        style={pulseActive ? { animationDelay: `${Math.min(idx, 14) * 14}ms` } : undefined}
        onClick={() => onSelect(article.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onSelect(article.id)}
      >
        <Text className={s.title} block>{article.title}</Text>
        <Text className={s.meta} block>
          {article.source_title}
          {' · '}
          {formatRelativeTime(article.pub_date)}
        </Text>
        {!compact && article.summary && (
          <Text className={s.summary} block>{stripHtml(article.summary)}</Text>
        )}
      </div>
    )
  }

  return (
    <div
      className={mergeClasses(s.scroll, 'opptrix-scroll', 'opptrix-scroll-hover')}
      onScroll={sections ? undefined : handleScroll}
    >
      <div className={s.list}>
        {sections ? (
          sections.map(sec => {
            if (sec.articles.length === 0) return null
            const collapsed = sectionsCollapsible && collapsedKeys.has(sec.key)
            return (
              <div key={sec.key}>
                {sectionsCollapsible ? (
                  <button
                    type="button"
                    className={s.sectionHeadButton}
                    aria-expanded={!collapsed}
                    onClick={() => toggleSection(sec.key)}
                  >
                    {collapsed
                      ? <ChevronRightRegular fontSize={11} color={opptrixTokens.textTertiary} />
                      : <ChevronDownRegular fontSize={11} color={opptrixTokens.textTertiary} />}
                    <Text className={s.sectionHeadLabel} block>{sec.label}</Text>
                    <span className={s.sectionHeadCount}>{sec.articles.length}</span>
                  </button>
                ) : (
                  <Text className={s.sectionHead} block>{sec.label}</Text>
                )}
                {!collapsed && sec.articles.map(renderRow)}
              </div>
            )
          })
        ) : (
          articles.map(renderRow)
        )}
        {!sections && loadingMore && (
          <div className={s.loadMore}>加载更多…</div>
        )}
        {!sections && !loadingMore && hasMore && articles.length > 0 && (
          <div className={s.loadMore}>
            <BookOpenRegular style={{ marginRight: 6, verticalAlign: 'middle' }} />
            继续下滑加载更多
          </div>
        )}
        {flatArticles.length === 0 && (
          <div className={s.loadMore}>
            <NewsRegular style={{ marginRight: 6, verticalAlign: 'middle' }} />
            暂无文章
          </div>
        )}
      </div>
    </div>
  )
}
