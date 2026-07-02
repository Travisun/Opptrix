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

  if (!app.isPackaged) return true

  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    process.exit(0)
  }

  app.on('second-instance', (_event, argv) => {
    const launchUrl = findProtocolUrl(argv)
    if (launchUrl) deliverProtocolUrl(launchUrl)
    focusMainWindow()
  })

  return gotLock
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
  registerProtocolIpc,
}
