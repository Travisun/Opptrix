import { Capability } from '../core/capabilities.js'
import type { NewsItem, SentimentData } from '../core/schema.js'
import { httpGetText } from '../utils/http.js'
import { BaseDriver } from './base.js'

const HEADERS = {
  Referer: 'https://guba.eastmoney.com/',
  Accept: 'text/html,application/json,*/*',
}

type GubaPost = Record<string, unknown>

export class GubaDriver extends BaseDriver {
  get name() { return 'guba' }
  get priority() { return 15 }
  capabilities() {
    return [Capability.SENTIMENT, Capability.NEWS]
  }

  private async fetchPosts(code: string, page = 1, pageSize = 20): Promise<GubaPost[] | null> {
    const c = this.normCode(code)
    // Primary: gbapi JSON endpoint
    try {
      const url = `https://gbapi.eastmoney.com/webarticlelist/api/Article/ArticleList?code=${c}&ps=${pageSize}&p=${page}&sorttype=1`
      const text = await httpGetText(url, HEADERS, 8000)
      const json = JSON.parse(text) as Record<string, unknown>
      const re = json.re as Record<string, unknown> | undefined
      const items = (re?.list ?? json.data ?? json.result) as GubaPost[] | undefined
      if (Array.isArray(items) && items.length) return items
    } catch { /* fallback */ }

    // Fallback: scrape HTML page
    try {
      const url = `https://guba.eastmoney.com/list,${c},f_${page}.html`
      const html = await httpGetText(url, HEADERS, 8000)
      const match = html.match(/var\s+resultData\s*=\s*(\[.*?\]);/s)
      if (match) {
        const parsed = JSON.parse(match[1]) as unknown
        if (Array.isArray(parsed) && parsed.length) return parsed as GubaPost[]
      }
    } catch { /* ignore */ }
    return null
  }

  private stripHtml(s: string) {
    return s.replace(/<[^>]+>/g, '').trim()
  }

  async sentiment(code: string) {
    try {
      const c = this.normCode(code)
      const data = await this.fetchPosts(c)
      if (!data?.length) return null

      let totalRead = 0
      let totalReply = 0
      for (const post of data.slice(0, 100)) {
        totalRead += Number(post.readCount ?? post.click_count ?? post.click ?? 0) || 0
        totalReply += Number(post.replyCount ?? post.comment_count ?? post.comment ?? 0) || 0
      }
      const hotScore = Math.min(100, data.length > 0 ? totalRead / data.length / 1000 : 0)
      const today = new Date().toISOString().slice(0, 10)

      return [{
        code: c,
        score: Math.round(hotScore * 100) / 100,
        label: `${data.length} posts`,
        summary: `read=${totalRead} reply=${totalReply}`,
        timestamp: today,
      }] satisfies SentimentData[]
    } catch {
      return null
    }
  }

  async news(code: string, page = 1, pageSize = 10, _newsType = 'all') {
    try {
      const c = this.normCode(code)
      const data = await this.fetchPosts(c, page, pageSize)
      if (!data?.length) return null

      const results: NewsItem[] = []
      for (const post of data.slice(0, pageSize)) {
        const rawTitle = String(post.postTitle ?? post.title ?? '')
        const title = this.stripHtml(rawTitle)
        if (!title) continue
        const id = post.postId ?? post.id ?? ''
        results.push({
          code: c,
          date: String(post.postPublishTime ?? post.postDate ?? post.date ?? '').slice(0, 10),
          title,
          url: String(post.postUrl ?? post.url ?? `https://guba.eastmoney.com/news,${c},${id}.html`),
          source: '东方财富股吧',
          type: 'news',
        })
      }
      return results.length ? results : null
    } catch {
      return null
    }
  }
}
