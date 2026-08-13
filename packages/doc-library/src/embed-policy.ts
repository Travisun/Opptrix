import type { DocumentSourceType } from './types.js'

/**
 * 是否应写入 Lance 向量库。
 * 资讯（news）仅 SQLite + FTS，不进向量；研报等可混合/语义检索。
 */
export function shouldEmbedToVector(
  sourceType: DocumentSourceType | string | null | undefined,
): boolean {
  return (sourceType ?? 'report') !== 'news'
}
