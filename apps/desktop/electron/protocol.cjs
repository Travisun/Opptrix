const path = require('node:path')

const PROTOCOL_SCHEME = 'opptrix'

/** @type {Record<string, unknown> | null} */
let pendingProtocolPayload = null

/** @type {((payload: Record<string, unknown>) => void) | null} */
let deliverHandler = null

function registerProtocolClient(app) {
  if (process.platform === 'win32' && process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ])
    return
  }

  if (app.isPackaged || process.defaultApp) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
  }
}

function parseOpptrixUrl(rawUrl) {
  const url = String(rawUrl ?? '').trim()
  if (!url.toLowerCase().startsWith(`${PROTOCOL_SCHEME}://`)) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null

    const route = [parsed.hostname, parsed.pathname]
      .filter(Boolean)
      .join('')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')

    return {
      url,
      host: parsed.hostname || '',
      pathname: parsed.pathname || '',
      route,
      params: Object.fromEntries(parsed.searchParams.entries()),
    }
  } catch {
    return null
  }
}

function findProtocolUrl(argv = process.argv) {
  return argv.find(
    (arg) => typeof arg === 'string' && arg.toLowerCase().startsWith(`${PROTOCOL_SCHEME}://`),
  )
}

function setProtocolDeliverHandler(handler) {
  deliverHandler = handler
}

function deliverProtocolUrl(rawUrl) {
  const payload = parseOpptrixUrl(rawUrl)
  if (!payload) return false

  if (deliverHandler) {
    deliverHandler(payload)
    return true
  }

  pendingProtocolPayload = payload
  return true
}

function flushPendingProtocolUrl() {
  if (!pendingProtocolPayload || !deliverHandler) return null
  const payload = pendingProtocolPayload
  pendingProtocolPayload = null
  deliverHandler(payload)
  return payload
}

function installProtocolHandlers(app, { focusMainWindow }) {
  registerProtocolClient(app)

  if (process.platform === 'darwin') {
    app.on('open-url', (event, url) => {
      event.preventDefault()
      deliverProtocolUrl(url)
      focusMainWindow()
    })
  }

  // 单实例锁由 main.cjs 统一持有；这里不再二次 requestSingleInstanceLock，
  // 避免自动更新 relaunch 时因锁竞态直接 process.exit(0) 导致新版起不来。
  // second-instance 的协议 URL 派发由 main.cjs 的统一处理器调用 handleSecondInstanceArgv。
}

/** 从 second-instance 的 argv 中提取并派发协议 URL（由 main.cjs 统一处理器调用）。 */
function handleSecondInstanceArgv(argv) {
  const launchUrl = findProtocolUrl(argv)
  if (launchUrl) deliverProtocolUrl(launchUrl)
}

function registerProtocolIpc(ipcMain) {
  ipcMain.handle('protocol-parse-url', async (_event, rawUrl) => parseOpptrixUrl(rawUrl))
}

module.exports = {
  PROTOCOL_SCHEME,
  registerProtocolClient,
  parseOpptrixUrl,
  findProtocolUrl,
  setProtocolDeliverHandler,
  deliverProtocolUrl,
  flushPendingProtocolUrl,
  installProtocolHandlers,
  handleSecondInstanceArgv,
  registerProtocolIpc,
}
