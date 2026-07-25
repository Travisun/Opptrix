const { Notification, app } = require('electron')

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
  registerNotificationIpc,
  requestNotificationPermission,
  sanitizeNotificationPayload,
  showLocalNotification,
}
