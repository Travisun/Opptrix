import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import SessionSidebar, { type SidebarListTab } from './SessionSidebar'
import type { ArchiveFolderGroup } from './SessionSidebarArchivePanel'
import ChatView from './ChatView'
import type { ChatStreamUiRef } from './chatStreamUiBridge'
import {
  applyChatProgressEvent,
  createThinkingStreamSnapshot,
  syncStreamSnapshotToUi,
  type SessionStreamSnapshot,
} from './sessionStreamRuntime'
import {
  clearSessionPromptQueue,
  enqueueQueuedPrompt,
  listQueuedPrompts,
  promoteQueuedPrompt,
  removeQueuedPrompt,
  resolveDrainAction,
  shiftQueuedPrompt,
  takeQueuedPromptById,
  type DrainIntent,
  type QueuedPrompt,
} from './sessionPromptQueue'
import type { ChatProgressEvent } from '../types/chatProgress'
import {
  decideAfterWakeExpiryFetch,
  formatWakeCountdownLabel,
  parsePendingWakesApi,
  parseScheduleTurnWakeFromStep,
  secondsLeftUntil,
  type PendingWakeInfo,
} from './turnWakeCountdown'
import {
  applyJobProgressToBackgroundJobs,
  hydrateBackgroundJobsFromWatches,
  jobWatchToBackgroundJob,
  parseJobProgressEvent,
  parseJobWatchEvent,
  parsePendingJobWatchesApi,
  removeSessionBackgroundJob,
  shouldShowBackgroundJob,
  upsertSessionBackgroundJob,
  type SessionBackgroundJob,
} from './jobWatchProgress'
import SettingsPage from '../pages/SettingsPage'
import NewsCenterPage from '../pages/news/NewsCenterPage'
import ExpertMarketPage from '../pages/experts/ExpertMarketPage'
import MarketDynamicsPage from '../pages/market-dynamics/MarketDynamicsPage'
import type { SettingsSection } from '../pages/settings/SettingsSidebar'
import { normalizeSettingsSection } from '../pages/settings/settingsTypes'
import RightPanel from './RightPanel'
import type { StockDiscussPayload } from '../market/StockDecisionCard'
import WorkspaceSplitDivider from './WorkspaceSplitDivider'
import {
  listSessions, createSession, getSession, getSessionContextUsage, deleteSession, forkSession, truncateSession, clearSessionContext,
  setSessionContext, ephemeralAsk,
  streamSessionChat, cancelSessionChat, steerSessionChat, getHealth, listAvailableModels, setSessionModel, setSessionLlmParams,
  archiveSession,
  listArchivedSessions, createSessionArchiveFolder, renameSessionArchiveFolder, deleteSessionArchiveFolder,
  clearSessionArchiveFolder, renameSession, listWorkspaceGrants,
  subscribeSessionLiveProgress, fetchSessionPendingWakes,
} from '../api/client'
import type {
  ChatDisplayMessage, ChatContextUsage, EphemeralAskTurn, MessageSelection, SessionContextRef, SessionSelectionContextRef,
  SessionMeta, AvailableModel, ChatAttachmentMeta, SessionLlmParams,
} from '../types/chat'
import type { FeedArticle } from '../types/schemas'
import { previewSelectionText } from '../utils/formatContextRefPreview'
import { feedArticleToContextRef } from '../pages/news/newsUtils'
import { setNewsFeedSelectedId } from '../pages/news/newsFeedSession'
import WorkspaceSearchDialog, { type WorkspaceSearchAction } from './WorkspaceSearchDialog'
import { normalizeWatchlistItem } from '../market/instrument'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { useBreakpoint, useSidebarPreference, useSidebarOverlayMode, useSidebarResizeSync, sidebarExpandThreshold } from '../hooks/useBreakpoint'
import { useWorkspaceSplit } from '../hooks/useWorkspaceSplit'
import { useSessionSidebarWidth } from '../hooks/useSessionSidebarWidth'
import { useSettingsSidebarWidth } from '../hooks/useSettingsSidebarWidth'
import { useAppNavigation } from '../hooks/useAppNavigation'
import DesktopWindowChrome from '../desktop/DesktopWindowChrome'
import ChromeToolButton from '../desktop/ChromeToolButton'
import OverlaySidebarEdgeTrigger from '../desktop/OverlaySidebarEdgeTrigger'
import { useOpptrixDialogAlert } from '../components/opptrix/OpptrixDialogAlert'
import ChatSessionTitleTools from './ChatSessionTitleTools'
import SessionRolePersonaDrawer from './SessionRolePersonaDrawer'
import { FolderListRegular } from '@fluentui/react-icons'
import { sessionToMarkdown } from './sessionExportMarkdown'
import { saveTextFileWithDialog } from '../platform/saveTextFile'
import { copyTextToClipboard } from '../platform/clipboard'
import { desktopChromeToolbarReserve } from '../desktop/layout'
import { useElectronFullscreen } from '../hooks/useElectronFullscreen'
import { useDesktopShell } from '../hooks/useDesktopShell'
import { electronPlatform, isElectron } from '../platform/detect'
import {
  buildChatAskNotification,
  buildChatDoneNotification,
  isAwayFromForeground,
  maybeShowChatLocalNotification,
  resolveWindowFocused,
} from '../platform/chatNotifications'
import { playChatCueSound } from '../platform/chatSound'
import {
  DESKTOP_SIDEBAR_LAYOUT_MS,
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_FRAME_TITLEBAR_HEIGHT,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_ICON_SIZE,
  DESKTOP_Z_TITLE,
  SIDEBAR_DEFAULT_WIDTH,
  WORKSPACE_CHAT_MIN_WIDTH,
  WORKSPACE_CHAT_RIGHT_MIN_WIDTH,
} from '../desktop/constants'

/** schedule_turn_wake 空闲等待倒计时刷新间隔 */
const WAKE_COUNTDOWN_TICK_MS = 1000
/** 到期后若仍无 live progress，再查一次 pending-wakes 的安全窗 */
const WAKE_EXPIRY_SAFETY_MS = 45_000

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
  rootElectronFrameTitlebar: {
    paddingTop: `${DESKTOP_FRAME_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
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
    transitionProperty: 'width, min-width',
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
    zIndex: DESKTOP_Z_TITLE,
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
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  )

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const {
    current: view,
    canGoBack,
    canGoForward,
    navigate,
    goBack,
    goForward,
  } = useAppNavigation('chat')

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
    mode,
    openPreview,
    openMarket,
  } = useWorkspaceSplit({ enabled: splitEnabled })

  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const workspaceMinWidth = splitEnabled && rightPanelVisible
    ? WORKSPACE_CHAT_RIGHT_MIN_WIDTH
    : WORKSPACE_CHAT_MIN_WIDTH

  const [preview, setPreview] = useState<{ sessionId: string; attachment: ChatAttachmentMeta } | null>(null)

  useEffect(() => {
    if (mode === 'market' && !rightPanelVisible) {
      setPreview(null)
    }
  }, [mode, rightPanelVisible])

  const handleOpenFilePreview = useCallback((sessionId: string, attachment: ChatAttachmentMeta) => {
    setPreview({ sessionId, attachment })
    openPreview()
  }, [openPreview])

  const handleClosePreview = useCallback(() => {
    openMarket()
  }, [openMarket])

  const handlePeerSlideTransitionEnd = useCallback(() => {
    if (modeRef.current === 'market') {
      setPreview(null)
    }
  }, [])

  const handleToggleSessionFilesPreview = useCallback(() => {
    if (mode === 'preview') {
      handleClosePreview()
      return
    }
    openPreview()
  }, [mode, handleClosePreview, openPreview])

  const {
    width: sidebarWidth,
    isDragging: sidebarDragging,
    beginDrag: beginSidebarDrag,
  } = useSessionSidebarWidth({
    enabled: !isMobile,
    viewportWidth,
    workspaceMinWidth,
  })

  const {
    width: settingsSidebarWidth,
    isDragging: settingsSidebarDragging,
    beginDrag: beginSettingsSidebarDrag,
  } = useSettingsSidebarWidth({
    enabled: !isMobile,
    viewportWidth,
  })

  const {
    visible: sidebarVisible,
    drawerOpen,
    setVisible: setSidebarVisible,
    toggleVisible,
    openDrawer,
    closeDrawer,
  } = useSidebarPreference(isMobile, sidebarWidth)
  const [settingsSidebarVisible, setSettingsSidebarVisible] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth >= sidebarExpandThreshold(SIDEBAR_DEFAULT_WIDTH)
  })
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection | undefined>()
  const overlayWidthForMode = view === 'settings' ? settingsSidebarWidth : sidebarWidth
  const sidebarOverlayMode = useSidebarOverlayMode(!isMobile, overlayWidthForMode)
  const sidebarInlineVisible = sidebarVisible && !sidebarOverlayMode
  const settingsSidebarInlineVisible = settingsSidebarVisible && !sidebarOverlayMode

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

  const collapseSidebars = useCallback(() => {
    setSidebarVisible(false)
    setSettingsSidebarVisible(false)
    collapseRightPanel(true)
  }, [collapseRightPanel, setSidebarVisible])

  const expandSidebars = useCallback(() => {
    setSidebarVisible(true)
    setSettingsSidebarVisible(true)
  }, [setSidebarVisible])

  useSidebarResizeSync(!isMobile, overlayWidthForMode, collapseSidebars, expandSidebars)

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
  const handleSelectPreviewAttachment = useCallback((att: ChatAttachmentMeta) => {
    if (!activeId) return
    setPreview({ sessionId: activeId, attachment: att })
  }, [activeId])

  /** 切换对话时丢弃旧会话的预览附件，保留 preview 模式以便显示新会话列表/空态 */
  useEffect(() => {
    setPreview((prev) => {
      if (!prev) return null
      if (!activeId || prev.sessionId !== activeId) return null
      return prev
    })
  }, [activeId])

  const [activeSessionMeta, setActiveSessionMeta] = useState<SessionMeta | null>(null)
  const [expertRefreshKey, setExpertRefreshKey] = useState(0)
  const [messages, setMessages] = useState<ChatDisplayMessage[]>([])
  const [contextRef, setContextRef] = useState<SessionContextRef | null>(null)
  const [composerDraft, setComposerDraft] = useState({ revision: 0, text: '' })
  const pushComposerDraft = useCallback((text: string) => {
    setComposerDraft(prev => ({ revision: prev.revision + 1, text }))
  }, [])
  const [streamingSessionIds, setStreamingSessionIds] = useState<string[]>([])
  const [wakeWaitingSessionIds, setWakeWaitingSessionIds] = useState<string[]>([])
  const streamUiRef = useRef<ChatStreamUiRef['current']>(null)
  const [error, setError] = useState('')
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [defaultModel, setDefaultModel] = useState<string | undefined>()
  const [sessionModel, setSessionModelState] = useState<string | undefined>()
  const [sessionLlmParams, setSessionLlmParamsState] = useState<SessionLlmParams | undefined>()
  const resolvedSessionModel = sessionModel ?? defaultModel
  const [contextUsage, setContextUsage] = useState<ChatContextUsage | null>(null)
  const [llmLabel, setLlmLabel] = useState('连接中…')
  const [backendOk, setBackendOk] = useState(false)
  const streamCacheRef = useRef(new Map<string, SessionStreamSnapshot>())
  const streamHandlesRef = useRef(new Map<string, { abortController: AbortController; streamGen: number }>())
  const sessionStreamGenRef = useRef(new Map<string, number>())
  const stoppingSessionsRef = useRef(new Set<string>())
  const streamingSessionIdsRef = useRef(new Set<string>())
  const wakeWaitingSessionIdsRef = useRef(new Set<string>())
  /** schedule_turn_wake 到期前本地倒计时 */
  const pendingWakeRef = useRef(new Map<string, PendingWakeInfo>())
  const wakeCountdownTimersRef = useRef(new Map<string, number>())
  const wakeExpirySafetyTimersRef = useRef(new Map<string, number>())
  /** 每会话 drain 意图：Stop=none；失败/成功=auto；打断指定项=runItem */
  const drainIntentRef = useRef(new Map<string, DrainIntent>())
  /** 当前会话排队提示（localStorage 镜像） */
  const [promptQueue, setPromptQueue] = useState<QueuedPrompt[]>([])
  /** 每会话未完成后台 Job（composer 上方状态条） */
  const [backgroundJobsBySession, setBackgroundJobsBySession] = useState<
    Record<string, SessionBackgroundJob[]>
  >({})
  const sessionBackgroundJobs = activeId ? (backgroundJobsBySession[activeId] ?? []) : []

  const patchSessionBackgroundJobs = useCallback((
    sessionId: string,
    updater: (prev: SessionBackgroundJob[]) => SessionBackgroundJob[],
  ) => {
    const sid = String(sessionId ?? '').trim()
    if (!sid) return
    setBackgroundJobsBySession((prev) => {
      const nextList = updater(prev[sid] ?? [])
      if (nextList.length === 0) {
        if (!(sid in prev)) return prev
        const { [sid]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [sid]: nextList }
    })
  }, [])

  const clearSessionBackgroundJobs = useCallback((sessionId: string) => {
    const sid = String(sessionId ?? '').trim()
    if (!sid) return
    setBackgroundJobsBySession((prev) => {
      if (!(sid in prev)) return prev
      const { [sid]: _removed, ...rest } = prev
      return rest
    })
  }, [])
  /** 流结束后延迟清除过程条的 timer（sessionId → timeout id） */
  const streamResetTimersRef = useRef(new Map<string, number>())
  /** 本轮生成期间曾失焦/不可见（sessionId → true） */
  const streamAwayDuringGenRef = useRef(new Map<string, boolean>())
  /** 同轮完成通知去重键：`${sessionId}:${streamGen}` */
  const doneNotifiedGensRef = useRef(new Set<string>())
  /** 系统通知被拒时仅温和提示一次 */
  const notificationDeniedHintedRef = useRef(false)
  const activeIdRef = useRef<string | null>(null)
  const viewRef = useRef(view)
  const sessionsRef = useRef(sessions)
  const activeSessionMetaRef = useRef(activeSessionMeta)
  const loading = activeId ? streamingSessionIds.includes(activeId) : false
  const wakeWaiting = activeId ? wakeWaitingSessionIds.includes(activeId) : false
  const markSessionStreaming = useCallback((sessionId: string, streaming: boolean) => {
    if (streaming) streamingSessionIdsRef.current.add(sessionId)
    else streamingSessionIdsRef.current.delete(sessionId)
    setStreamingSessionIds(Array.from(streamingSessionIdsRef.current))
  }, [])
  const markSessionWakeWaiting = useCallback((sessionId: string, waiting: boolean) => {
    if (waiting) wakeWaitingSessionIdsRef.current.add(sessionId)
    else wakeWaitingSessionIdsRef.current.delete(sessionId)
    setWakeWaitingSessionIds(Array.from(wakeWaitingSessionIdsRef.current))
  }, [])

  const stopWakeCountdown = useCallback((sessionId: string) => {
    const timer = wakeCountdownTimersRef.current.get(sessionId)
    if (timer != null) {
      window.clearInterval(timer)
      wakeCountdownTimersRef.current.delete(sessionId)
    }
  }, [])

  const clearWakeExpirySafety = useCallback((sessionId: string) => {
    const t = wakeExpirySafetyTimersRef.current.get(sessionId)
    if (t != null) {
      window.clearTimeout(t)
      wakeExpirySafetyTimersRef.current.delete(sessionId)
    }
  }, [])

  const clearSessionWakeState = useCallback((sessionId: string) => {
    pendingWakeRef.current.delete(sessionId)
    stopWakeCountdown(sessionId)
    clearWakeExpirySafety(sessionId)
    markSessionWakeWaiting(sessionId, false)
  }, [clearWakeExpirySafety, markSessionWakeWaiting, stopWakeCountdown])

  const applyWakeCountdownSnapshot = useCallback((sessionId: string, fireAt: string) => {
    const left = secondsLeftUntil(fireAt)
    const phaseLabel = left > 0 ? formatWakeCountdownLabel(left) : '正在继续'
    const prev = streamCacheRef.current.get(sessionId)
    const next: SessionStreamSnapshot = {
      liveTrace: {
        steps: prev?.liveTrace?.steps ?? [],
        phaseLabel,
        thinkingLabel: `${phaseLabel}…`,
      },
      pendingUserPrompt: null,
      userPromptSubmitting: false,
      contextHint: prev?.contextHint ?? null,
    }
    streamCacheRef.current.set(sessionId, next)
    if (activeIdRef.current === sessionId) {
      syncStreamSnapshotToUi(next, streamUiRef.current)
    }
  }, [])

  const startWakeCountdown = useCallback((sessionId: string, wake: PendingWakeInfo) => {
    pendingWakeRef.current.set(sessionId, wake)
    markSessionWakeWaiting(sessionId, true)
    applyWakeCountdownSnapshot(sessionId, wake.fireAt)
    stopWakeCountdown(sessionId)
    clearWakeExpirySafety(sessionId)

    const handleExpiry = () => {
      stopWakeCountdown(sessionId)
      applyWakeCountdownSnapshot(sessionId, wake.fireAt)
      void fetchSessionPendingWakes(sessionId).then((data) => {
        const decision = decideAfterWakeExpiryFetch(parsePendingWakesApi(data))
        if (decision.kind === 'restart') {
          startWakeCountdown(sessionId, decision.wake)
          return
        }
        // 等 live-progress；45s 后再查一次 pending
        const safety = window.setTimeout(() => {
          wakeExpirySafetyTimersRef.current.delete(sessionId)
          if (streamingSessionIdsRef.current.has(sessionId)) return
          if (!wakeWaitingSessionIdsRef.current.has(sessionId)) return
          void fetchSessionPendingWakes(sessionId).then((again) => {
            const next = decideAfterWakeExpiryFetch(parsePendingWakesApi(again))
            if (next.kind === 'restart') startWakeCountdown(sessionId, next.wake)
          }).catch(() => { /* ignore */ })
        }, WAKE_EXPIRY_SAFETY_MS)
        wakeExpirySafetyTimersRef.current.set(sessionId, safety)
      }).catch(() => { /* ignore */ })
    }

    if (secondsLeftUntil(wake.fireAt) <= 0) {
      handleExpiry()
      return
    }

    const timer = window.setInterval(() => {
      const current = pendingWakeRef.current.get(sessionId)
      if (!current) {
        stopWakeCountdown(sessionId)
        return
      }
      applyWakeCountdownSnapshot(sessionId, current.fireAt)
      if (secondsLeftUntil(current.fireAt) <= 0) {
        handleExpiry()
      }
    }, WAKE_COUNTDOWN_TICK_MS)
    wakeCountdownTimersRef.current.set(sessionId, timer)
  }, [
    applyWakeCountdownSnapshot,
    clearWakeExpirySafety,
    markSessionWakeWaiting,
    stopWakeCountdown,
  ])
  const resolveSessionTitle = useCallback((targetSessionId: string, eventTitle?: string) => {
    return eventTitle
      ?? (activeSessionMetaRef.current?.id === targetSessionId
        ? activeSessionMetaRef.current.title
        : undefined)
      ?? sessionsRef.current.find(s => s.id === targetSessionId)?.title
  }, [])

  const handleNotificationResult = useCallback((result: 'skipped' | 'shown' | 'denied' | 'failed') => {
    if (result !== 'denied' || notificationDeniedHintedRef.current) return
    notificationDeniedHintedRef.current = true
    setError('桌面通知未开启。可在系统设置中允许 Opptrix 发送通知，以免错过对话完成提醒。')
  }, [])

  const maybeNotifyChatDone = useCallback((targetSessionId: string, sessionTitle?: string) => {
    const streamGen = sessionStreamGenRef.current.get(targetSessionId) ?? 0
    const dedupeKey = `${targetSessionId}:${streamGen}`
    if (doneNotifiedGensRef.current.has(dedupeKey)) return
    doneNotifiedGensRef.current.add(dedupeKey)
    playChatCueSound()

    void (async () => {
      const documentVisible = typeof document !== 'undefined'
        && document.visibilityState === 'visible'
      const windowFocused = await resolveWindowFocused()
      const result = await maybeShowChatLocalNotification(
        targetSessionId,
        {
          activeSessionId: activeIdRef.current,
          view: viewRef.current,
          documentVisible,
          windowFocused,
          awayDuringGeneration: streamAwayDuringGenRef.current.get(targetSessionId) === true,
        },
        buildChatDoneNotification(targetSessionId, sessionTitle),
      )
      handleNotificationResult(result)
    })()
  }, [handleNotificationResult])

  const markStreamingSessionsAwayIfNeeded = useCallback(async () => {
    if (streamingSessionIdsRef.current.size === 0) return
    const documentVisible = typeof document !== 'undefined'
      && document.visibilityState === 'visible'
    const windowFocused = await resolveWindowFocused()
    if (!isAwayFromForeground({ documentVisible, windowFocused })) return
    for (const sessionId of streamingSessionIdsRef.current) {
      streamAwayDuringGenRef.current.set(sessionId, true)
    }
  }, [])

  useEffect(() => {
    if (!isElectron()) return

    const onVisibilityOrFocusChange = () => {
      void markStreamingSessionsAwayIfNeeded()
    }

    document.addEventListener('visibilitychange', onVisibilityOrFocusChange)
    window.addEventListener('blur', onVisibilityOrFocusChange)
    window.addEventListener('focus', onVisibilityOrFocusChange)
    const timer = window.setInterval(() => {
      void markStreamingSessionsAwayIfNeeded()
    }, 2000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityOrFocusChange)
      window.removeEventListener('blur', onVisibilityOrFocusChange)
      window.removeEventListener('focus', onVisibilityOrFocusChange)
      window.clearInterval(timer)
    }
  }, [markStreamingSessionsAwayIfNeeded])

  const applyBackgroundJobProgressEvent = useCallback((
    targetSessionId: string,
    event: ChatProgressEvent,
  ) => {
    if (event.type === 'job_watch') {
      if (event.action === 'attached' || event.action === 'updated') {
        const info = parseJobWatchEvent(event)
        if (info) {
          const job = jobWatchToBackgroundJob(info)
          if (shouldShowBackgroundJob(job)) {
            markSessionWakeWaiting(targetSessionId, true)
            patchSessionBackgroundJobs(targetSessionId, (list) =>
              upsertSessionBackgroundJob(list, job),
            )
          } else {
            patchSessionBackgroundJobs(targetSessionId, (list) =>
              removeSessionBackgroundJob(list, job.jobId),
            )
          }
        }
        return
      }
      if (event.action === 'cleared') {
        const jobId = typeof event.job_id === 'string' ? event.job_id.trim() : ''
        if (jobId) {
          patchSessionBackgroundJobs(targetSessionId, (list) =>
            removeSessionBackgroundJob(list, jobId),
          )
        } else {
          clearSessionBackgroundJobs(targetSessionId)
        }
        return
      }
      if (event.action === 'resuming') {
        markSessionWakeWaiting(targetSessionId, false)
        const jobId = typeof event.job_id === 'string' ? event.job_id.trim() : ''
        if (jobId) {
          patchSessionBackgroundJobs(targetSessionId, (list) =>
            removeSessionBackgroundJob(list, jobId),
          )
        }
      }
      return
    }
    if (event.type === 'job_progress') {
      const progress = parseJobProgressEvent(event)
      if (progress) {
        patchSessionBackgroundJobs(targetSessionId, (list) =>
          applyJobProgressToBackgroundJobs(list, progress),
        )
      }
    }
  }, [
    clearSessionBackgroundJobs,
    markSessionWakeWaiting,
    patchSessionBackgroundJobs,
  ])

  const pushStreamEvent = useCallback((targetSessionId: string, event: ChatProgressEvent) => {
    const prev = streamCacheRef.current.get(targetSessionId) ?? createThinkingStreamSnapshot()
    const next = applyChatProgressEvent(prev, event)
    streamCacheRef.current.set(targetSessionId, next)

    if (event.type === 'tool_done') {
      const wake = parseScheduleTurnWakeFromStep(event.step)
      if (wake) pendingWakeRef.current.set(targetSessionId, wake)
    }
    if (event.type === 'job_watch' || event.type === 'job_progress') {
      applyBackgroundJobProgressEvent(targetSessionId, event)
    }
    if (event.type === 'done' && Array.isArray(event.tool_steps)) {
      for (const step of event.tool_steps) {
        const wake = parseScheduleTurnWakeFromStep(step)
        if (wake) {
          pendingWakeRef.current.set(targetSessionId, wake)
          break
        }
      }
    }

    if (activeIdRef.current === targetSessionId) {
      syncStreamSnapshotToUi(next, streamUiRef.current)
      if (event.type === 'context_compact' && next.contextHint) {
        setContextHintBanner(next.contextHint)
      }
      if (event.type === 'done' && event.context_usage) {
        setContextUsage(event.context_usage)
      }
    }

    // 内容已落定：优先在最终 reply（含 content）触发完成通知，避免进度计数误触
    if (event.type === 'reply' && event.content) {
      maybeNotifyChatDone(targetSessionId, resolveSessionTitle(targetSessionId))
    }

    // done 作为兜底（无 reply 的路径）；同轮已通知则去重跳过
    if (event.type === 'done' && !event.cancelled) {
      maybeNotifyChatDone(
        targetSessionId,
        resolveSessionTitle(targetSessionId, event.title),
      )
    }

    if (event.type === 'user_prompt') {
      const promptSummary = event.prompt.title || event.prompt.prompt
      playChatCueSound()
      void (async () => {
        const documentVisible = typeof document !== 'undefined'
          && document.visibilityState === 'visible'
        const windowFocused = await resolveWindowFocused()
        const result = await maybeShowChatLocalNotification(
          targetSessionId,
          {
            activeSessionId: activeIdRef.current,
            view: viewRef.current,
            documentVisible,
            windowFocused,
          },
          buildChatAskNotification(targetSessionId, promptSummary),
        )
        handleNotificationResult(result)
      })()
    }
  }, [
    applyBackgroundJobProgressEvent,
    handleNotificationResult,
    maybeNotifyChatDone,
    resolveSessionTitle,
  ])

  const resolveStreamSnapshot = useCallback((id: string | null) => {
    if (!id) return null
    if (
      !streamingSessionIdsRef.current.has(id)
      && !wakeWaitingSessionIdsRef.current.has(id)
    ) return null
    return streamCacheRef.current.get(id) ?? createThinkingStreamSnapshot()
  }, [streamingSessionIds, wakeWaitingSessionIds])
  const clearPendingUserPrompt = useCallback((sessionId: string | null) => {
    if (!sessionId || !streamingSessionIdsRef.current.has(sessionId)) return
    const prev = streamCacheRef.current.get(sessionId)
    if (!prev?.pendingUserPrompt) return
    const next: SessionStreamSnapshot = { ...prev, pendingUserPrompt: null }
    streamCacheRef.current.set(sessionId, next)
    if (activeIdRef.current === sessionId) {
      syncStreamSnapshotToUi(next, streamUiRef.current)
    }
  }, [])

  const syncPromptQueueUi = useCallback((sessionId: string | null) => {
    if (!sessionId) {
      setPromptQueue([])
      return
    }
    if (activeIdRef.current === sessionId) {
      setPromptQueue(listQueuedPrompts(sessionId))
    }
  }, [])

  useEffect(() => {
    syncPromptQueueUi(activeId)
  }, [activeId, syncPromptQueueUi])

  const abortSessionStream = useCallback(async (sessionId: string) => {
    sessionStreamGenRef.current.set(
      sessionId,
      (sessionStreamGenRef.current.get(sessionId) ?? 0) + 1,
    )
    stoppingSessionsRef.current.add(sessionId)
    clearSessionWakeState(sessionId)
    streamHandlesRef.current.get(sessionId)?.abortController.abort()
    try {
      await cancelSessionChat(sessionId)
    } catch {
      /* stream may have already ended */
    }
  }, [clearSessionWakeState])
  const [welcomeEpoch, setWelcomeEpoch] = useState(0)
  const [chatScrollEpoch, setChatScrollEpoch] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [rolePersonaOpen, setRolePersonaOpen] = useState(false)
  const [contextHintBanner, setContextHintBanner] = useState('')

  const [focusStockCode, setFocusStockCode] = useState<string | null>(null)
  const [newsCenterMounted, setNewsCenterMounted] = useState(() => view === 'news')
  const [marketDynamicsMounted, setMarketDynamicsMounted] = useState(() => view === 'market')
  const [expertMarketMounted, setExpertMarketMounted] = useState(() => view === 'experts')

  const refreshModels = useCallback(async () => {
    try {
      const { models, default_model } = await listAvailableModels()
      setAvailableModels(models)
      setDefaultModel(default_model?.trim() || undefined)
      return models
    } catch {
      // 失败时保留已有列表，避免首启超时把选择器清空
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
      } else if (health.llm_configured) {
        // health 已表示有模型，但列表请求失败：保持文案，勿暗示「未配置」
        setLlmLabel((prev) => (prev.includes('可用模型') ? prev : '模型已就绪'))
      } else {
        setLlmLabel('请先在设置中配置 AI 模型')
      }
    } catch {
      setBackendOk(false)
      setLlmLabel('服务未连接，请检查网络')
    }
  }, [refreshModels])

  const refreshSessions = useCallback(async () => {
    const { sessions: list } = await listSessions()
    setSessions(list)
    return list
  }, [])

  // 订阅 live-progress：wake 到期续跑的 thinking/tool/done 推到同一会话 UI
  useEffect(() => {
    if (!activeId) return
    const sessionId = activeId
    const ac = new AbortController()
    let cancelled = false

    const finishWakeResume = async (sid: string) => {
      const pendingWake = pendingWakeRef.current.get(sid)
      markSessionStreaming(sid, false)
      if (pendingWake) {
        startWakeCountdown(sid, pendingWake)
      } else {
        clearSessionWakeState(sid)
        streamCacheRef.current.delete(sid)
      }
      try {
        const fresh = await getSession(sid)
        if (cancelled || activeIdRef.current !== sid) return
        setActiveSessionMeta(fresh.session)
        setMessages(fresh.messages)
        setContextRef(fresh.contextRef ?? null)
        setSessionModelState(fresh.session.model)
        setSessionLlmParamsState(fresh.session.llmParams)
        setContextUsage(fresh.contextUsage ?? null)
        await refreshSessions()
      } catch {
        /* keep current */
      }
      if (activeIdRef.current === sid && !streamingSessionIdsRef.current.has(sid)) {
        window.setTimeout(() => {
          if (activeIdRef.current !== sid) return
          if (streamingSessionIdsRef.current.has(sid)) return
          if (wakeWaitingSessionIdsRef.current.has(sid)) return
          streamUiRef.current?.resetStreamUi()
        }, 500)
      }
    }

    const onLiveEvent = (event: ChatProgressEvent) => {
      // 用户本轮已在 chat/stream 中：过程条由 stream 接管；Job 状态条仍吃 bus，避免丢进度
      if (streamHandlesRef.current.has(sessionId)) {
        if (event.type === 'job_watch' || event.type === 'job_progress') {
          applyBackgroundJobProgressEvent(sessionId, event)
        }
        return
      }

      const progressive =
        event.type === 'thinking'
        || event.type === 'tool_start'
        || event.type === 'tool_done'
        || event.type === 'reply'
        || event.type === 'context_compact'
        || event.type === 'user_prompt'
        || event.type === 'steer_applied'

      if (progressive && !streamingSessionIdsRef.current.has(sessionId)) {
        clearSessionWakeState(sessionId)
        const gen = (sessionStreamGenRef.current.get(sessionId) ?? 0) + 1
        sessionStreamGenRef.current.set(sessionId, gen)
        streamCacheRef.current.set(sessionId, createThinkingStreamSnapshot('正在继续…'))
        markSessionStreaming(sessionId, true)
      }

      pushStreamEvent(sessionId, event)

      if (event.type === 'done' || event.type === 'error') {
        void finishWakeResume(sessionId)
      }
    }

    void (async () => {
      try {
        const data = await fetchSessionPendingWakes(sessionId)
        if (cancelled) return
        const watches = parsePendingJobWatchesApi(data)
        patchSessionBackgroundJobs(sessionId, () => hydrateBackgroundJobsFromWatches(watches))
        const wake = parsePendingWakesApi(data)[0]
        if (
          wake
          && secondsLeftUntil(wake.fireAt) > 0
          && !streamingSessionIdsRef.current.has(sessionId)
        ) {
          startWakeCountdown(sessionId, wake)
        }
      } catch {
        /* ignore */
      }

      while (!cancelled && !ac.signal.aborted) {
        try {
          await subscribeSessionLiveProgress(sessionId, onLiveEvent, ac.signal)
          break
        } catch (e) {
          const aborted = (
            (e instanceof DOMException && e.name === 'AbortError')
            || (e instanceof Error && e.name === 'AbortError')
          )
          if (aborted || cancelled) break
          await new Promise(r => setTimeout(r, 1500))
        }
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [
    activeId,
    applyBackgroundJobProgressEvent,
    clearSessionWakeState,
    markSessionStreaming,
    patchSessionBackgroundJobs,
    pushStreamEvent,
    refreshSessions,
    startWakeCountdown,
  ])

  const refreshArchived = useCallback(async () => {
    const { groups } = await listArchivedSessions()
    setArchivedGroups(groups)
    return groups
  }, [])

  const refreshContextUsage = useCallback(async (sessionId: string) => {
    try {
      const { contextUsage: next } = await getSessionContextUsage(sessionId)
      if (activeIdRef.current === sessionId) {
        setContextUsage(next)
      }
    } catch {
      if (activeIdRef.current === sessionId) {
        setContextUsage(null)
      }
    }
  }, [])

  const loadSession = useCallback(async (id: string) => {
    const prevId = activeIdRef.current
    if (prevId && prevId !== id) {
      const pending = streamResetTimersRef.current.get(prevId)
      if (pending != null) {
        window.clearTimeout(pending)
        streamResetTimersRef.current.delete(prevId)
      }
    }
    pushComposerDraft('')
    const data = await getSession(id)
    setActiveId(id)
    setActiveSessionMeta(data.session)
    setMessages(data.messages)
    setContextRef(data.contextRef ?? null)
    setSessionModelState(data.session.model)
    setSessionLlmParamsState(data.session.llmParams)
    setContextUsage(data.contextUsage ?? null)
    setError('')
    setChatScrollEpoch(epoch => epoch + 1)
    // miss 时异步补拉，不阻塞消息切换
    if (!data.contextUsage) {
      void refreshContextUsage(id)
    }
  }, [pushComposerDraft, refreshContextUsage])

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
    if (view === 'experts') setExpertMarketMounted(true)
  }, [view])

  const openSettings = useCallback((section?: SettingsSection) => {
    closeDrawer()
    setSettingsInitialSection(normalizeSettingsSection(section))
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

  const openExpertMarket = useCallback(() => {
    closeDrawer()
    navigate('experts')
  }, [closeDrawer, navigate])

  const openNewsSettings = useCallback(() => {
    openSettings('news_feed')
  }, [openSettings])

  const handleExitSettings = useCallback(() => {
    navigate('chat')
    // 设置页可能改过提供商/模型；退出时刷新，确保聊天下拉立刻可用
    refreshHealth().catch(() => {})
  }, [navigate, refreshHealth])

  const handleChromeGoBack = useCallback(() => {
    if (view === 'settings' && !canGoBack) {
      handleExitSettings()
      return
    }
    goBack()
  }, [view, canGoBack, goBack, handleExitSettings])

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

  const handleNew = useCallback(async () => {
    restoreChatColumn()
    try {
      const { session } = await createSession()
      const list = await refreshSessions()
      setSessions(list)
      setActiveId(session.id)
      setActiveSessionMeta(session)
      setMessages([])
      setContextRef(null)
      setSessionModelState(session.model)
      setSessionLlmParamsState(session.llmParams)
      if (session.model?.trim()) setDefaultModel(session.model.trim())
      pushComposerDraft('')
      setError('')
      setWelcomeEpoch(epoch => epoch + 1)
      closeDrawer()
      if (view !== 'chat') navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建对话失败')
    }
  }, [closeDrawer, navigate, pushComposerDraft, refreshSessions, restoreChatColumn, view])

  const handleSelect = useCallback(async (id: string) => {
    restoreChatColumn()
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
  }, [activeId, loadSession, navigate, restoreChatColumn, view])

  const handleDelete = useCallback(async (id: string) => {
    const ok = await confirm({
      title: '确定删除此对话？',
      message: '删除后无法恢复。',
      confirmLabel: '删除',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      if (streamingSessionIdsRef.current.has(id)) {
        await abortSessionStream(id)
      }
      clearSessionWakeState(id)
      clearSessionBackgroundJobs(id)
      clearSessionPromptQueue(id)
      drainIntentRef.current.delete(id)
      syncPromptQueueUi(activeIdRef.current === id ? null : activeIdRef.current)
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
  }, [activeId, abortSessionStream, clearSessionBackgroundJobs, clearSessionWakeState, confirm, loadSession, refreshSessions])

  const handleSelectExpert = useCallback(async (expertId: string) => {
    restoreChatColumn()
    try {
      const { session } = await createSession({ expertId })
      const list = await refreshSessions()
      setSessions(list)
      setActiveId(session.id)
      setActiveSessionMeta(session)
      setMessages([])
      setContextRef(null)
      setSessionModelState(session.model)
      setSessionLlmParamsState(session.llmParams)
      if (session.model?.trim()) setDefaultModel(session.model.trim())
      pushComposerDraft('')
      setError('')
      setWelcomeEpoch(epoch => epoch + 1)
      setSidebarListTab('experts')
      closeDrawer()
      navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建专家对话失败')
    }
  }, [closeDrawer, navigate, pushComposerDraft, refreshSessions, restoreChatColumn])

  const handleArchive = useCallback(async (id: string, folderId: string) => {
    try {
      await archiveSession(id, folderId)
      clearSessionPromptQueue(id)
      drainIntentRef.current.delete(id)
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
          setSessionLlmParamsState(undefined)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '归档失败')
    }
  }, [activeId, loadSession, refreshArchived, refreshSessions])

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
          setSessionLlmParamsState(undefined)
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
          setSessionLlmParamsState(undefined)
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

  const handleOpenSessionDir = useCallback(async () => {
    if (!activeId) return
    try {
      const { grants } = await listWorkspaceGrants(activeId)
      const absPath = grants.find(g => g.is_default)?.abs_path?.trim()
      if (!absPath) {
        setError('暂时无法打开会话目录，请稍后重试')
        return
      }
      if (isElectron() && window.electronAPI?.openLocalDirectory) {
        await window.electronAPI.openLocalDirectory(absPath)
        return
      }
      const copied = await copyTextToClipboard(absPath)
      setError(copied ? '已复制会话目录路径' : '暂时无法打开会话目录，请稍后重试')
    } catch {
      setError('暂时无法打开会话目录，请稍后重试')
    }
  }, [activeId])

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
      openMarket()
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
    openMarket,
    view,
  ])

  const handleStop = useCallback(async () => {
    const sid = activeId
    if (!sid || !streamingSessionIdsRef.current.has(sid) || stoppingSessionsRef.current.has(sid)) return
    drainIntentRef.current.set(sid, { kind: 'none' })
    await abortSessionStream(sid)
  }, [abortSessionStream, activeId])

  const loadingRef = useRef(loading)
  const sessionModelRef = useRef(resolvedSessionModel)
  activeIdRef.current = activeId
  viewRef.current = view
  sessionsRef.current = sessions
  activeSessionMetaRef.current = activeSessionMeta
  loadingRef.current = loading
  sessionModelRef.current = resolvedSessionModel

  const submitImplRef = useRef<(text?: string, attachmentIds?: string[], attachmentMetas?: ChatAttachmentMeta[]) => Promise<void>>(async () => {})

  const drainPromptQueueAfterStream = useCallback((sessionId: string) => {
    const intent = drainIntentRef.current.get(sessionId) ?? { kind: 'auto' }
    drainIntentRef.current.delete(sessionId)

    const pendingAsk = Boolean(streamCacheRef.current.get(sessionId)?.pendingUserPrompt)
    const decision = resolveDrainAction(intent, {
      hasPendingUserPrompt: pendingAsk,
      alreadyStreaming: streamingSessionIdsRef.current.has(sessionId)
        || streamHandlesRef.current.has(sessionId),
    })
    if (decision.action === 'skip') {
      syncPromptQueueUi(sessionId)
      return
    }

    let next: QueuedPrompt | null = null
    if (decision.action === 'take') {
      next = takeQueuedPromptById(sessionId, decision.itemId).item
    } else {
      next = shiftQueuedPrompt(sessionId).item
    }
    syncPromptQueueUi(sessionId)
    if (!next) return

    // 微任务：确保本流 finally 的 streaming 清理已完成
    queueMicrotask(() => {
      if (streamingSessionIdsRef.current.has(sessionId)) return
      void submitImplRef.current(
        next.text || undefined,
        next.attachmentIds,
        next.attachmentMetas,
      )
    })
  }, [syncPromptQueueUi])

  submitImplRef.current = async (text?: string, attachmentIds?: string[], attachmentMetas?: ChatAttachmentMeta[]) => {
    const msg = (text ?? '').trim()
    const ids = attachmentIds?.filter(Boolean) ?? []
    if (!msg && !ids.length) return

    let sessionId = activeIdRef.current
    if (!sessionId) {
      try {
        const { session } = await createSession()
        sessionId = session.id
        setActiveId(sessionId)
        setActiveSessionMeta(session)
        setSessionModelState(session.model)
        setSessionLlmParamsState(session.llmParams)
        if (session.model?.trim()) setDefaultModel(session.model.trim())
        await refreshSessions()
      } catch (e) {
        setError(e instanceof Error ? e.message : '创建对话失败')
        return
      }
    }

    if (streamingSessionIdsRef.current.has(sessionId)) {
      // 生成中：纯文本走 soft steer；带附件仍排队等本轮结束后发送
      if (!ids.length && msg) {
        try {
          const result = await steerSessionChat(sessionId, msg)
          if (!result.ok) {
            if (result.reason === 'no_active_chat') {
              setError('当前没有进行中的回复，请直接发送新问题')
            } else {
              setError('补充说明未能送出，请稍后重试')
            }
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : '补充说明未能送出')
        }
        return
      }
      const result = enqueueQueuedPrompt(sessionId, {
        text: msg,
        attachmentIds: ids,
        attachmentMetas,
      })
      syncPromptQueueUi(sessionId)
      if (!result.ok && result.reason === 'full') {
        setError('排队已满，请先处理或删除后再添加')
      }
      return
    }

    const pendingReset = streamResetTimersRef.current.get(sessionId)
    if (pendingReset != null) {
      window.clearTimeout(pendingReset)
      streamResetTimersRef.current.delete(sessionId)
    }

    const streamGen = (sessionStreamGenRef.current.get(sessionId) ?? 0) + 1
    sessionStreamGenRef.current.set(sessionId, streamGen)
    streamAwayDuringGenRef.current.set(sessionId, false)
    for (const key of [...doneNotifiedGensRef.current]) {
      if (key.startsWith(`${sessionId}:`)) doneNotifiedGensRef.current.delete(key)
    }
    // 新一轮默认自动续跑下一条；Stop / runNow 会在本轮中途覆盖
    drainIntentRef.current.set(sessionId, { kind: 'auto' })
    clearSessionWakeState(sessionId)
    clearSessionBackgroundJobs(sessionId)
    const initialSnapshot = createThinkingStreamSnapshot()
    streamCacheRef.current.set(sessionId, initialSnapshot)
    markSessionStreaming(sessionId, true)
    // 若发送时已不在前台，立即记为曾离开
    void markStreamingSessionsAwayIfNeeded()
    stoppingSessionsRef.current.delete(sessionId)
    if (activeIdRef.current === sessionId) {
      syncStreamSnapshotToUi(initialSnapshot, streamUiRef.current)
    }
    setError('')

    const optimistic: ChatDisplayMessage = {
      role: 'user',
      content: msg || '（附件）',
      at: new Date().toISOString(),
      ...(attachmentMetas?.length ? { attachments: attachmentMetas } : {}),
    }
    if (activeIdRef.current === sessionId) {
      setMessages(prev => [...prev, optimistic])
    }

    let resolvedSessionId = sessionId
    const abortController = new AbortController()
    streamHandlesRef.current.set(sessionId, { abortController, streamGen })

    const isStreamStale = () => streamGen !== (sessionStreamGenRef.current.get(sessionId) ?? 0)

    const applyFreshSession = async (sid: string) => {
      const fresh = await getSession(sid)
      if (isStreamStale()) return
      if (activeIdRef.current === sid) {
        setActiveSessionMeta(fresh.session)
        setMessages(fresh.messages)
        setContextRef(fresh.contextRef ?? null)
        setSessionModelState(fresh.session.model)
        setSessionLlmParamsState(fresh.session.llmParams)
        setContextUsage(fresh.contextUsage ?? null)
      }
      const list = await refreshSessions()
      if (isStreamStale()) return
      setSessions(list)
    }

    try {
      await streamSessionChat(sessionId, msg, (event) => {
        pushStreamEvent(sessionId, event)
        if (event.type === 'done') {
          resolvedSessionId = event.session_id || resolvedSessionId
        }
      }, sessionModelRef.current, abortController.signal, ids.length ? ids : undefined)

      if (!isStreamStale()) {
        const sid = resolvedSessionId
        if (sid !== sessionId && activeIdRef.current === sessionId) {
          setActiveId(sid)
        }
        await applyFreshSession(sid)
      }
    } catch (e) {
      const aborted = (
        (e instanceof DOMException && e.name === 'AbortError')
        || (e instanceof Error && e.name === 'AbortError')
      )
      if (aborted) {
        try {
          await applyFreshSession(sessionId)
        } catch {
          /* keep current messages */
        }
      } else if (!isStreamStale()) {
        if (activeIdRef.current === sessionId) {
          setError(e instanceof Error ? e.message : '发送失败')
        }
        try {
          await applyFreshSession(sessionId)
        } catch {
          if (!isStreamStale() && activeIdRef.current === sessionId) {
            setMessages(prev => prev.slice(0, -1))
          }
        }
      }
    } finally {
      streamHandlesRef.current.delete(sessionId)
      stoppingSessionsRef.current.delete(sessionId)
      const hadPendingAsk = Boolean(streamCacheRef.current.get(sessionId)?.pendingUserPrompt)
      const pendingWake = pendingWakeRef.current.get(sessionId)
      markSessionStreaming(sessionId, false)
      if (pendingWake) {
        // 保留过程条，进入秒级倒计时（已到期则显示「正在继续」）
        startWakeCountdown(sessionId, pendingWake)
      } else {
        streamCacheRef.current.delete(sessionId)
        clearSessionWakeState(sessionId)
        if (activeIdRef.current === sessionId) {
          const prevTimer = streamResetTimersRef.current.get(sessionId)
          if (prevTimer != null) window.clearTimeout(prevTimer)
          const timer = window.setTimeout(() => {
            streamResetTimersRef.current.delete(sessionId)
            if (activeIdRef.current !== sessionId) return
            if (streamGen !== (sessionStreamGenRef.current.get(sessionId) ?? 0)) return
            if (streamingSessionIdsRef.current.has(sessionId)) return
            if (wakeWaitingSessionIdsRef.current.has(sessionId)) return
            streamUiRef.current?.resetStreamUi()
          }, 500)
          streamResetTimersRef.current.set(sessionId, timer)
        }
      }
      if (hadPendingAsk) {
        const intent = drainIntentRef.current.get(sessionId)
        if (!intent || intent.kind === 'auto') {
          drainIntentRef.current.set(sessionId, { kind: 'none' })
        }
      }
      drainPromptQueueAfterStream(sessionId)
    }
  }

  const handleSubmit = useCallback((text?: string, attachmentIds?: string[], attachmentMetas?: ChatAttachmentMeta[]) => {
    void submitImplRef.current(text, attachmentIds, attachmentMetas)
  }, [])

  const handlePromptQueueRemove = useCallback((id: string) => {
    const sid = activeIdRef.current
    if (!sid) return
    removeQueuedPrompt(sid, id)
    syncPromptQueueUi(sid)
  }, [syncPromptQueueUi])

  const handlePromptQueueRunNow = useCallback((id: string) => {
    const sid = activeIdRef.current
    if (!sid) return
    const pendingAsk = Boolean(streamCacheRef.current.get(sid)?.pendingUserPrompt)
      || Boolean(streamUiRef.current?.readPendingUserPrompt?.())
    if (pendingAsk) return

    if (!streamingSessionIdsRef.current.has(sid)) {
      const { item } = takeQueuedPromptById(sid, id)
      syncPromptQueueUi(sid)
      if (!item) return
      void submitImplRef.current(item.text || undefined, item.attachmentIds, item.attachmentMetas)
      return
    }

    promoteQueuedPrompt(sid, id)
    syncPromptQueueUi(sid)
    drainIntentRef.current.set(sid, { kind: 'runItem', itemId: id })
    void abortSessionStream(sid)
  }, [abortSessionStream, syncPromptQueueUi])

  const ensureSession = useCallback(async (): Promise<string> => {
    if (activeIdRef.current) return activeIdRef.current
    const { session } = await createSession()
    setActiveId(session.id)
    setActiveSessionMeta(session)
    setSessionModelState(session.model)
    setSessionLlmParamsState(session.llmParams)
    if (session.model?.trim()) setDefaultModel(session.model.trim())
    await refreshSessions()
    return session.id
  }, [refreshSessions])

  const handleStreamError = useCallback((message: string) => {
    setError(message)
  }, [])

  const handleForkFromMessage = useCallback(async (messageIndex: number) => {
    if (!activeId) return
    try {
      const data = await forkSession(activeId, messageIndex)
      const list = await refreshSessions()
      setSessions(list)
      setActiveId(data.session.id)
      setMessages(data.messages)
      setContextRef(data.contextRef ?? null)
      setSessionModelState(data.session.model)
      setSessionLlmParamsState(data.session.llmParams)
      pushComposerDraft('')
      setError('')
      closeDrawer()
      if (view !== 'chat') navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '分叉对话失败')
    }
  }, [activeId, closeDrawer, navigate, pushComposerDraft, refreshSessions, view])

  const handleEditResend = useCallback(async (messageIndex: number, text: string) => {
    const sid = activeIdRef.current
    if (!sid) return

    if (streamingSessionIdsRef.current.has(sid)) {
      setError('正在生成回复，请稍后再编辑')
      return
    }

    const target = messages[messageIndex]
    if (!target || target.role !== 'user') return

    const nextText = text.trim()
    const attachmentIds = (target.attachments ?? []).map(a => a.id)
    const hasAttachments = attachmentIds.length > 0
    if (!nextText && !hasAttachments) return

    const hasFollowing = messageIndex < messages.length - 1
    const textUnchanged = nextText === target.content.trim()
    if (textUnchanged && !hasFollowing) return

    if (hasFollowing) {
      const ok = await confirm({
        title: '重新发送这条消息？',
        message: '重新发送后，这条之后的回复都会被清除，且无法恢复。确定继续？',
        confirmLabel: '重新发送',
        cancelLabel: '取消',
        confirmTone: 'danger',
      })
      if (!ok) return
    }

    try {
      setError('')
      const data = await truncateSession(sid, messageIndex)
      if (activeIdRef.current === sid) {
        setMessages(data.messages)
        setContextRef(data.contextRef ?? null)
        setActiveSessionMeta(data.session)
        setSessionModelState(data.session.model)
        setSessionLlmParamsState(data.session.llmParams)
      }
      void submitImplRef.current(
        nextText || undefined,
        hasAttachments ? attachmentIds : undefined,
        hasAttachments ? target.attachments : undefined,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '重新发送失败，请稍后重试')
    }
  }, [confirm, messages])

  const handleClearContextRef = useCallback(async () => {
    if (!activeId) return
    try {
      await clearSessionContext(activeId)
      setContextRef(null)
      await refreshContextUsage(activeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '移除引用失败')
    }
  }, [activeId, refreshContextUsage])

  const handleQuoteSelection = useCallback(async (selection: MessageSelection) => {
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
      await refreshContextUsage(activeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '设置引用失败')
    }
  }, [activeId, messages, refreshContextUsage])

  const handleFocusStockConsumed = useCallback(() => {
    setFocusStockCode(null)
  }, [])

  const handleStockDiscuss = useCallback(async (payload: StockDiscussPayload) => {
    restoreChatColumn()
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
      pushComposerDraft(payload.prompt)
      setError('')
      await refreshContextUsage(activeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法开始讨论，请稍后重试')
    }
  }, [activeId, pushComposerDraft, refreshContextUsage, restoreChatColumn])

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
      setSessionLlmParamsState(session.llmParams)
      pushComposerDraft('')
      setError('')
      setWelcomeEpoch(epoch => epoch + 1)
      closeDrawer()
      navigate('chat')
      await refreshContextUsage(session.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建对话失败')
    }
  }, [closeDrawer, navigate, pushComposerDraft, refreshContextUsage, refreshSessions, restoreChatColumn])

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
      resolvedSessionModel,
      priorTurns,
    )
    return reply
  }, [activeId, resolvedSessionModel])

  const handleModelChange = useCallback(async (ref: string) => {
    setSessionModelState(ref)
    if (!activeId) {
      setDefaultModel(ref)
      return
    }
    try {
      const res = await setSessionModel(activeId, ref)
      setDefaultModel(ref)
      setSessions(prev => prev.map(sess =>
        sess.id === activeId ? { ...sess, model: ref } : sess,
      ))
      if (res.contextHint?.trim()) {
        setContextHintBanner(res.contextHint.trim())
      }
      await refreshContextUsage(activeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换模型失败')
    }
  }, [activeId, refreshContextUsage])

  const handleLlmParamsChange = useCallback(async (patch: {
    temperature?: number
    maxTokens?: number
    reasoningEffort?: 'low' | 'medium' | 'high' | null
  }) => {
    setSessionLlmParamsState(prev => {
      const next = { ...(prev ?? {}) }
      if (patch.temperature !== undefined) next.temperature = patch.temperature
      if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens
      if (patch.reasoningEffort === null) delete next.reasoningEffort
      else if (patch.reasoningEffort !== undefined) next.reasoningEffort = patch.reasoningEffort
      return next
    })
    if (!activeId) return
    try {
      const res = await setSessionLlmParams(activeId, patch)
      setSessionLlmParamsState(res.session.llmParams)
      setSessions(prev => prev.map(sess =>
        sess.id === activeId ? { ...sess, llmParams: res.session.llmParams } : sess,
      ))
      setActiveSessionMeta(prev => prev && prev.id === activeId
        ? { ...prev, llmParams: res.session.llmParams }
        : prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存模型参数失败')
    }
  }, [activeId])

  const activeSession = activeSessionMeta ?? sessions.find(x => x.id === activeId) ?? null
  const isSettings = view === 'settings'
  const isNews = view === 'news'
  const isMarket = view === 'market'
  const isExperts = view === 'experts'
  const isStandaloneView = isNews || isMarket || isExperts
  const chromeTitle = isNews ? '新闻中心' : isMarket ? '市场动态' : isExperts ? '专家' : (activeSession?.title ?? '新对话')
  const chromeViewMode = isSettings ? 'settings' : isNews ? 'news' : isMarket ? 'market' : isExperts ? 'experts' : 'chat'
  const overlaySidebarOpen = isSettings ? settingsSidebarVisible : sidebarVisible

  useEffect(() => {
    setRolePersonaOpen(false)
    setContextHintBanner('')
  }, [activeId, view])

  useEffect(() => {
    if (!contextHintBanner) return
    const timer = window.setTimeout(() => setContextHintBanner(''), 4200)
    return () => window.clearTimeout(timer)
  }, [contextHintBanner])

  const openRolePersonaDrawer = useCallback(() => {
    setRolePersonaOpen(true)
  }, [])

  const rolePersonaDrawer = (
    <SessionRolePersonaDrawer
      open={rolePersonaOpen && view === 'chat' && !isStandaloneView}
      sessionId={activeId}
      onOpenChange={setRolePersonaOpen}
    />
  )

  /** Electron：挂到 DesktopWindowChrome titleBarTrailing；右侧全宽（无聊天列）时隐藏 */
  const sessionFilesPreviewButton = electronChrome && view === 'chat' && !isStandaloneView && !isMobile && chatVisible ? (
    <ChromeToolButton
      label="文件预览"
      active={mode === 'preview'}
      disabled={!activeId}
      data-session-files-toggle
      onClick={handleToggleSessionFilesPreview}
    >
      <FolderListRegular fontSize={DESKTOP_TOOL_ICON_SIZE} />
    </ChromeToolButton>
  ) : null
  const sidebarSessions = useMemo(() => {
    if (sidebarListTab === 'experts') return sessions.filter(s => !!s.expertId)
    if (sidebarListTab === 'chat') return sessions.filter(s => !s.expertId)
    return sessions
  }, [sessions, sidebarListTab])

  const sessionTitleTools = view === 'chat' && !isStandaloneView ? (
    <ChatSessionTitleTools
      title={activeSession?.title ?? '新对话'}
      sessionId={activeId}
      variant="chrome"
      textClassName="opptrix-desktop-title-text"
      createdAt={activeSession?.createdAt}
      sessionUsageTotal={activeSession?.usageTotals?.totalTokens ?? null}
      onRename={handleRenameSession}
      onArchive={handleArchiveActiveSession}
      onDelete={() => { void handleDeleteActiveSession() }}
      onExport={handleExportSession}
      onOpenSessionDir={handleOpenSessionDir}
      onEditRolePersona={activeId ? openRolePersonaDrawer : undefined}
    />
  ) : null

  const chatTitleSlot = view === 'chat' && !isStandaloneView ? (
    <ChatSessionTitleTools
      title={activeSession?.title ?? '新对话'}
      sessionId={activeId}
      variant="header"
      createdAt={activeSession?.createdAt}
      sessionUsageTotal={activeSession?.usageTotals?.totalTokens ?? null}
      onRename={handleRenameSession}
      onArchive={handleArchiveActiveSession}
      onDelete={() => { void handleDeleteActiveSession() }}
      onExport={handleExportSession}
      onOpenSessionDir={handleOpenSessionDir}
      onEditRolePersona={activeId ? openRolePersonaDrawer : undefined}
    />
  ) : null

  const handleEdgeRevealSidebar = useCallback(() => {
    if (isSettings) {
      setSettingsSidebarVisible(true)
      return
    }
    setSidebarVisible(true)
  }, [isSettings, setSidebarVisible])

  const handleSidebarClose = useCallback(() => {
    setSidebarVisible(false)
  }, [setSidebarVisible])

  const sidebarActiveRoute = isNews ? 'news' as const : isMarket ? 'market' as const : isExperts ? 'experts' as const : 'chat' as const
  const sidebarProps = useMemo(() => ({
    sessions: sidebarSessions,
    activeId,
    activeRoute: sidebarActiveRoute,
    busySessionIds: streamingSessionIds,
    onSelect: handleSelect,
    onNew: handleNew,
    onDelete: handleDelete,
    onArchive: handleArchive,
    onOpenSearch: handleOpenSearch,
    onOpenSettings: openSettings,
    onOpenNewsCenter: openNewsCenter,
    onOpenMarketDynamics: openMarketDynamics,
    onOpenExpertMarket: openExpertMarket,
    listTab: sidebarListTab,
    onListTabChange: handleSidebarListTabChange,
    archivedGroups,
    onCreateArchiveFolder: handleCreateArchiveFolder,
    onRenameArchiveFolder: handleRenameArchiveFolder,
    onDeleteArchiveFolder: handleDeleteArchiveFolder,
    onClearArchiveFolder: handleClearArchiveFolder,
    onDeleteArchivedSession: handleDeleteArchivedSession,
  }), [
    sidebarSessions,
    activeId,
    sidebarActiveRoute,
    streamingSessionIds,
    handleSelect,
    handleNew,
    handleDelete,
    handleArchive,
    handleOpenSearch,
    openSettings,
    openNewsCenter,
    openMarketDynamics,
    openExpertMarket,
    sidebarListTab,
    handleSidebarListTabChange,
    archivedGroups,
    handleCreateArchiveFolder,
    handleRenameArchiveFolder,
    handleDeleteArchiveFolder,
    handleClearArchiveFolder,
    handleDeleteArchivedSession,
  ])

  return (
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
          titleBarTrailing={sessionFilesPreviewButton ?? undefined}
          viewMode={chromeViewMode}
          sidebarOpen={isSettings ? settingsSidebarVisible : sidebarVisible}
          sidebarInline={isSettings
            ? settingsSidebarInlineVisible
            : sidebarInlineVisible}
          sidebarWidth={isSettings ? settingsSidebarWidth : sidebarWidth}
          sidebarDragging={isSettings ? settingsSidebarDragging : sidebarDragging}
          showSidebarToggle={!isSettings || sidebarOverlayMode}
          sidebarHoverReveal={sidebarOverlayMode}
          onRevealSidebar={handleEdgeRevealSidebar}
          canGoBack={isSettings || canGoBack}
          canGoForward={!isSettings && canGoForward}
          onToggleSidebar={handleToggleSidebar}
          onNewChat={handleNew}
          onOpenSearch={!isSettings ? handleOpenSearch : undefined}
          onGoBack={!isSettings ? handleChromeGoBack : undefined}
          onGoForward={!isSettings ? goForward : undefined}
          rightPanelOpen={view === 'chat' && !isMobile ? rightPanelVisible : undefined}
          rightPanelWidth={view === 'chat' && !isMobile && rightPanelVisible ? rightPanelWidth : undefined}
          rightPanelDragging={view === 'chat' && !isMobile ? isDragging : undefined}
          chatColumnWidth={view === 'chat' && !isMobile && chatVisible && showSplitter ? chatWidth : undefined}
          chatAreaLeft={isSettings
            ? (settingsSidebarInlineVisible ? settingsSidebarWidth : 0)
            : (sidebarInlineVisible ? sidebarWidth : 0)}
          chatColumnVisible={view === 'chat' && !isMobile ? chatVisible : undefined}
          onToggleRightPanel={view === 'chat' && !isMobile ? handleToggleRightPanel : undefined}
          onToggleChatColumn={view === 'chat' && !isMobile && canToggleChatColumn ? handleToggleChatColumn : undefined}
        />
      )}
      <div className={mergeClasses(
        s.root,
        electronChrome && s.rootElectron,
        electronChrome && electronPlatform() !== 'darwin' && s.rootElectronFrameTitlebar,
        electronChrome && 'opptrix-app-shell',
      )}>
        <div className={s.rootLayout}>
        {!isMobile && !isSettings && (
          <>
            <SessionSidebar
              mode={sidebarOverlayMode ? 'overlay' : 'panel'}
              width={sidebarWidth}
              isDragging={sidebarDragging}
              visible={sidebarVisible}
              onClose={handleSidebarClose}
              {...sidebarProps}
            />
            {sidebarInlineVisible && (
              <WorkspaceSplitDivider
                electronChrome={electronChrome}
                isDragging={sidebarDragging}
                onBeginDrag={beginSidebarDrag}
                ariaLabel="调整侧栏宽度"
              />
            )}
          </>
        )}

        {isSettings && (
          <div className={mergeClasses(s.settingsHost, electronChrome && 'opptrix-settings-host')}>
            <SettingsPage
              isMobile={isMobile}
              sidebarVisible={settingsSidebarVisible}
              onSidebarClose={() => setSettingsSidebarVisible(false)}
              onBack={handleExitSettings}
              initialSection={settingsInitialSection}
              chromeToolbarReserve={electronChrome ? desktopChromeToolbarReserve(macFullscreen) : 0}
              sidebarWidth={settingsSidebarWidth}
              sidebarDragging={settingsSidebarDragging}
              onBeginSidebarDrag={beginSettingsSidebarDrag}
              onSaved={async () => {
                await refreshHealth()
              }}
            />
          </div>
        )}

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
                width={sidebarWidth}
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
                chromeToolbarReserve={chromeToolbarReserve}
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
                width={sidebarWidth}
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
              <MarketDynamicsPage
                electronChrome={electronChrome}
                chromeToolbarReserve={chromeToolbarReserve}
              />
            </div>
          </div>
        )}

        {expertMarketMounted && (
          <div
            className={mergeClasses(
              s.contentWorkspace,
              isMobile && s.contentWorkspaceMobile,
              electronChrome && s.contentWorkspaceElectron,
              electronChrome && 'opptrix-app-main',
              !isExperts && s.viewHidden,
            )}
            aria-hidden={!isExperts}
          >
            {isMobile && isExperts && (
              <SessionSidebar
                mode="drawer"
                width={sidebarWidth}
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
              <ExpertMarketPage
                electronChrome={electronChrome}
                chromeToolbarReserve={chromeToolbarReserve}
                onSelectExpert={handleSelectExpert}
                onExpertSaved={() => setExpertRefreshKey(k => k + 1)}
              />
            </div>
          </div>
        )}

        <div
          ref={workspaceRef}
          className={mergeClasses(
            s.contentWorkspace,
            isMobile && s.contentWorkspaceMobile,
            electronChrome && s.contentWorkspaceElectron,
            electronChrome && 'opptrix-app-main',
            (isSettings || isStandaloneView) && s.viewHidden,
          )}
          aria-hidden={isSettings || isStandaloneView}
        >
          {isMobile && !isStandaloneView && !isSettings && (
            <SessionSidebar
              mode="drawer"
              width={sidebarWidth}
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
              style={!isMobile ? (
                isDragging && showSplitter
                  ? {
                      flex: '0 0 auto',
                      width: chatWidth,
                      minWidth: chatWidth,
                    }
                  : {
                      // Stay flexible while the right panel width animates so the panel
                      // grows/shrinks from the window's right edge (not into a pre-reserved gap).
                      flex: 1,
                      width: undefined,
                      minWidth: showSplitter ? WORKSPACE_CHAT_MIN_WIDTH : 0,
                    }
              ) : undefined}
            >
              {electronChrome && (
                <div className={mergeClasses(s.chatTitleBar, 'opptrix-chat-title-bar')} aria-hidden />
              )}
              <div className={mergeClasses(s.chatPanel, electronChrome && 'opptrix-chat-panel')}>
                <ChatView
                  title={activeSession?.title ?? '新对话'}
                  titleSlot={electronChrome ? undefined : chatTitleSlot}
                  overlaySlot={rolePersonaDrawer}
                  contextHint={contextHintBanner}
                  sessionId={activeId}
                  expertId={activeSession?.expertId ?? null}
                  expertRefreshKey={expertRefreshKey}
                  welcomeEpoch={welcomeEpoch}
                  chatScrollEpoch={chatScrollEpoch}
                  messages={messages}
                  contextRef={contextRef}
                  composerDraft={composerDraft}
                  loading={loading}
                  wakeWaiting={wakeWaiting}
                  streamUiRef={streamUiRef}
                  error={error}
                  availableModels={availableModels}
                  sessionModel={resolvedSessionModel}
                  sessionLlmParams={sessionLlmParams}
                  contextUsage={contextUsage}
                  isMobile={isMobile}
                  llmLabel={llmLabel}
                  backendOk={backendOk}
                  onSubmit={handleSubmit}
                  ensureSession={ensureSession}
                  onStop={handleStop}
                  promptQueue={promptQueue}
                  onPromptQueueRemove={handlePromptQueueRemove}
                  onPromptQueueRunNow={handlePromptQueueRunNow}
                  backgroundJobs={sessionBackgroundJobs}
                  onForkMessage={handleForkFromMessage}
                  onEditResend={handleEditResend}
                  onQuoteSelection={activeId ? handleQuoteSelection : undefined}
                  onEphemeralAsk={activeId ? handleEphemeralAsk : undefined}
                  onClearContextRef={contextRef ? handleClearContextRef : undefined}
                  onModelChange={availableModels.length ? handleModelChange : undefined}
                  onLlmParamsChange={availableModels.length ? handleLlmParamsChange : undefined}
                  onOpenSidebar={openDrawer}
                  onNewChat={handleNew}
                  onOpenSettings={openSettings}
                  rightPanelOpen={rightPanelVisible}
                  chatColumnVisible={chatVisible}
                  onToggleRightPanel={!isMobile ? handleToggleRightPanel : undefined}
                  onToggleChatColumn={!isMobile && canToggleChatColumn ? handleToggleChatColumn : undefined}
                  onOpenFilePreview={!isMobile ? handleOpenFilePreview : undefined}
                  onStreamError={handleStreamError}
                  resolveStreamSnapshot={resolveStreamSnapshot}
                  onClearPendingUserPrompt={clearPendingUserPrompt}
                  sessionFilesPreviewOpen={!isMobile && mode === 'preview'}
                  onToggleSessionFilesPreview={!isMobile ? handleToggleSessionFilesPreview : undefined}
                />
              </div>
            </div>
          )}

          {!isMobile && showSplitter && (
            <WorkspaceSplitDivider
              electronChrome={electronChrome}
              extendIntoSecondaryChrome={electronChrome}
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
              onFocusStockConsumed={handleFocusStockConsumed}
              onToggleRightPanel={handleToggleRightPanel}
              onToggleChatColumn={canToggleChatColumn ? handleToggleChatColumn : undefined}
              onDiscussInChat={handleStockDiscuss}
              previewMode={mode === 'preview'}
              preview={preview}
              previewSessionId={activeId}
              onSelectAttachment={handleSelectPreviewAttachment}
              onClosePreview={handleClosePreview}
              onSlideTransitionEnd={handlePeerSlideTransitionEnd}
            />
          )}
        </div>

        </div>
      </div>
    </>
  )
}
