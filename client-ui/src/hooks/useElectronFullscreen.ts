import { useEffect, useState } from 'react'
import { electronPlatform, isElectron } from '../platform/detect'

/** macOS native fullscreen — traffic lights move to the top bar; toolbar inset shrinks. */
export function useElectronFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!isElectron() || electronPlatform() !== 'darwin') return undefined
    const api = window.electronAPI
    if (!api?.getIsFullscreen || !api.onFullscreenChange) return undefined

    let cancelled = false
    void api.getIsFullscreen().then(value => {
      if (!cancelled) setFullscreen(value)
    })

    const unsubscribe = api.onFullscreenChange(value => {
      setFullscreen(value)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return fullscreen
}
