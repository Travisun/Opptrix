import { useEffect, useRef } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChatRegular } from '@fluentui/react-icons'
import type { FeedArticle } from '../../types/schemas'
import { openExternalUrl } from '../../platform/openUrl'
import { opptrixTokens } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { enhanceFeedMedia, formatRelativeTime, sanitizeFeedHtml, stripHtml } from './newsUtils'

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
    padding: '12px 20px 10px',
    borderBottom: `1px solid ${opptrixTokens.separator}`,
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    lineHeight: 1.35,
    color: opptrixTokens.textPrimary,
    marginBottom: '6px',
    letterSpacing: '-0.01em',
    userSelect: 'text',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px 6px',
    fontSize: '11px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.4,
  },
  metaSep: {
    color: opptrixTokens.textTertiary,
    opacity: 0.55,
    userSelect: 'none',
  },
  meta: {
    fontSize: '11px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.4,
  },
  metaLink: {
    color: opptrixTokens.accent,
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline' },
  },
  metaAction: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixTokens.accent,
    cursor: 'pointer',
    verticalAlign: 'middle',
    lineHeight: 1,
    borderRadius: opptrixTokens.radiusSm,
    ...ghostInteractive,
    ':hover': {
      color: opptrixTokens.accent,
      backgroundColor: opptrixTokens.accentSoft,
    },
  },
  body: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '16px 20px 28px',
    fontSize: '15px',
    lineHeight: 1.7,
    color: opptrixTokens.textPrimary,
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    userSelect: 'text',
    '& img, & video, & picture, & svg': {
      display: 'block',
      maxWidth: '100%',
      width: 'auto',
      height: 'auto',
      borderRadius: opptrixTokens.radiusSm,
    },
    '& video': {
      width: '100%',
      maxWidth: '100%',
      height: 'auto',
      minHeight: '120px',
      backgroundColor: opptrixTokens.canvasAlt,
    },
    '& .opptrix-news-video-external': {
      display: 'block',
      width: '100%',
      margin: '12px 0',
      padding: 0,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      position: 'relative',
      borderRadius: opptrixTokens.radiusSm,
      overflow: 'hidden',
      textAlign: 'left',
    },
    '& .opptrix-news-video-external video': {
      display: 'block',
      width: '100%',
      minHeight: '120px',
      pointerEvents: 'none',
      cursor: 'pointer',
    },
    '& figure': {
      margin: '12px 0',
      maxWidth: '100%',
    },
    '& table': {
      display: 'block',
      maxWidth: '100%',
      overflowX: 'auto',
    },
    '& pre, & code': {
      maxWidth: '100%',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
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
    '& .rsshub-quote': {
      maxWidth: '100%',
      overflow: 'hidden',
    },
  },
  content: {
    maxWidth: '100%',
    minWidth: 0,
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
  onDiscussArticle?: (article: FeedArticle) => void
}

export default function NewsArticleDetail({ article, onDiscussArticle }: Props) {
  const s = useStyles()
  const contentRef = useRef<HTMLDivElement>(null)
  const mountedHtmlKey = useRef('')

  const raw = article?.content_html || article?.summary || ''
  const html = article ? sanitizeFeedHtml(raw) : ''
  const hasHtml = html.includes('<')
  const htmlKey = article ? `${article.id}\0${html}` : ''

  useEffect(() => {
    const el = contentRef.current
    if (!el || !hasHtml) {
      if (el) el.innerHTML = ''
      mountedHtmlKey.current = ''
      return
    }
    if (mountedHtmlKey.current === htmlKey) return
    mountedHtmlKey.current = htmlKey
    el.innerHTML = html
    enhanceFeedMedia(el)
  }, [hasHtml, html, htmlKey])

  if (!article) {
    return (
      <div className={s.empty}>
        <Text block>从左侧选择一篇文章开始阅读</Text>
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        <Text className={s.title} block>{article.title}</Text>
        <div className={s.metaRow}>
          <Text className={s.meta}>{article.source_title}</Text>
          <span className={s.metaSep} aria-hidden>·</span>
          <Text className={s.meta}>{formatRelativeTime(article.pub_date)}</Text>
          {article.link && (
            <>
              <span className={s.metaSep} aria-hidden>·</span>
              <a
                className={s.metaLink}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={event => openExternalUrl(article.link, event)}
              >
                查看原文
              </a>
            </>
          )}
          {onDiscussArticle && (
            <>
              <span className={s.metaSep} aria-hidden>·</span>
              <button
                type="button"
                className={s.metaAction}
                title="就此文章提问"
                aria-label="就此文章提问"
                onClick={() => onDiscussArticle(article)}
              >
                <ChatRegular fontSize={14} />
              </button>
            </>
          )}
        </div>
      </div>
      <div
        className={mergeClasses(
          s.body,
          'opptrix-scroll',
          'opptrix-scroll-hover',
          'opptrix-news-reader-selectable',
        )}
        onClick={event => {
          const target = event.target as HTMLElement
          if (target.closest('video, audio, .opptrix-news-video-external')) return
          const anchor = target.closest('a')
          const href = anchor?.getAttribute('href')?.trim()
          if (href) openExternalUrl(href, event)
        }}
      >
        {hasHtml ? (
          <div ref={contentRef} className={s.content} />
        ) : (
          <Text block>{stripHtml(html) || '暂无正文，可点击上方原文链接查看。'}</Text>
        )}
      </div>
    </div>
  )
}
