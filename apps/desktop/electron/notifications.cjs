const { Notification, app } = require('electron')

/** @type {'default' | 'granted' | 'denied'} */
let cachedPermission = 'default'

function isNotificationSupported() {
  return Notification.isSupported()
}

function getNotificationPermission() {
  return cachedPermission
}

async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    cachedPermission = 'denied'
    return cachedPermission
  }

  cachedPermission = 'granted'
  return cachedPermission
}

/**
 * @param {{
 *   title: string
 *   body?: string
 *   silent?: boolean
 *   tag?: string
 *   onClick?: () => void
 * }} options
 */
function showLocalNotification(options) {
  if (!isNotificationSupported()) return false

  const title = String(options?.title ?? '').trim()
  if (!title) return false

  const notification = new Notification({
    title,
    body: String(options?.body ?? '').trim() || undefined,
    silent: Boolean(options?.silent),
    tag: options?.tag ? String(options.tag) : undefined,
  })

  if (typeof options?.onClick === 'function') {
    notification.on('click', () => {
      options.onClick()
    })
  }

  notification.show()
  cachedPermission = 'granted'
  return true
}

function registerNotificationIpc(ipcMain, { onNotificationClick } = {}) {
  ipcMain.handle('notification-is-supported', async () => isNotificationSupported())

  ipcMain.handle('notification-get-permission', async () => getNotificationPermission())

  ipcMain.handle('notification-request-permission', async () => requestNotificationPermission())

  ipcMain.handle('notification-show', async (_event, payload) => {
    const onClick =
      typeof onNotificationClick === 'function'
        ? () => onNotificationClick(payload)
        : undefined
    return showLocalNotification({
      title: payload?.title,
      body: payload?.body,
      silent: payload?.silent,
      tag: payload?.tag,
      onClick,
    })
  })
}

function configureNotificationIdentity(appId) {
  if (process.platform === 'win32' && appId) {
    app.setAppUserModelId(appId)
  }
}

module.exports = {
  configureNotificationIdentity,
  getNotificationPermission,
  isNotificationSupported,
  registerNotificationIpc,
  requestNotificationPermission,
  showLocalNotification,
}
