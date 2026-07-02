import { useCallback, useEffect, useState } from 'react'
import type { FeedArticle } from '../../types/schemas'
import {
  isElectron,
  type TranslationArticleResult,
  type TranslationEngineStatus,
  type TranslationProgress,
} from '../../platform/detect'
import {
  articleLikelyNeedsChineseTranslation,
  buildFeedArticleBodyText,
} from './newsUtils'
import { type ArticleReaderViewMode, blocksToMap, type ArticleTranslationPrepareResult } from './articleTranslationLayout'

export type { ArticleReaderViewMode as ArticleViewMode }

export function useArticleTranslation(article: FeedArticle | null) {
  const [status, setStatus] = useState<TranslationEngineStatus | null>(null)
  const [viewMode, setViewMode] = useState<ArticleReaderViewMode>('original')
  const [translated, setTranslated] = useState<TranslationArticleResult | null>(null)
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null)
  const [translatedBlocks, setTranslatedBlocks] = useState<Record<string, string>>({})
  const [translationLayout, setTranslationLayout] = useState<ArticleTranslationPrepareResult | null>(null)
  const [translating, setTranslating] = useState(false)
  const [progress, setProgress] = useState<TranslationProgress | null>(null)
  const [error, setError] = useState('')

  const articleId = article?.id ?? null
  const plainBody = article ? buildFeedArticleBodyText(article) : ''
  const likelyForeign = article
    ? articleLikelyNeedsChineseTranslation(`${article.title}\n${plainBody}`)
    : false

  const refreshStatus = useCallback(() => {
    if (!isElectron() || !window.electronAPI?.translationGetStatus) return
    void window.electronAPI.translationGetStatus().then(setStatus).catch(() => {
      setStatus(null)
    })
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!isElectron()) return
    const onFocus = () => refreshStatus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshStatus])

  useEffect(() => {
    if (!isElectron()) return
    const unsubscribe = window.electronAPI?.onTranslationDownloadProgress?.(progress => {
      if (progress.status === 'completed' || progress.status === 'error') {
        refreshStatus()
      }
    })
    return unsubscribe
  }, [refreshStatus])

  useEffect(() => {
    setViewMode('original')
    setTranslated(null)
    setTranslatedTitle(null)
    setTranslatedBlocks({})
    setTranslationLayout(null)
    setTranslating(false)
    setProgress(null)
    setError('')
  }, [articleId])

  const translate = useCallback(async (prepare: ArticleTranslationPrepareResult) => {
    if (!article || !window.electronAPI?.translationTranslateArticle) return
    const blocks = prepare.blocks
    if (!blocks.length) {
      setError('未找到可翻译的正文内容')
      return
    }

    setError('')
    setTranslating(true)
    setProgress(null)
    setTranslatedBlocks({})
    setTranslatedTitle(null)
    setTranslationLayout(prepare)
    setViewMode('translated')

    const unsubscribe = window.electronAPI.onTranslationProgress?.(evt => {
      if (evt.articleId !== article.id) return
      setProgress(evt)

      if (evt.translatedText && evt.segmentId) {
        setTranslatedBlocks(prev => ({
          ...prev,
          [evt.segmentId!]: evt.translatedText!,
        }))
      }
      if (evt.translatedTitle) {
        setTranslatedTitle(evt.translatedTitle)
      }
    })

    try {
      const result = await window.electronAPI.translationTranslateArticle({
        articleId: article.id,
        title: article.title,
        bodyText: plainBody,
        segments: blocks,
        targetLang: 'Chinese',
      })
      setTranslated(result)
      setTranslatedTitle(result.title)
      setTranslatedBlocks(blocksToMap(result.segments ?? []))
      if (result.skipped) {
        setViewMode('original')
        setError(result.message ?? '内容主要为中文')
      } else {
        setViewMode('translated')
      }
    } catch (e) {
      setViewMode('original')
      setError(e instanceof Error ? e.message : '翻译失败，请稍后再试')
    } finally {
      unsubscribe?.()
      setTranslating(false)
      setProgress(null)
      const nextStatus = await window.electronAPI.translationGetStatus?.()
      if (nextStatus) setStatus(nextStatus)
    }
  }, [article, plainBody])

  const available = Boolean(
    isElectron()
    && status
    && (
      status.canTranslate
      || status.localAvailable
      || status.modelFound
      || status.remoteConfigured
    ),
  )
  const canTranslate = available && likelyForeign && !translating
  const hasTranslation = Boolean(
    translating
    || Object.keys(translatedBlocks).length > 0
    || (translated?.segments?.length ?? 0) > 0
    || (translatedTitle && article && translatedTitle !== article.title),
  )

  return {
    status,
    available,
    likelyForeign,
    canTranslate,
    hasTranslation,
    viewMode,
    setViewMode,
    translated,
    translatedTitle,
    translatedBlocks,
    translationLayout,
    translating,
    progress,
    error,
    translate,
  }
}
