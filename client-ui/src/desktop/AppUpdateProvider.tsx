import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isElectron, type AppUpdateStatus } from '../platform/detect'

const IDLE_STATUS: AppUpdateStatus = { state: 'idle' }

export interface AppUpdateContextValue {
  status: AppUpdateStatus
  checkNow: () => Promise<void>
  installUpdate: () => Promise<boolean>
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null)

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppUpdateStatus>(IDLE_STATUS)

  useEffect(() => {
    if (!isElectron()) return
    const api = window.electronAPI
    if (!api?.onAppUpdateStatus) return

    void api.appUpdateGetStatus?.().then(res => {
      if (res) setStatus(res)
    }).catch(() => {})

    return api.onAppUpdateStatus(next => setStatus(next))
  }, [])

  const checkNow = useCallback(async () => {
    if (!isElectron()) return
    setStatus(prev => ({
      ...prev,
      state: 'checking',
      message: '正在检查更新…',
    }))
    try {
      const res = await window.electronAPI?.appUpdateCheck?.()
      if (res) setStatus(res)
    } catch {
      setStatus({
        state: 'error',
        message: '无法连接更新服务器',
      })
    }
  }, [])

  const installUpdate = useCallback(async () => {
    if (!isElectron()) return false
    return Boolean(await window.electronAPI?.appUpdateInstall?.())
  }, [])

  const value = useMemo<AppUpdateContextValue>(
    () => ({ status, checkNow, installUpdate }),
    [status, checkNow, installUpdate],
  )

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
    </AppUpdateContext.Provider>
  )
}

export function useAppUpdate(): AppUpdateContextValue {
  const ctx = useContext(AppUpdateContext)
  if (!ctx) {
    throw new Error('useAppUpdate must be used within AppUpdateProvider')
  }
  return ctx
}
