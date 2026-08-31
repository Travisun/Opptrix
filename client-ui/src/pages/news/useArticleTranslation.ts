import { useCallback, useEffect, useState } from 'react'
import { ApiHttpError, news } from '../../api/client'
import type { FeedArticle } from '../../types/schemas'
import {
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

function remoteConfiguredFromSettings(remoteProviderId: string | null, remoteModel: string | null): boolean {
  return Boolean(remoteProviderId?.trim() && remoteModel?.trim())
}

function webRemoteStatus(remoteConfigured: boolean): TranslationEngineStatus {
  return {
    supported: true,
    modelFound: false,
    modelPath: null,
    modelName: null,
    ready: false,
    lastError: null,
    serviceMode: 'remote',
    remoteConfigured,
    localAvailable: false,
    canTranslate: remoteConfigured,
  }
}

/** 未拿到有效 HTTP 响应（超时 / 断网等）；业务 4xx/5xx 不算。 */
function isTransportFailure(err: unknown): boolean {
  if (err instanceof ApiHttpError) return false
  return true
}

async function fetchTranslationStatus(): Promise<TranslationEngineStatus | null> {
  try {
    return await news.getTranslationStatus()
  } catch {
    // HTTP 不可达或路由未就绪时再试桌面壳兜底
  }
  if (window.electronAPI?.translationGetStatus) {
    try {
      return await window.electronAPI.translationGetStatus()
    } catch {
      /* fall through */
    }
  }
  try {
    const resp = await news.getSettings()
    const t = resp.settings.translation
    return webRemoteStatus(
      remoteConfiguredFromSettings(t.remote_provider_id, t.remote_model),
    )
  } catch {
    return webRemoteStatus(false)
  }
}

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
    void fetchTranslationStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const onFocus = () => refreshStatus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
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
    if (!article) return
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

    const payload = {
      articleId: article.id,
      title: article.title,
      bodyText: plainBody,
      segments: blocks,
      targetLang: 'Chinese' as const,
    }

    const applyResult = (result: TranslationArticleResult) => {
      setTranslated(result)
      setTranslatedTitle(result.title)
      setTranslatedBlocks(blocksToMap(result.segments ?? []))
      if (result.skipped) {
        setViewMode('original')
        setError(result.message ?? '内容主要为中文')
      } else {
        setViewMode('translated')
      }
    }

    try {
      try {
        const result = await news.translateArticle(payload, {
          onProgress: (evt) => {
            if (evt.articleId !== article.id) return
            setProgress(evt)
            if (evt.translatedText && evt.segmentId) {
              const segmentId = evt.segmentId
              const translatedText = evt.translatedText
              setTranslatedBlocks(prev => ({
                ...prev,
                [segmentId]: translatedText,
              }))
            }
            if (evt.translatedTitle) {
              setTranslatedTitle(evt.translatedTitle)
            }
          },
        })
        applyResult(result)
        refreshStatus()
        return
      } catch (httpErr) {
        const canFallback = isTransportFailure(httpErr)
          && Boolean(window.electronAPI?.translationTranslateArticle)
        if (!canFallback) throw httpErr
      }

      const electronTranslate = window.electronAPI?.translationTranslateArticle
      if (!electronTranslate) {
        throw new Error('翻译失败，请稍后再试')
      }

      const unsubscribe = window.electronAPI?.onTranslationProgress?.(evt => {
        if (evt.articleId !== article.id) return
        setProgress(evt)
        if (evt.translatedText && evt.segmentId) {
          const segmentId = evt.segmentId
          const translatedText = evt.translatedText
          setTranslatedBlocks(prev => ({
            ...prev,
            [segmentId]: translatedText,
          }))
        }
        if (evt.translatedTitle) {
          setTranslatedTitle(evt.translatedTitle)
        }
      })

      try {
        const result = await electronTranslate(payload)
        applyResult(result)
      } finally {
        unsubscribe?.()
        const nextStatus = await window.electronAPI?.translationGetStatus?.()
        if (nextStatus) setStatus(nextStatus)
      }
    } catch (e) {
      setViewMode('original')
      setError(e instanceof Error ? e.message : '翻译失败，请稍后再试')
    } finally {
      setTranslating(false)
      setProgress(null)
    }
  }, [article, plainBody, refreshStatus])

  const available = Boolean(
    status
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
