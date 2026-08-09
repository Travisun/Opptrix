const { Notification, app, systemPreferences, shell } = require('electron')
const { resolveAppIconPath } = require('./icon.cjs')

/** @type {'default' | 'granted' | 'denied'} */
let cachedPermission = 'default'

const TITLE_MAX = 120
const BODY_MAX = 200
const TAG_MAX = 128
const SESSION_ID_MAX = 64
const TAG_RE = /^[A-Za-z0-9:_-]+$/
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/
const KIND_SET = new Set(['chat_done', 'chat_ask'])

/**
 * 将 macOS UNAuthorizationStatus 映射为 NotificationPermission 三态。
 * @param {unknown} status
 * @returns {'default' | 'granted' | 'denied'}
 */
function mapDarwinAuthorizationStatus(status) {
  const raw = String(status ?? '').trim().toLowerCase()
  if (
    raw === 'authorized'
    || raw === 'provisional'
    || raw === 'temporary'
    || raw === 'ephemeral'
  ) {
    return 'granted'
  }
  if (raw === 'denied' || raw === 'restricted') {
    return 'denied'
  }
  // not-determined / unknown / empty
  return 'default'
}

/**
 * 读取系统真实通知权限（能读则读；读不到时不得假 granted）。
 * @returns {'default' | 'granted' | 'denied'}
 */
function readSystemNotificationPermission() {
  if (!isNotificationSupported()) return 'denied'

  if (process.platform === 'darwin') {
    const getSettings = systemPreferences?.getNotificationSettings
    if (typeof getSettings === 'function') {
      try {
        const settings = getSettings.call(systemPreferences)
        return mapDarwinAuthorizationStatus(settings?.authorizationStatus)
      } catch (err) {
        console.warn('[notifications] getNotificationSettings failed:', err)
      }
    }
    // Electron 若无 API：保持缓存，但绝不无条件写成 granted
    return cachedPermission === 'granted' ? 'default' : cachedPermission
  }

  // Windows / Linux：能力由 AppUserModelId + 桌面环境决定；支持即视为可发
  return 'granted'
}

/**
 * 校验并裁剪 renderer 传入的通知载荷；非法字段忽略或整包拒绝。
 * @param {unknown} raw
 * @returns {{
 *   title: string
 *   body?: string
 *   silent?: boolean
 *   tag?: string
 *   sessionId?: string
 *   kind?: 'chat_done' | 'chat_ask'
 * } | null}
 */
function sanitizeNotificationPayload(raw) {
  if (!raw || typeof raw !== 'object') return null

  const title = String(/** @type {{ title?: unknown }} */ (raw).title ?? '').trim()
  if (!title || title.length > TITLE_MAX) return null

  /** @type {{
   *   title: string
   *   body?: string
   *   silent?: boolean
   *   tag?: string
   *   sessionId?: string
   *   kind?: 'chat_done' | 'chat_ask'
   * }} */
  const out = { title }

  const bodyRaw = /** @type {{ body?: unknown }} */ (raw).body
  if (bodyRaw != null) {
    const body = String(bodyRaw).trim()
    if (body) {
      out.body = body.length > BODY_MAX ? body.slice(0, BODY_MAX) : body
    }
  }

  if (/** @type {{ silent?: unknown }} */ (raw).silent != null) {
    out.silent = Boolean(/** @type {{ silent?: unknown }} */ (raw).silent)
  }

  const tagRaw = /** @type {{ tag?: unknown }} */ (raw).tag
  if (tagRaw != null) {
    const tag = String(tagRaw).trim()
    if (tag && tag.length <= TAG_MAX && TAG_RE.test(tag)) {
      out.tag = tag
    }
  }

  const sessionRaw = /** @type {{ sessionId?: unknown }} */ (raw).sessionId
  if (sessionRaw != null) {
    const sessionId = String(sessionRaw).trim()
    if (sessionId && sessionId.length <= SESSION_ID_MAX && SESSION_ID_RE.test(sessionId)) {
      out.sessionId = sessionId
    }
  }

  const kindRaw = /** @type {{ kind?: unknown }} */ (raw).kind
  if (kindRaw != null) {
    const kind = String(kindRaw).trim()
    if (KIND_SET.has(kind)) {
      out.kind = /** @type {'chat_done' | 'chat_ask'} */ (kind)
    }
  }

  return out
}

function isNotificationSupported() {
  return Notification.isSupported()
}

function getNotificationPermission() {
  cachedPermission = readSystemNotificationPermission()
  return cachedPermission
}

/**
 * 请求/刷新通知权限。不得无条件写 granted。
 * macOS 无法编程式弹出授权框，只能读系统状态；用户需在系统设置中开启。
 * @returns {Promise<'default' | 'granted' | 'denied'>}
 */
async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    cachedPermission = 'denied'
    return cachedPermission
  }

  cachedPermission = readSystemNotificationPermission()
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
 * @returns {boolean}
 */
function showLocalNotification(options) {
  if (!isNotificationSupported()) {
    cachedPermission = 'denied'
    return false
  }

  const title = String(options?.title ?? '').trim()
  if (!title) return false

  // 刷新权限；明确拒绝时不调用 show（避免静默失败）
  cachedPermission = readSystemNotificationPermission()
  if (cachedPermission === 'denied') {
    console.warn('[notifications] skip show: permission denied')
    return false
  }

  let delivered = false
  try {
    // Windows / Linux toast content image; macOS Notification.icon is ignored by the OS.
    const iconPath = resolveAppIconPath()
    const notification = new Notification({
      title,
      body: String(options?.body ?? '').trim() || undefined,
      silent: Boolean(options?.silent),
      tag: options?.tag ? String(options.tag) : undefined,
      ...(iconPath ? { icon: iconPath } : {}),
    })

    if (typeof options?.onClick === 'function') {
      notification.on('click', () => {
        options.onClick()
      })
    }

    notification.on('show', () => {
      delivered = true
      if (cachedPermission !== 'denied') {
        cachedPermission = 'granted'
      }
    })

    notification.on('failed', (_event, error) => {
      console.warn('[notifications] Notification.failed:', error)
      if (process.platform === 'darwin') {
        // 展示失败时回读系统状态，避免继续假 granted
        cachedPermission = readSystemNotificationPermission()
        if (cachedPermission === 'granted') {
          cachedPermission = 'denied'
        }
      }
    })

    notification.show()
  } catch (err) {
    console.warn('[notifications] show threw:', err)
    if (process.platform === 'darwin') {
      cachedPermission = readSystemNotificationPermission()
      if (cachedPermission !== 'denied') {
        // 抛错且无明确系统 denied 时，至少不要假 granted
        if (cachedPermission === 'granted') cachedPermission = 'default'
      }
    }
    return false
  }

  // Windows / Linux：show 同步路径通常即成功；macOS 以 show 事件为准，此处不强制写 granted
  if (process.platform !== 'darwin' && cachedPermission !== 'denied') {
    cachedPermission = 'granted'
    delivered = true
  }

  // macOS：若权限仍为 default（未决定），show 可能弹出系统授权框；返回 true 表示已尝试投递
  if (process.platform === 'darwin') {
    return cachedPermission !== 'denied'
  }

  return delivered
}

/**
 * 打开系统「通知」设置页，便于用户手动开启。
 * @returns {Promise<boolean>}
 */
async function openSystemNotificationSettings() {
  try {
    if (process.platform === 'darwin') {
      // macOS Ventura+ Notifications pane；旧版回退到通知偏好
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
      )
      return true
    }
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:notifications')
      return true
    }
  } catch (err) {
    console.warn('[notifications] openSystemNotificationSettings failed:', err)
  }
  return false
}

function registerNotificationIpc(ipcMain, { onNotificationClick } = {}) {
  ipcMain.handle('notification-is-supported', async () => isNotificationSupported())

  ipcMain.handle('notification-get-permission', async () => getNotificationPermission())

  ipcMain.handle('notification-request-permission', async () => requestNotificationPermission())

  ipcMain.handle('notification-open-settings', async () => openSystemNotificationSettings())

  ipcMain.handle('notification-show', async (_event, payload) => {
    const sanitized = sanitizeNotificationPayload(payload)
    if (!sanitized) return false
    const onClick =
      typeof onNotificationClick === 'function'
        ? () => onNotificationClick(sanitized)
        : undefined
    return showLocalNotification({
      title: sanitized.title,
      body: sanitized.body,
      silent: sanitized.silent,
      tag: sanitized.tag,
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
  mapDarwinAuthorizationStatus,
  openSystemNotificationSettings,
  registerNotificationIpc,
  requestNotificationPermission,
  sanitizeNotificationPayload,
  showLocalNotification,
}
