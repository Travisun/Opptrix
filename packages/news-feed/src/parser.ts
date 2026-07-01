import Parser from 'rss-parser'
import { createHash } from 'node:crypto'
import type { FeedArticle, FeedSourceKind, FeedSubscription } from './types.js'
import { detectAtomFromXml } from './url.js'
import { fetchFeedXml, type FetchFeedOptions } from './fetcher.js'

const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['description', 'description'],
    ],
  },
})

export function articleId(subscriptionId: string, guid: string): string {
  return createHash('sha256').update(`${subscriptionId}:${guid}`).digest('hex').slice(0, 24)
}

function pickContent(item: Record<string, unknown>): { summary?: string; content_html?: string } {
  const encoded = item.contentEncoded as string | undefined
  const content = item.content as string | undefined
  const desc = item.description as string | undefined
  const summary = desc?.trim() || undefined
  const content_html = (encoded || content || desc)?.trim() || undefined
  return { summary, content_html }
}

function parsePubDate(item: Record<string, unknown>): string {
  const raw = (item.isoDate || item.pubDate || item.published || item.updated) as string | undefined
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

export async function parseFeedXml(
  xml: string,
  subscription: FeedSubscription,
  kindOverride?: FeedSourceKind,
): Promise<{ title: string; items: FeedArticle[]; kind: FeedSourceKind }> {
  const parsed = await parser.parseString(xml) as unknown as {
    title?: string
    items?: Array<Record<string, unknown>>
  }
  const kind = kindOverride ?? (detectAtomFromXml(xml) ? 'atom' : subscription.kind)
  const feedTitle = parsed.title?.trim() || subscription.title
  const items = (parsed.items ?? []).map(item => {
    const link = String(item.link || item.guid || '').trim()
    const guid = String(item.guid || item.id || link || item.title || '').trim()
    const title = String(item.title || link || '无标题').trim()
    const { summary, content_html } = pickContent(item)
    return {
      id: articleId(subscription.id, guid || link || title),
      subscription_id: subscription.id,
      title,
      link: link || guid,
      pub_date: parsePubDate(item),
      summary,
      content_html,
      source_title: feedTitle,
    } satisfies FeedArticle
  })
  return { title: feedTitle, items, kind }
}

export async function fetchAndParseFeed(
  subscription: FeedSubscription,
  opts: FetchFeedOptions = {},
): Promise<{
  title: string
  items: FeedArticle[]
  kind: FeedSourceKind
  etag?: string
  lastModified?: string
  notModified: boolean
}> {
  const fetched = await fetchFeedXml(subscription.resolved_url, opts)
  if (fetched.notModified) {
    return {
      title: subscription.title,
      items: [],
      kind: subscription.kind,
      etag: opts.etag,
      lastModified: opts.lastModified,
      notModified: true,
    }
  }
  const parsed = await parseFeedXml(fetched.xml, subscription)
  return {
    ...parsed,
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    notModified: false,
  }
}
