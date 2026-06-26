import fs from 'node:fs'
import path from 'node:path'
import { formatMarkdownToWechat, wrapPreviewHtml, type ConvertResult } from './formatter.js'
import { appendHistory } from './history.js'
import { buildSeoMeta, validatePublishPreflight, type PreflightResult, type SeoMeta } from './seo.js'
import { loadWriterConfig, wechatConfigured, type WriterRuntimeConfig } from './writer-config.js'
import { createDraft, getAccessToken, uploadImage, uploadThumb } from './wechat.js'
import { loadStyle } from './config.js'

export interface PublishOptions {
  markdown: string
  theme?: string
  title?: string
  digest?: string
  coverPath?: string
  author?: string
  stockCode?: string
  stockName?: string
  articleType?: string
  persona?: string
  baseDir?: string
  wechat?: { appid: string; secret: string }
  skipPublish?: boolean
}

export interface PublishResult {
  convert: ConvertResult
  seo: SeoMeta
  preflight: PreflightResult
  previewHtml?: string
  mediaId?: string
  published: boolean
  message: string
}

export function formatArticle(markdown: string, theme?: string) {
  const cfg = loadWriterConfig()
  const themeName = theme ?? cfg.theme ?? loadStyle().theme as string ?? 'minimal-clean'
  const convert = formatMarkdownToWechat(markdown, themeName)
  const seo = buildSeoMeta(convert, { articleType: '投研' })
  const preflight = validatePublishPreflight(markdown, convert)
  return {
    convert,
    seo,
    preflight,
    previewHtml: wrapPreviewHtml(convert.html, themeName),
    theme: themeName,
  }
}

export async function publishArticle(opts: PublishOptions): Promise<PublishResult> {
  const cfg = loadWriterConfig()
  const themeName = opts.theme ?? cfg.theme ?? (loadStyle().theme as string) ?? 'minimal-clean'
  const formatted = formatArticle(opts.markdown, themeName)
  const { convert, seo, preflight } = formatted

  if (!preflight.ok) {
    return {
      convert, seo, preflight, published: false,
      message: `预检未通过: ${preflight.checks.filter(c => !c.pass).map(c => c.name).join('、')}`,
    }
  }

  const skipPublish = opts.skipPublish ?? cfg.skip_publish ?? !wechatConfigured(cfg)
  if (skipPublish) {
    appendHistory({
      date: new Date().toISOString().slice(0, 10),
      title: opts.title ?? convert.title,
      stock_code: opts.stockCode,
      stock_name: opts.stockName,
      article_type: opts.articleType,
      persona: opts.persona,
      word_count: convert.wordCount,
      media_id: null,
      compliance_check: 'PASSED',
      theme: themeName,
    })
    return {
      convert, seo, preflight,
      previewHtml: formatted.previewHtml,
      published: false,
      message: '排版完成（未推送微信：请配置 ~/.a_stock_layer/writer-config.yaml 中的 wechat.appid/secret）',
    }
  }

  const appid = opts.wechat?.appid ?? cfg.wechat?.appid!
  const secret = opts.wechat?.secret ?? cfg.wechat?.secret!
  const token = await getAccessToken(appid, secret)

  let html = convert.html
  const baseDir = opts.baseDir ?? process.cwd()
  for (const img of convert.images) {
    if (img.startsWith('http://') || img.startsWith('https://')) continue
    const candidates = [
      img,
      path.resolve(baseDir, img),
      path.resolve(process.cwd(), img),
    ]
    const found = candidates.find(p => fs.existsSync(p))
    if (found) {
      const url = await uploadImage(token, found, fs)
      html = html.split(img).join(url)
    }
  }

  let thumbMediaId: string | undefined
  if (opts.coverPath && fs.existsSync(opts.coverPath)) {
    thumbMediaId = await uploadThumb(token, opts.coverPath, fs)
  }

  const draft = await createDraft(
    token,
    opts.title ?? convert.title,
    html,
    opts.digest ?? convert.digest,
    { thumbMediaId, author: opts.author ?? cfg.wechat?.author },
  )

  appendHistory({
    date: new Date().toISOString().slice(0, 10),
    title: opts.title ?? convert.title,
    stock_code: opts.stockCode,
    stock_name: opts.stockName,
    article_type: opts.articleType,
    persona: opts.persona,
    word_count: convert.wordCount,
    media_id: draft.mediaId,
    compliance_check: 'PASSED',
    theme: themeName,
  })

  return {
    convert, seo, preflight,
    previewHtml: formatted.previewHtml,
    mediaId: draft.mediaId,
    published: true,
    message: `已推送到微信草稿箱 media_id=${draft.mediaId}`,
  }
}

export { loadWriterConfig, saveWriterConfig, wechatConfigured } from './writer-config.js'
export type { WriterRuntimeConfig } from './writer-config.js'
