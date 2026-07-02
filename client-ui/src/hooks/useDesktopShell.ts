import { useEffect } from 'react'
import type { SettingsSection } from '../pages/settings/SettingsSidebar'
import { setNewsFeedSelectedId } from '../pages/news/newsFeedSession'
import { isElectron } from '../platform/detect'
import type { OpptrixProtocolPayload } from '../platform/detect'

type DesktopProtocolHandlers = {
  openChat: (sessionId?: string) => void | Promise<void>
  openSettings: (section?: SettingsSection) => void
  openNews: (articleId?: string) => void
}

function resolveProtocolAction(payload: OpptrixProtocolPayload) {
  const route = (payload.route || payload.host || '').replace(/^\/+/, '').toLowerCase()
  const params = payload.params ?? {}

  if (route === 'settings' || route === 'open/settings') {
    const section = params.section as SettingsSection | undefined
    return { type: 'settings' as const, section }
  }

  if (route === 'news' || route === 'open/news') {
    return { type: 'news' as const, articleId: params.article ?? params.id }
  }

  if (route === 'chat' || route === 'open/chat' || route === 'open') {
    return { type: 'chat' as const, sessionId: params.session ?? params.id }
  }

  if (params.session || params.id) {
    return { type: 'chat' as const, sessionId: params.session ?? params.id }
  }

  return null
}

export function useDesktopShell(handlers: DesktopProtocolHandlers) {
  useEffect(() => {
    if (!isElectron()) return
    void window.electronAPI?.notificationRequestPermission?.()
  }, [])

  useEffect(() => {
    if (!isElectron()) return

    const unsubscribe = window.electronAPI?.onProtocolOpen?.((payload) => {
      const action = resolveProtocolAction(payload)
      if (!action) return

      if (action.type === 'settings') {
        handlers.openSettings(action.section)
        return
      }

      if (action.type === 'news') {
        if (action.articleId) setNewsFeedSelectedId(action.articleId)
        handlers.openNews(action.articleId)
        return
      }

      void handlers.openChat(action.sessionId)
    })

    return () => unsubscribe?.()
  }, [handlers])
}
