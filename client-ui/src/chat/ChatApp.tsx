import { useState, useEffect, useCallback, useRef } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import SessionSidebar, { type SidebarListTab } from './SessionSidebar'
import type { ArchiveFolderGroup } from './SessionSidebarArchivePanel'
import ChatView from './ChatView'
import SettingsPage from '../pages/SettingsPage'
import NewsCenterPage from '../pages/news/NewsCenterPage'
import MarketDynamicsPage from '../pages/market-dynamics/MarketDynamicsPage'
import type { SettingsSection } from '../pages/settings/SettingsSidebar'
import RightPanel from './RightPanel'
import type { StockDiscussPayload } from '../market/StockDecisionCard'
import WorkspaceSplitDivider from './WorkspaceSplitDivider'
import {
  listSessions, createSession, getSession, deleteSession, forkSession, clearSessionContext,
  setSessionContext, ephemeralAsk,
  streamSessionChat, cancelSessionChat, getHealth, listAvailableModels, setSessionModel,
  submitUserPromptResponse,
  archiveSession,
  listArchivedSessions, createSessionArchiveFolder, renameSessionArchiveFolder, deleteSessionArchiveFolder,
  clearSessionArchiveFolder, renameSession,
} from '../api/client'
import type {
  ChatDisplayMessage, EphemeralAskTurn, MessageSelection, SessionContextRef, SessionSelectionContextRef,
  SessionMeta, AvailableModel,
} from '../types/chat'
import type { ChatLiveTrace, ChatUserPromptPayload, UserPromptAnswerPayload } from '../types/chatProgress'
import type { FeedArticle } from '../types/schemas'
import { previewSelectionText } from '../utils/formatContextRefPreview'
import { feedArticleToContextRef } from '../pages/news/newsUtils'
import { setNewsFeedSelectedId } from '../pages/news/newsFeedSession'
import WorkspaceSearchDialog, { type WorkspaceSearchAction } from './WorkspaceSearchDialog'
import { normalizeWatchlistItem } from '../market/instrument'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { useBreakpoint, useSidebarPreference, useSidebarOverlayMode, useSidebarResizeSync } from '../hooks/useBreakpoint'
import { useWorkspaceSplit } from '../hooks/useWorkspaceSplit'
import { useAppNavigation } from '../hooks/useAppNavigation'
import DesktopWindowChrome from '../desktop/DesktopWindowChrome'
import OverlaySidebarEdgeTrigger from '../desktop/OverlaySidebarEdgeTrigger'
import { useOpptrixDialogAlert } from '../components/opptrix/OpptrixDialogAlert'
import ChatSessionTitleTools from './ChatSessionTitleTools'
import { sessionToMarkdown } from './sessionExportMarkdown'
import { saveTextFileWithDialog } from '../platform/saveTextFile'
import { desktopChromeToolbarReserve } from '../desktop/layout'
import { useElectronFullscreen } from '../hooks/useElectronFullscreen'
import { useDesktopShell } from '../hooks/useDesktopShell'
import { isElectron } from '../platform/detect'
import { DESKTOP_SIDEBAR_EXPAND_THRESHOLD, DESKTOP_SIDEBAR_LAYOUT_MS, DESKTOP_SIDEBAR_LAYOUT_EASE, DESKTOP_TITLEBAR_HEIGHT, SIDEBAR_INLINE_WIDTH } from '../desktop/constants'
import { WatchlistProvider } from '../market/WatchlistContext'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    height: '100dvh',
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  rootElectron: {
    backgroundColor: 'transparent',
  },
  rootLayout: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    width: '100%',
  },
  /** Shared parent of chat + right panel — peer to SessionSidebar */
  contentWorkspace: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    transitionProperty: 'padding',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  contentWorkspaceMobile: {
    flexDirection: 'column',
  },
  contentWorkspaceElectron: {
    paddingTop: `${DESKTOP_TITLEBAR_HEIGHT}px`,
  },
  chatColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transitionProperty: 'width, min-width, flex',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  chatColumnDragging: {
    transitionProperty: 'none',
  },
  chatColumnElectron: {
    marginTop: `-${DESKTOP_TITLEBAR_HEIGHT}px`,
    height: `calc(100% + ${DESKTOP_TITLEBAR_HEIGHT}px)`,
    boxSizing: 'border-box',
  },
  /** Occupies the title-bar band; title text renders in DesktopWindowChrome over this slot */
  chatTitleBar: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    backgroundColor: opptrixCssVars.canvas,
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
    position: 'relative',
    zIndex: 2,
  },
  chatPanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
    borderRadius: 0,
    overflow: 'hidden',
  },
  settingsHost: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    width: '100%',
    display: 'flex',
    backgroundColor: 'transparent',
  },
  viewHidden: {
    display: 'none',
  },
})

export default function ChatApp() {
  const s = useStyles()
  const { confirm } = useOpptrixDialogAlert()
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const {
    visible: sidebarVisible,
    drawerOpen,
    setVisible: setSidebarVisible,
    toggleVisible,
    openDrawer,
    closeDrawer,
  } = useSidebarPreference(isMobile)
  const sidebarOverlayMode = useSidebarOverlayMode(!isMobile)
  const sidebarInlineVisible = sidebarVisible && !sidebarOverlayMode
  const [settingsSidebarVisible, setSettingsSidebarVisible] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth >= DESKTOP_SIDEBAR_EXPAND_THRESHOLD
  })
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection | undefined>()

  const {
    current: view,
    canGoBack,
    canGoForward,
    navigate,
    goBack,
    goForward,
  } = useAppNavigation('chat')

  const electronChrome = isElectron() && !isMobile

  useEffect(() => {
    if (!electronChrome) return
    let cancelled = false
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        document.documentElement.classList.remove('opptrix-electron-startup')
        window.electronAPI?.signalShellReady?.()
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(outer)
    }
  }, [electronChrome])

  const macFullscreen = useElectronFullscreen()
  const chromeToolbarReserve = electronChrome && !sidebarInlineVisible
    ? desktopChromeToolbarReserve(macFullscreen)
    : 0
  const splitEnabled = !isMobile && view === 'chat'

  const {
    workspaceRef,
    rightPanelOpen: rightPanelVisible,
    chatVisible,
    rightPanelWidth,
    showSplitter,
    chatWidth,
    isDragging,
    canToggleChatColumn,
    beginDrag,
    collapseRightPanel,
    toggleRightPanel: handleToggleRightPanel,
    toggleChatColumn: handleToggleChatColumn,
  } = useWorkspaceSplit({ enabled: splitEnabled })

  const collapseSidebars = useCallback(() => {
    setSidebarVisible(false)
    setSettingsSidebarVisible(false)
    collapseRightPanel(true)
  }, [collapseRightPanel, setSidebarVisible])

  const expandSidebars = useCallback(() => {
    setSidebarVisible(true)
    setSettingsSidebarVisible(true)
  }, [setSidebarVisible])

  useSidebarResizeSync(!isMobile, collapseSidebars, expandSidebars)

  const handleToggleSidebar = useCallback(() => {
    if (view === 'settings') {
      setSettingsSidebarVisible(prev => !prev)
      return
    }
    toggleVisible()
  }, [view, toggleVisible])

  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [archivedGroups, setArchivedGroups] = useState<ArchiveFolderGroup[]>([])
  const [sidebarListTab, setSidebarListTab] = useState<SidebarListTab>('chat')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeSessionMeta, setActiveSessionMeta] = useState<SessionMeta | null>(null)
  const [messages, setMessages] = useState<ChatDisplayMessage[]>([])
  const [contextRef, setContextRef] = useState<SessionContextRef | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [liveTrace, setLiveTrace] = useState<ChatLiveTrace | null>(null)
  const [pendingUserPrompt, setPendingUserPrompt] = useState<ChatUserPromptPayload | null>(null)
  const [userPromptSubmitting, setUserPromptSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [sessionModel, setSessionModelState] = useState<string | undefined>()
  const [llmLabel, setLlmLabel] = useState('连接中…')
  const [backendOk, setBackendOk] = useState(false)
  const chatAbortRef = useRef<AbortController | null>(null)
  const stoppingRef = useRef(false)
  const [welcomeEpoch, setWelcomeEpoch] = useState(0)
  const [chatScrollEpoch, setChatScrollEpoch] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusStockCode, setFocusStockCode] = useState<string | null>(null)
  const [newsCenterMounted, setNewsCenterMounted] = useState(() => view === 'news')
  const [marketDynamicsMounted, setMarketDynamicsMounted] = useState(() => view === 'market')

  const refreshModels = useCallback(async () => {
    try {
      const { models } = await listAvailableModels()
      setAvailableModels(models)
      return models
    } catch {
      setAvailableModels([])
      return []
    }
  }, [])

  const refreshHealth = useCallback(async () => {
    try {
      const health = await getHealth()
      setBackendOk(true)
      const models = await refreshModels()
      if (health.llm_configured && models.length) {
        setLlmLabel(`${models.length} 个可用模型`)
      } else {
        setLlmLabel(health.llm_configured ? 'LLM 已配置' : 'LLM 未配置')
      }
    } catch {
      setBackendOk(false)
      setLlmLabel('API 未连接')
    }
  }, [refreshModels])

  const refreshSessions = useCallback(async () => {
    const { sessions: list } = await listSessions()
    setSessions(list)
    return list
  }, [])

  const refreshArchived = useCallback(async () => {
    const { groups } = await listArchivedSessions()
    setArchivedGroups(groups)
    return groups
  }, [])

  const loadSession = useCallback(async (id: string) => {
    const data = await getSession(id)
    setActiveId(id)
    setActiveSessionMeta(data.session)
    setMessages(data.messages)
    setContextRef(data.contextRef ?? null)
    setSessionModelState(data.session.model)
    setError('')
    setChatScrollEpoch(epoch => epoch + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    refreshHealth().catch(() => {})

    refreshSessions()
      .then(async list => {
        if (cancelled) return
        if (list.length > 0) {
          await loadSession(list[0].id)
        }
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载对话失败')
      })

    const timer = setInterval(() => { refreshHealth().catch(() => {}) }, 15000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [refreshHealth, refreshSessions, loadSession])

  useEffect(() => {
    if (view === 'news') setNewsCenterMounted(true)
    if (view === 'market') setMarketDynamicsMounted(true)
  }, [view])

  const openSettings = useCallback((section?: SettingsSection) => {
    closeDrawer()
    setSettingsInitialSection(section)
    navigate('settings')
  }, [closeDrawer, navigate])

  const openNewsCenter = useCallback(() => {
    closeDrawer()
    navigate('news')
  }, [closeDrawer, navigate])

  const openMarketDynamics = useCallback(() => {
    closeDrawer()
    navigate('market')
  }, [closeDrawer, navigate])

  const openNewsSettings = useCallback(() => {
    openSettings('news_feed')
  }, [openSettings])

  const handleExitSettings = useCallback(() => {
    navigate('chat')
  }, [navigate])

  const restoreChatColumn = useCallback(() => {
    if (!chatVisible && canToggleChatColumn) {
      handleToggleChatColumn()
    }
  }, [canToggleChatColumn, chatVisible, handleToggleChatColumn])

  const handleProtocolChat = useCallback(async (sessionId?: string) => {
    restoreChatColumn()
    closeDrawer()
    navigate('chat')
    if (!sessionId) return
    try {
      await loadSession(sessionId)
    } catch {
      setError('无法打开链接中的对话，可能已被删除')
    }
  }, [closeDrawer, loadSession, navigate, restoreChatColumn])

  const handleProtocolNews = useCallback((articleId?: string) => {
    if (articleId) setNewsFeedSelectedId(articleId)
    openNewsCenter()
  }, [openNewsCenter])

  useDesktopShell({
    openChat: handleProtocolChat,
    openSettings: openSettings,
    openNews: handleProtocolNews,
  })

  const handleNew = async () => {
    restoreChatColumn()
    try {
      const { session } = await createSession()
      const list = await refreshSessions()
      setSessions(list)
      setActiveId(session.id)
      setActiveSessionMeta(session)
      setMessages([])
      setContextRef(null)
      setSessionModelState(undefined)
      setInput('')
      setError('')
      setWelcomeEpoch(epoch => epoch + 1)
      closeDrawer()
      if (view !== 'chat') navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建对话失败')
    }
  }

  const handleSelect = async (id: string) => {
    restoreChatColumn()
    // If we're already on this session but currently viewing news/market,
    // just navigate back to chat without reloading.
    if (id === activeId) {
      if (view !== 'chat') navigate('chat')
      return
    }
    try {
      await loadSession(id)
      if (view !== 'chat') navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载对话失败')
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '确定删除此对话？',
      message: '删除后无法恢复。',
      confirmLabel: '删除',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      await deleteSession(id)
      const list = await refreshSessions()
      if (activeId === id) {
        if (list.length > 0) {
          await loadSession(list[0].id)
        } else {
          setActiveId(null)
          setActiveSessionMeta(null)
          setMessages([])
          setContextRef(null)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const handleArchive = async (id: string, folderId: string) => {
    try {
      await archiveSession(id, folderId)
      const list = await refreshSessions()
      setSessions(list)
      void refreshArchived()
      if (activeId === id) {
        if (list.length > 0) {
          await loadSession(list[0].id)
        } else {
          setActiveId(null)
          setActiveSessionMeta(null)
          setMessages([])
          setContextRef(null)
          setSessionModelState(undefined)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '归档失败')
    }
  }

  const handleCreateArchiveFolder = useCallback(async (title: string) => {
    try {
      await createSessionArchiveFolder(title)
      await refreshArchived()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建文件夹失败')
    }
  }, [refreshArchived])

  const handleRenameArchiveFolder = useCallback(async (id: string, title: string) => {
    try {
      await renameSessionArchiveFolder(id, title)
      await refreshArchived()
    } catch (e) {
      setError(e instanceof Error ? e.message : '重命名失败')
    }
  }, [refreshArchived])

  const handleDeleteArchiveFolder = useCallback(async (id: string) => {
    try {
      await deleteSessionArchiveFolder(id)
      await refreshArchived()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除文件夹失败')
    }
  }, [refreshArchived])

  const handleClearArchiveFolder = useCallback(async (id: string) => {
    try {
      const clearedIds = new Set(
        archivedGroups.find(g => g.folder.id === id)?.sessions.map(s => s.id) ?? [],
      )
      await clearSessionArchiveFolder(id)
      await refreshArchived()
      if (activeId && clearedIds.has(activeId)) {
        const list = await refreshSessions()
        if (list.length > 0) {
          await loadSession(list[0].id)
        } else {
          setActiveId(null)
          setActiveSessionMeta(null)
          setMessages([])
          setContextRef(null)
          setSessionModelState(undefined)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '清空文件夹失败')
    }
  }, [activeId, archivedGroups, loadSession, refreshArchived, refreshSessions])

  const handleDeleteArchivedSession = useCallback(async (id: string) => {
    try {
      await deleteSession(id)
      await refreshArchived()
      if (activeId === id) {
        const list = await refreshSessions()
        if (list.length > 0) {
          await loadSession(list[0].id)
        } else {
          setActiveId(null)
          setActiveSessionMeta(null)
          setMessages([])
          setContextRef(null)
          setSessionModelState(undefined)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }, [activeId, loadSession, refreshArchived, refreshSessions])

  const handleRenameSession = useCallback(async (title: string) => {
    if (!activeId) return
    try {
      const { session } = await renameSession(activeId, title)
      setActiveSessionMeta(prev => prev && prev.id === activeId
        ? { ...prev, title: session.title, updatedAt: session.updatedAt }
        : prev)
      setSessions(prev => prev.map(sess =>
        sess.id === activeId ? { ...sess, title: session.title, updatedAt: session.updatedAt } : sess,
      ))
    } catch (e) {
      setError(e instanceof Error ? e.message : '重命名失败')
    }
  }, [activeId])

  const handleArchiveActiveSession = useCallback(async (folderId: string) => {
    if (!activeId) return
    await handleArchive(activeId, folderId)
  }, [activeId, handleArchive])

  const handleDeleteActiveSession = useCallback(async () => {
    if (!activeId) return
    await handleDelete(activeId)
  }, [activeId, handleDelete])

  const handleExportSession = useCallback(async () => {
    if (!activeId || !activeSessionMeta) return
    try {
      const md = sessionToMarkdown(activeSessionMeta, messages)
      const result = await saveTextFileWithDialog(md, activeSessionMeta.title)
      if (!result) return
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    }
  }, [activeId, activeSessionMeta, messages])

  const handleSidebarListTabChange = useCallback((tab: SidebarListTab) => {
    setSidebarListTab(tab)
    if (tab === 'archive') void refreshArchived()
  }, [refreshArchived])

  const handleOpenSearch = useCallback(() => {
    closeDrawer()
    setSearchOpen(true)
  }, [closeDrawer])

  const handleSearchAction = useCallback(async (action: WorkspaceSearchAction) => {
    if (action.type === 'session') {
      restoreChatColumn()
      closeDrawer()
      try {
        await loadSession(action.sessionId)
        if (view !== 'chat') navigate('chat')
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载对话失败')
      }
      return
    }
    if (action.type === 'stock') {
      restoreChatColumn()
      setFocusStockCode(normalizeWatchlistItem({ code: action.code, name: action.name }).code)
      if (!rightPanelVisible) handleToggleRightPanel()
      if (view !== 'chat') navigate('chat')
      return
    }
    if (action.type === 'news') {
      setNewsFeedSelectedId(action.articleId)
      navigate('news')
    }
  }, [
    loadSession,
    navigate,
    restoreChatColumn,
    closeDrawer,
    rightPanelVisible,
    handleToggleRightPanel,
    view,
  ])

  const handleStop = useCallback(async () => {
    if (!loading || stoppingRef.current) return
    stoppingRef.current = true
    const sid = activeId
    if (sid) {
      try {
        await cancelSessionChat(sid)
      } catch {
        /* stream may have already ended */
      }
    }
    chatAbortRef.current?.abort()
  }, [activeId, loading])

  const handleSubmit = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    let sessionId = activeId
    if (!sessionId) {
      try {
        const { session } = await createSession()
        sessionId = session.id
        setActiveId(sessionId)
        await refreshSessions()
      } catch (e) {
        setError(e instanceof Error ? e.message : '创建对话失败')
        return
      }
    }

    setInput('')
    setLoading(true)
    setLiveTrace({ steps: [], thinkingLabel: '模型正在思考…' })
    setPendingUserPrompt(null)
    setUserPromptSubmitting(false)
    setError('')

    const optimistic: ChatDisplayMessage = {
      role: 'user',
      content: msg,
      at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    let resolvedSessionId = sessionId
    const abortController = new AbortController()
    chatAbortRef.current = abortController
    stoppingRef.current = false

    try {
      await streamSessionChat(sessionId, msg, (event) => {
        if (event.type === 'thinking') {
          setLiveTrace(prev => ({
            steps: prev?.steps ?? [],
            thinkingLabel: event.label,
            thinkingSnippet: event.snippet ?? prev?.thinkingSnippet,
          }))
          return
        }
        if (event.type === 'user_prompt') {
          setPendingUserPrompt(event.prompt)
          setLiveTrace(prev => ({
            steps: prev?.steps ?? [],
            thinkingLabel: '等待你的确认…',
            thinkingSnippet: prev?.thinkingSnippet,
          }))
          return
        }
        if (event.type === 'tool_start') {
          setLiveTrace(prev => ({
            thinkingLabel: prev?.thinkingLabel,
            thinkingSnippet: prev?.thinkingSnippet,
            steps: [...(prev?.steps ?? []), event.step],
          }))
          return
        }
        if (event.type === 'tool_done') {
          if (event.step.tool === 'ask_user') {
            setPendingUserPrompt(null)
          }
          setLiveTrace(prev => ({
            thinkingLabel: prev?.thinkingLabel ?? '模型正在整理结果…',
            thinkingSnippet: prev?.thinkingSnippet,
            steps: (prev?.steps ?? []).map(step =>
              step.id === event.step.id ? event.step : step,
            ),
          }))
          return
        }
        if (event.type === 'reply') {
          setLiveTrace(prev => ({
            steps: prev?.steps ?? [],
            thinkingLabel: '正在生成回复…',
            thinkingSnippet: prev?.thinkingSnippet,
          }))
          return
        }
        if (event.type === 'done') {
          resolvedSessionId = event.session_id || resolvedSessionId
        }
      }, sessionModel, abortController.signal)

      const sid = resolvedSessionId
      if (sid !== sessionId) {
        setActiveId(sid)
      }
      const fresh = await getSession(sid)
      setActiveSessionMeta(fresh.session)
      setMessages(fresh.messages)
      setContextRef(fresh.contextRef ?? null)
      setSessionModelState(fresh.session.model)
      const list = await refreshSessions()
      setSessions(list)
    } catch (e) {
      const aborted = (
        (e instanceof DOMException && e.name === 'AbortError')
        || (e instanceof Error && e.name === 'AbortError')
      )
      if (aborted) {
        try {
          const fresh = await getSession(sessionId)
          setActiveSessionMeta(fresh.session)
          setMessages(fresh.messages)
          setContextRef(fresh.contextRef ?? null)
          setSessionModelState(fresh.session.model)
          const list = await refreshSessions()
          setSessions(list)
        } catch {
          /* keep current messages */
        }
        return
      }
      setInput(msg)
      setError(e instanceof Error ? e.message : '发送失败')
      try {
        const fresh = await getSession(sessionId)
        setActiveSessionMeta(fresh.session)
        setMessages(fresh.messages)
        setContextRef(fresh.contextRef ?? null)
      } catch {
        setMessages(prev => prev.slice(0, -1))
      }
    } finally {
      chatAbortRef.current = null
      stoppingRef.current = false
      setLiveTrace(null)
      setPendingUserPrompt(null)
      setUserPromptSubmitting(false)
      setLoading(false)
    }
  }

  const handleUserPromptSubmit = useCallback(async (answer: UserPromptAnswerPayload) => {
    const sid = activeId
    const prompt = pendingUserPrompt
    if (!sid || !prompt || userPromptSubmitting) return
    setUserPromptSubmitting(true)
    setError('')
    try {
      await submitUserPromptResponse(sid, prompt.id, answer)
      setPendingUserPrompt(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请重试')
    } finally {
      setUserPromptSubmitting(false)
    }
  }, [activeId, pendingUserPrompt, userPromptSubmitting])

  const handleForkFromMessage = async (messageIndex: number) => {
    if (!activeId) return
    try {
      const data = await forkSession(activeId, messageIndex)
      const list = await refreshSessions()
      setSessions(list)
      setActiveId(data.session.id)
      setMessages(data.messages)
      setContextRef(data.contextRef ?? null)
      setSessionModelState(data.session.model)
      setInput('')
      setError('')
      closeDrawer()
      if (view !== 'chat') navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '分叉对话失败')
    }
  }

  const handleClearContextRef = async () => {
    if (!activeId) return
    try {
      await clearSessionContext(activeId)
      setContextRef(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '移除引用失败')
    }
  }

  const handleQuoteSelection = async (selection: MessageSelection) => {
    if (!activeId) return
    try {
      const at = messages[selection.messageIndex]?.at ?? new Date().toISOString()
      const nextRef: SessionSelectionContextRef = {
        kind: 'selection',
        selectedText: selection.text,
        sourceMessageIndex: selection.messageIndex,
        sourceRole: selection.messageRole,
        anchorAt: at,
        preview: previewSelectionText(selection.text),
        turns: [{
          role: selection.messageRole,
          content: selection.text,
          at,
        }],
      }
      const data = await setSessionContext(activeId, nextRef)
      setContextRef(data.contextRef ?? nextRef)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '设置引用失败')
    }
  }

  const handleStockDiscuss = useCallback(async (payload: StockDiscussPayload) => {
    if (!activeId) {
      setError('请先新建或选择一个对话')
      return
    }
    try {
      const at = new Date().toISOString()
      const nextRef: SessionSelectionContextRef = {
        kind: 'selection',
        selectedText: payload.contextText,
        sourceMessageIndex: 0,
        sourceRole: 'user',
        anchorAt: at,
        preview: `${payload.topic === 'buy' ? '研讨买入' : '研讨卖出'} · ${payload.name}`,
        turns: [{
          role: 'user',
          content: payload.contextText,
          at,
        }],
      }
      const data = await setSessionContext(activeId, nextRef)
      setContextRef(data.contextRef ?? nextRef)
      setInput(payload.prompt)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '设置研讨上下文失败')
    }
  }, [activeId])

  const handleDiscussArticle = useCallback(async (article: FeedArticle) => {
    restoreChatColumn()
    try {
      const nextRef = feedArticleToContextRef(article)
      const { session } = await createSession()
      const list = await refreshSessions()
      setSessions(list)
      setActiveId(session.id)
      setActiveSessionMeta(session)
      setMessages([])
      const data = await setSessionContext(session.id, nextRef)
      setContextRef(data.contextRef ?? nextRef)
      setSessionModelState(session.model)
      setInput('')
      setError('')
      setWelcomeEpoch(epoch => epoch + 1)
      closeDrawer()
      navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建对话失败')
    }
  }, [closeDrawer, navigate, refreshSessions, restoreChatColumn])

  const handleEphemeralAsk = useCallback(async (
    message: string,
    selection: MessageSelection,
    priorTurns: EphemeralAskTurn[],
  ) => {
    if (!activeId) throw new Error('无活动对话')
    const { reply } = await ephemeralAsk(
      activeId,
      message,
      selection.text,
      sessionModel,
      priorTurns,
    )
    return reply
  }, [activeId, sessionModel])

  const handleModelChange = async (ref: string) => {
    setSessionModelState(ref)
    if (!activeId) return
    try {
      await setSessionModel(activeId, ref)
      setSessions(prev => prev.map(sess =>
        sess.id === activeId ? { ...sess, model: ref } : sess,
      ))
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换模型失败')
    }
  }

  const activeSession = activeSessionMeta ?? sessions.find(x => x.id === activeId) ?? null
  const isSettings = view === 'settings'
  const isNews = view === 'news'
  const isMarket = view === 'market'
  const chromeTitle = isNews ? '新闻中心' : isMarket ? '市场动态' : (activeSession?.title ?? '新对话')
  const chromeViewMode = isSettings ? 'settings' : isNews ? 'news' : isMarket ? 'market' : 'chat'
  const overlaySidebarOpen = isSettings ? settingsSidebarVisible : sidebarVisible

  const sessionTitleTools = view === 'chat' && !isNews && !isMarket ? (
    <ChatSessionTitleTools
      title={activeSession?.title ?? '新对话'}
      sessionId={activeId}
      variant="chrome"
      textClassName="opptrix-desktop-title-text"
      onRename={handleRenameSession}
      onArchive={handleArchiveActiveSession}
      onDelete={() => { void handleDeleteActiveSession() }}
      onExport={handleExportSession}
    />
  ) : null

  const chatTitleSlot = view === 'chat' && !isNews && !isMarket ? (
    <ChatSessionTitleTools
      title={activeSession?.title ?? '新对话'}
      sessionId={activeId}
      variant="header"
      onRename={handleRenameSession}
      onArchive={handleArchiveActiveSession}
      onDelete={() => { void handleDeleteActiveSession() }}
      onExport={handleExportSession}
    />
  ) : null

  const handleEdgeRevealSidebar = useCallback(() => {
    if (isSettings) {
      setSettingsSidebarVisible(true)
      return
    }
    setSidebarVisible(true)
  }, [isSettings, setSidebarVisible])

  const sidebarProps = {
    sessions,
    activeId,
    activeRoute: isNews ? 'news' as const : isMarket ? 'market' as const : 'chat' as const,
    busySessionId: loading ? activeId : null,
    onSelect: handleSelect,
    onNew: handleNew,
    onDelete: handleDelete,
    onArchive: handleArchive,
    onOpenSearch: handleOpenSearch,
    onOpenSettings: () => { openSettings() },
    onOpenNewsCenter: openNewsCenter,
    onOpenMarketDynamics: openMarketDynamics,
    listTab: sidebarListTab,
    onListTabChange: handleSidebarListTabChange,
    archivedGroups,
    onCreateArchiveFolder: handleCreateArchiveFolder,
    onRenameArchiveFolder: handleRenameArchiveFolder,
    onDeleteArchiveFolder: handleDeleteArchiveFolder,
    onClearArchiveFolder: handleClearArchiveFolder,
    onDeleteArchivedSession: handleDeleteArchivedSession,
  }

  return (
    <WatchlistProvider>
    <>
      <WorkspaceSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onAction={handleSearchAction}
      />
      {electronChrome && sidebarOverlayMode && !overlaySidebarOpen && (
        <OverlaySidebarEdgeTrigger
          enabled
          onReveal={handleEdgeRevealSidebar}
        />
      )}
      {electronChrome && (
        <DesktopWindowChrome
          title={chromeTitle}
          titleSlot={sessionTitleTools}
          viewMode={chromeViewMode}
          sidebarOpen={isSettings ? settingsSidebarVisible : sidebarVisible}
          sidebarInline={isSettings
            ? settingsSidebarVisible && !sidebarOverlayMode
            : sidebarInlineVisible}
          showSidebarToggle={!isSettings || sidebarOverlayMode}
          sidebarHoverReveal={sidebarOverlayMode}
          onRevealSidebar={handleEdgeRevealSidebar}
          canGoBack={!isSettings && canGoBack}
          canGoForward={!isSettings && canGoForward}
          onToggleSidebar={handleToggleSidebar}
          onNewChat={handleNew}
          onGoBack={!isSettings ? goBack : undefined}
          onGoForward={!isSettings ? goForward : undefined}
          rightPanelOpen={view === 'chat' && !isMobile ? rightPanelVisible : undefined}
          rightPanelWidth={view === 'chat' && !isMobile && rightPanelVisible ? rightPanelWidth : undefined}
          chatColumnWidth={view === 'chat' && !isMobile && chatVisible && showSplitter ? chatWidth : undefined}
          chatAreaLeft={sidebarInlineVisible ? SIDEBAR_INLINE_WIDTH : 0}
          chatColumnVisible={view === 'chat' && !isMobile ? chatVisible : undefined}
          onToggleRightPanel={view === 'chat' && !isMobile ? handleToggleRightPanel : undefined}
          onToggleChatColumn={view === 'chat' && !isMobile && canToggleChatColumn ? handleToggleChatColumn : undefined}
        />
      )}
      <div className={mergeClasses(s.root, electronChrome && s.rootElectron, electronChrome && 'opptrix-app-shell')}>
        <div className={s.rootLayout}>
        {!isMobile && !isSettings && (
          <SessionSidebar
            mode={sidebarOverlayMode ? 'overlay' : 'panel'}
            visible={sidebarVisible}
            onClose={() => setSidebarVisible(false)}
            {...sidebarProps}
          />
        )}

        {isSettings ? (
          <div className={mergeClasses(s.settingsHost, electronChrome && 'opptrix-settings-host')}>
            <SettingsPage
              isMobile={isMobile}
              sidebarVisible={settingsSidebarVisible}
              onSidebarClose={() => setSettingsSidebarVisible(false)}
              onBack={handleExitSettings}
              initialSection={settingsInitialSection}
              onSaved={async () => {
                await refreshHealth()
              }}
            />
          </div>
        ) : (
          <>
            {newsCenterMounted && (
              <div
                className={mergeClasses(
                  s.contentWorkspace,
                  isMobile && s.contentWorkspaceMobile,
                  electronChrome && s.contentWorkspaceElectron,
                  electronChrome && 'opptrix-app-main',
                  !isNews && s.viewHidden,
                )}
                aria-hidden={!isNews}
              >
                {isMobile && isNews && (
                  <SessionSidebar
                    mode="drawer"
                    drawerOpen={drawerOpen}
                    onClose={closeDrawer}
                    {...sidebarProps}
                  />
                )}
                <div
                  className={mergeClasses(
                    s.chatColumn,
                    electronChrome && s.chatColumnElectron,
                  )}
                >
                  <NewsCenterPage
                    electronChrome={electronChrome}
                    onOpenSettings={openNewsSettings}
                    onDiscussArticle={handleDiscussArticle}
                  />
                </div>
              </div>
            )}

            {marketDynamicsMounted && (
              <div
                className={mergeClasses(
                  s.contentWorkspace,
                  isMobile && s.contentWorkspaceMobile,
                  electronChrome && s.contentWorkspaceElectron,
                  electronChrome && 'opptrix-app-main',
                  !isMarket && s.viewHidden,
                )}
                aria-hidden={!isMarket}
              >
                {isMobile && isMarket && (
                  <SessionSidebar
                    mode="drawer"
                    drawerOpen={drawerOpen}
                    onClose={closeDrawer}
                    {...sidebarProps}
                  />
                )}
                <div
                  className={mergeClasses(
                    s.chatColumn,
                    electronChrome && s.chatColumnElectron,
                  )}
                >
                  <MarketDynamicsPage electronChrome={electronChrome} />
                </div>
              </div>
            )}

            {!isNews && !isMarket && (
          <div
            ref={workspaceRef}
            className={mergeClasses(
              s.contentWorkspace,
              isMobile && s.contentWorkspaceMobile,
              electronChrome && s.contentWorkspaceElectron,
              electronChrome && 'opptrix-app-main',
            )}
          >
            {isMobile && (
              <SessionSidebar
                mode="drawer"
                drawerOpen={drawerOpen}
                onClose={closeDrawer}
                {...sidebarProps}
              />
            )}

            {(isMobile || chatVisible) && (
              <div
                className={mergeClasses(
                  s.chatColumn,
                  electronChrome && s.chatColumnElectron,
                  isDragging && s.chatColumnDragging,
                )}
                style={!isMobile ? {
                  flex: showSplitter ? '0 0 auto' : 1,
                  width: showSplitter ? chatWidth : undefined,
                  minWidth: showSplitter ? chatWidth : 0,
                } : undefined}
              >
                {electronChrome && (
                  <div className={mergeClasses(s.chatTitleBar, 'opptrix-chat-title-bar')} aria-hidden />
                )}
                <div className={mergeClasses(s.chatPanel, electronChrome && 'opptrix-chat-panel')}>
                  <ChatView
                    title={activeSession?.title ?? '新对话'}
                    titleSlot={electronChrome ? undefined : chatTitleSlot}
                    sessionId={activeId}
                    welcomeEpoch={welcomeEpoch}
                    chatScrollEpoch={chatScrollEpoch}
                    messages={messages}
                    contextRef={contextRef}
                    input={input}
                    loading={loading}
                    liveTrace={liveTrace}
                    error={error}
                    availableModels={availableModels}
                    sessionModel={sessionModel}
                    isMobile={isMobile}
                    llmLabel={llmLabel}
                    backendOk={backendOk}
                    onInputChange={setInput}
                    onSubmit={handleSubmit}
                    onStop={handleStop}
                    onForkMessage={handleForkFromMessage}
                    onQuoteSelection={activeId ? handleQuoteSelection : undefined}
                    onEphemeralAsk={activeId ? handleEphemeralAsk : undefined}
                    onClearContextRef={contextRef ? handleClearContextRef : undefined}
                    onModelChange={availableModels.length ? handleModelChange : undefined}
                    onOpenSidebar={openDrawer}
                    onNewChat={handleNew}
                    onOpenSettings={openSettings}
                    rightPanelOpen={rightPanelVisible}
                    chatColumnVisible={chatVisible}
                    onToggleRightPanel={!isMobile ? handleToggleRightPanel : undefined}
                    onToggleChatColumn={!isMobile && canToggleChatColumn ? handleToggleChatColumn : undefined}
                    userPrompt={pendingUserPrompt}
                    userPromptSubmitting={userPromptSubmitting}
                    onUserPromptSubmit={pendingUserPrompt ? handleUserPromptSubmit : undefined}
                  />
                </div>
              </div>
            )}

            {!isMobile && showSplitter && (
              <WorkspaceSplitDivider
                electronChrome={electronChrome}
                isDragging={isDragging}
                onBeginDrag={beginDrag}
              />
            )}

            {!isMobile && (
              <RightPanel
                visible={rightPanelVisible}
                width={rightPanelWidth}
                fullWidth={!chatVisible}
                transitionEnabled={!isDragging}
                electronChrome={electronChrome}
                chatColumnVisible={chatVisible}
                chromeToolbarReserve={chromeToolbarReserve}
                focusStockCode={focusStockCode}
                onFocusStockConsumed={() => setFocusStockCode(null)}
                onToggleRightPanel={handleToggleRightPanel}
                onToggleChatColumn={canToggleChatColumn ? handleToggleChatColumn : undefined}
                onDiscussInChat={handleStockDiscuss}
              />
            )}
          </div>
            )}
          </>
        )}

        </div>
      </div>
    </>
    </WatchlistProvider>
  )
}
