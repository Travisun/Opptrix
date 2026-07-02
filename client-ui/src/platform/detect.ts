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
      translationGetStatus?: () => Promise<TranslationEngineStatus>
      translationGetModels?: () => Promise<TranslationModelsResult>
      translationGetDownloadDir?: () => Promise<string>
      translationOpenDownloadDir?: () => Promise<string>
      translationStartDownload?: (modelId: string) => Promise<{ filePath: string; filename: string }>
      translationCancelDownload?: () => Promise<boolean>
      translationTranslateArticle?: (payload: TranslationArticleRequest) => Promise<TranslationArticleResult>
      onTranslationDownloadProgress?: (callback: (progress: TranslationDownloadProgress) => void) => () => void
      onTranslationProgress?: (callback: (progress: TranslationProgress) => void) => () => void
      onFullscreenChange?: (callback: (fullscreen: boolean) => void) => () => void
    }
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}

export type TranslationServiceMode = 'offline' | 'remote'

export type TranslationDownloadProgress = {
  modelId: string
  filename: string
  receivedBytes: number
  totalBytes: number
  status: 'downloading' | 'completed' | 'error'
  filePath?: string
  error?: string
  source?: string
  sourceLabel?: string
}

export type TranslationModelCatalogItem = {
  id: string
  name: string
  filename: string
  sizeBytes: number
  sizeLabel: string
  family: string
  purpose?: 'translation' | 'vision'
  purposeLabel?: string
  recommended?: boolean
  installed: boolean
  downloadSource?: string
}

export type TranslationInstalledModel = {
  filename: string
  path: string
  sizeLabel: string
}

export type TranslationModelsResult = {
  catalog: TranslationModelCatalogItem[]
  installed: TranslationInstalledModel[]
  defaultDownloadSource?: string
  downloadDir?: string
}

export type TranslationEngineStatus = {
  supported: boolean
  modelFound: boolean
  modelPath: string | null
  modelName: string | null
  modelFamily?: string | null
  ready: boolean
  loading?: boolean
  lastError: string | null
  serviceMode?: TranslationServiceMode
  offlineModel?: string
  remoteConfigured?: boolean
  localAvailable?: boolean
  canTranslate?: boolean
  downloading?: boolean
  download?: TranslationDownloadProgress | null
  downloadDir?: string
}

export type TranslationSegment = {
  id: string
  text: string
  kind?: 'text' | 'html'
}

export type TranslationArticleRequest = {
  articleId: string
  title: string
  bodyText?: string
  segments?: TranslationSegment[]
  targetLang?: string
}

export type TranslationArticleResult = {
  title: string
  body?: string
  segments?: TranslationSegment[]
  fromCache?: boolean
  skipped?: boolean
  message?: string
  engine?: 'offline' | 'remote'
}

export type TranslationProgress = {
  articleId: string
  phase: 'title' | 'body' | 'segment'
  current: number
  total: number
  segmentId?: string
  translatedText?: string
  translatedTitle?: string
  done?: boolean
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
