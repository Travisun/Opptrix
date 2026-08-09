/**
 * Packaged macOS：启动时尝试清除 .app 的 quarantine（Gatekeeper「已损坏」常见成因）。
 * 失败只打日志，不阻塞启动；幂等。
 */
const { execFile } = require('node:child_process')
const path = require('node:path')
const { app } = require('electron')

function clearMacAppQuarantine() {
  if (process.platform !== 'darwin' || !app.isPackaged) return

  // Electron.app/Contents/MacOS/<bin> → .app 根
  const appPath = path.resolve(process.execPath, '../../..')
  execFile('xattr', ['-cr', appPath], (err) => {
    if (err) {
      console.warn('[mac] clear quarantine failed:', err.message || err)
    }
  })
}

module.exports = { clearMacAppQuarantine }
