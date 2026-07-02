import { useCallback, useEffect, useState } from 'react'
import { isElectron, type AppUpdateStatus } from '../platform/detect'

const IDLE_STATUS: AppUpdateStatus = { state: 'idle' }

export function useAppUpdate() {
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
    const res = await window.electronAPI?.appUpdateCheck?.()
    if (res) setStatus(res)
  }, [])

  const installUpdate = useCallback(async () => {
    if (!isElectron()) return false
    return Boolean(await window.electronAPI?.appUpdateInstall?.())
  }, [])

  return { status, checkNow, installUpdate }
}
