import type { SessionRecord } from '@opptrix/agent'
import { getUserDataStore } from '@opptrix/user-store'

const SESSION_REBUILD_PAGE = 100

export function sessionBodyText(record: SessionRecord): string {
  const parts: string[] = []
  for (const turn of record.turns ?? []) {
    if (turn.content?.trim()) parts.push(turn.content.trim())
  }
  if (!parts.length) {
    for (const m of record.messages ?? []) {
      if ((m.role === 'user' || m.role === 'assistant') && m.content) {
        parts.push(String(m.content).trim())
      }
    }
  }
  return parts.join('\n')
}

export function syncSessionSearchIndex(record: SessionRecord) {
  const store = getUserDataStore()
  store.indexSessionSearch({
    session_id: record.id,
    title: record.title,
    body: sessionBodyText(record),
    archived: record.archivedAt ? 1 : 0,
    archive_folder_id: record.archiveFolderId ?? '',
    updated_at: record.updatedAt,
  })
}

export function removeSessionSearchIndex(sessionId: string) {
  getUserDataStore().removeSessionSearch(sessionId)
}

/**
 * 重建会话 FTS。无参时按页 iterate → upsert，避免一次性持有全部 SessionRecord。
 * 传入 `records` 时保持旧批处理语义（测试/调用方显式灌入）。
 */
export function rebuildSessionSearchIndex(records?: SessionRecord[]) {
  const store = getUserDataStore()
  store.clearSessionSearchIndex()
  if (records) {
    for (const record of records) syncSessionSearchIndex(record)
    return
  }
  for (const page of store.iterateDocumentPages<SessionRecord>('session', SESSION_REBUILD_PAGE)) {
    for (const row of page) syncSessionSearchIndex(row.data)
  }
}
