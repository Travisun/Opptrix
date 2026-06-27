import { useState, useEffect, useCallback } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import SessionSidebar from './SessionSidebar'
import ChatView from './ChatView'
import SettingsPage from '../pages/SettingsPage'
import RightPanel from './RightPanel'
import WorkspaceSplitDivider from './WorkspaceSplitDivider'
import {
  listSessions, createSession, getSession, deleteSession, forkSession, clearSessionContext,
  setSessionContext, ephemeralAsk,
  sendSessionChat, listSkills, getHealth, listAvailableModels, setSessionModel,
} from '../api/client'
import type {
  ChatDisplayMessage, EphemeralAskTurn, MessageSelection, SessionContextRef, SessionSelectionContextRef,
  SessionMeta, SkillCategory, AvailableModel,
} from '../types/chat'
import { previewSelectionText } from '../utils/formatContextRefPreview'
import { innoTokens } from '../theme/tokens'
import { useBreakpoint, useSidebarPreference, useSidebarOverlayMode, useSidebarResizeSync } from '../hooks/useBreakpoint'
import { useWorkspaceSplit } from '../hooks/useWorkspaceSplit'
import { useAppNavigation } from '../hooks/useAppNavigation'
import DesktopWindowChrome from '../desktop/DesktopWindowChrome'
import OverlaySidebarEdgeTrigger from '../desktop/OverlaySidebarEdgeTrigger'
import { isElectron } from '../platform/detect'
import { DESKTOP_SIDEBAR_EXPAND_THRESHOLD, DESKTOP_SIDEBAR_LAYOUT_MS, DESKTOP_SIDEBAR_LAYOUT_EASE, DESKTOP_TITLEBAR_HEIGHT } from '../desktop/constants'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    height: '100dvh',
    backgroundColor: innoTokens.canvas,
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
    backgroundColor: innoTokens.canvas,
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
    boxSizing: 'border-box',
  },
  /** Occupies the title-bar band; title text renders in DesktopWindowChrome over this slot */
  chatTitleBar: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    backgroundColor: innoTokens.canvas,
    borderBottom: `1px solid ${innoTokens.separatorStrong}`,
    position: 'relative',
    zIndex: 2,
  },
  chatPanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: innoTokens.canvas,
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
})

export default function ChatApp() {
  const s = useStyles()
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

  const collapseSidebars = useCallback(() => {
    setSidebarVisible(false)
    setSettingsSidebarVisible(false)
  }, [setSidebarVisible])

  const expandSidebars = useCallback(() => {
    setSidebarVisible(true)
    setSettingsSidebarVisible(true)
  }, [setSidebarVisible])

  useSidebarResizeSync(!isMobile, collapseSidebars, expandSidebars)

  const {
    current: view,
    canGoBack,
    canGoForward,
    navigate,
    goBack,
    goForward,
  } = useAppNavigation('chat')

  const handleToggleSidebar = useCallback(() => {
    if (view === 'settings') {
      setSettingsSidebarVisible(prev => !prev)
      return
    }
    toggleVisible()
  }, [view, toggleVisible])

  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatDisplayMessage[]>([])
  const [contextRef, setContextRef] = useState<SessionContextRef | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [skills, setSkills] = useState<SkillCategory[]>([])
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [sessionModel, setSessionModelState] = useState<string | undefined>()
  const [llmLabel, setLlmLabel] = useState('连接中…')
  const [backendOk, setBackendOk] = useState(false)

  const electronChrome = isElectron() && !isMobile
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
    toggleRightPanel: handleToggleRightPanel,
    toggleChatColumn: handleToggleChatColumn,
  } = useWorkspaceSplit({ enabled: splitEnabled })

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

  const loadSession = useCallback(async (id: string) => {
    const data = await getSession(id)
    setActiveId(id)
    setMessages(data.messages)
    setContextRef(data.contextRef ?? null)
    setSessionModelState(data.session.model)
    setError('')
  }, [])

  useEffect(() => {
    let cancelled = false

    refreshHealth().catch(() => {})

    Promise.all([
      refreshSessions(),
      listSkills().catch(() => ({ categories: [] as SkillCategory[] })),
    ])
      .then(async ([list, skillData]) => {
        if (cancelled) return
        setSkills(skillData.categories)
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

  const openSettings = () => {
    closeDrawer()
    navigate('settings')
  }

  const handleNew = async () => {
    try {
      const { session } = await createSession()
      const list = await refreshSessions()
      setSessions(list)
      setActiveId(session.id)
      setMessages([])
      setContextRef(null)
      setSessionModelState(undefined)
      setInput('')
      setError('')
      closeDrawer()
      if (view !== 'chat') navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建对话失败')
    }
  }

  const handleSelect = async (id: string) => {
    if (id === activeId) return
    try {
      await loadSession(id)
      if (view !== 'chat') navigate('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载对话失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此对话？')) return
    try {
      await deleteSession(id)
      const list = await refreshSessions()
      if (activeId === id) {
        if (list.length > 0) {
          await loadSession(list[0].id)
        } else {
          setActiveId(null)
          setMessages([])
          setContextRef(null)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

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
    setError('')

    const optimistic: ChatDisplayMessage = {
      role: 'user',
      content: msg,
      at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const result = await sendSessionChat(sessionId, msg, sessionModel)
      const sid = result.session_id && result.session_id !== sessionId ? result.session_id : sessionId
      if (result.session_id && result.session_id !== sessionId) {
        setActiveId(result.session_id)
      }
      const fresh = await getSession(sid)
      setMessages(fresh.messages)
      setContextRef(fresh.contextRef ?? null)
      setSessionModelState(fresh.session.model)
      const list = await refreshSessions()
      setSessions(list)
    } catch (e) {
      setInput(msg)
      setError(e instanceof Error ? e.message : '发送失败')
      try {
        const fresh = await getSession(sessionId)
        setMessages(fresh.messages)
        setContextRef(fresh.contextRef ?? null)
      } catch {
        setMessages(prev => prev.slice(0, -1))
      }
    } finally {
      setLoading(false)
    }
  }

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

  const activeSession = sessions.find(x => x.id === activeId)
  const isSettings = view === 'settings'
  const chromeTitle = activeSession?.title ?? '新对话'
  const overlaySidebarOpen = isSettings ? settingsSidebarVisible : sidebarVisible

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
    onSelect: handleSelect,
    onNew: handleNew,
    onDelete: handleDelete,
    onOpenSettings: openSettings,
  }

  return (
    <>
      {electronChrome && sidebarOverlayMode && !overlaySidebarOpen && (
        <OverlaySidebarEdgeTrigger
          enabled
          onReveal={handleEdgeRevealSidebar}
        />
      )}
      {electronChrome && (
        <DesktopWindowChrome
          title={chromeTitle}
          viewMode={isSettings ? 'settings' : 'chat'}
          sidebarOpen={isSettings ? settingsSidebarVisible : sidebarVisible}
          sidebarInline={isSettings
            ? settingsSidebarVisible && !sidebarOverlayMode
            : sidebarInlineVisible}
          showSidebarToggle={!isSettings || sidebarOverlayMode}
          sidebarHoverReveal={sidebarOverlayMode}
          onRevealSidebar={handleEdgeRevealSidebar}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onToggleSidebar={handleToggleSidebar}
          onNewChat={handleNew}
          onGoBack={goBack}
          onGoForward={goForward}
          rightPanelOpen={!isSettings ? rightPanelVisible : undefined}
          chatColumnVisible={!isSettings ? chatVisible : undefined}
          onToggleRightPanel={!isSettings && !isMobile ? handleToggleRightPanel : undefined}
          onToggleChatColumn={!isSettings && !isMobile && canToggleChatColumn ? handleToggleChatColumn : undefined}
        />
      )}
      <div className={mergeClasses(s.root, electronChrome && s.rootElectron, electronChrome && 'inno-app-shell')}>
        <div className={s.rootLayout}>
        {view === 'chat' && !isMobile && (
          <SessionSidebar
            mode={sidebarOverlayMode ? 'overlay' : 'panel'}
            visible={sidebarVisible}
            onClose={() => setSidebarVisible(false)}
            {...sidebarProps}
          />
        )}

        {isSettings ? (
          <div className={mergeClasses(s.settingsHost, electronChrome && 'inno-settings-host')}>
            <SettingsPage
              isMobile={isMobile}
              sidebarVisible={settingsSidebarVisible}
              onSidebarClose={() => setSettingsSidebarVisible(false)}
              onBack={goBack}
              onSaved={async () => {
                await refreshHealth()
              }}
            />
          </div>
        ) : (
          <div
            ref={workspaceRef}
            className={mergeClasses(
              s.contentWorkspace,
              isMobile && s.contentWorkspaceMobile,
              electronChrome && s.contentWorkspaceElectron,
              electronChrome && 'inno-app-main',
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
                  <div className={mergeClasses(s.chatTitleBar, 'inno-chat-title-bar')} aria-hidden />
                )}
                <div className={mergeClasses(s.chatPanel, electronChrome && 'inno-chat-panel')}>
                  <ChatView
                    title={activeSession?.title ?? '新对话'}
                    sessionId={activeId}
                    messages={messages}
                    contextRef={contextRef}
                    input={input}
                    loading={loading}
                    error={error}
                    skills={skills}
                    availableModels={availableModels}
                    sessionModel={sessionModel}
                    isMobile={isMobile}
                    llmLabel={llmLabel}
                    backendOk={backendOk}
                    onInputChange={setInput}
                    onSubmit={handleSubmit}
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
              />
            )}
          </div>
        )}

        </div>
      </div>
    </>
  )
}
