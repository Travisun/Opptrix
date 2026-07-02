const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  getIsFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  pickExportDirectory: () => ipcRenderer.invoke('pick-export-directory'),
  writeBinaryFile: (payload) => ipcRenderer.invoke('write-binary-file', payload),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  clientVersion: () => ipcRenderer.invoke('client-version'),
  translationGetStatus: () => ipcRenderer.invoke('translation-get-status'),
  translationGetModels: () => ipcRenderer.invoke('translation-get-models'),
  translationGetDownloadDir: () => ipcRenderer.invoke('translation-get-download-dir'),
  translationOpenDownloadDir: () => ipcRenderer.invoke('translation-open-download-dir'),
  translationStartDownload: (modelId) => ipcRenderer.invoke('translation-start-download', modelId),
  translationCancelDownload: () => ipcRenderer.invoke('translation-cancel-download'),
  translationTranslateArticle: (payload) => ipcRenderer.invoke('translation-translate-article', payload),
  onTranslationDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress)
    ipcRenderer.on('translation-download-progress', handler)
    return () => ipcRenderer.removeListener('translation-download-progress', handler)
  },
  onTranslationProgress: (callback) => {
    const handler = (_event, progress) => callback(progress)
    ipcRenderer.on('translation-progress', handler)
    return () => ipcRenderer.removeListener('translation-progress', handler)
  },
  onFullscreenChange: (callback) => {
    const handler = (_event, fullscreen) => callback(Boolean(fullscreen))
    ipcRenderer.on('window-fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('window-fullscreen-changed', handler)
  },
  signalShellReady: () => ipcRenderer.send('shell-ready'),
})
