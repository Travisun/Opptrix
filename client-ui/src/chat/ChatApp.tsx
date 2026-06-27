import { useState, useEffect, useCallback } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import SessionSidebar from './SessionSidebar'
import ChatView from './ChatView'
import SettingsPage from '../pages/SettingsPage'
import {
  listSessions, createSession, getSession, deleteSession,
  sendSessionChat, listSkills, getHealth, listAvailableModels, setSessionModel,
} from '../api/client'
import type { ChatDisplayMessage, SessionMeta, SkillCategory, AvailableModel } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { useBreakpoint, useSidebarPreference, useSidebarOverlayMode, useSidebarResizeSync } from '../hooks/useBreakpoint'
import { useAppNavigation } from '../hooks/useAppNavigation'
import DesktopWindowChrome from '../desktop/DesktopWindowChrome'
import OverlaySidebarEdgeTrigger from '../desktop/OverlaySidebarEdgeTrigger'
import { isElectron } from '../platform/detect'
import { DESKTOP_SIDEBAR_EXPAND_THRESHOLD, DESKTOP_SIDEBAR_LAYOUT_MS, DESKTOP_SIDEBAR_LAYOUT_EASE, DESKTOP_TITLEBAR_HEIGHT, DESKTOP_Z_TITLE } from '../desktop/constants'

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
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    transitionProperty: 'margin, padding',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  mainChatElectron: {
    paddingTop: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    paddingBottom: innoTokens.windowInset,
    paddingRight: 0,
    paddingLeft: 0,
    backgroundColor: innoTokens.canvas,
  },
  chatPanel: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: innoTokens.canvas,
    borderRadius: 0,
    overflow: 'hidden',
  },
  chatHeaderHairline: {
    position: 'fixed',
    top: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    right: 0,
    height: 0,
    borderBottom: `1px solid ${innoTokens.separatorStrong}`,
    zIndex: DESKTOP_Z_TITLE,
    pointerEvents: 'none',
    transitionProperty: 'left',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
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
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [skills, setSkills] = useState<SkillCategory[]>([])
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [sessionModel, setSessionModelState] = useState<string | undefined>()
  const [llmLabel, setLlmLabel] = useState('连接中…')
  const [backendOk, setBackendOk] = useState(false)

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
      const assistant: ChatDisplayMessage = {
        role: 'assistant',
        content: result.reply,
        toolsUsed: result.tools_used,
        at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistant])
      if (result.session_id && result.session_id !== sessionId) {
        setActiveId(result.session_id)
      }
      const list = await refreshSessions()
      setSessions(list)
    } catch (e) {
      setMessages(prev => prev.slice(0, -1))
      setInput(msg)
      setError(e instanceof Error ? e.message : '发送失败')
    } finally {
      setLoading(false)
    }
  }

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
  const electronChrome = isElectron() && !isMobile
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
        />
      )}
      {electronChrome && !isSettings && (
        <div
          className={s.chatHeaderHairline}
          style={{ left: sidebarInlineVisible ? `${innoTokens.sidebarWidthPx}px` : 0 }}
          aria-hidden
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
          <div className={mergeClasses(s.main, electronChrome && s.mainChatElectron, electronChrome && 'inno-app-main')}>
            {isMobile && (
              <SessionSidebar
                mode="drawer"
                drawerOpen={drawerOpen}
                onClose={closeDrawer}
                {...sidebarProps}
              />
            )}

            <div className={mergeClasses(electronChrome && s.chatPanel, electronChrome && 'inno-chat-panel')}>
              <ChatView
                title={activeSession?.title ?? '新对话'}
                messages={messages}
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
                onModelChange={availableModels.length ? handleModelChange : undefined}
                onOpenSidebar={openDrawer}
                onNewChat={handleNew}
                onOpenSettings={openSettings}
              />
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  )
}
