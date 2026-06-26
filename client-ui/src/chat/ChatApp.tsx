import { useState, useEffect, useCallback } from 'react'
import { makeStyles } from '@fluentui/react-components'
import SessionSidebar from './SessionSidebar'
import ChatView from './ChatView'
import SettingsPage from '../pages/SettingsPage'
import {
  listSessions, createSession, getSession, deleteSession,
  sendSessionChat, listSkills, getHealth, listAvailableModels, setSessionModel,
} from '../api/client'
import type { ChatDisplayMessage, SessionMeta, SkillCategory, AvailableModel } from '../types/chat'
import { innoTokens } from '../theme/tokens'
import { useBreakpoint, useSidebarPreference } from '../hooks/useBreakpoint'

type AppView = 'chat' | 'settings'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    height: '100dvh',
    backgroundColor: innoTokens.canvas,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    transitionProperty: 'margin',
    transitionDuration: '220ms',
    transitionTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
  },
})

export default function ChatApp() {
  const s = useStyles()
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const {
    visible: sidebarVisible,
    drawerOpen,
    toggleVisible,
    openDrawer,
    closeDrawer,
  } = useSidebarPreference(isMobile)

  const [view, setView] = useState<AppView>('chat')
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
    setView('settings')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建对话失败')
    }
  }

  const handleSelect = async (id: string) => {
    if (id === activeId) return
    try {
      await loadSession(id)
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
      setSessions(prev => prev.map(s =>
        s.id === activeId ? { ...s, model: ref } : s,
      ))
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换模型失败')
    }
  }

  const activeSession = sessions.find(x => x.id === activeId)

  if (view === 'settings') {
    return (
      <SettingsPage
        onBack={() => setView('chat')}
        onSaved={async () => {
          await refreshHealth()
        }}
      />
    )
  }

  const sidebarProps = {
    sessions,
    activeId,
    llmLabel,
    backendOk,
    onSelect: handleSelect,
    onNew: handleNew,
    onDelete: handleDelete,
    onOpenSettings: openSettings,
  }

  return (
    <div className={s.root}>
      {!isMobile && (
        <SessionSidebar mode="panel" visible={sidebarVisible} {...sidebarProps} />
      )}

      <div className={s.main}>
        {isMobile && (
          <SessionSidebar
            mode="drawer"
            drawerOpen={drawerOpen}
            onClose={closeDrawer}
            {...sidebarProps}
          />
        )}

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
          sidebarVisible={sidebarVisible}
          llmLabel={llmLabel}
          backendOk={backendOk}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          onModelChange={availableModels.length ? handleModelChange : undefined}
          onOpenSidebar={openDrawer}
          onNewChat={handleNew}
          onOpenSettings={openSettings}
          onToggleSidebar={toggleVisible}
        />
      </div>
    </div>
  )
}
