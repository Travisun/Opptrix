const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const CACHE_FILE = path.join(os.homedir(), '.opptrix', 'news-translation-cache.json')
const MAX_ENTRIES = 200

function readCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(data) {
  const dir = path.dirname(CACHE_FILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8')
}

function getCachedTranslation(cacheKey) {
  const all = readCache()
  return all[cacheKey] ?? null
}

function setCachedTranslation(cacheKey, value) {
  const all = readCache()
  all[cacheKey] = {
    ...value,
    cached_at: new Date().toISOString(),
  }

  const keys = Object.keys(all)
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys
      .map(key => ({ key, cached_at: all[key]?.cached_at ?? '' }))
      .sort((a, b) => a.cached_at.localeCompare(b.cached_at))
    for (const stale of sorted.slice(0, keys.length - MAX_ENTRIES)) {
      delete all[stale.key]
    }
  }

  writeCache(all)
}

module.exports = {
  getCachedTranslation,
  setCachedTranslation,
}
