const { systemPreferences, shell, session } = require('electron')

/**
 * @returns {'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'}
 */
function getMicAccessStatus() {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    try {
      return systemPreferences.getMediaAccessStatus('microphone')
    } catch (err) {
      console.warn('[media] getMediaAccessStatus failed:', err)
      return 'unknown'
    }
  }
  return 'granted'
}

/**
 * @returns {'default' | 'granted' | 'denied'}
 */
function getMicrophonePermission() {
  const status = getMicAccessStatus()
  if (status === 'granted') return 'granted'
  if (status === 'denied' || status === 'restricted') return 'denied'
  // not-determined / unknown / Linux
  if (status === 'not-determined') return 'default'
  if (process.platform === 'linux') return 'granted'
  return 'default'
}

/**
 * macOS 弹出系统麦克风授权；其他平台返回当前状态（由 getUserMedia 触发 Chromium 层）。
 * @returns {Promise<'default' | 'granted' | 'denied'>}
 */
async function requestMicrophonePermission() {
  if (process.platform === 'darwin') {
    try {
      const ok = await systemPreferences.askForMediaAccess('microphone')
      return ok ? 'granted' : 'denied'
    } catch (err) {
      console.warn('[media] askForMediaAccess failed:', err)
      return 'denied'
    }
  }
  return getMicrophonePermission()
}

/**
 * @returns {Promise<boolean>}
 */
async function openSystemMicrophoneSettings() {
  try {
    if (process.platform === 'darwin') {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      )
      return true
    }
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:privacy-microphone')
      return true
    }
  } catch (err) {
    console.warn('[media] openSystemMicrophoneSettings failed:', err)
  }
  return false
}

/**
 * 仅放行麦克风相关 media、扬声器选择、以及剪贴板写入；拒绝摄像头等无关权限。
 * 本地 wav 提示音播放无需系统喇叭授权；此处放行 speaker-selection，
 * 避免 Chromium 权限层误拦输出设备选择（与 autoplayPolicy 配合）。
 * clipboard-*：聊天复制 / Markdown 表格复制依赖 navigator.clipboard.writeText。
 * 不要把「播放」绑到 askForMediaAccess('microphone')。
 * @param {import('electron').Session} ses
 */
function installMediaPermissionHandlers(ses) {
  const target = ses ?? session.defaultSession

  const isSpeakerPermission = (permission) =>
    permission === 'speaker-selection'
    || (typeof permission === 'string' && permission.includes('speaker'))

  const isClipboardPermission = (permission) =>
    permission === 'clipboard-sanitized-write'
    || permission === 'clipboard-write'
    || permission === 'clipboard-read'

  target.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission === 'media') {
      const mediaTypes = details?.mediaTypes
      if (Array.isArray(mediaTypes) && mediaTypes.length > 0) {
        const audioOnly = mediaTypes.every((t) => t === 'audio')
        callback(audioOnly)
        return
      }
      // 无 mediaTypes 时保守放行（部分 Chromium 版本只报 media）
      callback(true)
      return
    }
    if (isSpeakerPermission(permission) || isClipboardPermission(permission)) {
      callback(true)
      return
    }
    callback(false)
  })

  target.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, details) => {
    if (permission === 'media') {
      const mediaType = details?.mediaType
      if (mediaType === 'video') return false
      return true
    }
    if (isSpeakerPermission(permission) || isClipboardPermission(permission)) return true
    return false
  })
}

function registerMediaPermissionIpc(ipcMain) {
  ipcMain.handle('media-get-mic-permission', async () => getMicrophonePermission())

  ipcMain.handle('media-request-mic-permission', async () => requestMicrophonePermission())

  ipcMain.handle('media-open-mic-settings', async () => openSystemMicrophoneSettings())
}

module.exports = {
  getMicrophonePermission,
  getMicAccessStatus,
  installMediaPermissionHandlers,
  openSystemMicrophoneSettings,
  registerMediaPermissionIpc,
  requestMicrophonePermission,
}
