const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => process.env.npm_package_version || '0.3.0',
  platform: process.platform,
})
