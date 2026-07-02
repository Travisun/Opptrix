import type {
  ArticleDerivedSegment,
  ArticleEnrichment,
  FeedArticle,
  NewsEnrichmentSettings,
} from '@opptrix/news-feed'
import {
  ffmpegRuntime,
  whisperRuntime,
} from '@opptrix/local-inference'
import { scanHtmlMedia, type ScannedMedia } from './html-media-scan.js'
import { fetchMediaToCache } from './media-fetch.js'
import { getEnrichmentStore } from './enrichment-store.js'
import {
  extractImageWithRemoteLlm,
  resolveRemoteVisionLlm,
} from './remote-image.js'
import path from 'node:path'
import { ensureDirAsync, getMediaCacheDir } from '@opptrix/local-inference'

export type EnrichmentProgress = {
  articleId: string
  phase: 'scan' | 'image' | 'audio' | 'video' | 'save'
  current: number
  total: number
  mediaId?: string
  message?: string
}

const DERIVED_LABEL: Record<ArticleDerivedSegment['kind'], string> = {
  html_text: '',
  image_ocr: '【图片摘要】',
  audio_asr: '【音频转写】',
  video_asr: '【视频转写】',
}

function labelText(kind: ArticleDerivedSegment['kind'], text: string): string {
  const label = DERIVED_LABEL[kind]
  if (!label) return text
  return `${label}${text}`
}

function emptyEnrichment(articleId: string): ArticleEnrichment {
  return {
    article_id: articleId,
    status: 'pending',
    segments: [],
    updated_at: new Date().toISOString(),
    version: 1,
  }
}

/** 图片仅走远程视觉模型；未配置远程时不会进入处理队列 */
export function isRemoteVisionConfigured(settings: NewsEnrichmentSettings): boolean {
  return resolveRemoteVisionLlm(settings) !== null
}

export function canEnrichWithSettings(settings: NewsEnrichmentSettings, ffmpegReady: boolean): {
  images: boolean
  speech: boolean
  any: boolean
} {
  if (!settings.enabled) {
    return { images: false, speech: false, any: false }
  }
  const images = settings.extract_images && isRemoteVisionConfigured(settings)
  const speech = ffmpegReady && (settings.extract_audio || settings.extract_video)
  return { images, speech, any: images || speech }
}

async function processImage(
  item: ScannedMedia,
  settings: NewsEnrichmentSettings,
  article: FeedArticle,
): Promise<ArticleDerivedSegment> {
  const remoteLlm = resolveRemoteVisionLlm(settings)
  if (!remoteLlm) {
    throw new Error('未配置远程视觉模型，跳过图片处理')
  }

  const localPath = await fetchMediaToCache(item)
  const text = await extractImageWithRemoteLlm(localPath, remoteLlm, article.title)

  return {
    id: item.id,
    kind: 'image_ocr',
    text: labelText('image_ocr', text || '（未能识别有效内容）'),
    anchor: { media_src: item.src, insert: 'after_media' },
    model: remoteLlm.model,
    created_at: new Date().toISOString(),
  }
}

async function processAudio(
  item: ScannedMedia,
  whisperModel: string,
): Promise<ArticleDerivedSegment> {
  const localPath = await fetchMediaToCache(item)
  await whisperRuntime.ensureModel(whisperModel)
  const wavPath = path.join(getMediaCacheDir(), `${item.id.replace(':', '_')}.wav`)
  await ffmpegRuntime.extractAudioWav(localPath, wavPath)
  const result = await whisperRuntime.transcribe(wavPath, whisperModel)
  return {
    id: item.id,
    kind: 'audio_asr',
    text: labelText('audio_asr', result.text || '（未识别到语音）'),
    anchor: { media_src: item.src, insert: 'after_media' },
    model: `whisper-${whisperModel}`,
    created_at: new Date().toISOString(),
  }
}

async function processVideo(
  item: ScannedMedia,
  whisperModel: string,
): Promise<ArticleDerivedSegment> {
  const localPath = await fetchMediaToCache(item)
  await whisperRuntime.ensureModel(whisperModel)
  const wavPath = path.join(getMediaCacheDir(), `${item.id.replace(':', '_')}.wav`)
  await ffmpegRuntime.extractAudioWav(localPath, wavPath)
  const result = await whisperRuntime.transcribe(wavPath, whisperModel)
  return {
    id: item.id,
    kind: 'video_asr',
    text: labelText('video_asr', result.text || '（未识别到语音）'),
    anchor: { media_src: item.src, insert: 'after_media' },
    model: `whisper-${whisperModel}`,
    created_at: new Date().toISOString(),
  }
}

function filterMedia(
  items: ScannedMedia[],
  settings: NewsEnrichmentSettings,
): ScannedMedia[] {
  const remoteVision = isRemoteVisionConfigured(settings)
  return items.filter(item => {
    if (item.kind === 'image') {
      return settings.extract_images && remoteVision
    }
    if (item.kind === 'audio') return settings.extract_audio
    if (item.kind === 'video') return settings.extract_video
    return false
  })
}

export async function enrichArticle(
  article: FeedArticle,
  options: {
    settings: NewsEnrichmentSettings
    repoRoot?: string
    onProgress?: (p: EnrichmentProgress) => void
  },
): Promise<ArticleEnrichment> {
  const store = getEnrichmentStore()
  const articleId = article.id
  const whisperModel = options.settings.offline_whisper_model?.trim() || 'tiny'
  const started = {
    ...emptyEnrichment(articleId),
    status: 'running' as const,
    updated_at: new Date().toISOString(),
  }
  store.save(started)

  const html = article.content_html || article.summary || ''
  const media = filterMedia(scanHtmlMedia(html), options.settings)
  const segments: ArticleDerivedSegment[] = []
  const errors: Array<{ segment_id: string; message: string }> = []

  await ensureDirAsync(getMediaCacheDir())

  options.onProgress?.({
    articleId,
    phase: 'scan',
    current: 0,
    total: media.length,
    message: media.length > 0
      ? `发现 ${media.length} 个媒体项`
      : '无可处理媒体（图片需配置远程视觉模型）',
  })

  for (let i = 0; i < media.length; i += 1) {
    const item = media[i]!
    options.onProgress?.({
      articleId,
      phase: item.kind === 'image' ? 'image' : item.kind === 'audio' ? 'audio' : 'video',
      current: i + 1,
      total: media.length,
      mediaId: item.id,
    })
    try {
      if (item.kind === 'image') {
        segments.push(await processImage(item, options.settings, article))
      } else if (item.kind === 'audio') {
        segments.push(await processAudio(item, whisperModel))
      } else {
        segments.push(await processVideo(item, whisperModel))
      }
    } catch (e) {
      errors.push({
        segment_id: item.id,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const status: ArticleEnrichment['status'] = errors.length === 0
    ? 'ready'
    : segments.length > 0
      ? 'partial'
      : media.length === 0
        ? 'ready'
        : 'failed'

  const result: ArticleEnrichment = {
    article_id: articleId,
    status,
    segments,
    errors: errors.length ? errors : undefined,
    updated_at: new Date().toISOString(),
    version: 1,
  }
  store.save(result)
  options.onProgress?.({
    articleId,
    phase: 'save',
    current: media.length,
    total: media.length,
    message: '完成',
  })
  return result
}

export function queueArticleEnrichment(
  article: FeedArticle,
  settings: NewsEnrichmentSettings,
  repoRoot?: string,
  onProgress?: (p: EnrichmentProgress) => void,
): Promise<ArticleEnrichment> {
  if (!settings.enabled) {
    const store = getEnrichmentStore()
    const doc = { ...emptyEnrichment(article.id), status: 'ready' as const }
    store.save(doc)
    return Promise.resolve(doc)
  }
  return enrichArticle(article, { settings, repoRoot, onProgress })
}
