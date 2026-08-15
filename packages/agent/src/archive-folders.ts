import { randomUUID } from 'node:crypto'
import { getUserDataStore } from '@opptrix/user-store'

export interface SessionArchiveFolder {
  id: string
  title: string
  sortOrder: number
  isDefault: boolean
}

const PREF_NS = 'preference'
const FOLDERS_KEY = 'session_archive_folders'

export const DEFAULT_SESSION_ARCHIVE_FOLDERS: SessionArchiveFolder[] = [
  { id: 'research', title: '投研精选', sortOrder: 0, isDefault: true },
  { id: 'trades', title: '操作记录', sortOrder: 1, isDefault: true },
  { id: 'review', title: '待复盘', sortOrder: 2, isDefault: true },
  { id: 'other', title: '其他', sortOrder: 3, isDefault: true },
]

function cloneDefaultFolders(): SessionArchiveFolder[] {
  return DEFAULT_SESSION_ARCHIVE_FOLDERS.map(f => ({ ...f }))
}

function sortFolders(folders: SessionArchiveFolder[]): SessionArchiveFolder[] {
  return folders.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
}

function isFolderRecord(raw: unknown): raw is SessionArchiveFolder {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const rec = raw as Record<string, unknown>
  return typeof rec.id === 'string'
    && rec.id.length > 0
    && typeof rec.title === 'string'
    && typeof rec.sortOrder === 'number'
    && Number.isFinite(rec.sortOrder)
    && typeof rec.isDefault === 'boolean'
}

/** 非法 / 空数组 → null（须重新 seed） */
function parseStoredFolders(raw: unknown): SessionArchiveFolder[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const folders = raw.filter(isFolderRecord)
  if (!folders.length) return null
  return folders
}

export class SessionArchiveFolderStore {
  /**
   * 始终经 ensureDefaults：无有效文档时持久化默认文件夹，避免「内存默认 / 磁盘未写」漂移。
   */
  list(): SessionArchiveFolder[] {
    return this.ensureDefaults()
  }

  save(folders: SessionArchiveFolder[]) {
    getUserDataStore().setDocument(PREF_NS, FOLDERS_KEY, folders)
  }

  get(id: string): SessionArchiveFolder | null {
    return this.list().find(f => f.id === id) ?? null
  }

  ensureDefaults(): SessionArchiveFolder[] {
    const raw = getUserDataStore().getDocument<unknown>(PREF_NS, FOLDERS_KEY)
    const existing = parseStoredFolders(raw)

    if (!existing) {
      const seeded = cloneDefaultFolders()
      this.save(seeded)
      return sortFolders(seeded)
    }

    const byId = new Map(existing.map(f => [f.id, f]))
    let changed = false
    for (const def of DEFAULT_SESSION_ARCHIVE_FOLDERS) {
      const cur = byId.get(def.id)
      if (!cur) {
        byId.set(def.id, { ...def })
        changed = true
        continue
      }
      if (!cur.isDefault) {
        byId.set(def.id, { ...cur, isDefault: true })
        changed = true
      }
    }

    const merged = sortFolders([...byId.values()])
    if (changed) this.save(merged)
    return merged
  }

  create(title: string): SessionArchiveFolder {
    const folders = this.ensureDefaults()
    const folder: SessionArchiveFolder = {
      id: randomUUID(),
      title: title.trim() || '未命名',
      sortOrder: folders.length,
      isDefault: false,
    }
    this.save([...folders, folder])
    return folder
  }

  rename(id: string, title: string): SessionArchiveFolder | null {
    const folders = this.ensureDefaults()
    const idx = folders.findIndex(f => f.id === id)
    if (idx < 0) return null
    const current = folders[idx]
    if (!current || current.isDefault) return null
    const trimmed = title.trim()
    if (!trimmed) return current
    const next = folders.slice()
    next[idx] = { ...current, title: trimmed }
    this.save(next)
    return next[idx] ?? null
  }

  /** 仅允许删除用户创建的文件夹 */
  delete(id: string): boolean {
    const folders = this.ensureDefaults()
    const folder = folders.find(f => f.id === id)
    if (!folder || folder.isDefault) return false
    this.save(folders.filter(f => f.id !== id))
    return true
  }
}
