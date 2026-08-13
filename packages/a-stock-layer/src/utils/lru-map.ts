/**
 * 有界 LRU Map（基于插入序）。
 * Provider 侧 nameCache 等进程内短缓存须有硬顶，避免全市场列表灌入后无界增长。
 */

/** Provider 名称缓存默认硬顶（覆盖 A 股全市场列表量级，仍可驱逐冷条目） */
export const DEFAULT_NAME_CACHE_MAX_ENTRIES = 8000

/**
 * Map 子类：get 命中时移到 MRU；set 后若超 maxEntries 则淘汰最久未用条目。
 * 可直接替代 `new Map<string, string>()` 用作 nameCache。
 */
export class LruMap<K, V> extends Map<K, V> {
  readonly maxEntries: number

  constructor(maxEntries = DEFAULT_NAME_CACHE_MAX_ENTRIES) {
    super()
    this.maxEntries = Math.max(1, Math.floor(maxEntries))
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined
    const value = super.get(key) as V
    super.delete(key)
    super.set(key, value)
    return value
  }

  override set(key: K, value: V): this {
    if (super.has(key)) super.delete(key)
    super.set(key, value)
    while (super.size > this.maxEntries) {
      const oldest = super.keys().next().value
      if (oldest === undefined) break
      super.delete(oldest)
    }
    return this
  }
}

/** 创建 Provider 名称缓存（默认 {@link DEFAULT_NAME_CACHE_MAX_ENTRIES}） */
export function createNameCache(maxEntries = DEFAULT_NAME_CACHE_MAX_ENTRIES): LruMap<string, string> {
  return new LruMap<string, string>(maxEntries)
}
