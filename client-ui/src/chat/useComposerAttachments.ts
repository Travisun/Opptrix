import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatAttachmentMeta, ModelMediaCapabilities } from '../types/chat'
import { uploadSessionAttachment, deleteSessionAttachment, fetchSessionAttachmentMeta } from '../api/client'
import { validateFileForModel, partitionPinsForModel } from './mediaCapabilities'

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

  // 轮询研报库整理状态（PDF / 文档 / 图片 OCR）
  useEffect(() => {
    const pending = pinned.filter(p =>
      (p.kind === 'pdf' || p.kind === 'document' || p.kind === 'image')
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
    const sid = await resolveSessionId()
    if (!sid) {
      clearToastLater('暂时无法添加附件，请稍后再试')
      return
    }

    const list = Array.from(files)
    if (!list.length) return
    setUploading(true)
    try {
      let next = [...pinned]
      let total = next.reduce((sum, p) => sum + p.size, 0)
      for (const file of list) {
        const err = validateFileForModel(file, media, next.length, total)
        if (err) {
          clearToastLater(err)
          continue
        }
        const meta = await uploadSessionAttachment(sid, file, next.length, total)
        next = [...next, meta]
        total += meta.size
      }
      setPinned(next)
    } catch (e) {
      clearToastLater(e instanceof Error ? e.message : '上传失败，请稍后重试')
    } finally {
      setUploading(false)
    }
  }, [pinned, clearToastLater, resolveSessionId])

  const removePinned = useCallback(async (id: string) => {
    setPinned(prev => prev.filter(p => p.id !== id))
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
    attachmentIds: pinned.map(p => p.id),
  }
}
