import { createProvider } from '@opptrix/agent'
import type { NewsTranslationSettings } from '@opptrix/news-feed'
import { loadConfig } from './config.js'
import {
  articleLikelyNeedsChineseTranslation,
  buildHtmlTranslatePrompt,
  buildTranslatePrompt,
  cleanBlockTranslationOutput,
  cleanHtmlTranslationOutput,
  normalizeWhitespace,
} from './translation-text.js'

export type RemoteTranslationSegment = {
  id: string
  text: string
  kind?: 'text' | 'html'
}

export type RemoteTranslationPayload = {
  articleId: string
  title?: string
  bodyText?: string
  segments?: RemoteTranslationSegment[]
  targetLang?: string
}

export type RemoteTranslationProgress = {
  articleId: string
  phase: 'title' | 'segment'
  current: number
  total: number
  segmentId?: string
  translatedText?: string
  translatedTitle?: string
  done?: boolean
}

function resolveRemoteLlm(translation: NewsTranslationSettings) {
  const cfg = loadConfig()
  const providerId = translation.remote_provider_id
  const model = translation.remote_model?.trim()
  if (!providerId || !model) {
    throw new Error('请先在设置中配置远程翻译的提供商与模型')
  }

  const provider = cfg.providers.find(p => p.id === providerId)
  if (!provider?.api_key || !provider.base_url) {
    throw new Error('远程翻译提供商未配置 API Key 或接口地址')
  }

  return createProvider({
    provider: provider.name,
    apiKey: provider.api_key,
    model,
    baseUrl: provider.base_url,
    temperature: 0.3,
    maxTokens: 2048,
    timeout: 120_000,
  })
}

async function translateRemoteSegment(
  llm: ReturnType<typeof createProvider>,
  sourceText: string,
  targetLang: string,
  kind: 'text' | 'html' = 'text',
): Promise<string> {
  const prompt = kind === 'html'
    ? buildHtmlTranslatePrompt(sourceText, targetLang)
    : buildTranslatePrompt(sourceText, targetLang)

  const turn = await llm.chat([{ role: 'user', content: prompt }])
  if (turn.finishReason === 'error') {
    throw new Error(turn.error ?? turn.message.content ?? '远程翻译请求失败')
  }

  const raw = String(turn.message.content ?? '').trim()
  if (kind === 'html') {
    return cleanHtmlTranslationOutput(raw, sourceText) || raw
  }
  return cleanBlockTranslationOutput(raw, sourceText) || normalizeWhitespace(raw)
}

export async function translateArticleRemote(
  payload: RemoteTranslationPayload,
  translation: NewsTranslationSettings,
  onProgress?: (progress: RemoteTranslationProgress) => void,
) {
  const articleId = String(payload.articleId ?? '').trim()
  const title = String(payload.title ?? '').trim()
  const targetLang = String(payload.targetLang ?? 'Chinese')
  const segments = Array.isArray(payload.segments)
    ? payload.segments
        .map(seg => ({
          id: String(seg?.id ?? '').trim(),
          text: String(seg?.text ?? '').trim(),
          kind: seg?.kind === 'html' ? 'html' as const : 'text' as const,
        }))
        .filter(seg => seg.id && seg.text)
    : []

  if (!articleId) throw new Error('articleId 无效')
  if (!title && !segments.length) throw new Error('没有可翻译的正文')

  const llm = resolveRemoteLlm(translation)
  const titleNeeds = title ? articleLikelyNeedsChineseTranslation(title) : false
  const bodyNeeds = segments.some(seg => articleLikelyNeedsChineseTranslation(seg.text))

  if (!titleNeeds && !bodyNeeds) {
    return {
      title,
      segments,
      body: segments.map(seg => seg.text).join('\n\n'),
      skipped: true,
      message: '内容主要为中文，无需翻译',
      engine: 'remote' as const,
    }
  }

  const workSegments = segments.filter(seg => articleLikelyNeedsChineseTranslation(seg.text))
  const total = workSegments.length + (titleNeeds ? 1 : 0)
  let current = 0
  const translatedById = new Map<string, string>()

  for (const seg of segments) {
    if (!articleLikelyNeedsChineseTranslation(seg.text)) {
      translatedById.set(seg.id, seg.text)
    }
  }

  for (const seg of workSegments) {
    current += 1
    onProgress?.({
      articleId,
      phase: 'segment',
      current,
      total,
      segmentId: seg.id,
    })

    const translated = await translateRemoteSegment(llm, seg.text, targetLang, seg.kind)
    translatedById.set(seg.id, translated)
    onProgress?.({
      articleId,
      phase: 'segment',
      current,
      total,
      segmentId: seg.id,
      translatedText: translated,
      done: true,
    })
  }

  let translatedTitle = title
  if (titleNeeds) {
    current += 1
    onProgress?.({ articleId, phase: 'title', current, total })
    translatedTitle = await translateRemoteSegment(llm, title, targetLang, 'text')
    onProgress?.({
      articleId,
      phase: 'title',
      current,
      total,
      translatedTitle,
      done: true,
    })
  }

  const orderedSegments = segments.map(seg => ({
    id: seg.id,
    text: translatedById.get(seg.id) ?? seg.text,
    kind: seg.kind,
  }))

  return {
    title: translatedTitle,
    segments: orderedSegments,
    body: orderedSegments.map(seg => seg.text).join('\n\n'),
    engine: 'remote' as const,
  }
}
