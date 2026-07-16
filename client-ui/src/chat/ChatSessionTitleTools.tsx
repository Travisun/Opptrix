import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Input, mergeClasses } from '@fluentui/react-components'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import {
  AddRegular,
  ArchiveRegular,
  ArrowExportRegular,
  CheckmarkRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  FolderRegular,
} from '@fluentui/react-icons'
import { OPPTRIX_GLASS_PANEL_CLASS } from '../theme/mixins'
import type { SessionArchiveFolder } from '../types/chat'
import { createSessionArchiveFolder, listSessionArchiveFolders } from '../api/client'
import { ComposerTooltipMenuItem } from './ComposerTooltipMenu'

const MENU_WIDTH = 208
const ARCHIVE_PANEL_WIDTH = 220
const VIEWPORT_PAD = 12
const PANEL_GAP = 6

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export interface ChatSessionTitleToolsProps {
  title: string
  sessionId: string | null
  disabled?: boolean
  /** 可用宽度上限（Electron 标题栏由 DesktopWindowChrome 传入） */
  maxWidth?: number
  /** Electron 标题栏 vs 聊天区顶栏 */
  variant?: 'chrome' | 'header'
  className?: string
  textClassName?: string
  style?: CSSProperties
  onRename: (title: string) => void | Promise<void>
  onArchive: (folderId: string) => void | Promise<void>
  onDelete: () => void
  onExport: () => void | Promise<void>
}

export default function ChatSessionTitleTools({
  title,
  sessionId,
  disabled = false,
  maxWidth,
  variant = 'header',
  className,
  textClassName,
  style,
  onRename,
  onArchive,
  onDelete,
  onExport,
}: ChatSessionTitleToolsProps) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const primaryPanelRef = useRef<HTMLDivElement>(null)
  const archivePanelRef = useRef<HTMLDivElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState(title)
  const [primaryStyle, setPrimaryStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [archiveStyle, setArchiveStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  const [folders, setFolders] = useState<SessionArchiveFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderDraft, setNewFolderDraft] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  const hasSession = Boolean(sessionId)
  const canUseTools = hasSession && !disabled

  useEffect(() => {
    if (!renaming) setRenameDraft(title)
  }, [title, renaming])

  useEffect(() => {
    if (!renaming) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renaming])

  useEffect(() => {
    if (!creatingFolder) return
    newFolderInputRef.current?.focus()
  }, [creatingFolder])

  const closeMenus = useCallback(() => {
    setMenuOpen(false)
    setArchiveOpen(false)
    setCreatingFolder(false)
    setNewFolderDraft('')
  }, [])

  const loadFolders = useCallback(async () => {
    setFoldersLoading(true)
    try {
      const res = await listSessionArchiveFolders()
      setFolders(res.folders)
    } catch {
      setFolders([])
    } finally {
      setFoldersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen || !archiveOpen) return
    void loadFolders()
  }, [archiveOpen, loadFolders, menuOpen])

  const updatePanelPositions = useCallback(() => {
    const anchor = anchorRef.current
    const primary = primaryPanelRef.current
    if (!menuOpen || !anchor || !primary) return

    const rect = anchor.getBoundingClientRect()
    const panelWidth = MENU_WIDTH
    const panelHeight = primary.offsetHeight
    const gap = 6

    let left = rect.left
    left = clamp(left, VIEWPORT_PAD, window.innerWidth - panelWidth - VIEWPORT_PAD)

    let top = rect.bottom + gap
    if (top + panelHeight > window.innerHeight - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, rect.top - gap - panelHeight)
    }

    setPrimaryStyle({
      position: 'fixed',
      top,
      left,
      width: panelWidth,
      zIndex: 2100,
      visibility: 'visible',
    })

    if (archiveOpen) {
      const archive = archivePanelRef.current
      if (!archive) return
      const archiveHeight = archive.offsetHeight
      const archiveWidth = ARCHIVE_PANEL_WIDTH
      let archiveLeft = left + panelWidth + PANEL_GAP
      if (archiveLeft + archiveWidth > window.innerWidth - VIEWPORT_PAD) {
        archiveLeft = left - archiveWidth - PANEL_GAP
      }
      archiveLeft = clamp(archiveLeft, VIEWPORT_PAD, window.innerWidth - archiveWidth - VIEWPORT_PAD)

      let archiveTop = top
      if (archiveTop + archiveHeight > window.innerHeight - VIEWPORT_PAD) {
        archiveTop = Math.max(VIEWPORT_PAD, window.innerHeight - VIEWPORT_PAD - archiveHeight)
      }

      setArchiveStyle({
        position: 'fixed',
        top: archiveTop,
        left: archiveLeft,
        width: archiveWidth,
        zIndex: 2100,
        visibility: 'visible',
      })
    }
  }, [archiveOpen, menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen) return
    updatePanelPositions()
    const raf = window.requestAnimationFrame(updatePanelPositions)
    return () => window.cancelAnimationFrame(raf)
  }, [menuOpen, archiveOpen, creatingFolder, folders.length, foldersLoading, updatePanelPositions])

  useEffect(() => {
    if (!menuOpen) return
    const onResize = () => updatePanelPositions()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [menuOpen, updatePanelPositions])

  useEffect(() => {
    if (!menuOpen) return
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (anchorRef.current?.contains(target)) return
      if (primaryPanelRef.current?.contains(target)) return
      if (archivePanelRef.current?.contains(target)) return
      closeMenus()
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [closeMenus, menuOpen])

  const commitRename = useCallback(async () => {
    const next = renameDraft.trim()
    setRenaming(false)
    if (!next || next === title) return
    await onRename(next)
  }, [onRename, renameDraft, title])

  const cancelRename = useCallback(() => {
    setRenaming(false)
    setRenameDraft(title)
  }, [title])

  const handleRenameKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
  }

  const handleTitleClick = () => {
    if (disabled || renaming) return
    if (!canUseTools) return
    setMenuOpen(prev => {
      const next = !prev
      if (!next) setArchiveOpen(false)
      return next
    })
  }

  const handleTitleMouseDown = (e: ReactMouseEvent<HTMLElement>) => {
    if (disabled || renaming || !canUseTools) return
    e.stopPropagation()
  }

  const startRename = () => {
    closeMenus()
    setRenameDraft(title)
    setRenaming(true)
  }

  const openArchivePanel = () => {
    setArchiveOpen(true)
    void loadFolders()
  }

  const handleArchiveSelect = async (folderId: string) => {
    closeMenus()
    await onArchive(folderId)
  }

  const handleCreateFolderConfirm = async () => {
    const name = newFolderDraft.trim()
    if (!name) {
      setCreatingFolder(false)
      return
    }
    try {
      const { folder } = await createSessionArchiveFolder(name)
      closeMenus()
      await onArchive(folder.id)
    } catch {
      setCreatingFolder(false)
    }
  }

  const handleCreateFolderKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleCreateFolderConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setCreatingFolder(false)
      setNewFolderDraft('')
    }
  }

  const handleDeleteClick = () => {
    closeMenus()
    onDelete()
  }

  const handleExportClick = async () => {
    closeMenus()
    await onExport()
  }

  const titleStyle: CSSProperties | undefined = maxWidth != null
    ? { maxWidth: `${maxWidth}px` }
    : style

  const titleButton = renaming ? (
    <div
      className={mergeClasses(
        'opptrix-session-title-inline-edit',
        variant === 'chrome' && 'opptrix-session-title-inline-edit--chrome',
        className,
      )}
      style={titleStyle}
      onMouseDown={handleTitleMouseDown}
    >
      <Input
        ref={renameInputRef}
        className="opptrix-session-title-inline-input opptrix-archive-inline-input"
        value={renameDraft}
        onChange={(_, data) => setRenameDraft(data.value)}
        onKeyDown={handleRenameKeyDown}
        aria-label="重命名对话"
      />
      <OpptrixButton
        variant="icon"
        className="opptrix-session-title-inline-btn"
        aria-label="确认重命名"
        onClick={() => { void commitRename() }}
      >
        <CheckmarkRegular fontSize={14} />
      </OpptrixButton>
      <OpptrixButton
        variant="icon"
        className="opptrix-session-title-inline-btn"
        aria-label="取消重命名"
        onClick={cancelRename}
      >
        <DismissRegular fontSize={14} />
      </OpptrixButton>
    </div>
  ) : (
    <button
      ref={anchorRef}
      type="button"
      className={mergeClasses(
        'opptrix-session-title-btn',
        variant === 'chrome' && 'opptrix-session-title-btn--chrome',
        canUseTools && 'opptrix-session-title-btn--clickable',
        menuOpen && 'opptrix-session-title-btn--open',
        className,
      )}
      style={titleStyle}
      disabled={!canUseTools}
      onMouseDown={handleTitleMouseDown}
      onClick={handleTitleClick}
      aria-haspopup={canUseTools ? 'menu' : undefined}
      aria-expanded={canUseTools ? menuOpen : undefined}
      aria-label={canUseTools ? `对话：${title}，打开工具菜单` : title}
    >
      <span className={mergeClasses('opptrix-session-title-btn__text', textClassName)}>
        {title || '新对话'}
      </span>
      {canUseTools && (
        <ChevronDownRegular
          className={mergeClasses(
            'opptrix-session-title-btn__chevron',
            menuOpen && 'opptrix-session-title-btn__chevron--open',
          )}
          fontSize={14}
        />
      )}
    </button>
  )

  const primaryMenu = menuOpen && canUseTools ? createPortal(
    <div
      ref={primaryPanelRef}
      className={mergeClasses('opptrix-session-tools-menu', OPPTRIX_GLASS_PANEL_CLASS)}
      style={primaryStyle}
      role="menu"
      aria-label="对话工具"
    >
      <ComposerTooltipMenuItem onClick={startRename}>
        <EditRegular fontSize={16} />
        <span>重命名</span>
      </ComposerTooltipMenuItem>
      <ComposerTooltipMenuItem
        active={archiveOpen}
        onClick={openArchivePanel}
        className="opptrix-session-tools-menu__archive-item"
      >
        <ArchiveRegular fontSize={16} />
        <span>归档移动</span>
        <ChevronRightRegular fontSize={14} className="opptrix-session-tools-menu__arrow" />
      </ComposerTooltipMenuItem>
      <ComposerTooltipMenuItem onClick={handleDeleteClick} className="opptrix-session-tools-menu__danger">
        <DeleteRegular fontSize={16} />
        <span>删除</span>
      </ComposerTooltipMenuItem>
      <ComposerTooltipMenuItem onClick={() => { void handleExportClick() }}>
        <ArrowExportRegular fontSize={16} />
        <span>导出会话</span>
      </ComposerTooltipMenuItem>
    </div>,
    document.body,
  ) : null

  const archiveMenu = menuOpen && archiveOpen && canUseTools ? createPortal(
    <div
      ref={archivePanelRef}
      className={mergeClasses('opptrix-session-tools-archive', OPPTRIX_GLASS_PANEL_CLASS)}
      style={archiveStyle}
      role="menu"
      aria-label="选择归档文件夹"
    >
      <div className="opptrix-session-tools-archive__head">归档到</div>
      <div className="opptrix-session-tools-archive__body opptrix-scroll">
        {foldersLoading && (
          <div className="opptrix-session-tools-archive__empty">加载文件夹…</div>
        )}
        {!foldersLoading && folders.map(folder => (
          <button
            key={folder.id}
            type="button"
            className={mergeClasses('opptrix-session-tools-archive__folder', 'opptrix-focusable')}
            onClick={() => { void handleArchiveSelect(folder.id) }}
          >
            <FolderRegular fontSize={16} />
            <span>{folder.title}</span>
          </button>
        ))}
      </div>
      <div className="opptrix-session-tools-archive__foot">
        {creatingFolder ? (
          <div className="opptrix-session-tools-archive__inline">
            <Input
              ref={newFolderInputRef}
              className="opptrix-session-tools-archive__inline-input opptrix-archive-inline-input"
              placeholder="文件夹名称"
              value={newFolderDraft}
              onChange={(_, data) => setNewFolderDraft(data.value)}
              onKeyDown={handleCreateFolderKeyDown}
            />
            <button
              type="button"
              className={mergeClasses('opptrix-session-tools-archive__inline-btn', 'opptrix-focusable')}
              aria-label="创建并归档"
              onClick={() => { void handleCreateFolderConfirm() }}
            >
              <CheckmarkRegular fontSize={14} />
            </button>
            <button
              type="button"
              className={mergeClasses('opptrix-session-tools-archive__inline-btn', 'opptrix-focusable')}
              aria-label="取消"
              onClick={() => {
                setCreatingFolder(false)
                setNewFolderDraft('')
              }}
            >
              <DismissRegular fontSize={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={mergeClasses('opptrix-session-tools-archive__new', 'opptrix-focusable')}
            onClick={() => {
              setCreatingFolder(true)
              setNewFolderDraft('')
            }}
          >
            <AddRegular fontSize={16} />
            <span>新建文件夹</span>
          </button>
        )}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      {titleButton}
      {primaryMenu}
      {archiveMenu}
    </>
  )
}
