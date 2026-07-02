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

export class SessionArchiveFolderStore {
  list(): SessionArchiveFolder[] {
    const raw = getUserDataStore().getDocument<SessionArchiveFolder[]>(PREF_NS, FOLDERS_KEY)
    if (!raw?.length) return DEFAULT_SESSION_ARCHIVE_FOLDERS.slice()
    return raw.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
  }

  save(folders: SessionArchiveFolder[]) {
    getUserDataStore().setDocument(PREF_NS, FOLDERS_KEY, folders)
  }

  get(id: string): SessionArchiveFolder | null {
    return this.list().find(f => f.id === id) ?? null
  }

  ensureDefaults(): SessionArchiveFolder[] {
    const existing = getUserDataStore().getDocument<SessionArchiveFolder[]>(PREF_NS, FOLDERS_KEY)
    if (existing?.length) return this.list()
    this.save(DEFAULT_SESSION_ARCHIVE_FOLDERS)
    return DEFAULT_SESSION_ARCHIVE_FOLDERS.slice()
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
}
