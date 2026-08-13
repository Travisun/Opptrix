/**
 * 资讯入库曾双写 doc-library（source_type=news）与 user-store FTS。
 * 已收敛为单一 FTS：仅 `syncNewsSearchIndex` → user-store；本模块保留导出兼容，**不再**切块写入 doc-library。
 * 研报/附件仍走 doc-library；news 继续不进 Lance。
 */
import type { FeedArticle } from '@opptrix/news-feed'

/** @deprecated 资讯不再写入 doc-library；调用方请依赖 syncNewsSearchIndex。保留为 no-op。 */
export function ingestNewsArticleToDocLibrary(_article: FeedArticle): void {
  /* no-op：双 FTS 已收敛，停止写入 doc-library */
}

/** 测试：当前排队长度（队列已移除，恒为 0） */
export function newsDocIngestQueueDepthForTests(): number {
  return 0
}

/** 测试：清空队列（no-op） */
export function resetNewsDocIngestQueueForTests(): void {
  /* no-op */
}
