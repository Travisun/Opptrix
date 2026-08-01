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
  /** 是否自动下载更新包；缺省 false */
  autoDownload: boolean
  checkNow: () => Promise<void>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => Promise<boolean>
  setAutoDownload: (enabled: boolean) => Promise<void>
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null)

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppUpdateStatus>(IDLE_STATUS)
  const [autoDownload, setAutoDownloadState] = useState(false)
  const [manualHelpOpen, setManualHelpOpen] = useState(false)
  const openedHelpKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isElectron()) return
    const api = window.electronAPI
    if (!api?.onAppUpdateStatus) return

    void api.appUpdateGetStatus?.().then(res => {
      if (res) setStatus(res)
    }).catch(() => {})

    void api.appUpdateGetAutoDownload?.().then(value => {
      if (typeof value === 'boolean') setAutoDownloadState(value)
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

  const downloadUpdate = useCallback(async () => {
    if (!isElectron()) return false
    return Boolean(await window.electronAPI?.appUpdateDownload?.())
  }, [])

  const installUpdate = useCallback(async () => {
    if (!isElectron()) return false
    return Boolean(await window.electronAPI?.appUpdateInstall?.())
  }, [])

  const setAutoDownload = useCallback(async (enabled: boolean) => {
    if (!isElectron()) {
      setAutoDownloadState(enabled)
      return
    }
    try {
      const next = await window.electronAPI?.appUpdateSetAutoDownload?.(enabled)
      setAutoDownloadState(typeof next === 'boolean' ? next : enabled)
    } catch {
      setAutoDownloadState(enabled)
    }
  }, [])

  const value = useMemo<AppUpdateContextValue>(
    () => ({
      status,
      autoDownload,
      checkNow,
      downloadUpdate,
      installUpdate,
      setAutoDownload,
    }),
    [status, autoDownload, checkNow, downloadUpdate, installUpdate, setAutoDownload],
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
