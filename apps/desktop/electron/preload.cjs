const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  appMenuList: () => ipcRenderer.invoke('app-menu-list'),
  appMenuPopup: (payload) => ipcRenderer.invoke('app-menu-popup', payload),
  getIsFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  getIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  windowIsFocused: () => ipcRenderer.invoke('window-is-focused'),
  /** Grow the window so content width is at least `minWidth` (no-op if already wide enough). */
  windowEnsureContentWidth: (minWidth) => ipcRenderer.invoke('window-ensure-content-width', minWidth),
  pickExportDirectory: () => ipcRenderer.invoke('pick-export-directory'),
  writeBinaryFile: (payload) => ipcRenderer.invoke('write-binary-file', payload),
  pickSaveFile: (payload) => ipcRenderer.invoke('pick-save-file', payload),
  writeTextFile: (payload) => ipcRenderer.invoke('write-text-file', payload),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  clientVersion: () => ipcRenderer.invoke('client-version'),
  appUpdateGetStatus: () => ipcRenderer.invoke('app-update-get-status'),
  appUpdateCheck: () => ipcRenderer.invoke('app-update-check'),
  appUpdateInstall: () => ipcRenderer.invoke('app-update-install'),
  appUpdateDownload: () => ipcRenderer.invoke('app-update-download'),
  appUpdateGetAutoDownload: () => ipcRenderer.invoke('app-update-get-auto-download'),
  appUpdateSetAutoDownload: (enabled) => ipcRenderer.invoke('app-update-set-auto-download', enabled),
  onAppUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status)
    ipcRenderer.on('app-update-status', handler)
    return () => ipcRenderer.removeListener('app-update-status', handler)
  },
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
  onProtocolOpen: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('opptrix-protocol', handler)
    return () => ipcRenderer.removeListener('opptrix-protocol', handler)
  },
  notificationIsSupported: () => ipcRenderer.invoke('notification-is-supported'),
  notificationGetPermission: () => ipcRenderer.invoke('notification-get-permission'),
  notificationRequestPermission: () => ipcRenderer.invoke('notification-request-permission'),
  notificationOpenSettings: () => ipcRenderer.invoke('notification-open-settings'),
  showLocalNotification: (payload) => ipcRenderer.invoke('notification-show', payload),
  mediaGetMicPermission: () => ipcRenderer.invoke('media-get-mic-permission'),
  mediaRequestMicPermission: () => ipcRenderer.invoke('media-request-mic-permission'),
  mediaOpenMicSettings: () => ipcRenderer.invoke('media-open-mic-settings'),
  speechTranscribe: (payload) => ipcRenderer.invoke('speech-transcribe', payload),
  speechGetStatus: () => ipcRenderer.invoke('speech-get-status'),
  signalShellReady: () => ipcRenderer.send('shell-ready'),
  shellInstallWindowsSandbox: () => ipcRenderer.invoke('shell-install-windows-sandbox'),
  shellInstallLinuxSandbox: () => ipcRenderer.invoke('shell-install-linux-sandbox'),
  scheduleOsReconcile: () => ipcRenderer.invoke('schedule-os-reconcile'),
  scheduleEnsureAutostart: (enabled) => ipcRenderer.invoke('schedule-ensure-autostart', enabled),
  schedulePostTick: () => ipcRenderer.invoke('schedule-post-tick'),
  scheduleGetStatus: () => ipcRenderer.invoke('schedule-get-status'),
  setThemeSource: (source) => ipcRenderer.send('set-theme-source', source),
})
