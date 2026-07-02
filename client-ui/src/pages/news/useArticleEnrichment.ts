import { useCallback, useEffect, useRef, useState } from 'react'
import { news } from '../api/client'
import type { ArticleEnrichment, FeedArticle } from '../types/schemas'

type EnrichmentProgress = {
  phase: string
  current: number
  total: number
  message?: string
}

export function useArticleEnrichment(article: FeedArticle | null) {
  const [available, setAvailable] = useState(false)
  const [enrichment, setEnrichment] = useState<ArticleEnrichment | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [progress, setProgress] = useState<EnrichmentProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showExtracted, setShowExtracted] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const loadEnrichment = useCallback(async (articleId: string) => {
    const resp = await news.getArticleEnrichment(articleId)
    setEnrichment(resp.enrichment)
    return resp.enrichment
  }, [])

  const refreshAvailability = useCallback(async () => {
    try {
      const status = await news.getMultimodalStatus()
      setAvailable(Boolean(status.canEnrich && status.settings.enabled))
    } catch {
      setAvailable(false)
    }
  }, [])

  useEffect(() => {
    void refreshAvailability()
  }, [refreshAvailability])

  useEffect(() => {
    clearPoll()
    setEnrichment(null)
    setError(null)
    setProgress(null)
    setEnriching(false)
    setShowExtracted(false)
    if (!article) return

    void loadEnrichment(article.id).then(doc => {
      if (doc?.segments?.length) setShowExtracted(true)
    }).catch(() => {})

    return clearPoll
  }, [article?.id, clearPoll, loadEnrichment])

  const pollJob = useCallback((jobId: string, articleId: string) => {
    clearPoll()
    pollRef.current = setInterval(() => {
      void news.getEnrichmentJob(jobId).then(resp => {
        if (resp.job.progress) {
          setProgress({
            phase: resp.job.progress.phase,
            current: resp.job.progress.current,
            total: resp.job.progress.total,
            message: resp.job.progress.message,
          })
        }
        if (resp.enrichment) setEnrichment(resp.enrichment)
        if (resp.job.status === 'completed') {
          clearPoll()
          setEnriching(false)
          setProgress(null)
          if (resp.enrichment?.segments?.length) setShowExtracted(true)
        }
        if (resp.job.status === 'failed') {
          clearPoll()
          setEnriching(false)
          setProgress(null)
          setError(resp.job.error ?? '媒体提取失败')
        }
      }).catch(e => {
        clearPoll()
        setEnriching(false)
        setError(e instanceof Error ? e.message : '查询任务失败')
      })
    }, 800)
  }, [clearPoll])

  const enrich = useCallback(async () => {
    if (!article || enriching) return
    setError(null)
    setEnriching(true)
    setProgress({ phase: 'scan', current: 0, total: 0, message: '准备中…' })

    try {
      const existing = enrichment
      if (existing?.status === 'ready' || existing?.status === 'partial') {
        setShowExtracted(true)
        setEnriching(false)
        setProgress(null)
        return
      }

      const { job_id } = await news.enrichArticle(article.id)
      pollJob(job_id, article.id)
    } catch (e) {
      setEnriching(false)
      setProgress(null)
      setError(e instanceof Error ? e.message : '无法启动媒体提取')
    }
  }, [article, enriching, enrichment, pollJob])

  const hasExtraction = Boolean(enrichment?.segments?.length)
  const canEnrich = available && Boolean(article)

  const progressLabel = enriching && progress
    ? progress.message
      || (progress.total > 0
        ? `正在提取 ${progress.current}/${progress.total}…`
        : '正在扫描文章中的媒体…')
    : enriching
      ? '正在准备多模态服务…'
      : ''

  return {
    available,
    canEnrich,
    enriching,
    enrichment,
    hasExtraction,
    showExtracted,
    setShowExtracted,
    enrich,
    error,
    progressLabel,
  }
}
