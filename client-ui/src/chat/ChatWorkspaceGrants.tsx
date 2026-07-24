import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderAddRegular } from '@fluentui/react-icons'
import {
  addWorkspaceGrant,
  listWorkspaceGrants,
  removeWorkspaceGrant,
  type WorkspaceGrantDto,
} from '../api/client'
import { isElectron } from '../platform/detect'
import WorkspaceGrantsDialog, { grantFolderName } from './WorkspaceGrantsDialog'

interface ChatWorkspaceGrantsProps {
  sessionId: string | null
  variant?: 'stack' | 'toolbar'
  disabled?: boolean
}

export default function ChatWorkspaceGrants({
  sessionId,
  variant = 'stack',
  disabled = false,
}: ChatWorkspaceGrantsProps) {
  const [grants, setGrants] = useState<WorkspaceGrantDto[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [stackError, setStackError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [toolbarHint, setToolbarHint] = useState<string | null>(null)
  const toolbarHintTimerRef = useRef<number | null>(null)

  const clearToolbarHintTimer = useCallback(() => {
    if (toolbarHintTimerRef.current !== null) {
      window.clearTimeout(toolbarHintTimerRef.current)
      toolbarHintTimerRef.current = null
    }
  }, [])

  const showToolbarHint = useCallback((message: string) => {
    clearToolbarHintTimer()
    setToolbarHint(message)
    toolbarHintTimerRef.current = window.setTimeout(() => {
      setToolbarHint(null)
      toolbarHintTimerRef.current = null
    }, 4000)
  }, [clearToolbarHintTimer])

  useEffect(() => () => clearToolbarHintTimer(), [clearToolbarHintTimer])

  const reportError = useCallback((message: string) => {
    if (dialogOpen) {
      setDialogError(message)
      return
    }
    if (variant === 'toolbar') {
      showToolbarHint(message)
      return
    }
    setStackError(message)
  }, [dialogOpen, showToolbarHint, variant])

  const clearError = useCallback(() => {
    setStackError(null)
    setDialogError(null)
    setToolbarHint(null)
    clearToolbarHintTimer()
  }, [clearToolbarHintTimer])

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setGrants([])
      return
    }
    try {
      const resp = await listWorkspaceGrants(sessionId)
      setGrants(resp.grants)
      clearError()
    } catch (e) {
      const message = e instanceof Error ? e.message : '暂时无法加载授权目录'
      if (variant === 'toolbar' && !dialogOpen) {
        console.warn('[ChatWorkspaceGrants] refresh failed:', message)
      } else {
        reportError(message)
      }
    }
  }, [clearError, dialogOpen, reportError, sessionId, variant])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pickDirectory = useCallback(async (): Promise<string | null> => {
    if (!isElectron() || !window.electronAPI?.pickExportDirectory) {
      reportError('授权本地文件夹需使用桌面版')
      return null
    }
    return window.electronAPI.pickExportDirectory()
  }, [reportError])

  const handleAddFolder = useCallback(async (mode: 'ro' | 'rw') => {
    if (!sessionId || disabled) return
    setLoading(true)
    setDialogError(null)
    try {
      const dirPath = await pickDirectory()
      if (!dirPath) return
      await addWorkspaceGrant(sessionId, { path: dirPath, mode })
      await refresh()
    } catch (e) {
      reportError(e instanceof Error ? e.message : '添加失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [disabled, pickDirectory, refresh, reportError, sessionId])

  const handleRemove = useCallback(async (grant: WorkspaceGrantDto) => {
    if (!sessionId || grant.is_default || disabled) return
    setLoading(true)
    setDialogError(null)
    try {
      await removeWorkspaceGrant(sessionId, grant.id)
      await refresh()
    } catch (e) {
      reportError(e instanceof Error ? e.message : '无法移除授权')
    } finally {
      setLoading(false)
    }
  }, [disabled, reportError, sessionId, refresh])

  const handleReplaceGrant = useCallback(async (grant: WorkspaceGrantDto) => {
    if (!sessionId || grant.is_default || disabled) return
    setLoading(true)
    setDialogError(null)
    try {
      const dirPath = await pickDirectory()
      if (!dirPath) return
      const mode = grant.mode
      await removeWorkspaceGrant(sessionId, grant.id)
      await addWorkspaceGrant(sessionId, { path: dirPath, mode })
      await refresh()
    } catch (e) {
      reportError(e instanceof Error ? e.message : '更换文件夹失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [disabled, pickDirectory, refresh, reportError, sessionId])

  const openDialog = useCallback(() => {
    if (!sessionId || disabled) return
    clearError()
    setDialogOpen(true)
    void refresh()
  }, [clearError, disabled, refresh, sessionId])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setDialogError(null)
  }, [])

  const userGrants = grants.filter(grant => !grant.is_default)

  if (!sessionId) return null

  const dialog = (
    <WorkspaceGrantsDialog
      open={dialogOpen}
      onClose={closeDialog}
      grants={grants}
      loading={loading}
      disabled={disabled}
      error={dialogError}
      isDesktop={isElectron()}
      onAddFolder={mode => { void handleAddFolder(mode) }}
      onReplaceGrant={grant => { void handleReplaceGrant(grant) }}
      onRemoveGrant={grant => { void handleRemove(grant) }}
    />
  )

  if (variant === 'toolbar') {
    const folderTitle = toolbarHint ?? '管理本对话可访问的文件夹'
    return (
      <>
        <div className="opptrix-composer-grants">
          <button
            type="button"
            className="opptrix-composer-quick-add opptrix-focusable"
            disabled={disabled || loading}
            aria-label="授权文件夹"
            title={folderTitle}
            onClick={openDialog}
          >
            <FolderAddRegular fontSize={16} />
          </button>
          {userGrants.length > 0 && (
            <button
              type="button"
              className="opptrix-composer-grants__count opptrix-focusable"
              disabled={disabled || loading}
              aria-label={`${userGrants.length}个已授权目录，点击查看与管理`}
              title={folderTitle}
              onClick={openDialog}
            >
              {userGrants.length}个已授权目录
            </button>
          )}
        </div>
        {dialog}
      </>
    )
  }

  return (
    <>
      <div className="opptrix-workspace-grants-stack">
        <div className="opptrix-workspace-grants-stack__row">
          <button
            type="button"
            className="opptrix-workspace-grants-stack__add opptrix-focusable"
            disabled={disabled || loading}
            onClick={openDialog}
          >
            <FolderAddRegular fontSize={16} />
            授权文件夹
          </button>
          {userGrants.map(grant => (
            <button
              key={grant.id}
              type="button"
              className="opptrix-workspace-grants-stack__chip-name opptrix-focusable"
              title={`${grant.abs_path}\n点击查看与管理`}
              disabled={disabled || loading}
              aria-label={`管理 ${grantFolderName(grant)}`}
              onClick={openDialog}
            >
              {grantFolderName(grant)}
              {grant.mode === 'ro' ? ' · 只读' : ''}
            </button>
          ))}
        </div>
        {stackError && (
          <p className="opptrix-workspace-grants-stack__error" role="alert">
            {stackError}
          </p>
        )}
      </div>
      {dialog}
    </>
  )
}
