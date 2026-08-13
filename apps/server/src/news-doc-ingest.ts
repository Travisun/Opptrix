/**
 * 将资讯正文写入 doc-library（source_type=news），仅 SQLite + FTS（不进 Lance 向量）。
 * 失败不阻断新闻持久化 / 搜索索引。
 *
 * 入库有界串行队列（concurrency=1），积压时丢弃最旧任务，避免资讯洪峰无限并发
 * ingestFromText。FTS 由 ingest 路径写入；向量/embed 对 news 已跳过。
 */
import type { FeedArticle } from '@opptrix/news-feed'
import { compressNewsTextForAgent } from '@opptrix/news-feed'

/** 队列上限；超出时丢掉最旧（资讯入库非强一致） */
const MAX_QUEUE = 32

type QueueJob = { article: FeedArticle }

const queue: QueueJob[] = []
let draining = false

function articlePlainText(article: FeedArticle): string {
  const parts = [
    article.title,
    article.summary,
    article.content_html,
  ].filter((p): p is string => Boolean(p && String(p).trim()))
  return compressNewsTextForAgent(parts.join('\n\n'))
}

async function ingestOne(article: FeedArticle): Promise<void> {
  try {
    const text = articlePlainText(article)
    if (text.length < 24) return
    // 动态 import 避免 server 冷启动强依赖 doc-library 初始化顺序
    const mod = await import('@opptrix/doc-library')
    const svc = mod.getDocLibraryService()
    svc.ingestFromText({
      text,
      name: (article.title || article.id).slice(0, 200),
      sourceType: 'news',
      externalId: article.id,
      mime: 'text/plain',
    })
  } catch {
    /* 入库失败不阻断资讯流 */
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()
      if (!job) break
      await ingestOne(job.article)
    }
  } finally {
    draining = false
    if (queue.length > 0) void drainQueue()
  }
}

/** 单篇资讯入库（SQLite+FTS；异步队列有界串行） */
export function ingestNewsArticleToDocLibrary(article: FeedArticle): void {
  try {
    if (queue.length >= MAX_QUEUE) {
      queue.shift()
    }
    queue.push({ article })
    void drainQueue()
  } catch {
    /* ignore */
  }
}

/** 测试：当前排队长度 */
export function newsDocIngestQueueDepthForTests(): number {
  return queue.length
}

/** 测试：清空队列（不执行） */
export function resetNewsDocIngestQueueForTests(): void {
  queue.length = 0
}
