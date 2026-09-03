export type PluginStorageTx = {
  get<T>(key: string): T | null
  set(key: string, value: unknown): void
  delete(key: string): void
}

export interface PluginStorageService {
  get<T>(key: string): T | null
  set(key: string, value: unknown): void
  delete(key: string): void
  keys(prefix?: string): string[]
  transaction(fn: (tx: PluginStorageTx) => void): void
  close(): void
}

export type UserDbNamespace =
  | `ext:${string}`
  | 'user_preferences'
  | 'watchlist'
  | 'portfolio'

export type UserDbAccess = 'read' | 'write'

export type UserDbPolicy = {
  pluginId: string
  /** namespace → allowed access */
  namespaces: Partial<Record<UserDbNamespace, UserDbAccess>>
}

export type DocumentPageCursor = {
  updatedAt: string
  id: string
}

export type DocumentPage<T> = {
  items: Array<{ id: string; updatedAt: string; data: T }>
  next?: DocumentPageCursor
}

export interface UserDbFacade {
  get<T>(namespace: UserDbNamespace, id: string): T | null
  set(namespace: UserDbNamespace, id: string, data: unknown): void
  delete(namespace: UserDbNamespace, id: string): void
  listPage<T>(
    namespace: UserDbNamespace,
    opts?: { limit?: number; after?: DocumentPageCursor },
  ): DocumentPage<T>
}

export const DEFAULT_PLUGIN_STORAGE_QUOTA_BYTES = 64 * 1024 * 1024
