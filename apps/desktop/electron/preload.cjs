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
  onFullscreenChange: (callback) => {
    const handler = (_event, fullscreen) => callback(Boolean(fullscreen))
    ipcRenderer.on('window-fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('window-fullscreen-changed', handler)
  },
})
