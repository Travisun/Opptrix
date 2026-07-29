import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isElectron, type AppUpdateStatus } from '../platform/detect'
import UpdateManualInstallDialog, {
  hasShownManualInstallHelp,
  markManualInstallHelpShown,
} from './UpdateManualInstallDialog'

const IDLE_STATUS: AppUpdateStatus = { state: 'idle' }

export interface AppUpdateContextValue {
  status: AppUpdateStatus
  checkNow: () => Promise<void>
  installUpdate: () => Promise<boolean>
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null)

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppUpdateStatus>(IDLE_STATUS)
  const [manualHelpOpen, setManualHelpOpen] = useState(false)
  const openedHelpKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isElectron()) return
    const api = window.electronAPI
    if (!api?.onAppUpdateStatus) return

    void api.appUpdateGetStatus?.().then(res => {
      if (res) setStatus(res)
    }).catch(() => {})

    return api.onAppUpdateStatus(next => setStatus(next))
  }, [])

  useEffect(() => {
    if (!status.manual_install_help) return
    const key = status.version?.trim() || 'unknown'
    if (openedHelpKeyRef.current === key) return
    if (hasShownManualInstallHelp(status.version)) return
    openedHelpKeyRef.current = key
    markManualInstallHelpShown(status.version)
    setManualHelpOpen(true)
  }, [status.manual_install_help, status.version])

  const checkNow = useCallback(async () => {
    if (!isElectron()) return
    setStatus(prev => ({
      ...prev,
      state: 'checking',
      message: '正在检查更新…',
      manual_install_help: false,
    }))
    try {
      const res = await window.electronAPI?.appUpdateCheck?.()
      if (res) setStatus(res)
    } catch {
      setStatus({
        state: 'error',
        message: '无法连接更新服务器',
        manual_install_help: false,
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
      <UpdateManualInstallDialog
        open={manualHelpOpen}
        onClose={() => setManualHelpOpen(false)}
      />
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
