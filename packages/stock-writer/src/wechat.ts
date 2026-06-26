const API_TIMEOUT = 30_000

interface TokenCache { accessToken: string; expiresAt: number }
const tokenCache = new Map<string, TokenCache>()

export async function getAccessToken(appid: string, secret: string, forceRefresh = false) {
  const now = Date.now()
  const cached = tokenCache.get(appid)
  if (!forceRefresh && cached && now < cached.expiresAt) return cached.accessToken

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appid)
  url.searchParams.set('secret', secret)

  const resp = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT) })
  const data = await resp.json() as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }
  if (!data.access_token) {
    throw new Error(`WeChat token error: ${data.errcode ?? 'unknown'} ${data.errmsg ?? ''}`)
  }
  tokenCache.set(appid, {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in ?? 7200) * 1000 - 300_000,
  })
  return data.access_token
}

export async function uploadImage(accessToken: string, imagePath: string, fs: typeof import('node:fs')) {
  const buf = fs.readFileSync(imagePath)
  const name = imagePath.split('/').pop() ?? 'image.jpg'
  const form = new FormData()
  form.append('media', new Blob([buf]), name)

  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`,
    { method: 'POST', body: form, signal: AbortSignal.timeout(API_TIMEOUT) },
  )
  const data = await resp.json() as { url?: string; errcode?: number; errmsg?: string }
  if (!data.url) throw new Error(`WeChat upload_image error: ${data.errcode} ${data.errmsg}`)
  return data.url
}

export async function uploadThumb(accessToken: string, imagePath: string, fs: typeof import('node:fs')) {
  const buf = fs.readFileSync(imagePath)
  const name = imagePath.split('/').pop() ?? 'cover.jpg'
  const form = new FormData()
  form.append('media', new Blob([buf]), name)

  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`,
    { method: 'POST', body: form, signal: AbortSignal.timeout(API_TIMEOUT) },
  )
  const data = await resp.json() as { media_id?: string; errcode?: number; errmsg?: string }
  if (!data.media_id) throw new Error(`WeChat upload_thumb error: ${data.errcode} ${data.errmsg}`)
  return data.media_id
}

export async function createDraft(
  accessToken: string,
  title: string,
  html: string,
  digest: string,
  opts: { thumbMediaId?: string; author?: string } = {},
) {
  const article: Record<string, unknown> = {
    title,
    author: opts.author ?? '',
    digest,
    content: html,
    show_cover_pic: 0,
  }
  if (opts.thumbMediaId) article.thumb_media_id = opts.thumbMediaId

  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ articles: [article] }),
      signal: AbortSignal.timeout(API_TIMEOUT),
    },
  )
  const data = await resp.json() as { media_id?: string; errcode?: number; errmsg?: string }
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`WeChat create_draft error: ${data.errcode} ${data.errmsg}`)
  }
  if (!data.media_id) throw new Error('WeChat create_draft: missing media_id')
  return { mediaId: data.media_id }
}
