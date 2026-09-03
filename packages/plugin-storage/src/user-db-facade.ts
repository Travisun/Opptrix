import type { ListDocumentPageOpts, DocumentPageRow } from '@opptrix/user-store'
import type {
  DocumentPage,
  DocumentPageCursor,
  UserDbAccess,
  UserDbFacade,
  UserDbNamespace,
  UserDbPolicy,
} from './types.js'

export type UserDocumentStore = {
  getDocument<T>(namespace: string, id: string): T | null
  setDocument(namespace: string, id: string, data: unknown): void
  deleteDocument(namespace: string, id: string): void
  listDocumentPage<T>(namespace: string, opts?: ListDocumentPageOpts): DocumentPageRow<T>[]
}

export class UserDbAccessError extends Error {
  readonly code = 'USER_DB_ACCESS_DENIED'

  constructor(message: string) {
    super(message)
    this.name = 'UserDbAccessError'
  }
}

function extNamespace(pluginId: string): UserDbNamespace {
  return `ext:${pluginId}`
}

export function defaultUserDbPolicy(pluginId: string): UserDbPolicy {
  const ns = extNamespace(pluginId)
  return {
    pluginId,
    namespaces: {
      [ns]: 'write' as UserDbAccess,
    },
  }
}

function assertAccess(
  policy: UserDbPolicy,
  namespace: UserDbNamespace,
  need: UserDbAccess,
): void {
  const allowed = policy.namespaces[namespace]
  if (!allowed) {
    throw new UserDbAccessError(`namespace not granted: ${namespace}`)
  }
  if (need === 'write' && allowed !== 'write') {
    throw new UserDbAccessError(`write not allowed on namespace: ${namespace}`)
  }
}

function assertExtNamespaceOwnership(policy: UserDbPolicy, namespace: UserDbNamespace): void {
  if (!namespace.startsWith('ext:')) return
  const owner = extNamespace(policy.pluginId)
  if (namespace !== owner) {
    throw new UserDbAccessError(`cross-plugin namespace denied: ${namespace}`)
  }
}

export class UserDbFacadeImpl implements UserDbFacade {
  constructor(
    private readonly store: UserDocumentStore,
    private readonly policy: UserDbPolicy,
  ) {}

  get<T>(namespace: UserDbNamespace, id: string): T | null {
    assertExtNamespaceOwnership(this.policy, namespace)
    assertAccess(this.policy, namespace, 'read')
    return this.store.getDocument<T>(namespace, id)
  }

  set(namespace: UserDbNamespace, id: string, data: unknown): void {
    assertExtNamespaceOwnership(this.policy, namespace)
    assertAccess(this.policy, namespace, 'write')
    this.store.setDocument(namespace, id, data)
  }

  delete(namespace: UserDbNamespace, id: string): void {
    assertExtNamespaceOwnership(this.policy, namespace)
    assertAccess(this.policy, namespace, 'write')
    this.store.deleteDocument(namespace, id)
  }

  listPage<T>(
    namespace: UserDbNamespace,
    opts?: { limit?: number; after?: DocumentPageCursor },
  ): DocumentPage<T> {
    assertExtNamespaceOwnership(this.policy, namespace)
    assertAccess(this.policy, namespace, 'read')
    const limit = opts?.limit ?? 100
    const rows = this.store.listDocumentPage<T>(namespace, {
      limit,
      after: opts?.after,
    })
    const items = rows.map(row => ({
      id: row.id,
      updatedAt: row.updated_at,
      data: row.data,
    }))
    const last = rows[rows.length - 1]
    const next = last && rows.length >= limit
      ? { updatedAt: last.updated_at, id: last.id }
      : undefined
    return { items, next }
  }
}

export function createUserDbFacade(
  store: UserDocumentStore,
  policy: UserDbPolicy,
): UserDbFacade {
  return new UserDbFacadeImpl(store, policy)
}
