import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Input, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  AddRegular,
  BroomRegular,
  CheckmarkRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  FolderRegular,
} from '@fluentui/react-icons'
import type { SessionArchiveFolder, SessionMeta } from '../types/chat'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive, nativeIconInteractive, sidebarItemSelected } from '../theme/mixins'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { OpptrixDialogAlert } from '../components/opptrix/OpptrixDialogAlert'

const OTHER_ARCHIVE_FOLDER_ID = 'other'

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    flexShrink: 0,
    padding: '4px 8px 6px',
  },
  newFolderBtn: {
    width: '100%',
    justifyContent: 'flex-start',
    minHeight: '30px',
    fontSize: '13px',
    fontWeight: 500,
    color: opptrixCssVars.textSecondary,
    borderRadius: opptrixTokens.radiusMd,
  },
  inlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minHeight: '30px',
    padding: '4px 6px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
  },
  inlineEditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minHeight: '30px',
    padding: '2px 4px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceHover,
  },
  inlineInput: {
    flex: 1,
    minWidth: 0,
    height: '26px',
    minHeight: '26px',
    fontSize: '13px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceMuted,
  },
  inlineHint: {
    flex: 1,
    minWidth: 0,
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
    padding: '0 2px',
  },
  inlineConfirmText: {
    flex: 1,
    minWidth: 0,
    fontSize: '12px',
    fontWeight: 500,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  inlineActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  inlineBtn: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    lineHeight: 0,
    borderRadius: opptrixTokens.radiusMd,
    color: opptrixCssVars.textSecondary,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  inlineBtnDanger: {
    color: opptrixCssVars.error,
    ':hover': {
      backgroundColor: opptrixCssVars.errorSoft,
      color: opptrixCssVars.error,
    },
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '0 8px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  folderBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  folderHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 6px',
    borderRadius: opptrixTokens.radiusMd,
    minHeight: '30px',
    ...ghostInteractive,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  folderHeadEditing: {
    padding: '2px 4px',
    gap: '4px',
    backgroundColor: opptrixCssVars.surfaceHover,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  folderToggle: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    flexShrink: 0,
    color: opptrixCssVars.textTertiary,
    lineHeight: 0,
  },
  folderIcon: {
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  folderTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: '12px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  folderCount: {
    fontSize: '10px',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  folderActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0',
    flexShrink: 0,
    opacity: 0,
    pointerEvents: 'none',
    '@media (hover: none)': {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
  iconAction: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    lineHeight: 0,
    color: opptrixCssVars.textTertiary,
    ':hover': {
      color: opptrixCssVars.textPrimary,
    },
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    paddingLeft: '22px',
  },
  sessionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    minHeight: '30px',
    borderRadius: opptrixTokens.radiusMd,
    color: opptrixCssVars.textPrimary,
    ...ghostInteractive,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  sessionConfirm: {
    padding: '4px 8px',
  },
  sessionActive: {
    ...sidebarItemSelected,
  },
  sessionTitle: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sessionDelete: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    lineHeight: 0,
    opacity: 0,
    pointerEvents: 'none',
    flexShrink: 0,
    '@media (hover: none)': {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
  emptyFolder: {
    padding: '6px 8px 6px 22px',
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
  },
  emptyAll: {
    padding: '32px 16px',
    textAlign: 'center',
    fontSize: '13px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
  },
})

export interface ArchiveFolderGroup {
  folder: SessionArchiveFolder
  sessions: SessionMeta[]
}

interface Props {
  groups: ArchiveFolderGroup[]
  activeId: string | null
  onSelect: (id: string) => void
  onDeleteSession: (id: string) => void | Promise<void>
  onCreateFolder: (title: string) => void | Promise<void>
  onRenameFolder: (id: string, title: string) => void | Promise<void>
  onDeleteFolder: (id: string) => void | Promise<void>
  onClearFolder?: (id: string) => void | Promise<void>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function useFocusOnMount(active: boolean) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [active])
  return ref
}

export default function SessionSidebarArchivePanel({
  groups,
  activeId,
  onSelect,
  onDeleteSession,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onClearFolder,
}: Props) {
  const s = useStyles()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderTitle, setNewFolderTitle] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  const createInputRef = useFocusOnMount(creatingFolder)
  const renameInputRef = useFocusOnMount(renamingFolderId != null)

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsed(prev => ({ ...prev, [folderId]: !prev[folderId] }))
  }, [])

  const cancelCreate = useCallback(() => {
    setCreatingFolder(false)
    setNewFolderTitle('')
  }, [])

  const submitCreate = useCallback(() => {
    const trimmed = newFolderTitle.trim()
    if (!trimmed) return
    void onCreateFolder(trimmed)
    setCreatingFolder(false)
    setNewFolderTitle('')
  }, [newFolderTitle, onCreateFolder])

  const startRename = useCallback((folder: SessionArchiveFolder) => {
    if (folder.isDefault) return
    setDeletingFolderId(null)
    setRenamingFolderId(folder.id)
    setRenameDraft(folder.title)
  }, [])

  const cancelRename = useCallback(() => {
    setRenamingFolderId(null)
    setRenameDraft('')
  }, [])

  const submitRename = useCallback((folder: SessionArchiveFolder) => {
    const trimmed = renameDraft.trim()
    if (!trimmed || trimmed === folder.title) {
      cancelRename()
      return
    }
    void onRenameFolder(folder.id, trimmed)
    cancelRename()
  }, [renameDraft, onRenameFolder, cancelRename])

  const startDeleteFolder = useCallback((folder: SessionArchiveFolder) => {
    if (folder.isDefault) return
    setRenamingFolderId(null)
    setDeletingFolderId(folder.id)
  }, [])

  const cancelDeleteFolder = useCallback(() => {
    setDeletingFolderId(null)
  }, [])

  const confirmDeleteFolder = useCallback((folderId: string) => {
    void onDeleteFolder(folderId)
    setDeletingFolderId(null)
  }, [onDeleteFolder])

  const startDeleteSession = useCallback((sessionId: string) => {
    setDeletingSessionId(sessionId)
  }, [])

  const cancelDeleteSession = useCallback(() => {
    setDeletingSessionId(null)
  }, [])

  const confirmDeleteSession = useCallback((sessionId: string) => {
    void onDeleteSession(sessionId)
    setDeletingSessionId(null)
  }, [onDeleteSession])

  const handleCreateKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitCreate()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelCreate()
    }
  }, [submitCreate, cancelCreate])

  const handleRenameKeyDown = useCallback((e: KeyboardEvent, folder: SessionArchiveFolder) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitRename(folder)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
  }, [submitRename, cancelRename])

  const hasAnySession = groups.some(g => g.sessions.length > 0)
  const otherFolderSessions = groups.find(g => g.folder.id === OTHER_ARCHIVE_FOLDER_ID)?.sessions.length ?? 0

  const confirmClearOtherFolder = useCallback(() => {
    if (onClearFolder) void onClearFolder(OTHER_ARCHIVE_FOLDER_ID)
    setClearDialogOpen(false)
  }, [onClearFolder])

  return (
    <div className={s.root}>
      <div className={s.toolbar}>
        {creatingFolder ? (
          <div className={s.inlineEditRow}>
            <Input
              ref={createInputRef}
              className={mergeClasses(s.inlineInput, 'opptrix-archive-inline-input', 'opptrix-focusable')}
              appearance="filled-darker"
              size="small"
              placeholder="文件夹名称"
              value={newFolderTitle}
              onChange={(_, data) => setNewFolderTitle(data.value)}
              onKeyDown={handleCreateKeyDown}
            />
            <span className={s.inlineActions}>
              <button
                type="button"
                className={mergeClasses(s.inlineBtn, 'opptrix-focusable')}
                aria-label="创建文件夹"
                onClick={submitCreate}
              >
                <CheckmarkRegular fontSize={14} />
              </button>
              <button
                type="button"
                className={mergeClasses(s.inlineBtn, 'opptrix-focusable')}
                aria-label="取消"
                onClick={cancelCreate}
              >
                <DismissRegular fontSize={14} />
              </button>
            </span>
          </div>
        ) : (
          <OpptrixButton
            className={s.newFolderBtn}
            variant="ghost"
            size="small"
            icon={<AddRegular fontSize={16} />}
            onClick={() => {
              setCreatingFolder(true)
              setNewFolderTitle('')
            }}
          >
            新建文件夹
          </OpptrixButton>
        )}
      </div>

      <div className={mergeClasses(s.scroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        {!groups.length && !creatingFolder && (
          <div className={s.emptyAll}>还没有归档文件夹</div>
        )}
        {groups.length > 0 && !hasAnySession && (
          <div className={s.emptyAll}>暂无归档对话<br />在对话列表中可将对话归档到此</div>
        )}
        {groups.map(({ folder, sessions }) => {
          const isCollapsed = collapsed[folder.id] ?? false
          const isRenaming = renamingFolderId === folder.id
          const isDeleting = deletingFolderId === folder.id

          return (
            <div key={folder.id} className={s.folderBlock}>
              <div
                className={mergeClasses(
                  s.folderHead,
                  (isRenaming || isDeleting) && s.folderHeadEditing,
                  'opptrix-archive-folder-head',
                  !isRenaming && !isDeleting && 'opptrix-focusable',
                )}
              >
                {!isRenaming && (
                  <button
                    type="button"
                    className={s.folderToggle}
                    aria-label={isCollapsed ? '展开' : '收起'}
                    onClick={() => toggleFolder(folder.id)}
                  >
                    {isCollapsed
                      ? <ChevronRightRegular fontSize={14} />
                      : <ChevronDownRegular fontSize={14} />}
                  </button>
                )}
                {!isRenaming && <FolderRegular className={s.folderIcon} fontSize={15} />}
                {isRenaming ? (
                  <>
                    <Input
                      ref={renameInputRef}
                      className={mergeClasses(s.inlineInput, 'opptrix-archive-inline-input', 'opptrix-focusable')}
                      appearance="filled-darker"
                      size="small"
                      value={renameDraft}
                      onChange={(_, data) => setRenameDraft(data.value)}
                      onKeyDown={e => handleRenameKeyDown(e, folder)}
                    />
                    <span className={s.inlineActions}>
                      <button
                        type="button"
                        className={mergeClasses(s.inlineBtn, 'opptrix-focusable')}
                        aria-label="保存名称"
                        onClick={() => submitRename(folder)}
                      >
                        <CheckmarkRegular fontSize={14} />
                      </button>
                      <button
                        type="button"
                        className={mergeClasses(s.inlineBtn, 'opptrix-focusable')}
                        aria-label="取消"
                        onClick={cancelRename}
                      >
                        <DismissRegular fontSize={14} />
                      </button>
                    </span>
                  </>
                ) : isDeleting ? (
                  <>
                    <span className={s.inlineConfirmText}>
                      删除「{folder.title}」？对话将移到「其他」
                    </span>
                    <span className={s.inlineActions}>
                      <button
                        type="button"
                        className={mergeClasses(s.inlineBtn, s.inlineBtnDanger, 'opptrix-focusable')}
                        aria-label="确认删除文件夹"
                        onClick={() => confirmDeleteFolder(folder.id)}
                      >
                        <CheckmarkRegular fontSize={14} />
                      </button>
                      <button
                        type="button"
                        className={mergeClasses(s.inlineBtn, 'opptrix-focusable')}
                        aria-label="取消"
                        onClick={cancelDeleteFolder}
                      >
                        <DismissRegular fontSize={14} />
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className={s.folderTitle}>{folder.title}</span>
                    <span className={s.folderCount}>{sessions.length}</span>
                    {!folder.isDefault && (
                      <span className={mergeClasses(s.folderActions, 'opptrix-archive-folder-actions')}>
                        <button
                          type="button"
                          className={mergeClasses(s.iconAction, 'opptrix-focusable')}
                          aria-label="重命名文件夹"
                          onClick={e => { e.stopPropagation(); startRename(folder) }}
                        >
                          <EditRegular fontSize={14} />
                        </button>
                        <button
                          type="button"
                          className={mergeClasses(s.iconAction, 'opptrix-focusable')}
                          aria-label="删除文件夹"
                          onClick={e => { e.stopPropagation(); startDeleteFolder(folder) }}
                        >
                          <DeleteRegular fontSize={14} />
                        </button>
                      </span>
                    )}
                    {folder.id === OTHER_ARCHIVE_FOLDER_ID && onClearFolder && (
                      <span className={mergeClasses(s.folderActions, 'opptrix-archive-folder-actions')}>
                        <button
                          type="button"
                          className={mergeClasses(s.iconAction, 'opptrix-focusable')}
                          aria-label="清空文件夹"
                          onClick={e => {
                            e.stopPropagation()
                            setClearDialogOpen(true)
                          }}
                        >
                          <BroomRegular fontSize={14} />
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
              {!isCollapsed && !isRenaming && !isDeleting && (
                sessions.length === 0
                  ? <Text className={s.emptyFolder}>暂无对话</Text>
                  : (
                    <div className={s.sessionList}>
                      {sessions.map(sess => {
                        const active = sess.id === activeId
                        const isDeletingSession = deletingSessionId === sess.id
                        return isDeletingSession ? (
                          <div
                            key={sess.id}
                            className={mergeClasses(s.inlineRow, s.sessionConfirm, 'opptrix-archive-session-item')}
                          >
                            <Text className={s.inlineHint}>删除此对话？</Text>
                            <span className={s.inlineActions}>
                              <button
                                type="button"
                                className={mergeClasses(s.inlineBtn, s.inlineBtnDanger, 'opptrix-focusable')}
                                aria-label="确认删除对话"
                                onClick={() => confirmDeleteSession(sess.id)}
                              >
                                <CheckmarkRegular fontSize={14} />
                              </button>
                              <button
                                type="button"
                                className={mergeClasses(s.inlineBtn, 'opptrix-focusable')}
                                aria-label="取消"
                                onClick={cancelDeleteSession}
                              >
                                <DismissRegular fontSize={14} />
                              </button>
                            </span>
                          </div>
                        ) : (
                          <div
                            key={sess.id}
                            className={mergeClasses(
                              s.sessionItem,
                              'opptrix-archive-session-item',
                              'opptrix-focusable',
                              active && s.sessionActive,
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelect(sess.id)}
                            onKeyDown={e => e.key === 'Enter' && onSelect(sess.id)}
                          >
                            <span className={s.sessionTitle}>{sess.title}</span>
                            <span className={s.folderCount}>{formatDate(sess.updatedAt)}</span>
                            <button
                              type="button"
                              className={mergeClasses(s.sessionDelete, 'opptrix-archive-session-delete', 'opptrix-focusable')}
                              aria-label="删除对话"
                              onClick={e => {
                                e.stopPropagation()
                                startDeleteSession(sess.id)
                              }}
                            >
                              <DeleteRegular fontSize={14} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )
              )}
            </div>
          )
        })}
      </div>

      <OpptrixDialogAlert
        open={clearDialogOpen}
        title="清空「其他」文件夹"
        message={
          otherFolderSessions > 0
            ? `将永久删除「其他」中的 ${otherFolderSessions} 条归档对话，此操作不可撤销。`
            : '「其他」文件夹中暂无对话。'
        }
        confirmLabel="清空"
        confirmTone="danger"
        confirmDisabled={otherFolderSessions === 0}
        onConfirm={confirmClearOtherFolder}
        onCancel={() => setClearDialogOpen(false)}
      />
    </div>
  )
}
