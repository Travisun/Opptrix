declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
      platform?: NodeJS.Platform
      windowMinimize?: () => void
      windowMaximize?: () => void
      windowClose?: () => void
      getIsFullscreen?: () => Promise<boolean>
      pickExportDirectory?: () => Promise<string | null>
      writeBinaryFile?: (payload: {
        dirPath: string
        filename: string
        data: ArrayBuffer
      }) => Promise<string>
      openExternalUrl?: (url: string) => Promise<boolean>
      clientVersion?: () => Promise<string>
      onFullscreenChange?: (callback: (fullscreen: boolean) => void) => () => void
    }
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}

export function isElectron(): boolean {
  if (typeof window === 'undefined') return false
  return window.electronAPI?.isElectron === true
}

export function electronPlatform(): NodeJS.Platform | undefined {
  return window.electronAPI?.platform
}

/** Desktop shell (Electron) or explicit Vite flag */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false
  return isElectron() || import.meta.env.VITE_DESKTOP === '1'
}

export function isDesktopRuntime(): boolean {
  return isDesktopApp()
}

export function useElectronChrome(): boolean {
  return isElectron()
}
