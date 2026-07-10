/** Public base URL for electron-updater generic provider (must end with `/`). */
export const DEFAULT_UPDATE_FEED_URL = 'https://updates.opptrix.example/desktop/'

export function resolveUpdateFeedUrl() {
  const raw = (process.env.OPPTRIX_UPDATE_BASE_URL ?? DEFAULT_UPDATE_FEED_URL).trim()
  if (!raw) return DEFAULT_UPDATE_FEED_URL
  return raw.endsWith('/') ? raw : `${raw}/`
}

/** Object key prefix inside the R2 bucket, derived from the public URL path. */
export function r2KeyPrefixFromFeedUrl(feedUrl = resolveUpdateFeedUrl()) {
  const pathname = new URL(feedUrl).pathname.replace(/^\/+|\/+$/g, '')
  return pathname || 'desktop'
}
