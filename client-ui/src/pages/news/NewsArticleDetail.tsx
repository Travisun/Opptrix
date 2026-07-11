import { useEffect, useRef } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChatRegular, ImageRegular, TranslateRegular } from '@fluentui/react-icons'
import type { FeedArticle } from '../../types/schemas'
import { openExternalUrl } from '../../platform/openUrl'
import { isElectron } from '../../platform/detect'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import {
  applyReaderTranslationView,
  prepareArticleTranslation,
} from './articleTranslationLayout'
import { enhanceFeedMedia, formatRelativeTime, sanitizeFeedHtml, stripHtml, buildFeedArticleBodyText } from './newsUtils'
import { useArticleTranslation } from './useArticleTranslation'
import { useArticleEnrichment } from './useArticleEnrichment'

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
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    lineHeight: 1.35,
    color: opptrixCssVars.textPrimary,
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
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  metaSep: {
    color: opptrixCssVars.textTertiary,
    opacity: 0.55,
    userSelect: 'none',
  },
  meta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  metaLink: {
    color: opptrixCssVars.accent,
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline' },
  },
  metaAction: {...ghostInteractive,

    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    margin: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.accent,
    cursor: 'pointer',
    verticalAlign: 'middle',
    lineHeight: 1,
    borderRadius: opptrixTokens.radiusSm,
':hover': {
      color: opptrixCssVars.accent,
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  metaActionLabel: {
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: 1.2,
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
    color: opptrixCssVars.textPrimary,
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
      backgroundColor: opptrixCssVars.canvasAlt,
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
    '& a': { color: opptrixCssVars.accent, textDecoration: 'none' },
    '& a:hover': { textDecoration: 'underline' },
    '& p': { margin: '0 0 14px' },
    '& h1, & h2, & h3': { margin: '20px 0 10px', lineHeight: 1.35 },
    '& blockquote': {
      margin: '12px 0',
      paddingLeft: '14px',
      borderLeft: `3px solid ${opptrixCssVars.separatorStrong}`,
      color: opptrixCssVars.textSecondary,
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
  metaActionDisabled: {
    opacity: 0.35,
    cursor: 'default',
    ':hover': {
      color: opptrixCssVars.accent,
      backgroundColor: 'transparent',
    },
  },
  viewToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    marginLeft: '2px',
  },
  viewToggleBtn: {...ghostInteractive,

    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    height: '20px',
    padding: '0 7px',
    margin: 0,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textTertiary,
    fontSize: '10px',
    lineHeight: 1,
    cursor: 'pointer',
    borderRadius: opptrixTokens.radiusSm,
':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
      color: opptrixCssVars.textPrimary,
    },
  },
  viewToggleBtnActive: {
    border: `1px solid ${opptrixCssVars.accentSoft}`,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    fontWeight: 600,
  },
  translateHint: {
    flexShrink: 0,
    padding: '6px 20px 0',
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  translateError: {
    color: opptrixCssVars.error,
  },
  extractedBlock: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
  },
  extractedHeading: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '10px',
  },
  extractedSegment: {
    marginBottom: '14px',
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    fontSize: '14px',
    lineHeight: 1.65,
    color: opptrixCssVars.textPrimary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
})

type Props = {
  article: FeedArticle
  onDiscussArticle?: (article: FeedArticle) => void
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapPlainTextHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const paragraphs = normalized.split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
  const parts = paragraphs.length ? paragraphs : [normalized]
  return parts.map(part => `<p>${escapeHtml(part)}</p>`).join('')
}

export default function NewsArticleDetail({ article, onDiscussArticle }: Props) {
  const s = useStyles()
  const contentRef = useRef<HTMLDivElement>(null)
  const mountedHtmlKey = useRef('')
  const translation = useArticleTranslation(article)
  const enrichment = useArticleEnrichment(article)

  const raw = article.content_html || article.summary || ''
  const html = sanitizeFeedHtml(raw)
  const hasHtml = html.includes('<')
  const htmlKey = `${article.id}\0${html}`
  const plainFallback = stripHtml(html) || '暂无正文，可点击上方原文链接查看。'
  const displayTitle = translation.viewMode === 'translated' && translation.translatedTitle
    ? translation.translatedTitle
    : article.title

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (mountedHtmlKey.current === htmlKey) return
    mountedHtmlKey.current = htmlKey

    if (hasHtml) {
      el.innerHTML = html
    } else if (plainFallback) {
      el.innerHTML = wrapPlainTextHtml(plainFallback)
    } else {
      el.innerHTML = ''
    }
    enhanceFeedMedia(el)
  }, [hasHtml, html, htmlKey, plainFallback])

  useEffect(() => {
    const el = contentRef.current
    if (!el || !translation.hasTranslation) return

    applyReaderTranslationView(el, translation.viewMode, translation.translatedBlocks, translation.translationLayout)
    enhanceFeedMedia(el)
  }, [translation.viewMode, translation.translatedBlocks, translation.translationLayout, translation.hasTranslation, htmlKey])

  const progressLabel = translation.translating && translation.progress
    ? `正在翻译 ${translation.progress.current}/${translation.progress.total}…`
    : translation.translating && !translation.status?.ready
      ? '正在准备翻译，首次约需十几秒…'
      : translation.translating
        ? '准备翻译…'
        : ''

  return (
    <div className={s.root}>
      <div className={s.head}>
        <Text className={s.title} block>{displayTitle}</Text>
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
          {isElectron() && translation.available && (
            <>
              <span className={s.metaSep} aria-hidden>·</span>
              <button
                type="button"
                className={mergeClasses(
                  s.metaAction,
                  (!translation.canTranslate && !translation.hasTranslation) && s.metaActionDisabled,
                )}
                title={translation.likelyForeign ? '翻译为中文' : '内容主要为中文'}
                aria-label="翻译为中文"
                disabled={!translation.canTranslate && !translation.hasTranslation}
                onClick={() => {
                  if (translation.hasTranslation) {
                    translation.setViewMode('translated')
                    return
                  }
                  const el = contentRef.current
                  if (!el) return
                  const plainBody = buildFeedArticleBodyText(article)
                  const prepare = prepareArticleTranslation(el, plainBody)
                  void translation.translate(prepare)
                }}
              >
                {translation.translating
                  ? <Spinner size="extra-tiny" />
                  : <TranslateRegular fontSize={14} />}
                <span className={s.metaActionLabel}>翻译</span>
              </button>
            </>
          )}
          {translation.hasTranslation && (
            <div className={s.viewToggle}>
              <button
                type="button"
                className={mergeClasses(
                  s.viewToggleBtn,
                  translation.viewMode === 'original' && s.viewToggleBtnActive,
                )}
                onClick={() => translation.setViewMode('original')}
              >
                原文
              </button>
              <button
                type="button"
                className={mergeClasses(
                  s.viewToggleBtn,
                  translation.viewMode === 'translated' && s.viewToggleBtnActive,
                )}
                onClick={() => translation.setViewMode('translated')}
              >
                译文
              </button>
            </div>
          )}
          {isElectron() && enrichment.available && (
            <>
              <span className={s.metaSep} aria-hidden>·</span>
              <button
                type="button"
                className={mergeClasses(
                  s.metaAction,
                  (!enrichment.canEnrich && !enrichment.hasExtraction) && s.metaActionDisabled,
                )}
                title={enrichment.hasExtraction ? '查看图片与音视频说明' : '识别文章中的图片与音视频'}
                aria-label="图片与音视频"
                disabled={!enrichment.canEnrich && !enrichment.hasExtraction}
                onClick={() => {
                  if (enrichment.hasExtraction) {
                    enrichment.setShowExtracted(v => !v)
                    return
                  }
                  void enrichment.enrich()
                }}
              >
                {enrichment.enriching
                  ? <Spinner size="extra-tiny" />
                  : <ImageRegular fontSize={14} />}
                <span className={s.metaActionLabel}>配图音视频</span>
              </button>
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
                <span className={s.metaActionLabel}>加入聊天</span>
              </button>
            </>
          )}
        </div>
      </div>
      {(progressLabel || translation.error || enrichment.progressLabel || enrichment.error
        || (!translation.available && isElectron())
        || (!translation.canTranslate && translation.available && !translation.hasTranslation && isElectron())) && (
        <Text
          block
          className={mergeClasses(
            s.translateHint,
            (translation.error || enrichment.error) ? s.translateError : undefined,
          )}
        >
          {translation.error
            || enrichment.error
            || enrichment.progressLabel
            || progressLabel
            || (!translation.available && isElectron()
              ? '翻译暂不可用：请在设置中开启翻译功能'
              : !translation.canTranslate && translation.available && !translation.hasTranslation
                ? '内容主要为中文，通常无需翻译'
                : '')}
        </Text>
      )}
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
        <div ref={contentRef} className={s.content} />
        {enrichment.showExtracted && enrichment.enrichment?.segments?.length ? (
          <div className={s.extractedBlock}>
            <Text className={s.extractedHeading} block>图片与音视频</Text>
            {enrichment.enrichment.segments.map(seg => (
              <div key={seg.id} className={s.extractedSegment}>{seg.text}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
