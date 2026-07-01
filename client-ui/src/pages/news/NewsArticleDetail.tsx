import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { FeedArticle } from '../../types/schemas'
import { opptrixTokens } from '../../theme/tokens'
import { formatRelativeTime, sanitizeFeedHtml, stripHtml } from './newsUtils'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
  },
  head: {
    flexShrink: 0,
    padding: '20px 24px 16px',
    borderBottom: `1px solid ${opptrixTokens.separator}`,
  },
  title: {
    fontSize: '20px',
    fontWeight: 650,
    lineHeight: 1.4,
    color: opptrixTokens.textPrimary,
    marginBottom: '10px',
  },
  meta: {
    fontSize: '12px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.5,
  },
  metaLink: {
    color: opptrixTokens.accent,
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline' },
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '20px 24px 32px',
    fontSize: '15px',
    lineHeight: 1.7,
    color: opptrixTokens.textPrimary,
    '& img': { maxWidth: '100%', height: 'auto', borderRadius: opptrixTokens.radiusSm },
    '& a': { color: opptrixTokens.accent, textDecoration: 'none' },
    '& a:hover': { textDecoration: 'underline' },
    '& p': { margin: '0 0 14px' },
    '& h1, & h2, & h3': { margin: '20px 0 10px', lineHeight: 1.35 },
    '& blockquote': {
      margin: '12px 0',
      paddingLeft: '14px',
      borderLeft: `3px solid ${opptrixTokens.separatorStrong}`,
      color: opptrixTokens.textSecondary,
    },
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    textAlign: 'center',
    fontSize: '13px',
    color: opptrixTokens.textTertiary,
  },
})

type Props = {
  article: FeedArticle | null
}

export default function NewsArticleDetail({ article }: Props) {
  const s = useStyles()
  if (!article) {
    return (
      <div className={s.empty}>
        <Text block>从左侧选择一篇文章开始阅读</Text>
      </div>
    )
  }

  const raw = article.content_html || article.summary || ''
  const html = sanitizeFeedHtml(raw)
  const hasHtml = html.includes('<')

  return (
    <div className={s.root}>
      <div className={s.head}>
        <Text className={s.title} block>{article.title}</Text>
        <Text className={s.meta} block>
          {article.source_title}
          {' · '}
          {formatRelativeTime(article.pub_date)}
          {article.link && (
            <>
              {' · '}
              <a
                className={s.metaLink}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看原文
              </a>
            </>
          )}
        </Text>
      </div>
      <div className={mergeClasses(s.body, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        {hasHtml ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <Text block>{stripHtml(html) || '暂无正文，可点击上方原文链接查看。'}</Text>
        )}
      </div>
    </div>
  )
}
