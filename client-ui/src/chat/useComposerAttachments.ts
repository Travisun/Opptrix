import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatAttachmentMeta, ModelMediaCapabilities } from '../types/chat'
import { uploadSessionAttachment, deleteSessionAttachment, fetchSessionAttachmentMeta } from '../api/client'
import {
  validateFileForModel,
  partitionPinsForModel,
  resolveFileMime,
  mimeToKind,
  isLibraryIngestKind,
} from './mediaCapabilities'

function isLocalAttachmentId(id: string): boolean {
  return id.startsWith('local-')
}

function isServerAttachment(item: ChatAttachmentMeta): boolean {
  return !item.optimistic && !isLocalAttachmentId(item.id)
}

export function useComposerAttachments(
  sessionId: string | null | undefined,
  ensureSession?: () => Promise<string>,
) {
  const [pinned, setPinned] = useState<ChatAttachmentMeta[]>([])
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const effectiveSessionIdRef = useRef<string | null>(sessionId ?? null)
  const prevSessionIdRef = useRef(sessionId)

  useEffect(() => {
    const prev = prevSessionIdRef.current ?? null
    const next = sessionId ?? null
    if (prev != null && next != null && prev !== next) {
      setPinned([])
    } else if (prev != null && next == null) {
      setPinned([])
    }
    prevSessionIdRef.current = sessionId
    if (sessionId) effectiveSessionIdRef.current = sessionId
  }, [sessionId])

  // 轮询研报库整理状态（PDF / 文档 / 图片 OCR）；跳过尚未入库的乐观项
  useEffect(() => {
    const pending = pinned.filter(p =>
      isServerAttachment(p)
      && (p.kind === 'pdf' || p.kind === 'document' || p.kind === 'image')
      && (p.extract?.status ?? 'pending') === 'pending',
    )
    if (!pending.length) return
    const sid = effectiveSessionIdRef.current ?? sessionId
    if (!sid) return
    let cancelled = false
    const tick = async () => {
      for (const item of pending) {
        try {
          const next = await fetchSessionAttachmentMeta(sid, item.id)
          if (cancelled || !next) continue
          setPinned(prev => prev.map(p => (p.id === next.id ? next : p)))
        } catch {
          /* ignore poll errors */
        }
      }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, 1200)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [pinned, sessionId])

  const clearToastLater = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const resolveSessionId = useCallback(async (): Promise<string | null> => {
    if (effectiveSessionIdRef.current) return effectiveSessionIdRef.current
    if (sessionId) {
      effectiveSessionIdRef.current = sessionId
      return sessionId
    }
    if (!ensureSession) return null
    try {
      const id = await ensureSession()
      effectiveSessionIdRef.current = id
      return id
    } catch {
      return null
    }
  }, [ensureSession, sessionId])

  const addFiles = useCallback(async (
    files: FileList | File[],
    media: ModelMediaCapabilities | null,
  ) => {
    // 必须在任何 await 之前固化：file input 清空或 drop 结束后 live FileList 会变空
    const list = Array.from(files)
    if (!list.length) return

    const sid = await resolveSessionId()
    if (!sid) {
      clearToastLater('暂时无法添加附件，请稍后再试')
      return
    }

    let next = [...pinned]
    let total = next.reduce((sum, p) => sum + p.size, 0)
    const queue: Array<{ localId: string; file: File }> = []

    for (const file of list) {
      const err = validateFileForModel(file, media, next.length, total)
      if (err) {
        clearToastLater(err)
        continue
      }
      const mime = resolveFileMime(file)
      const kind = mimeToKind(mime, file.name)
      if (!kind) {
        clearToastLater('不支持此文件类型')
        continue
      }
      const localId = `local-${crypto.randomUUID()}`
      const optimistic: ChatAttachmentMeta = {
        id: localId,
        kind,
        mime,
        name: file.name,
        size: file.size,
        createdAt: new Date().toISOString(),
        optimistic: true,
        ...(isLibraryIngestKind(kind) ? { extract: { status: 'pending' as const } } : {}),
      }
      next = [...next, optimistic]
      total += file.size
      queue.push({ localId, file })
    }

    if (!queue.length) return

    // 每个文件在上传前即出现在列表
    setPinned(next)
    setUploading(true)
    try {
      let uploadedCount = pinned.filter(isServerAttachment).length
      let uploadedTotal = pinned.filter(isServerAttachment).reduce((sum, p) => sum + p.size, 0)

      for (const { localId, file } of queue) {
        try {
          const meta = await uploadSessionAttachment(sid, file, uploadedCount, uploadedTotal)
          uploadedCount += 1
          uploadedTotal += meta.size
          setPinned(prev => {
            if (!prev.some(p => p.id === localId)) {
              // 上传完成前已被移除：清理服务端残留
              void deleteSessionAttachment(sid, meta.id).catch(() => {})
              return prev
            }
            return prev.map(p => (p.id === localId ? meta : p))
          })
        } catch (e) {
          setPinned(prev => prev.filter(p => p.id !== localId))
          clearToastLater(e instanceof Error ? e.message : '上传失败，请稍后重试')
        }
      }
    } finally {
      setUploading(false)
    }
  }, [pinned, clearToastLater, resolveSessionId])

  const removePinned = useCallback(async (id: string) => {
    setPinned(prev => prev.filter(p => p.id !== id))
    if (isLocalAttachmentId(id)) return
    const sid = effectiveSessionIdRef.current ?? sessionId
    if (sid) {
      try {
        await deleteSessionAttachment(sid, id)
      } catch {
        /* 已引用附件可能无法删除 */
      }
    }
  }, [sessionId])

  const reconcileWithModel = useCallback((
    media: ModelMediaCapabilities | null,
  ) => {
    if (!pinned.length) return
    const { kept, removedIds } = partitionPinsForModel(pinned, media)
    if (removedIds.length) {
      setPinned(kept)
      clearToastLater('部分附件与当前模型不兼容，已自动移除')
      const sid = effectiveSessionIdRef.current ?? sessionId
      if (sid) {
        for (const id of removedIds) {
          if (isLocalAttachmentId(id)) continue
          void deleteSessionAttachment(sid, id).catch(() => {})
        }
      }
    }
  }, [pinned, clearToastLater, sessionId])

  const clearPinned = useCallback(() => setPinned([]), [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return {
    pinned,
    uploading,
    toast,
    fileInputRef,
    addFiles,
    removePinned,
    reconcileWithModel,
    clearPinned,
    openFilePicker,
    attachmentIds: pinned.filter(isServerAttachment).map(p => p.id),
  }
}
