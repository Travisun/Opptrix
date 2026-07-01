import type { UIEvent } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { BookOpenRegular, NewsRegular } from '@fluentui/react-icons'
import type { FeedArticle } from '../../types/schemas'
import { opptrixTokens } from '../../theme/tokens'
import { ghostInteractive, sidebarItemSelected } from '../../theme/mixins'
import { formatRelativeTime, stripHtml } from './newsUtils'

const CONTENT_PAD = '12px'

const useStyles = makeStyles({
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: `4px ${CONTENT_PAD} 16px`,
  },
  sectionHead: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixTokens.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '10px 10px 4px',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 10px',
    minHeight: '30px',
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixTokens.accentSoft },
  },
  rowCompact: {
    padding: '7px 8px',
  },
  rowActive: {
    ...sidebarItemSelected,
  },
  title: {
    fontSize: '13px',
    fontWeight: 650,
    color: opptrixTokens.textPrimary,
    lineHeight: 1.45,
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
}: Props) {
  const s = useStyles()

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
        className={mergeClasses(s.row, compact && s.rowCompact, active && s.rowActive)}
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
          sections.map(sec => (
            sec.articles.length > 0 && (
              <div key={sec.key}>
                <Text className={s.sectionHead} block>{sec.label}</Text>
                {sec.articles.map(renderRow)}
              </div>
            )
          ))
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
